import { randomUUID } from 'node:crypto';
import { db, nowIso, tx } from './db.ts';
import { ACCOUNTS, post, riderDebt } from './ledger.ts';
import { HttpError, splitFare, type Pesewas } from './money.ts';
import { assertSufficientBalance, startCharge } from './payments.ts';
import { computeFare, distanceIsPlausible, type ProductId } from './pricing.ts';

export type PaymentMethod = 'wallet' | 'momo' | 'cash';

export interface TripRow {
  id: string;
  rider_id: string;
  driver_id: string | null;
  product: ProductId;
  pickup: string;
  dropoff: string;
  distance_m: number;
  duration_s: number;
  surge_bp: number;
  fare_pesewas: number;
  discount_pesewas: number;
  tip_pesewas: number;
  promo_code: string | null;
  payment_method: PaymentMethod;
  status: 'QUOTED' | 'ACTIVE' | 'COMPLETED' | 'SETTLED' | 'UNPAID';
  created_at: string;
  completed_at: string | null;
}

function commissionBp(): number {
  return Number(process.env.COMMISSION_BP ?? 2000);
}

function maxDebt(): Pesewas {
  return Number(process.env.MAX_RIDER_DEBT_PESEWAS ?? 5000);
}

export function getTrip(id: string): TripRow | undefined {
  return db.prepare(`SELECT * FROM trips WHERE id = ?`).get(id) as TripRow | undefined;
}

export interface QuoteInput {
  riderId: string;
  product: ProductId;
  pickup: { name: string; lat: number; lng: number };
  dropoff: { name: string; lat: number; lng: number };
  distanceM: number;
  durationS: number;
  surgeBp: number;
  paymentMethod: PaymentMethod;
  promoCode?: string;
  discountPesewas?: number;
}

const PROMOS: Record<string, Pesewas> = { RYDE10: 1000, ACCRA5: 500, KENTE20: 2000 };

/**
 * Price a trip and record the quote. The stored fare is the only amount that
 * can subsequently be charged.
 */
export function quoteTrip(input: QuoteInput): TripRow {
  if (!distanceIsPlausible(input.distanceM, input.pickup, input.dropoff)) {
    throw new HttpError(400, 'Reported route distance is implausible for these endpoints');
  }

  // A rider who owes us money doesn't get another ride until they settle.
  const debt = riderDebt(input.riderId);
  if (debt > maxDebt()) {
    throw new HttpError(
      402,
      `Outstanding balance of ${debt}p must be cleared before booking`,
      'OUTSTANDING_BALANCE',
    );
  }

  const surgeBp = Math.min(Math.max(input.surgeBp, 10000), 30000);
  const fare = computeFare({
    product: input.product,
    distanceM: input.distanceM,
    durationS: input.durationS,
    surgeBp,
  });

  const discount = input.promoCode ? (PROMOS[input.promoCode.toUpperCase()] ?? 0) : 0;
  const id = randomUUID();

  db.prepare(
    `INSERT INTO trips
       (id, rider_id, product, pickup, dropoff, distance_m, duration_s, surge_bp,
        fare_pesewas, discount_pesewas, promo_code, payment_method, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUOTED', ?)`,
  ).run(
    id,
    input.riderId,
    input.product,
    input.pickup.name,
    input.dropoff.name,
    Math.round(input.distanceM),
    Math.round(input.durationS),
    surgeBp,
    fare,
    Math.min(discount, fare),
    input.promoCode?.toUpperCase() ?? null,
    input.paymentMethod,
    nowIso(),
  );

  // Development shim. Real dispatch happens when a driver accepts through the
  // driver app; this exists so the demo rider flow can settle a trip on a
  // single device. It is off unless explicitly enabled, and refuses to run
  // against live Hubtel credentials.
  if (process.env.DEMO_AUTO_ASSIGN === 'true' && process.env.HUBTEL_MODE !== 'live') {
    const driver = db
      .prepare(`SELECT id FROM users WHERE role = 'driver' AND id != ? LIMIT 1`)
      .get(input.riderId) as { id: string } | undefined;
    if (driver) startTrip(id, driver.id);
  }

  return getTrip(id)!;
}

export function startTrip(tripId: string, driverId: string): TripRow {
  const trip = getTrip(tripId);
  if (!trip) throw new HttpError(404, 'Unknown trip');
  if (trip.status !== 'QUOTED') throw new HttpError(409, `Trip is ${trip.status}`);

  db.prepare(`UPDATE trips SET driver_id = ?, status = 'ACTIVE' WHERE id = ?`).run(driverId, tripId);
  return getTrip(tripId)!;
}

export interface Receipt {
  trip: TripRow;
  totalPesewas: Pesewas;
  driverSharePesewas: Pesewas;
  commissionPesewas: Pesewas;
  settlement: 'wallet' | 'momo_pending' | 'cash';
  paymentReference?: string;
}

