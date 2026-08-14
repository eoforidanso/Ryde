# Ryde payments

Mobile money collections, driver disbursements and a double-entry ledger, over
Hubtel.

```bash
npm install
cp .env.example .env
npm run seed
npm test      # 37 checks against Hubtel mock mode
npm run dev
```

Sign in from the app with any seeded number — `0244000418` (rider) or
`0209990111` (driver). In mock mode the code is printed by the server and
returned as `devCode`, so no real SMS is sent.

Runs on `:8787`. `HUBTEL_MODE=mock` is the default, so everything works —
including the self-test — with no Hubtel credentials.

To point the app at it, from the project root:

```bash
echo "VITE_API_URL=http://localhost:8787" > .env.local
```

## Going live

1. Get a Hubtel merchant account. You need the **API Client ID**, **Client
   Secret** and **Merchant Account Number** (POS Sales ID) from the dashboard.
2. Set `HUBTEL_MODE=live` and fill in the three credentials.
3. Set `PUBLIC_BASE_URL` to a public HTTPS origin. Hubtel cannot POST callbacks
   to localhost — use ngrok or cloudflared in development.
4. `openssl rand -hex 24 > WEBHOOK_PATH_SECRET`.
5. **Verify [`src/hubtel.ts`](src/hubtel.ts) against the current Hubtel docs.**
   Endpoint paths, field casing and response codes have changed between API
   versions. That file is the only place Hubtel appears — nothing else in the
   service needs to change.

Test with a GH₵1 charge to your own number before anything else.

## How the money moves

Every amount is an **integer number of pesewas**. Floats appear only in the
Hubtel request body and in text shown to a human.

The ledger is **double-entry**: each transaction writes postings that sum to
zero, enforced at write time in `ledger.ts`. `GET /api/health` reports whether
the whole ledger still sums to zero, which it must, always.

| Account | Meaning | Sign |
|---|---|---|
| `ryde:momo_float` | cash held at Hubtel | asset, positive |
| `user:{id}:cash` | a rider's Ryde Cash | liability, negative |
| `user:{id}:receivable` | an unpaid trip | receivable, positive |
| `driver:{id}:payable` | earnings awaiting payout | liability, negative |
| `ryde:revenue` | commission | revenue, negative |
| `ryde:fees` | Hubtel charges | expense, positive |

A rider's spendable balance is therefore `-balanceOf('user:{id}:cash')`.

### Trip settlement

| Method | What happens |
|---|---|
| `wallet` | Ryde Cash debited, driver credited, commission booked. Settles instantly, cannot fail mid-street. |
| `momo` | Driver credited **immediately** and a rider receivable is booked, then the MoMo charge is chased. The driver never carries collection risk. |
| `cash` | Driver already holds the money, so the commission is charged back against their payable. |

Unpaid MoMo trips accumulate as rider debt. Once that debt passes
`MAX_RIDER_DEBT_PESEWAS` the rider cannot book again — that gate is what bounds
Ryde's exposure to the "rider walks away from the prompt" case.

## The three things that keep this correct

**Write before you call.** The `PENDING` row is committed before Hubtel is
contacted. A crash mid-request leaves a reference the poller reconciles, rather
than money that moved with no record.

**The reference is the idempotency key.** `POST /topup` honours an
`Idempotency-Key` header and trip charges use a deterministic `trip-{id}`
reference, so a retried request returns the original payment instead of charging
twice. A network timeout never marks a payment failed — it tells you nothing
about whether the charge landed.

**The poller, not the webhook, guarantees terminal state.** Hubtel callbacks
carry no signature, so `/api/webhooks/hubtel/:secret` treats the body purely as
a hint: it reads the reference, then re-queries Hubtel's status API before
touching the ledger. The secret path segment keeps casual traffic out; it is not
the security boundary. A sweep runs every 30s regardless, and expires prompts
nobody answered.

## Authentication

Riders and drivers sign in with their MSISDN and a six-digit code — the same
number their mobile money is registered to. There are no passwords.

Sessions are **opaque random tokens stored only as a SHA-256 hash**. A presented
token is hashed and looked up by primary key, so no secret is ever compared
byte-by-byte and there is no timing side channel. Opaque beats JWT here because
a payments service needs instant revocation: a stolen handset must be able to
kill every session immediately, which `POST /api/auth/revoke-all` does.

