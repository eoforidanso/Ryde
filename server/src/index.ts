import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, nowIso } from './db.ts';
import {
  listSessions, requestOtp, revokeAllSessions, revokeSession, verifyOtp,
} from './auth.ts';
import * as hubtel from './hubtel.ts';
import { ledgerIsBalanced, riderBalance, riderDebt, statement } from './ledger.ts';
import {
  clientIp, cors, rateLimit, requireAuth, requireRole, requireServiceKey, securityHeaders,
} from './middleware.ts';
import { HttpError, formatGHS } from './money.ts';
import { applyResult, getPayment, reconcilePending, startCharge } from './payments.ts';
import {
  applyPayoutResult, driverPayable, getPayout, reconcilePayouts, runPayoutBatch,
} from './payouts.ts';
import { completeTrip, getTrip, quoteTrip, startTrip } from './trips.ts';

const app = express();
app.set('trust proxy', process.env.TRUST_PROXY === 'true');
app.use(express.json({ limit: '256kb' }));
app.use(securityHeaders);
app.use(cors);

const wrap = (fn: (req: express.Request, res: express.Response) => Promise<void> | void) =>
  (req: express.Request, res: express.Response) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message, code: err.code });
      } else if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', code: 'BAD_REQUEST' });
      } else {
        // Never leak internals to a caller.
        console.error('[error]', err);
        res.status(500).json({ error: 'Internal error' });
      }
    });
  };

const meta = (req: express.Request) => ({
  ip: clientIp(req),
  userAgent: req.header('user-agent') ?? undefined,
});

/* ------------------------------------------------------------------ */
/* Health — deliberately says nothing about the data                   */
/* ------------------------------------------------------------------ */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: hubtel.isMock() ? 'mock' : 'live', time: nowIso() });
});

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

const otpRequestSchema = z.object({ msisdn: z.string().min(9).max(20) });

app.post(
  '/api/auth/request-otp',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }), // per IP; per-number cap lives in auth.ts
  wrap(async (req, res) => {
    const { msisdn } = otpRequestSchema.parse(req.body);
    const result = await requestOtp(msisdn, clientIp(req));
    // Identical response whether or not an account exists.
    res.json({ sent: true, ...result });
  }),
);

const otpVerifySchema = z.object({
  msisdn: z.string().min(9).max(20),
  code: z.string().regex(/^\d{6}$/),
});

app.post(
  '/api/auth/verify-otp',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }),
  wrap((req, res) => {
    const { msisdn, code } = otpVerifySchema.parse(req.body);
    const session = verifyOtp(msisdn, code, meta(req));
    res.json(session);
  }),
);

app.get('/api/auth/me', requireAuth, wrap((req, res) => {
  res.json({ user: req.auth });
}));

app.post('/api/auth/logout', requireAuth, wrap((req, res) => {
  revokeSession((req.header('authorization') ?? '').slice(7).trim());
  res.json({ ok: true });
}));

app.get('/api/auth/sessions', requireAuth, wrap((req, res) => {
  res.json({ sessions: listSessions(req.auth!.id) });
}));

/** The "my phone was stolen" button. */
app.post('/api/auth/revoke-all', requireAuth, wrap((req, res) => {
  res.json({ revoked: revokeAllSessions(req.auth!.id) });
}));

/* ------------------------------------------------------------------ */
/* Wallet — scoped to the caller, no id in the path                    */
/* ------------------------------------------------------------------ */

app.get('/api/me/wallet', requireAuth, wrap((req, res) => {
  const id = req.auth!.id;
  res.json({
    user: req.auth,
    balancePesewas: riderBalance(id),
    balanceFormatted: formatGHS(riderBalance(id)),
    debtPesewas: riderDebt(id),
    entries: statement(`user:${id}:cash`, 25),
  });
}));

const topUpSchema = z.object({
  amountPesewas: z.number().int().positive().max(500_00),
  voucherToken: z.string().max(32).optional(),
});

