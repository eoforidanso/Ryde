/**
 * Hubtel adapter — the only file that knows Hubtel exists.
 *
 * ⚠️ VERIFY BEFORE GOING LIVE
 * Endpoint paths, field casing and response codes below match Hubtel's
 * Receive Money / Send Money APIs as documented at developers.hubtel.com, but
 * Hubtel has revised these between versions. Check the current docs against
 * the four constants and two request shapes in this file. Everything else in
 * the service is provider-agnostic, so a correction here is the whole change.
 *
 * Auth is HTTP Basic with your API Client ID / Client Secret. The Merchant
 * Account Number (POS Sales ID) goes in the URL path.
 */

import { randomUUID } from 'node:crypto';
import { HttpError, pesewasToCedis, type Pesewas } from './money.ts';

const RECEIVE_URL = (merchant: string) =>
  `https://rmp.hubtel.com/merchantaccount/merchants/${merchant}/receive/mobilemoney`;

const SEND_URL = (merchant: string) =>
  `https://rmp.hubtel.com/merchantaccount/merchants/${merchant}/send/mobilemoney`;

const STATUS_URL = (merchant: string, clientReference: string) =>
  `https://api-txnstatus.hubtel.com/transactions/${merchant}/status?clientReference=${encodeURIComponent(clientReference)}`;

/** Hubtel's channel identifiers. `vodafone-gh` is Telecel Cash post-rebrand. */
export const CHANNELS = {
  mtn: 'mtn-gh',
  telecel: 'vodafone-gh',
  at: 'tigo-gh',
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

export function channelForMsisdn(msisdn: string): Channel {
  const p = msisdn.replace(/^\+?233/, '').replace(/\D/g, '').padStart(9, '0');
  const prefix = p.slice(0, 2);
  if (['24', '54', '55', '59', '25', '53'].includes(prefix)) return CHANNELS.mtn;
  if (['20', '50'].includes(prefix)) return CHANNELS.telecel;
  if (['27', '57', '26', '56'].includes(prefix)) return CHANNELS.at;
  return CHANNELS.mtn;
}

/** Normalise any local format to 233XXXXXXXXX. */
export function normaliseMsisdn(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('233')) return digits;
  if (digits.startsWith('0')) return `233${digits.slice(1)}`;
  if (digits.length === 9) return `233${digits}`;
  throw new HttpError(400, `Unrecognised Ghanaian mobile number: ${raw}`);
}

export type ProviderStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface ProviderResult {
  status: ProviderStatus;
  providerTxnId: string | null;
  providerStatus: string;
  chargesPesewas: Pesewas;
  raw: unknown;
}

interface Config {
  mode: 'mock' | 'live';
  clientId: string;
  clientSecret: string;
  merchant: string;
  callbackUrl: string;
}

function config(): Config {
  const mode = (process.env.HUBTEL_MODE ?? 'mock') as 'mock' | 'live';
  const cfg: Config = {
    mode,
    clientId: process.env.HUBTEL_CLIENT_ID ?? '',
    clientSecret: process.env.HUBTEL_CLIENT_SECRET ?? '',
    merchant: process.env.HUBTEL_MERCHANT_ACCOUNT ?? '',
    callbackUrl: `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:8787'}/api/webhooks/hubtel/${process.env.WEBHOOK_PATH_SECRET ?? 'dev'}`,
  };
  if (mode === 'live' && (!cfg.clientId || !cfg.clientSecret || !cfg.merchant)) {
    throw new Error('HUBTEL_MODE=live requires CLIENT_ID, CLIENT_SECRET and MERCHANT_ACCOUNT');
  }
  return cfg;
}

function authHeader(cfg: Config): string {
  return `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`;
}

/**
 * Map a Hubtel response envelope onto our status enum.
 *   "0000" — completed successfully
 *   "0001" — accepted, prompt delivered, awaiting the customer's PIN
 * Anything else is a failure for our purposes; the raw code is retained.
 */
function interpret(body: any): ProviderResult {
  const code = String(body?.ResponseCode ?? '');
  const data = body?.Data ?? {};
  const status: ProviderStatus =
    code === '0000' ? 'SUCCESS' : code === '0001' ? 'PENDING' : 'FAILED';
  return {
    status,
    providerTxnId: data.TransactionId ?? null,
    providerStatus: `${code}${data.Description ? ` ${data.Description}` : ''}`.trim(),
    chargesPesewas: typeof data.Charges === 'number' ? Math.round(data.Charges * 100) : 0,
    raw: body,
  };
}