The threat that gets the most attention is not credential theft, it is **SMS
pumping** — an attacker hammering `request-otp` to burn your SMS budget. The
defences are: only valid Ghanaian numbers are accepted, three codes per number
per 15 minutes (enforced in the database so it survives a restart), and a
per-IP cap on top.

Codes are hashed, single-use, expire in five minutes, and burn after five wrong
attempts. **Every failure returns the same 401 and the same message** — a caller
cannot distinguish an unknown number from a wrong code from an expired one, so
this is not an account-enumeration oracle.

### Authorization

No endpoint takes an actor id from the path, query or body. Identity comes from
the token and nowhere else, which removes the entire "change the id in the URL"
class of bug by construction.

- `/api/me/*` is implicitly scoped to the caller.
- A trip is readable and settleable only by its rider or its assigned driver.
  Anyone else gets **404, not 403** — a stranger cannot even confirm it exists.
- Accepting a trip is driver-only, and always onto the caller's own account.
- A driver cannot award themselves a tip on the rider's behalf.
- Top-ups always charge the number on the account; a caller cannot name someone
  else's MSISDN.
- `/api/ops/*` uses a **separate service key**, never a user session. No user
  token, however privileged, can trigger a payout run.

## Endpoints

```
GET  /api/health

POST /api/auth/request-otp           { msisdn }            public, rate limited
POST /api/auth/verify-otp            { msisdn, code }      → { token, user }
GET  /api/auth/me
POST /api/auth/logout
GET  /api/auth/sessions
POST /api/auth/revoke-all

GET  /api/me/wallet                                        Bearer
POST /api/me/topup                   Idempotency-Key: <key>
GET  /api/me/earnings                                      driver only
GET  /api/payments/:reference                              own payments only

POST /api/trips/quote                                      rider only
POST /api/trips/:id/start                                  driver only
POST /api/trips/:id/complete                               participants only
GET  /api/trips/:id                                        participants only

POST /api/ops/reconcile              X-Service-Key
POST /api/ops/payouts/run            X-Service-Key   { "dryRun": true }
GET  /api/ops/ledger-health          X-Service-Key

POST /api/webhooks/hubtel/:secret                          provider
```

## Mock mode

`checkStatus` resolves charges deterministically. Amounts ending in **13
pesewas** simulate a rider declining the prompt, which is how the self-test
exercises the failed-charge and rider-debt paths.

## Known gaps

**Rate limiting is per-process.** The IP limiter is in memory, so it does not
hold across instances — move it to Redis before running more than one. The
per-number OTP cap is in the database precisely because that one guards real
money (SMS spend) and must survive a restart.

**`DEMO_AUTO_ASSIGN` is a development shim.** It assigns a driver at quote time
so a single-device demo can settle a trip. Real dispatch is a driver accepting
through the driver app. It is off by default and refuses to run against live
Hubtel credentials — keep it that way.

**Closing the distance gap.** `POST /trips/quote` still takes `distanceM` and
`durationS` from the client. The fare itself is server-computed and stored at
quote time, so a client cannot change what it is billed — but it can influence
the inputs. `distanceIsPlausible()` bounds this by checking the reported
distance against the great-circle distance between the endpoints the client also
supplied (0.85×–3×), which stops a 2 km hop being billed as a motorway run. The
real fix is to move the A\* router in `src/lib/router.ts` into a shared workspace
package and have the server derive distance from the pickup and dropoff itself.
That is the next thing to do here.

**Payouts are manual by design.** `runPayoutBatch` defaults to `dryRun` and has
per-payout and per-batch caps. Wire it to an approved scheduled job, not to a
public endpoint.

**SQLite** is here for zero-setup development. Move to Postgres for production —
`tx()` in `db.ts` is the only thing that assumes better-sqlite3's synchronous
transactions.

## Before you take real money

Holding rider funds in a prepaid wallet is e-money issuance, regulated by the
Bank of Ghana under the Payment Systems and Services Act, 2019 (Act 987). Either
partner with a licensed PSP/EMI that holds the float, or get licensed. Confirm
current tax treatment of transfers with your own advisor.
