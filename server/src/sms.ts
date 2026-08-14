/**
 * Hubtel SMS — used to deliver one-time codes.
 *
 * ⚠️ Same caveat as the payments adapter: verify the endpoint and field names
 * against the current Hubtel docs before going live. Sender IDs must be
 * registered with Hubtel first, or messages are silently dropped.
 */

import { isMock } from './hubtel.ts';

const SEND_URL = 'https://sms.hubtel.com/v1/messages/send';

export async function sendSms(to: string, content: string): Promise<void> {
  if (isMock()) {
    console.log(`\n  ┌─ SMS (mock) → ${to}`);
    console.log(`  └─ ${content}\n`);
    return;
  }

  const auth = Buffer.from(
    `${process.env.HUBTEL_CLIENT_ID}:${process.env.HUBTEL_CLIENT_SECRET}`,
  ).toString('base64');

  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      From: process.env.SMS_SENDER_ID ?? 'Ryde',
      To: to,
      Content: content,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    // Never surface the reason to the caller — it would confirm whether a
    // number is reachable. Log it for operators instead.
    console.error(`[sms] send failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    throw new Error('SMS delivery failed');
  }
}
