import { randomUUID } from 'node:crypto';
import { db, nowIso, tx } from './db.ts';
import * as hubtel from './hubtel.ts';
import { ACCOUNTS, post, riderBalance } from './ledger.ts';
import { HttpError, type Pesewas } from './money.ts';

export interface PaymentRow {
  client_reference: string;
  user_id: string;
  amount_pesewas: number;
  channel: string;
  msisdn: string;
  purpose: string;
  trip_id: string | null;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  provider_txn_id: string | null;
  provider_status: string | null;
  charges_pesewas: number;
  poll_attempts: number;
  created_at: string;
  settled_at: string | null;
}

export function getPayment(clientReference: string): PaymentRow | undefined {
  return db
    .prepare(`SELECT * FROM payments WHERE client_reference = ?`)
    .get(clientReference) as PaymentRow | undefined;
}

/**
 * Start a wallet top-up.
 *
 * The PENDING row is written and committed *before* Hubtel is called. If the
 * process dies mid-request we still have a reference the poller will pick up
 * and reconcile — the alternative loses money we can't trace.
 */
export async function startCharge(opts: {
  userId: string;
  amountPesewas: Pesewas;
  msisdn?: string;
  voucherToken?: string;
  clientReference?: string;
  /** Determines which ledger postings settlement will make. */
  purpose?: 'topup' | 'trip';
  tripId?: string;
}): Promise<PaymentRow> {
  const purpose = opts.purpose ?? 'topup';
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(opts.userId) as
    | { id: string; name: string; msisdn: string }
    | undefined;
  if (!user) throw new HttpError(404, 'Unknown user');

  // A caller-supplied reference makes the whole endpoint idempotent: a retried
  // request returns the original payment instead of charging twice.
  const clientReference = opts.clientReference ?? randomUUID();
  const existing = getPayment(clientReference);
  if (existing) return existing;

  const msisdn = hubtel.normaliseMsisdn(opts.msisdn ?? user.msisdn);
  const channel = hubtel.channelForMsisdn(msisdn);

  // purpose and trip_id are written up front: settlement reads them to decide
  // which accounts to post to, so they must never be patched in afterwards.
  db.prepare(
    `INSERT INTO payments
       (client_reference, user_id, amount_pesewas, channel, msisdn, purpose, trip_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
  ).run(
    clientReference,
    user.id,
    opts.amountPesewas,
    channel,
    msisdn,
    purpose,
    opts.tripId ?? null,
    nowIso(),
  );

  try {
    const result = await hubtel.charge({
      clientReference,
      amountPesewas: opts.amountPesewas,
      msisdn,
      channel,
      customerName: user.name,
      description: purpose === 'trip' ? 'Ryde trip fare' : 'Ryde Cash top up',
      voucherToken: opts.voucherToken,
    });

    db.prepare(
      `UPDATE payments SET provider_txn_id = ?, provider_status = ? WHERE client_reference = ?`,
    ).run(result.providerTxnId, result.providerStatus, clientReference);

    // A synchronous SUCCESS is possible; settle immediately rather than waiting.
    if (result.status !== 'PENDING') applyResult(clientReference, result);
  } catch (err) {
    // Network failure tells us nothing about whether the charge landed. Leave
    // the row PENDING for the poller — never mark it FAILED from a timeout.
    db.prepare(`UPDATE payments SET provider_status = ? WHERE client_reference = ?`).run(
      `local_error: ${(err as Error).message}`.slice(0, 300),
      clientReference,
    );
    if (err instanceof HttpError && err.code === 'VOUCHER_REQUIRED') throw err;
  }

  return getPayment(clientReference)!;
}

/**
 * Apply a provider outcome to a payment, exactly once.
 *
 * Safe to call repeatedly with the same result — webhooks are replayed, and the
 * poller races the webhook by design. Terminal states are never rewritten.
 */
export function applyResult(clientReference: string, result: hubtel.ProviderResult): PaymentRow {
  return tx(() => {
    const payment = db
      .prepare(`SELECT * FROM payments WHERE client_reference = ?`)
      .get(clientReference) as PaymentRow | undefined;
    if (!payment) throw new HttpError(404, `Unknown payment ${clientReference}`);

    if (payment.status !== 'PENDING') return payment; // already terminal — no-op
    if (result.status === 'PENDING') return payment;

    if (result.status === 'FAILED') {
      db.prepare(
        `UPDATE payments SET status = 'FAILED', provider_status = ?, settled_at = ?
         WHERE client_reference = ?`,
      ).run(result.providerStatus, nowIso(), clientReference);
      return getPayment(clientReference)!;
    }

    db.prepare(
      `UPDATE payments
         SET status = 'SUCCESS', provider_txn_id = COALESCE(?, provider_txn_id),
             provider_status = ?, charges_pesewas = ?, settled_at = ?
       WHERE client_reference = ?`,
    ).run(
      result.providerTxnId,
      result.providerStatus,
      result.chargesPesewas,
      nowIso(),
      clientReference,
    );

    const amount = payment.amount_pesewas;
    const fees = result.chargesPesewas;

    if (payment.purpose === 'topup') {
      // Cash arrives at the float; the rider's wallet liability grows.
      post(`topup:${clientReference}`, [
        { account: ACCOUNTS.momoFloat, delta: amount - fees, memo: 'Hubtel top up net of charges' },
        { account: ACCOUNTS.fees, delta: fees, memo: 'Hubtel transaction charge' },
        { account: ACCOUNTS.riderCash(payment.user_id), delta: -amount, memo: 'Ryde Cash credited' },
      ]);
    } else {
      // Direct trip charge: clears the rider's outstanding receivable.
      post(`tripcharge:${clientReference}`, [
        { account: ACCOUNTS.momoFloat, delta: amount - fees, memo: 'Trip paid by MoMo' },
        { account: ACCOUNTS.fees, delta: fees, memo: 'Hubtel transaction charge' },
        { account: ACCOUNTS.riderDebt(payment.user_id), delta: -amount, memo: 'Trip debt cleared' },
      ]);
      if (payment.trip_id) {
        db.prepare(`UPDATE trips SET status = 'SETTLED' WHERE id = ?`).run(payment.trip_id);
      }
    }

    return getPayment(clientReference)!;
  });
}

/** Guard before a wallet-funded trip settles. Call inside the settlement tx. */
export function assertSufficientBalance(userId: string, amount: Pesewas): void {
  const balance = riderBalance(userId);
  if (balance < amount) {
    throw new HttpError(
      402,
      `Insufficient Ryde Cash: have ${balance}p, need ${amount}p`,
      'INSUFFICIENT_FUNDS',
    );
  }
}

/**
 * Reconciliation sweep.
 *
 * Webhooks get lost, delayed and duplicated, so the poller — not the webhook —
 * is what guarantees every payment reaches a terminal state. Prompts that go
 * unanswered are expired so they stop consuming attempts.
 */
export async function reconcilePending(opts: { maxAgeMinutes?: number; limit?: number } = {}) {
  const maxAge = opts.maxAgeMinutes ?? 15;
  const rows = db
    .prepare(
      `SELECT * FROM payments
       WHERE status = 'PENDING'
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .all(opts.limit ?? 50) as PaymentRow[];

  const summary = { checked: 0, settled: 0, expired: 0 };

  for (const row of rows) {
    const ageMinutes = (Date.now() - new Date(row.created_at).getTime()) / 60000;
    summary.checked += 1;

    try {
      const result = await hubtel.checkStatus(row.client_reference);
      db.prepare(
        `UPDATE payments SET poll_attempts = poll_attempts + 1, last_polled_at = ? WHERE client_reference = ?`,
      ).run(nowIso(), row.client_reference);

      if (result.status !== 'PENDING') {
        applyResult(row.client_reference, result);
        summary.settled += 1;
        continue;
      }
    } catch {
      // Upstream unavailable — leave PENDING and try again next sweep.
      continue;
    }

    if (ageMinutes > maxAge) {
      db.prepare(
        `UPDATE payments SET status = 'EXPIRED', settled_at = ? WHERE client_reference = ? AND status = 'PENDING'`,
      ).run(nowIso(), row.client_reference);
      summary.expired += 1;
    }
  }

  return summary;
}
