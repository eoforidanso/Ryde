import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { resolveSession, type AuthUser, type Role } from './auth.ts';
import { HttpError } from './money.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export function clientIp(req: Request): string {
  // Behind a proxy, trust only the hop you control. Configure TRUST_PROXY and
  // make sure your load balancer strips inbound X-Forwarded-For.
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = req.header('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function bearer(req: Request): string {
  const header = req.header('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

/**
 * Attach the authenticated user, or reject.
 *
 * Nothing downstream may read an actor id from the path, query or body — the
 * identity comes from here and only here. That is the whole defence against
 * "change the id in the URL and read someone else's wallet".
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = resolveSession(bearer(req));
  if (!user) throw new HttpError(401, 'Sign in to continue', 'UNAUTHENTICATED');
  req.auth = user;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw new HttpError(401, 'Sign in to continue', 'UNAUTHENTICATED');
    if (!roles.includes(req.auth.role)) {
      throw new HttpError(403, 'Not permitted for this account', 'FORBIDDEN');
    }
    next();
  };
}

/**
 * Machine auth for /api/ops/*.
 *
 * Deliberately a different mechanism from user sessions: no user token, however
 * privileged, should ever be able to trigger a payout run. Rotate by changing
 * the env var; compare in constant time.
 */
export function requireServiceKey(req: Request, _res: Response, next: NextFunction) {
  const expected = process.env.SERVICE_API_KEY ?? '';
  const presented = req.header('x-service-key') ?? '';

  if (!expected || expected === 'change-me') {
    throw new HttpError(503, 'Service key is not configured', 'SERVICE_KEY_UNSET');
  }

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(401, 'Invalid service key', 'BAD_SERVICE_KEY');
  }
  next();
}

/* ------------------------------------------------------------------------ */
/* Rate limiting                                                             */
/* ------------------------------------------------------------------------ */

const buckets = new Map<string, number[]>();

/**
 * Fixed-window limiter keyed by IP.
 *
 * In-memory, so it is per-process: move to Redis before running more than one
 * instance. The durable per-number OTP limit lives in the database precisely
 * because that one guards real money (SMS spend) and must survive a restart.
 */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = opts.key ? opts.key(req) : clientIp(req);
    const now = Date.now();
    const hits = (buckets.get(key) ?? []).filter((t) => now - t < opts.windowMs);

    if (hits.length >= opts.max) {
      throw new HttpError(429, 'Too many requests. Slow down.', 'RATE_LIMITED');
    }

    hits.push(now);
    buckets.set(key, hits);
    next();
  };
}

// Keep the limiter from growing without bound.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, hits] of buckets) {
    const live = hits.filter((t) => t > cutoff);
    if (live.length === 0) buckets.delete(key);
    else buckets.set(key, live);
  }
}, 10 * 60 * 1000).unref();

/** Security headers, without pulling in a dependency. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/**
 * CORS restricted to an explicit allowlist.
 *
 * Credentials are sent as a bearer token rather than a cookie, so there is no
 * CSRF surface here — but an open ACAO would still let any site read responses.
 */
export function cors(req: Request, res: Response, next: NextFunction) {
  const allowed = (process.env.CORS_ORIGINS ?? 'http://localhost:5178')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const origin = req.header('origin');
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key, X-Service-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}
