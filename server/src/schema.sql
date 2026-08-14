PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  msisdn      TEXT NOT NULL UNIQUE,        -- 233XXXXXXXXX
  role        TEXT NOT NULL DEFAULT 'rider',
  created_at  TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Double-entry ledger. Every transaction's deltas sum to zero; this is
-- enforced in ledger.ts, not by the schema, so keep all writes going through
-- post(). Amounts are integer pesewas — never floats, never cedis.
--
-- Sign convention (standard accounting, single signed column):
--   assets      positive = Ryde holds it        (ryde:momo_float)
--   liabilities negative = Ryde owes it         (user:*:cash, driver:*:payable)
--   revenue     negative = Ryde earned it       (ryde:revenue)
--   receivable  positive = someone owes Ryde    (user:*:receivable)
--
-- So a rider's spendable balance is -balanceOf('user:{id}:cash').
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  txn_id      TEXT NOT NULL,
  account     TEXT NOT NULL,
  delta       INTEGER NOT NULL,
  memo        TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account);
CREATE INDEX IF NOT EXISTS idx_ledger_txn     ON ledger_entries(txn_id);

-- Collections: money moving from a rider's MoMo wallet into Ryde.
CREATE TABLE IF NOT EXISTS payments (
  client_reference  TEXT PRIMARY KEY,       -- our idempotency key, sent to Hubtel
  user_id           TEXT NOT NULL REFERENCES users(id),
  amount_pesewas    INTEGER NOT NULL,
  channel           TEXT NOT NULL,          -- mtn-gh | vodafone-gh | tigo-gh
  msisdn            TEXT NOT NULL,
  purpose           TEXT NOT NULL,          -- topup | trip
  trip_id           TEXT,
  status            TEXT NOT NULL,          -- PENDING | SUCCESS | FAILED | EXPIRED
  provider_txn_id   TEXT,
  provider_status   TEXT,
  charges_pesewas   INTEGER NOT NULL DEFAULT 0,
  poll_attempts     INTEGER NOT NULL DEFAULT 0,
  last_polled_at    TEXT,
  created_at        TEXT NOT NULL,
  settled_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_user   ON payments(user_id);

-- Disbursements: money moving from Ryde out to a driver's MoMo wallet.
CREATE TABLE IF NOT EXISTS payouts (
  client_reference  TEXT PRIMARY KEY,
  driver_id         TEXT NOT NULL REFERENCES users(id),
  amount_pesewas    INTEGER NOT NULL,
  channel           TEXT NOT NULL,
  msisdn            TEXT NOT NULL,
  status            TEXT NOT NULL,          -- PENDING | SUCCESS | FAILED
  provider_txn_id   TEXT,
  provider_status   TEXT,
  batch_id          TEXT,
  created_at        TEXT NOT NULL,
  settled_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);

CREATE TABLE IF NOT EXISTS trips (
  id                TEXT PRIMARY KEY,
  rider_id          TEXT NOT NULL REFERENCES users(id),
  driver_id         TEXT REFERENCES users(id),
  product           TEXT NOT NULL,
  pickup            TEXT NOT NULL,
  dropoff           TEXT NOT NULL,
  distance_m        INTEGER NOT NULL,
  duration_s        INTEGER NOT NULL,
  surge_bp          INTEGER NOT NULL DEFAULT 10000,
  fare_pesewas      INTEGER NOT NULL,
  discount_pesewas  INTEGER NOT NULL DEFAULT 0,
  tip_pesewas       INTEGER NOT NULL DEFAULT 0,
  promo_code        TEXT,
  payment_method    TEXT NOT NULL,          -- wallet | momo | cash
  status            TEXT NOT NULL,          -- QUOTED | ACTIVE | COMPLETED | SETTLED | UNPAID
  created_at        TEXT NOT NULL,
  completed_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_trips_rider ON trips(rider_id);

-- Replayed webhooks are the norm, not the exception.
CREATE TABLE IF NOT EXISTS webhook_events (
  id           TEXT PRIMARY KEY,            -- provider txn id + status
  provider     TEXT NOT NULL,
  body         TEXT NOT NULL,
  received_at  TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Authentication
--
-- Sessions are opaque random tokens, stored only as a SHA-256 hash. Lookup is
-- by hash, so a presented token is never compared byte-by-byte against a
-- secret and there is no timing side channel. Opaque beats JWT here because a
-- payments service needs instant revocation — a stolen handset must be able to
-- kill every session immediately.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  last_used_at  TEXT,
  user_agent    TEXT,
  ip            TEXT,
  revoked_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- One-time codes. Stored hashed, single-use, attempt-capped and short-lived.
CREATE TABLE IF NOT EXISTS otp_codes (
  msisdn        TEXT PRIMARY KEY,
  code_hash     TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  sent_count    INTEGER NOT NULL DEFAULT 1,
  window_start  TEXT NOT NULL,
  consumed_at   TEXT,
  created_at    TEXT NOT NULL
);

-- Auth attempts, for lockout forensics and abuse investigation.
CREATE TABLE IF NOT EXISTS auth_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  msisdn      TEXT,
  user_id     TEXT,
  event       TEXT NOT NULL,
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_events_msisdn ON auth_events(msisdn, created_at);