app.post(
  '/api/me/topup',
  requireAuth,
  rateLimit({ windowMs: 60 * 1000, max: 5, key: (req) => `topup:${req.auth?.id}` }),
  wrap(async (req, res) => {
    const body = topUpSchema.parse(req.body);
    const clientReference = (req.header('Idempotency-Key') || randomUUID()).slice(0, 64);

    // The charge always goes to the number on the account. Letting a caller
    // name an arbitrary MSISDN here would make this a tool for debiting other
    // people's wallets.
    const payment = await startCharge({
      userId: req.auth!.id,
      amountPesewas: body.amountPesewas,
      voucherToken: body.voucherToken,
      clientReference,
      purpose: 'topup',
    });

    res.status(202).json({
      reference: payment.client_reference,
      status: payment.status,
      message:
        payment.status === 'PENDING'
          ? 'Approve the prompt on your phone. If it does not arrive, dial *170# and approve from your MoMo menu.'
          : undefined,
    });
  }),
);

app.get('/api/payments/:reference', requireAuth, wrap((req, res) => {
  const payment = getPayment(req.params.reference);
  if (!payment || payment.user_id !== req.auth!.id) throw new HttpError(404, 'Unknown payment');
  res.json({
    reference: payment.client_reference,
    status: payment.status,
    amountPesewas: payment.amount_pesewas,
    purpose: payment.purpose,
    createdAt: payment.created_at,
  });
}));

/* ------------------------------------------------------------------ */
/* Trips                                                               */
/* ------------------------------------------------------------------ */

const place = z.object({ name: z.string().min(1).max(120), lat: z.number(), lng: z.number() });

const quoteSchema = z.object({
  product: z.enum(['okada', 'share', 'go', 'comfort', 'xl', 'aboboya']),
  pickup: place,
  dropoff: place,
  distanceM: z.number().positive().max(200_000),
  durationS: z.number().positive().max(6 * 3600),
  surgeBp: z.number().int().min(10000).max(30000).default(10000),
  paymentMethod: z.enum(['wallet', 'momo', 'cash']),
  promoCode: z.string().max(24).optional(),
});

app.post('/api/trips/quote', requireAuth, requireRole('rider'), wrap((req, res) => {
  const trip = quoteTrip({ riderId: req.auth!.id, ...quoteSchema.parse(req.body) });
  res.status(201).json({
    tripId: trip.id,
    farePesewas: trip.fare_pesewas,
    discountPesewas: trip.discount_pesewas,
    totalPesewas: trip.fare_pesewas - trip.discount_pesewas,
    formatted: formatGHS(trip.fare_pesewas - trip.discount_pesewas),
  });
}));

/** Only a driver can accept a trip, and only onto their own account. */
app.post('/api/trips/:id/start', requireAuth, requireRole('driver'), wrap((req, res) => {
  res.json(startTrip(req.params.id, req.auth!.id));
}));

const completeSchema = z.object({
  tipPesewas: z.number().int().min(0).max(200_00).default(0),
  voucherToken: z.string().max(32).optional(),
});

app.post('/api/trips/:id/complete', requireAuth, wrap(async (req, res) => {
  const body = completeSchema.parse(req.body);
  const receipt = await completeTrip({
    tripId: req.params.id,
    actor: { id: req.auth!.id, role: req.auth!.role },
    ...body,
  });
  res.json({ ...receipt, totalFormatted: formatGHS(receipt.totalPesewas) });
}));

app.get('/api/trips/:id', requireAuth, wrap((req, res) => {
  const trip = getTrip(req.params.id);
  const me = req.auth!.id;
  if (!trip || (trip.rider_id !== me && trip.driver_id !== me)) {
    throw new HttpError(404, 'Unknown trip');
  }
  res.json(trip);
}));

/* ------------------------------------------------------------------ */
/* Driver                                                              */
/* ------------------------------------------------------------------ */

app.get('/api/me/earnings', requireAuth, requireRole('driver'), wrap((req, res) => {
  const id = req.auth!.id;
  res.json({
    payablePesewas: driverPayable(id),
    formatted: formatGHS(driverPayable(id)),
    entries: statement(`driver:${id}:payable`, 25),
  });
}));

