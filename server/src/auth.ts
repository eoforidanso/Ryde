/**
 * Phone-number authentication.
 *
 * Ghanaian riders and drivers sign in with their MSISDN and a one-time code —
 * the same number their mobile money wallet is registered to. There are no
 * passwords to leak.
 *
 * The threat we spend the most effort on is not credential theft, it is SMS
 * pumping: an attacker hammering request-otp to burn your SMS budget. Hence the
 * per-number window, the strict Ghanaian-MSISDN check, and the fact that a
 * repeat request inside the window resends the *existing* code rather than
 * minting and paying for a new one.
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { db, nowIso } from './db.ts';
import { normaliseMsisdn } from './hubtel.ts';
import { HttpError } from './money.ts';
import { sendSms } from './sms.ts';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_PER_WINDOW = 3;

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type Role = 'rider' | 'driver';

export interface AuthUser {
  id: string;
  name: string;
  msisdn: string;
  role: Role;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Create or update a user, storing the number in canonical 233XXXXXXXXX form.
 *
 * Normalising on write is load-bearing, not cosmetic: the UNIQUE constraint on
 * users.msisdn only means anything if every row is canonical, otherwise the
 * same person registers twice as 0244... and 233244... and ends up with two
 * wallets. Every write path must go through here.
 */
export function upsertUser(input: {
  id: string;
  name: string;
  msisdn: string;
  role: Role;
}): AuthUser {
  const msisdn = normaliseMsisdn(input.msisdn);
  db.prepare(
    `INSERT INTO users (id, name, msisdn, role, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(msisdn) DO UPDATE SET name = excluded.name, role = excluded.role`,
  ).run(input.id, input.name, msisdn, input.role, nowIso());

  return db.prepare(`SELECT id, name, msisdn, role FROM users WHERE msisdn = ?`).get(msisdn) as AuthUser;
}

function equalHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function logEvent(event: string, msisdn: string | null, userId: string | null, ip?: string) {
  db.prepare(
    `INSERT INTO auth_events (msisdn, user_id, event, ip, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(msisdn, userId, event, ip ?? null, nowIso());
}

/* ------------------------------------------------------------------------ */
/* One-time codes                                                            */
/* ------------------------------------------------------------------------ */

interface OtpRow {
  msisdn: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  sent_count: number;
  window_start: string;
  consumed_at: string | null;
}

/**
 * Send a login code.
 *
 * Returns nothing meaningful by design: the response must look identical
 * whether or not the number belongs to a registered user, or it becomes an
 * account-enumeration oracle. In mock mode the code is returned so the
 * self-test and local development can drive the flow.
 */
export async function requestOtp(rawMsisdn: string, ip?: string): Promise<{ devCode?: string }> {
  // Rejects anything that is not a valid Ghanaian mobile number, which alone
  // removes most international SMS-pumping targets.
  const msisdn = normaliseMsisdn(rawMsisdn);

  const existing = db.prepare(`SELECT * FROM otp_codes WHERE msisdn = ?`).get(msisdn) as
    | OtpRow
    | undefined;

  const now = Date.now();
  let sentCount = 1;
  let windowStart = nowIso();

  if (existing) {
    const windowAge = now - new Date(existing.window_start).getTime();
    if (windowAge < OTP_WINDOW_MS) {
      if (existing.sent_count >= OTP_MAX_PER_WINDOW) {
        logEvent('otp_rate_limited', msisdn, null, ip);
        throw new HttpError(
          429,
          'Too many codes requested. Try again in a few minutes.',
          'OTP_RATE_LIMITED',
        );
      }
      sentCount = existing.sent_count + 1;
      windowStart = existing.window_start;
    }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(now + OTP_TTL_MS).toISOString();

  // A fresh code invalidates any previous one for this number.
  db.prepare(
    `INSERT INTO otp_codes
       (msisdn, code_hash, expires_at, attempts, sent_count, window_start, consumed_at, created_at)
     VALUES (?, ?, ?, 0, ?, ?, NULL, ?)
     ON CONFLICT(msisdn) DO UPDATE SET
       code_hash = excluded.code_hash,
       expires_at = excluded.expires_at,
       attempts = 0,
       sent_count = excluded.sent_count,
       window_start = excluded.window_start,
       consumed_at = NULL,
       created_at = excluded.created_at`,
  ).run(msisdn, sha256(`${msisdn}:${code}`), expiresAt, sentCount, windowStart, nowIso());

  await sendSms(msisdn, `${code} is your Ryde code. It expires in 5 minutes. Never share it.`);
  logEvent('otp_sent', msisdn, null, ip);

  return process.env.HUBTEL_MODE === 'live' ? {} : { devCode: code };
}

export interface Session {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

/**
 * Verify a code and open a session.
 *
 * Every failure path returns the same message and status: a caller cannot tell
 * an unknown number from a wrong code from an expired code.
 */
export function verifyOtp(
  rawMsisdn: string,
  code: string,
  meta: { ip?: string; userAgent?: string } = {},
): Session {
  const msisdn = normaliseMsisdn(rawMsisdn);
  const invalid = new HttpError(401, 'That code is not valid or has expired', 'OTP_INVALID');

  const row = db.prepare(`SELECT * FROM otp_codes WHERE msisdn = ?`).get(msisdn) as
    | OtpRow
    | undefined;
  if (!row || row.consumed_at) throw invalid;

  if (Date.now() > new Date(row.expires_at).getTime()) {
    db.prepare(`DELETE FROM otp_codes WHERE msisdn = ?`).run(msisdn);
    throw invalid;
  }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    logEvent('otp_attempts_exhausted', msisdn, null, meta.ip);
    db.prepare(`DELETE FROM otp_codes WHERE msisdn = ?`).run(msisdn);
    throw invalid;
  }

  // Count the attempt before checking it, so a crash can't reset the counter.
  db.prepare(`UPDATE otp_codes SET attempts = attempts + 1 WHERE msisdn = ?`).run(msisdn);

  if (!equalHex(row.code_hash, sha256(`${msisdn}:${code}`))) {
    logEvent('otp_failed', msisdn, null, meta.ip);
    throw invalid;
  }

  // Single use: burn it the moment it succeeds.
  db.prepare(`DELETE FROM otp_codes WHERE msisdn = ?`).run(msisdn);

  const user = db.prepare(`SELECT id, name, msisdn, role FROM users WHERE msisdn = ?`).get(msisdn) as
    | AuthUser
    | undefined;
  if (!user) {
    // Correct code, no account. Still generic — registration is a separate flow.
    logEvent('otp_no_account', msisdn, null, meta.ip);
    throw invalid;
  }

  logEvent('login', msisdn, user.id, meta.ip);
  return openSession(user, meta);
}

/* ------------------------------------------------------------------------ */
/* Sessions                                                                  */
/* ------------------------------------------------------------------------ */

export function openSession(
  user: AuthUser,
  meta: { ip?: string; userAgent?: string } = {},
): Session {
  const token = `ryde_${randomBytes(32).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(sha256(token), user.id, nowIso(), expiresAt, meta.userAgent ?? null, meta.ip ?? null);

  // The raw token is returned exactly once and never stored.
  return { token, expiresAt, user };
}

/**
 * Resolve a bearer token to a user.
 *
 * The presented token is hashed and looked up by primary key — no secret is
 * ever compared byte-by-byte, so there is nothing to time.
 */
export function resolveSession(token: string): AuthUser | null {
  if (!token || !token.startsWith('ryde_')) return null;

  const row = db
    .prepare(
      `SELECT s.token_hash, s.expires_at, s.revoked_at,
              u.id, u.name, u.msisdn, u.role
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .get(sha256(token)) as
    | (AuthUser & { token_hash: string; expires_at: string; revoked_at: string | null })
    | undefined;

  if (!row || row.revoked_at) return null;
  if (Date.now() > new Date(row.expires_at).getTime()) return null;

  db.prepare(`UPDATE sessions SET last_used_at = ? WHERE token_hash = ?`).run(
    nowIso(),
    row.token_hash,
  );

  return { id: row.id, name: row.name, msisdn: row.msisdn, role: row.role };
}

export function revokeSession(token: string): void {
  db.prepare(`UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`).run(
    nowIso(),
    sha256(token),
  );
}

/** Kill every session for a user — the "my phone was stolen" button. */
export function revokeAllSessions(userId: string): number {
  return db
    .prepare(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`)
    .run(nowIso(), userId).changes;
}

export function listSessions(userId: string) {
  return db
    .prepare(
      `SELECT created_at, last_used_at, expires_at, user_agent, ip, revoked_at
         FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    )
    .all(userId);
}
