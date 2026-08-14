/**
 * End-to-end exercise of every money path, against Hubtel mock mode.
 *   npm test
 *
 * Asserts the ledger balances to zero after every step — if a posting is ever
 * unbalanced or applied twice, this fails loudly.
 */

import 'dotenv/config';
process.env.HUBTEL_MODE = 'mock';
process.env.DB_PATH = ':memory:';
// Tests drive dispatch explicitly; the demo shim would assign drivers behind us.
process.env.DEMO_AUTO_ASSIGN = 'false';

const { db } = await import('./db.ts');
const { ledgerIsBalanced, riderBalance, riderDebt, driverPayable } = await import('./ledger.ts');
const { startCharge, applyResult, reconcilePending, getPayment } = await import('./payments.ts');
const { quoteTrip, startTrip, completeTrip } = await import('./trips.ts');
const { runPayoutBatch } = await import('./payouts.ts');
const { checkStatus } = await import('./hubtel.ts');
const { formatGHS } = await import('./money.ts');
const {
  requestOtp, verifyOtp, resolveSession, revokeSession, revokeAllSessions, upsertUser,
} = await import('./auth.ts');

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  const balanced = ledgerIsBalanced();
  const ok = condition && balanced;
  if (!ok) failures += 1;
  const flag = ok ? '  ok  ' : ' FAIL ';
  console.log(`[${flag}] ${label}${detail ? ` — ${detail}` : ''}${balanced ? '' : '  (LEDGER UNBALANCED)'}`);
}

function seedUser(id: string, name: string, msisdn: string, role: 'rider' | 'driver') {
  // Goes through upsertUser so numbers are stored canonically, exactly as the
  // real registration path does.
  upsertUser({ id, name, msisdn, role });
}

const RIDER = { id: 'rider-1', role: 'rider' as const };
const DRIVER = { id: 'driver-1', role: 'driver' as const };

const EAST_LEGON = { name: 'A&C Square, East Legon', lat: 5.6383, lng: -0.1553 };
const AIRPORT = { name: 'Kotoka International Airport', lat: 5.6052, lng: -0.1668 };

console.log('\nRyde payments — self test (Hubtel mock)\n' + '─'.repeat(52));

seedUser('rider-1', 'Ama Boakye', '0244000418', 'rider');
seedUser('driver-1', 'Kwame Danso', '0209990111', 'driver');

/* 1. Top up ------------------------------------------------------------- */

const topUp = await startCharge({ userId: 'rider-1', amountPesewas: 20000, purpose: 'topup' });
check('top-up starts PENDING', topUp.status === 'PENDING', topUp.client_reference.slice(0, 8));
check('no balance before settlement', riderBalance('rider-1') === 0);

await reconcilePending();
check(
  'top-up settles and credits wallet',
  riderBalance('rider-1') === 20000,
  formatGHS(riderBalance('rider-1')),
);

/* 2. Replay protection -------------------------------------------------- */

const verified = await checkStatus(topUp.client_reference);
applyResult(topUp.client_reference, verified);
applyResult(topUp.client_reference, verified);
check('replayed webhook does not double-credit', riderBalance('rider-1') === 20000);

const retry = await startCharge({
  userId: 'rider-1',
  amountPesewas: 20000,
  clientReference: topUp.client_reference,
  purpose: 'topup',
});
check('same idempotency key returns original payment', retry.client_reference === topUp.client_reference);
await reconcilePending();
check('idempotent retry did not charge twice', riderBalance('rider-1') === 20000);

/* 3. Wallet-funded trip ------------------------------------------------- */

const walletTrip = quoteTrip({
  riderId: 'rider-1', product: 'go', pickup: EAST_LEGON, dropoff: AIRPORT,
  distanceM: 6200, durationS: 900, surgeBp: 16000, paymentMethod: 'wallet',
});
check('trip quoted server-side', walletTrip.fare_pesewas > 0, formatGHS(walletTrip.fare_pesewas));

startTrip(walletTrip.id, 'driver-1');
const walletReceipt = await completeTrip({ tripId: walletTrip.id, actor: RIDER, tipPesewas: 500 });
const expectedBalance = 20000 - walletReceipt.totalPesewas;

check('wallet debited by exact total', riderBalance('rider-1') === expectedBalance, formatGHS(riderBalance('rider-1')));
check(
  'driver credited fare less commission, plus full tip',
  driverPayable('driver-1') === walletReceipt.driverSharePesewas,
  formatGHS(driverPayable('driver-1')),
);
check('trip marked SETTLED', walletReceipt.trip.status === 'SETTLED');

