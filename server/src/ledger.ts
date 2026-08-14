import { db, nowIso } from './db.ts';
import type { Pesewas } from './money.ts';

export interface Posting {
  account: string;
  delta: Pesewas;
  memo?: string;
}

export const ACCOUNTS = {
  /** Cash sitting with Hubtel / the telcos on Ryde's behalf. Asset. */
  momoFloat: 'ryde:momo_float',
  /** Commission earned. Revenue. */
  revenue: 'ryde:revenue',
  /** Provider transaction charges. Expense. */
  fees: 'ryde:fees',
  /** A rider's prepaid Ryde Cash. Liability — stored negative. */
  riderCash: (userId: string) => `user:${userId}:cash`,
  /** A trip a rider took but hasn't paid for. Receivable — stored positive. */
  riderDebt: (userId: string) => `user:${userId}:receivable`,
  /** Earnings owed to a driver, pending payout. Liability — stored negative. */
  driverPayable: (driverId: string) => `driver:${driverId}:payable`,
} as const;

/**
 * Write one balanced transaction.
 *
 * Throws if the postings don't sum to zero — an unbalanced ledger is a bug we
 * want to fail loudly at write time, not discover during reconciliation. Must
 * be called inside tx().
 */
export function post(txnId: string, postings: Posting[]): void {
  const sum = postings.reduce((acc, p) => acc + p.delta, 0);
  if (sum !== 0) {
    throw new Error(`Unbalanced ledger transaction ${txnId}: postings sum to ${sum}, expected 0`);
  }
  if (postings.some((p) => !Number.isInteger(p.delta))) {
    throw new Error(`Non-integer posting in transaction ${txnId}`);
  }

  const stmt = db.prepare(
    `INSERT INTO ledger_entries (txn_id, account, delta, memo, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const at = nowIso();
  for (const p of postings) {
    if (p.delta === 0) continue;
    stmt.run(txnId, p.account, p.delta, p.memo ?? null, at);
  }
}

export function balanceOf(account: string): Pesewas {
  const row = db
    .prepare(`SELECT COALESCE(SUM(delta), 0) AS balance FROM ledger_entries WHERE account = ?`)
    .get(account) as { balance: number };
  return row.balance;
}

/** Spendable Ryde Cash. Liability accounts are stored negative, so flip it. */
export function riderBalance(userId: string): Pesewas {
  return -balanceOf(ACCOUNTS.riderCash(userId));
}

/** Outstanding trip debt for a rider. */
export function riderDebt(userId: string): Pesewas {
  return balanceOf(ACCOUNTS.riderDebt(userId));
}

export function driverPayable(driverId: string): Pesewas {
  return -balanceOf(ACCOUNTS.driverPayable(driverId));
}

export function statement(account: string, limit = 50) {
  return db
    .prepare(
      `SELECT txn_id, account, delta, memo, created_at
       FROM ledger_entries WHERE account = ?
       ORDER BY id DESC LIMIT ?`,
    )
    .all(account, limit);
}

/**
 * Global invariant: every account summed together must be zero.
 * Run it in tests and as a periodic health check.
 */
export function ledgerIsBalanced(): boolean {
  const row = db
    .prepare(`SELECT COALESCE(SUM(delta), 0) AS total FROM ledger_entries`)
    .get() as { total: number };
  return row.total === 0;
}
