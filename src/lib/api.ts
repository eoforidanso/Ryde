/**
 * Payments API client.
 *
 * When VITE_API_URL is unset the app runs entirely on its simulated state, so
 * the demo works with no backend and no sign-in. Set it to point at the
 * payments service and fares, wallet balances and settlement become
 * server-authoritative, and the app requires a real session.
 */

const BASE = import.meta.env.VITE_API_URL as string | undefined;

const TOKEN_KEY = 'ryde.session';

export function isLive(): boolean {
  return Boolean(BASE);
}

export const toPesewas = (cedis: number) => Math.round(cedis * 100);
export const toCedis = (pesewas: number) => pesewas / 100;

/* ------------------------------------------------------------------ */
/* Session storage                                                     */
/* ------------------------------------------------------------------ */

export interface AuthUser {
  id: string;
  name: string;
  msisdn: string;
  role: 'rider' | 'driver';
}

let token: string | null = null;

export function getToken(): string | null {
  if (token === null) token = localStorage.getItem(TOKEN_KEY);
  return token;
}

export function setToken(value: string | null) {
  token = value;
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Fired when the server rejects our token, so the UI can show sign-in again. */
type Listener = () => void;
const onSignedOut = new Set<Listener>();
export function subscribeSignedOut(fn: Listener): () => void {
  onSignedOut.add(fn);
  return () => {
    onSignedOut.delete(fn);
  };
}

export class ApiError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
  }
}

async function call<T>(
  path: string,
  init?: RequestInit & { idempotencyKey?: string; anonymous?: boolean },
): Promise<T> {
  const auth = init?.anonymous ? undefined : getToken();

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(init?.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
      ...init?.headers,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (res.status === 401 && !init?.anonymous) {
    // The token is dead — drop it and let the app fall back to sign-in rather
    // than leaving the user staring at a stale balance.
    setToken(null);
    onSignedOut.forEach((fn) => fn());
  }
  if (!res.ok) {
    throw new ApiError(body.error ?? `Request failed (${res.status})`, body.code, res.status);
  }
  return body as T;
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const requestOtp = (msisdn: string) =>
  call<{ sent: true; devCode?: string }>('/api/auth/request-otp', {
    method: 'POST',
    anonymous: true,
    body: JSON.stringify({ msisdn }),
  });

export async function verifyOtp(msisdn: string, code: string): Promise<AuthUser> {
  const session = await call<{ token: string; user: AuthUser }>('/api/auth/verify-otp', {
    method: 'POST',
    anonymous: true,
    body: JSON.stringify({ msisdn, code }),
  });
  setToken(session.token);
  return session.user;
}

export const me = () => call<{ user: AuthUser }>('/api/auth/me');

export async function logout() {
  try {
    await call('/api/auth/logout', { method: 'POST' });
  } finally {
    setToken(null);
  }
}

export const revokeAllSessions = () =>
  call<{ revoked: number }>('/api/auth/revoke-all', { method: 'POST' });

/* ------------------------------------------------------------------ */
/* Wallet and trips                                                    */
/* ------------------------------------------------------------------ */

export interface WalletResponse {
  user: AuthUser;
  balancePesewas: number;
  balanceFormatted: string;
  debtPesewas: number;
}

export const getWallet = () => call<WalletResponse>('/api/me/wallet');

export const topUp = (amountCedis: number, idempotencyKey: string) =>
  call<{ reference: string; status: string; message?: string }>('/api/me/topup', {
    method: 'POST',
    idempotencyKey,
    body: JSON.stringify({ amountPesewas: toPesewas(amountCedis) }),
  });

export const getPayment = (reference: string) =>
  call<{ status: string }>(`/api/payments/${reference}`);

export const quoteTrip = (input: {
  product: string;
  pickup: { name: string; lat: number; lng: number };
  dropoff: { name: string; lat: number; lng: number };
  distanceM: number;
  durationS: number;
  surgeBp: number;
  paymentMethod: 'wallet' | 'momo' | 'cash';
  promoCode?: string;
}) =>
  call<{ tripId: string; totalPesewas: number; formatted: string }>('/api/trips/quote', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export interface ReceiptResponse {
  totalPesewas: number;
  totalFormatted: string;
  settlement: 'wallet' | 'momo_pending' | 'cash';
}

export const completeTrip = (tripId: string, tipCedis: number) =>
  call<ReceiptResponse>(`/api/trips/${tripId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ tipPesewas: toPesewas(tipCedis) }),
  });

/** Map the app's payment method ids onto the server's settlement modes. */
export function settlementFor(paymentId: string): 'wallet' | 'momo' | 'cash' {
  if (paymentId === 'cash') return 'cash';
  // A MoMo or card method charges the rider directly at trip end. Ryde Cash
  // draws on the prepaid balance they already topped up.
  if (paymentId.startsWith('momo') || paymentId === 'card') return 'momo';
  return 'wallet';
}