const again = await completeTrip({ tripId: walletTrip.id, actor: RIDER, tipPesewas: 500 });
check('re-completing is idempotent', riderBalance('rider-1') === expectedBalance, again.trip.status);

/* 4. Insufficient funds ------------------------------------------------- */

const bigTrip = quoteTrip({
  riderId: 'rider-1', product: 'xl', pickup: EAST_LEGON, dropoff: AIRPORT,
  distanceM: 6200, durationS: 900, surgeBp: 30000, paymentMethod: 'wallet',
});
startTrip(bigTrip.id, 'driver-1');
db.prepare(`UPDATE trips SET fare_pesewas = 999999 WHERE id = ?`).run(bigTrip.id);
let refused = false;
try {
  await completeTrip({ tripId: bigTrip.id, actor: RIDER });
} catch (err) {
  refused = (err as { code?: string }).code === 'INSUFFICIENT_FUNDS';
}
check('wallet trip beyond balance is refused', refused);

/* 5. MoMo trip where the rider declines the prompt ---------------------- */

const momoTrip = quoteTrip({
  riderId: 'rider-1', product: 'okada', pickup: EAST_LEGON, dropoff: AIRPORT,
  distanceM: 6200, durationS: 700, surgeBp: 10000, paymentMethod: 'momo',
});
startTrip(momoTrip.id, 'driver-1');

// Mock rule: a total ending in 13p is declined by the rider.
const declineTip = ((13 - (momoTrip.fare_pesewas - momoTrip.discount_pesewas)) % 100 + 100) % 100;
const momoReceipt = await completeTrip({ tripId: momoTrip.id, actor: RIDER, tipPesewas: declineTip });
const driverBefore = driverPayable('driver-1');

check('driver paid immediately on MoMo trip', driverBefore > walletReceipt.driverSharePesewas);
check('rider debt booked', riderDebt('rider-1') === momoReceipt.totalPesewas, formatGHS(riderDebt('rider-1')));

await reconcilePending();
const failedPayment = getPayment(`trip-${momoTrip.id}`);
check('declined prompt recorded as FAILED', failedPayment?.status === 'FAILED');
check('debt survives a failed charge', riderDebt('rider-1') === momoReceipt.totalPesewas);
check('driver keeps their earnings', driverPayable('driver-1') === driverBefore);

/* 6. Debt gate ---------------------------------------------------------- */

// Tighten the cap below the debt just booked so the gate is exercised
// deterministically rather than depending on the fare landing above GH₵50.
process.env.MAX_RIDER_DEBT_PESEWAS = String(riderDebt('rider-1') - 1);

let blocked = false;
try {
  quoteTrip({
    riderId: 'rider-1', product: 'go', pickup: EAST_LEGON, dropoff: AIRPORT,
    distanceM: 6200, durationS: 900, surgeBp: 10000, paymentMethod: 'wallet',
  });
} catch (err) {
  blocked = (err as { code?: string }).code === 'OUTSTANDING_BALANCE';
}
check('rider with debt above the cap cannot book', blocked);

/* 7. Implausible distance ---------------------------------------------- */

let rejected = false;
try {
  quoteTrip({
    riderId: 'driver-1', product: 'go', pickup: EAST_LEGON, dropoff: AIRPORT,
    distanceM: 150_000, durationS: 900, surgeBp: 10000, paymentMethod: 'cash',
  });
} catch {
  rejected = true;
}
check('inflated distance is rejected', rejected);

/* 8. Cash trip ---------------------------------------------------------- */

const cashTrip = quoteTrip({
  riderId: 'driver-1', product: 'go', pickup: EAST_LEGON, dropoff: AIRPORT,
  distanceM: 6200, durationS: 900, surgeBp: 10000, paymentMethod: 'cash',
});
startTrip(cashTrip.id, 'driver-1');
const payableBeforeCash = driverPayable('driver-1');
const cashReceipt = await completeTrip({ tripId: cashTrip.id, actor: DRIVER });
check(
  'cash trip reduces what Ryde owes the driver by the commission',
  driverPayable('driver-1') === payableBeforeCash - cashReceipt.commissionPesewas,
  formatGHS(cashReceipt.commissionPesewas),
);

/* 9. Payout ------------------------------------------------------------- */

const dry = await runPayoutBatch({ dryRun: true });
check('dry run lists the driver', dry.count === 1, formatGHS(dry.totalPesewas));