async function call(url: string, cfg: Config, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: authHeader(cfg),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(502, `Hubtel returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  // 4xx/5xx still carry a ResponseCode we want to record rather than throw on.
  if (res.status >= 500) {
    throw new HttpError(502, `Hubtel ${res.status}: ${parsed?.Message ?? 'upstream error'}`);
  }
  return parsed;
}

export interface ChargeInput {
  clientReference: string;
  amountPesewas: Pesewas;
  msisdn: string;
  channel: Channel;
  customerName: string;
  description: string;
  /** Telecel Cash requires a voucher the customer generates by dialling *110#. */
  voucherToken?: string;
}

/** Debit a customer's mobile money wallet (Receive Money). */
export async function charge(input: ChargeInput): Promise<ProviderResult> {
  const cfg = config();

  if (cfg.mode === 'mock') return mockCharge(input);

  if (input.channel === CHANNELS.telecel && !input.voucherToken) {
    throw new HttpError(
      400,
      'Telecel Cash requires a voucher token — ask the customer to dial *110# and enter the code',
      'VOUCHER_REQUIRED',
    );
  }

  const body = {
    CustomerName: input.customerName,
    CustomerMsisdn: input.msisdn,
    Channel: input.channel,
    Amount: pesewasToCedis(input.amountPesewas),
    PrimaryCallbackUrl: cfg.callbackUrl,
    Description: input.description,
    ClientReference: input.clientReference,
    ...(input.voucherToken ? { Token: input.voucherToken } : {}),
  };

  return interpret(await call(RECEIVE_URL(cfg.merchant), cfg, body));
}

export interface PayoutInput {
  clientReference: string;
  amountPesewas: Pesewas;
  msisdn: string;
  channel: Channel;
  recipientName: string;
  description: string;
}

/** Credit a driver's mobile money wallet (Send Money). */
export async function payout(input: PayoutInput): Promise<ProviderResult> {
  const cfg = config();

  if (cfg.mode === 'mock') return mockPayout(input);

  const body = {
    RecipientName: input.recipientName,
    RecipientMsisdn: input.msisdn,
    Channel: input.channel,
    Amount: pesewasToCedis(input.amountPesewas),
    PrimaryCallbackUrl: cfg.callbackUrl,
    Description: input.description,
    ClientReference: input.clientReference,
  };

  return interpret(await call(SEND_URL(cfg.merchant), cfg, body));
}

/**
 * Authoritative status check.
 *
 * Used by the reconciliation poller AND by the webhook handler: Hubtel
 * callbacks carry no signature, so we never trust a callback body — we take it
 * only as a hint that something changed, then ask Hubtel directly.
 */
export async function checkStatus(clientReference: string): Promise<ProviderResult> {
  const cfg = config();
  if (cfg.mode === 'mock') return mockStatus(clientReference);
  return interpret(await call(STATUS_URL(cfg.merchant, clientReference), cfg));
}

/* ------------------------------------------------------------------------ */
/* Mock mode — lets the whole service run, and be tested, with no credentials */
/* ------------------------------------------------------------------------ */

const mockLedger = new Map<string, { status: ProviderStatus; txnId: string; charges: number }>();

function mockCharge(input: ChargeInput): ProviderResult {
  const txnId = randomUUID();
  // Amounts ending in 13 pesewas simulate a rider who declines the prompt.
  const willFail = input.amountPesewas % 100 === 13;
  mockLedger.set(input.clientReference, {
    status: willFail ? 'FAILED' : 'SUCCESS',
    txnId,
    charges: Math.round(input.amountPesewas * 0.0195),
  });
  return {
    status: 'PENDING',
    providerTxnId: txnId,
    providerStatus: '0001 mock prompt delivered',
    chargesPesewas: 0,
    raw: { mock: true },
  };
}

function mockPayout(input: PayoutInput): ProviderResult {
  const txnId = randomUUID();
  mockLedger.set(input.clientReference, { status: 'SUCCESS', txnId, charges: 0 });
  return {
    status: 'PENDING',
    providerTxnId: txnId,
    providerStatus: '0001 mock payout queued',
    chargesPesewas: 0,
    raw: { mock: true },
  };
}

function mockStatus(clientReference: string): ProviderResult {
  const entry = mockLedger.get(clientReference);
  if (!entry) {
    return { status: 'FAILED', providerTxnId: null, providerStatus: '2001 unknown reference', chargesPesewas: 0, raw: { mock: true } };
  }
  return {
    status: entry.status,
    providerTxnId: entry.txnId,
    providerStatus: entry.status === 'SUCCESS' ? '0000 mock success' : '2001 mock declined',
    chargesPesewas: entry.status === 'SUCCESS' ? entry.charges : 0,
    raw: { mock: true },
  };
}

export function isMock(): boolean {
  return (process.env.HUBTEL_MODE ?? 'mock') === 'mock';
}
