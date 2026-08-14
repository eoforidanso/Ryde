# Ryde

A ride-hailing app for Ghana, built in React + TypeScript. Rider app and driver
app in one, with a live simulated fleet moving across a hand-built map of
Greater Accra.

**Live demo → https://eoforidanso.github.io/Ryde/**

It's an installable PWA — open it on a phone and add it to your home screen. It
then runs full screen and **works offline**, which matters more than usual here:
the whole app shell is client-side, and connectivity across Accra is patchy.

The deployed build runs on simulated state with no backend: GitHub Pages is
static hosting, so the payments service in [`server/`](server) cannot run
alongside it and sign-in is skipped. Run it locally to exercise the real
Hubtel integration.

Payment endpoints are deliberately excluded from the service worker cache — a
balance or charge status must never be served stale, so those requests go to
the network and fail loudly when there's no connection.

```bash
npm install
npm run dev
```

Then open http://localhost:5178.

## What's in it

**Real routing, not a straight line.** `src/data/network.ts` holds 40 Accra
junctions at their true coordinates — Tetteh Quarshie, Circle, Madina Zongo,
Mallam, Pokuase — connected by the roads that actually join them (N1, the
Accra–Tema Motorway, Ring Road, Spintex, Liberation Road). `src/lib/router.ts`
runs A\* over that graph weighted by a per-road-class speed profile, so a trip
from East Legon to Kasoa takes the motorway rather than crawling through town,
and the quoted distance and turn list come out of the same path the car drives.

**Fares that behave like Accra fares.** `src/lib/pricing.ts` prices each product
from a base fare, distance, time, a booking fee and a per-product minimum, then
applies surge. Traffic is modelled by time of day: the 6–9am crawl into town and
the 4–8pm crawl out of it push journey times up over 2×, which raises both the
ETA and the fare. Okadas are given a traffic-resilience factor because they
filter through queues; XLs are penalised.

**Six products.** Okada (motorbike), Share, Go, Comfort, XL, and Aboboya —
the tricycle people use for market runs and parcels.

**Mobile money first.** MTN MoMo, Telecel Cash and AT Money sit above card and
cash, and the Ryde Cash wallet debits on trip completion.

**The map is drawn, not tiled.** No map SDK and no API key: `MapCanvas.tsx`
renders the coastline, the Weija and Sakumo lagoons, land use, the road network,
a procedural residential street lattice and 64 live vehicles as SVG. The camera
fits itself to the leg being driven and biases the framing into the band above
the bottom sheet; labels, markers and road weights are sized in screen pixels so
they stay legible at any zoom.

**A full trip, live.** Request → matching → driver en route → arrived → on trip →
fare, rating and tip. Trips run time-compressed, so a 25-minute ride to the
airport plays out in about half a minute. The driver you get is the nearest one
in the simulated fleet who drives the product you picked.

**Driver mode.** Flip the switch in Account for the earnings dashboard, the
online toggle, incoming trip requests you can accept or decline, and the
surge hotspots.

## Payments

`server/` is a real payments service: Hubtel mobile money collections, driver
disbursements, and a double-entry ledger in integer pesewas. It runs in mock
mode with no credentials, so you can exercise every money path immediately.

```bash
cd server && npm install && cp .env.example .env && npm run seed && npm test
npm run dev
```

Then point the app at it and restart the dev server:

```bash
echo "VITE_API_URL=http://localhost:8787" > .env.local
```

With `VITE_API_URL` set, the app requires a real sign-in: phone number plus a
six-digit code, the way ride apps work in Ghana. Fares are then priced and
stored server-side, top-ups go through Hubtel, and the wallet balance is read
from the ledger. Sign in with a seeded number — `0244000418` (rider) or
`0209990111` (driver); in mock mode the code is shown on screen.

With `VITE_API_URL` unset the app runs entirely on simulated state and skips
sign-in, exactly as before.

See [server/README.md](server/README.md) for the ledger model, the auth and
authorization design, the idempotency and reconciliation guarantees, and what to
check before going live.

## Layout

```
src/
  data/        road graph, places, products and fares, simulated fleet
  lib/         A* router, fare engine, map projection, API client
  store/       reducer, trip state machine, simulation loop
  components/  map, sheets, panels, icons
server/
  src/         Hubtel adapter, ledger, trips, payouts, reconciliation
```

## Notes

Rider matching, driver dispatch and the live fleet are simulated in the browser.
Payments are real code against a real provider API, but ship nothing to
production without reading the "Known gaps" and licensing sections of
[server/README.md](server/README.md). Fares are modelled on typical Accra
pricing and are illustrative, not quotes.