const owed = driverPayable('driver-1');
await runPayoutBatch({ dryRun: false });
await reconcilePending();
const { reconcilePayouts } = await import('./payouts.ts');
await reconcilePayouts();
check('payout clears the driver balance', driverPayable('driver-1') === 0, `paid ${formatGHS(owed)}`);


/* 10. Authentication ---------------------------------------------------- */

console.log('─'.repeat(52));

const { devCode } = await requestOtp('0244000418');
check('OTP issued', typeof devCode === 'string' && devCode!.length === 6);

// The stored code must never be recoverable from the database.
const stored = db.prepare(`SELECT code_hash FROM otp_codes WHERE msisdn = ?`).get('233244000418') as { code_hash: string };
check('OTP stored hashed, not in clear', stored.code_hash !== devCode && stored.code_hash.length === 64);

let wrongRejected = false;
try { verifyOtp('0244000418', '000000'); } catch (e) { wrongRejected = (e as { code?: string }).code === 'OTP_INVALID'; }
check('wrong code rejected', wrongRejected);

const session = verifyOtp('0244000418', devCode!);
check('correct code opens a session', session.user.id === 'rider-1' && session.token.startsWith('ryde_'));

const sessionStored = db.prepare(`SELECT token_hash FROM sessions LIMIT 1`).get() as { token_hash: string };
check('session token stored hashed', sessionStored.token_hash !== session.token);

let replayRejected = false;
try { verifyOtp('0244000418', devCode!); } catch (e) { replayRejected = (e as { code?: string }).code === 'OTP_INVALID'; }
check('code is single-use', replayRejected);

check('session resolves to the right user', resolveSession(session.token)?.id === 'rider-1');
check('garbage token resolves to nothing', resolveSession('ryde_notarealtoken') === null);

revokeSession(session.token);
check('revoked session stops resolving', resolveSession(session.token) === null);

// Attempt cap: five wrong guesses burn the code even if the sixth is correct.
const { devCode: code2 } = await requestOtp('0209990111');
for (let i = 0; i < 5; i += 1) {
  try { verifyOtp('0209990111', '111111'); } catch { /* expected */ }
}
let burned = false;
try { verifyOtp('0209990111', code2!); } catch (e) { burned = (e as { code?: string }).code === 'OTP_INVALID'; }
check('code burns after 5 failed attempts', burned);

// SMS-pumping guard: a number cannot be used to send unlimited messages.
let smsLimited = false;
try {
  for (let i = 0; i < 6; i += 1) await requestOtp('0271234567');
} catch (e) {
  smsLimited = (e as { code?: string }).code === 'OTP_RATE_LIMITED';
}
check('OTP requests per number are capped', smsLimited);

let foreignRejected = false;
try { await requestOtp('+1 415 555 0100'); } catch { foreignRejected = true; }
check('non-Ghanaian number refused', foreignRejected);

const s1 = verifyOtp('0244000418', (await requestOtp('0244000418')).devCode!);
const s2 = verifyOtp('0244000418', (await requestOtp('0244000418')).devCode!);
revokeAllSessions('rider-1');
check(
  'revoke-all kills every session',
  resolveSession(s1.token) === null && resolveSession(s2.token) === null,
);

/* 11. Authorization ----------------------------------------------------- */

// Section 6 tightened the debt cap to prove the gate fires; restore it.
process.env.MAX_RIDER_DEBT_PESEWAS = '5000';

const victimTrip = quoteTrip({
  riderId: 'rider-1', product: 'go', pickup: EAST_LEGON, dropoff: AIRPORT,
  distanceM: 6200, durationS: 900, surgeBp: 10000, paymentMethod: 'cash',
});
startTrip(victimTrip.id, 'driver-1');

seedUser('rider-2', 'Kojo Mensah', '0554001234', 'rider');
let idorBlocked = false;
try {
  await completeTrip({ tripId: victimTrip.id, actor: { id: 'rider-2', role: 'rider' } });
} catch (e) {
  // 404, not 403 — a stranger cannot even confirm the trip exists.
  idorBlocked = (e as { status?: number }).status === 404;
}
check("a stranger cannot settle someone else's trip", idorBlocked);

const beforeTipAbuse = driverPayable('driver-1');
const driverSettled = await completeTrip({
  tripId: victimTrip.id, actor: DRIVER, tipPesewas: 5000,
});
check(
  'driver cannot tip themselves',
  driverSettled.trip.tip_pesewas === 0 && driverPayable('driver-1') < beforeTipAbuse + 5000,
);

/* ----------------------------------------------------------------------- */

console.log('─'.repeat(52));
console.log(`ledger balanced: ${ledgerIsBalanced()}`);
console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