/**
 * Complete and settle a trip.
 *
 * The driver is credited in the same transaction that closes the trip, whatever
 * the rider's payment method — the driver did the work and shouldn't carry the
 * collection risk. If a MoMo charge later fails, the loss sits on Ryde as a
 * rider receivable, which is what the debt gate above exists to bound.
 */
export async function completeTrip(opts: {
  tripId: string;
  /** The authenticated caller. Only the rider or the assigned driver may settle. */
  actor: { id: string; role: 'rider' | 'driver' };
  tipPesewas?: Pesewas;
  msisdn?: string;
  voucherToken?: string;
}): Promise<Receipt> {
  const existing = getTrip(opts.tripId);
  // A stranger must not be able to distinguish "not yours" from "doesn't
  // exist" — both are a flat 404.
  if (!existing) throw new HttpError(404, 'Unknown trip');

  const isRider = existing.rider_id === opts.actor.id;
  const isAssignedDriver = existing.driver_id === opts.actor.id;
  if (!isRider && !isAssignedDriver) throw new HttpError(404, 'Unknown trip');

  if (existing.status === 'SETTLED' || existing.status === 'COMPLETED') {
    // Idempotent: re-completing returns the original receipt.
    return receiptFor(existing);
  }
  if (!existing.driver_id) throw new HttpError(409, 'Trip has no driver assigned');

  // A driver cannot award themselves a tip on the rider's behalf.
  // A driver cannot award themselves a tip on the rider's behalf.
  const tip = isRider ? Math.max(0, Math.round(opts.tipPesewas ?? 0)) : 0;
  const total = existing.fare_pesewas - existing.discount_pesewas + tip;
  const { commission, driverShare } = splitFare(existing.fare_pesewas - existing.discount_pesewas, commissionBp());
  // Tips pass through to the driver untouched.
  const driverTotal = driverShare + tip;
  const driverId = existing.driver_id;
  const txnId = `trip:${existing.id}`;

  if (existing.payment_method === 'wallet') {
    return tx(() => {
      assertSufficientBalance(existing.rider_id, total);
      post(txnId, [
        { account: ACCOUNTS.riderCash(existing.rider_id), delta: total, memo: 'Trip paid from Ryde Cash' },
        { account: ACCOUNTS.driverPayable(driverId), delta: -driverTotal, memo: 'Driver earnings' },
        { account: ACCOUNTS.revenue, delta: -commission, memo: 'Ryde commission' },
      ]);
      db.prepare(
        `UPDATE trips SET status = 'SETTLED', tip_pesewas = ?, completed_at = ? WHERE id = ?`,
      ).run(tip, nowIso(), existing.id);
      return receiptFor(getTrip(existing.id)!, 'wallet');
    });
  }

  if (existing.payment_method === 'cash') {
    return tx(() => {
      // The driver already holds the cash, so they owe Ryde the commission.
      post(txnId, [
        { account: ACCOUNTS.driverPayable(driverId), delta: commission, memo: 'Commission on cash trip' },
        { account: ACCOUNTS.revenue, delta: -commission, memo: 'Ryde commission' },
      ]);
      db.prepare(
        `UPDATE trips SET status = 'SETTLED', tip_pesewas = ?, completed_at = ? WHERE id = ?`,
      ).run(tip, nowIso(), existing.id);
      return receiptFor(getTrip(existing.id)!, 'cash');
    });
  }

  // MoMo: book the receivable and pay the driver now, then chase the charge.
  tx(() => {
    post(txnId, [
      { account: ACCOUNTS.riderDebt(existing.rider_id), delta: total, memo: 'Trip owed by rider' },
      { account: ACCOUNTS.driverPayable(driverId), delta: -driverTotal, memo: 'Driver earnings' },
      { account: ACCOUNTS.revenue, delta: -commission, memo: 'Ryde commission' },
    ]);
    db.prepare(
      `UPDATE trips SET status = 'COMPLETED', tip_pesewas = ?, completed_at = ? WHERE id = ?`,
    ).run(tip, nowIso(), existing.id);
  });

  const payment = await startCharge({
    userId: existing.rider_id,
    amountPesewas: total,
    msisdn: opts.msisdn,
    voucherToken: opts.voucherToken,
    // Deterministic reference: retrying completion never double-charges.
    clientReference: `trip-${existing.id}`,
    purpose: 'trip',
    tripId: existing.id,
  });

  return {
    ...receiptFor(getTrip(existing.id)!, 'momo_pending'),
    paymentReference: payment.client_reference,
  };
}

function receiptFor(trip: TripRow, settlement: Receipt['settlement'] = 'wallet'): Receipt {
  const net = trip.fare_pesewas - trip.discount_pesewas;
  const { commission, driverShare } = splitFare(net, commissionBp());
  return {
    trip,
    totalPesewas: net + trip.tip_pesewas,
    driverSharePesewas: driverShare + trip.tip_pesewas,
    commissionPesewas: commission,
    settlement:
      trip.payment_method === 'cash' ? 'cash' : trip.status === 'SETTLED' ? 'wallet' : settlement,
  };
}