/* ------------------------------------------------------------------ */
/* Webhooks — provider auth, not user auth                             */
/* ------------------------------------------------------------------ */

/**
 * Hubtel callbacks are not signed, so the body is an untrusted hint: we read
 * the reference, then re-query Hubtel before touching the ledger. The secret
 * path segment keeps casual traffic out; it is not the security boundary.
 */
app.post('/api/webhooks/hubtel/:secret', wrap(async (req, res) => {
  if (req.params.secret !== (process.env.WEBHOOK_PATH_SECRET ?? 'dev')) {
    res.sendStatus(404);
    return;
  }

  const data = req.body?.Data ?? req.body ?? {};
  const reference: string | undefined = data.ClientReference ?? data.clientReference;

  // Always 200: a non-2xx makes Hubtel retry, and we have already recorded it.
  res.status(200).json({ received: true });
  if (!reference) return;

  const eventId = `${reference}:${data.TransactionId ?? ''}:${req.body?.ResponseCode ?? ''}`;
  const seen = db.prepare(`SELECT id FROM webhook_events WHERE id = ?`).get(eventId);
  db.prepare(
    `INSERT OR IGNORE INTO webhook_events (id, provider, body, received_at) VALUES (?, 'hubtel', ?, ?)`,
  ).run(eventId, JSON.stringify(req.body).slice(0, 4000), nowIso());
  if (seen) return;

  try {
    const verified = await hubtel.checkStatus(reference);
    if (getPayment(reference)) applyResult(reference, verified);
    else if (getPayout(reference)) applyPayoutResult(reference, verified);
  } catch (err) {
    console.error('[webhook] verification failed, poller will retry:', (err as Error).message);
  }
}));

/* ------------------------------------------------------------------ */
/* Ops — service key only. No user session reaches these.              */
/* ------------------------------------------------------------------ */

app.post('/api/ops/reconcile', requireServiceKey, wrap(async (_req, res) => {
  const payments = await reconcilePending();
  const payouts = await reconcilePayouts();
  res.json({ payments, payouts, ledgerBalanced: ledgerIsBalanced() });
}));

app.post('/api/ops/payouts/run', requireServiceKey, wrap(async (req, res) => {
  const dryRun = req.body?.dryRun !== false;
  res.json(await runPayoutBatch({ dryRun }));
}));

app.get('/api/ops/ledger-health', requireServiceKey, wrap((_req, res) => {
  res.json({ balanced: ledgerIsBalanced(), checkedAt: nowIso() });
}));

/* ------------------------------------------------------------------ */
/* Error handling                                                      */
/* ------------------------------------------------------------------ */

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/**
 * Terminal error handler.
 *
 * `wrap()` only covers route handlers — anything thrown from middleware
 * (requireAuth, requireServiceKey, rateLimit) lands here instead. Without this,
 * Express's default handler renders the stack trace, leaking absolute file
 * paths and internal structure to anyone who sends a bad token.
 */
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request', code: 'BAD_REQUEST' });
    return;
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal error' });
});

const PORT = Number(process.env.PORT ?? 8787);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Ryde payments on :${PORT} — Hubtel ${hubtel.isMock() ? 'MOCK' : 'LIVE'} mode`);
    if (hubtel.isMock()) {
      console.log('Mock mode: OTP codes are printed here and returned as devCode.');
      console.log('Amounts ending in 13p simulate a declined prompt.');
    }
    if (!process.env.SERVICE_API_KEY || process.env.SERVICE_API_KEY === 'change-me') {
      console.warn('⚠  SERVICE_API_KEY is unset — /api/ops/* will refuse every request.');
    }
  });

  setInterval(() => {
    reconcilePending().catch((e) => console.error('[reconcile]', e.message));
    reconcilePayouts().catch((e) => console.error('[reconcile]', e.message));
  }, 30_000).unref();
}

export { app };
