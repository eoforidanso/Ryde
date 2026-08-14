import { randomUUID } from 'node:crypto';
import { db, nowIso, tx } from './db.ts';
import * as hubtel from './hubtel.ts';
import { ACCOUNTS, driverPayable, post } from './ledger.ts';
import { HttpError, type Pesewas } from './money.ts';

export interface PayoutRow {
  client_reference: string;
  driver_id: string;
  amount_pesewas: number;
  channel: string;
  msisdn: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  provider_txn_id: string | null;
  provider_status: string | null;
  batch_id: string | null;
  created_at: string;
  settled_at: string | null;
}

export function getPayout(ref: string): PayoutRow | undefined {
  return db.prepare(`SELECT * FROM payouts WHERE client_reference = ?`).get(ref) as
    | PayoutRow
    | undefined;
}

/** Payouts are the fraud surface. Nothing above this leaves the building. */
const MAX_SINGLE_PAYOUT: Pesewas = 500_00;
const MAX_BATCH_TOTAL: Pesewas = 50_000_00;

/**
 * Pay every driver their outstanding balance.
 *
 * Deliberately not automatic: call it from a scheduled job that a human has
 * approved, or from an admin endpoint behind proper auth. The ledger is debited
 * only once the provider confirms, so a failed transfer leaves the driver's
 * balance intact rather than silently vanishing.
 */
export async function runPayoutBatch(opts: { minPesewas?: Pesewas; dryRun?: boolean } = {}) {
  const min = opts.minPesewas ?? 1000;
  const batchId = randomUUID();

  const drivers = db
    .prepare(
      `SELECT u.id, u.name, u.msisdn, -COALESCE(SUM(l.delta), 0) AS payable
         FROM users u
         JOIN ledger_entries l ON l.account = 'driver:' || u.id || ':payable'
        WHERE u.role = 'driver'
        GROUP BY u.id
       HAVING payable >= ?`,
    )
    .all(min) as { id: string; name: string; msisdn: string; payable: number }[];

  const total = drivers.reduce((sum, d) => sum + d.payable, 0);
  if (total > MAX_BATCH_TOTAL) {
    throw new HttpError(409, `Batch total ${total}p exceeds the ${MAX_BATCH_TOTAL}p cap — review manually`);
  }

  if (opts.dryRun) {
    return { batchId, dryRun: true, count: drivers.length, totalPesewas: total, drivers };
  }

  const results: PayoutRow[] = [];

  for (const driver of drivers) {
    if (driver.payable > MAX_SINGLE_PAYOUT) {
      console.warn(`[payout] skipping ${driver.id}: ${driver.payable}p exceeds single-payout cap`);
      continue;
    }

    const ref = randomUUID();
    const msisdn = hubtel.normaliseMsisdn(driver.msisdn);
    const channel = hubtel.channelForMsisdn(msisdn);

    db.prepare(
      `INSERT INTO payouts
         (client_reference, driver_id, amount_pesewas, channel, msisdn, status, batch_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    ).run(ref, driver.id, driver.payable, channel, msisdn, batchId, nowIso());

    try {
      const result = await hubtel.payout({
        clientReference: ref,
        amountPesewas: driver.payable,
        msisdn,
        channel,
        recipientName: driver.name,
        description: 'Ryde driver earnings',
      });
      db.prepare(
        `UPDATE payouts SET provider_txn_id = ?, provider_status = ? WHERE client_reference = ?`,
      ).run(result.providerTxnId, result.providerStatus, ref);
      if (result.status !== 'PENDING') applyPayoutResult(ref, result);
    } catch (err) {
      db.prepare(`UPDATE payouts SET provider_status = ? WHERE client_reference = ?`).run(
        `local_error: ${(err as Error).message}`.slice(0, 300),
        ref,
      );
    }

    results.push(getPayout(ref)!);
  }

  return { batchId, dryRun: false, count: results.length, totalPesewas: total, payouts: results };
}

/** Apply a provider outcome to a payout, exactly once. */
export function applyPayoutResult(ref: string, result: hubtel.ProviderResult): PayoutRow {
  return tx(() => {
    const row = db.prepare(`SELECT * FROM payouts WHERE client_reference = ?`).get(ref) as
      | PayoutRow
      | undefined;
    if (!row) throw new HttpError(404, `Unknown payout ${ref}`);
    if (row.status !== 'PENDING' || result.status === 'PENDING') return row;

    if (result.status === 'FAILED') {
      db.prepare(
        `UPDATE payouts SET status = 'FAILED', provider_status = ?, settled_at = ? WHERE client_reference = ?`,
      ).run(result.providerStatus, nowIso(), ref);
      return getPayout(ref)!;
    }

    db.prepare(
      `UPDATE payouts SET status = 'SUCCESS', provider_status = ?, settled_at = ? WHERE client_reference = ?`,
    ).run(result.providerStatus, nowIso(), ref);

    post(`payout:${ref}`, [
      { account: ACCOUNTS.driverPayable(row.driver_id), delta: row.amount_pesewas, memo: 'Earnings paid out' },
      { account: ACCOUNTS.momoFloat, delta: -row.amount_pesewas, memo: 'Disbursed via Hubtel' },
    ]);

    return getPayout(ref)!;
  });
}

export async function reconcilePayouts(limit = 50) {
  const rows = db
    .prepare(`SELECT * FROM payouts WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT ?`)
    .all(limit) as PayoutRow[];

  let settled = 0;
  for (const row of rows) {
    try {
      const result = await hubtel.checkStatus(row.client_reference);
      if (result.status !== 'PENDING') {
        applyPayoutResult(row.client_reference, result);
        settled += 1;
      }
    } catch {
      /* retry next sweep */
    }
  }
  return { checked: rows.length, settled };
}

export { driverPayable };
