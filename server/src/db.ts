import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const db = new Database(process.env.DB_PATH ?? join(here, '..', 'ryde.db'));

db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));

/**
 * Run `fn` inside an IMMEDIATE transaction.
 *
 * better-sqlite3 is synchronous, which is exactly what we want for money: the
 * whole read-check-write sequence happens with the write lock held, so two
 * concurrent trip completions cannot both see the same stale balance.
 */
export function tx<T>(fn: () => T): T {
  return db.transaction(fn).immediate();
}

export function nowIso(): string {
  return new Date().toISOString();
}
