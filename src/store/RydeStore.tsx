import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { createFleet, type Driver } from '../data/fleet';
import { NODES, haversineKm } from '../data/network';
import { SAVED, type Place } from '../data/places';
import {
  PRODUCT_BY_ID,
  PRODUCTS,
  type PaymentMethodId,
  type ProductId,
} from '../data/products';
import { formatGHS, quoteFor, trafficAt, type FareRules, type Quote, type TrafficState } from '../lib/pricing';
import { buildRoute, nearestNode, pointAt, type LatLng, type Route } from '../lib/router';
import { createJob, type DriverJob } from '../lib/driverJobs';
import { fareRulesFor, forecastFare, type FareForecast } from '../lib/fairness';
import { pickupAdvice, type PickupAdvice } from '../lib/pickupZones';
import {
  cashbackTierFor, pointsFor, splitFare, type AutoTopUpRule, type CashbackStanding,
} from '../lib/loyalty';
import { challengeJustCompleted, tierFor, type DriverStats } from '../lib/rewards';
import {
  BUSINESS_TRIPS, COMPANY, ME, checkPolicy, type BusinessTrip,
} from '../data/business';

/** Trips run compressed so a 25-minute ride plays out in about 27 seconds. */
const TIME_SCALE = 55;
const TICK_MS = 90;
/** Background traffic drifts only slightly faster than real time. */
const FLEET_SPEEDUP = 5;
/** Real seconds a driver has to accept an offer, as in the real app. */
const OFFER_SECONDS = 15;
/** Real seconds of searching before the next offer arrives. */
const SEARCH_MIN_S = 4;
const SEARCH_MAX_S = 11;

export type Phase =
  | 'idle'
  | 'search'
  | 'choosing'
  | 'matching'
  | 'arriving'
  | 'arrived'
  | 'ontrip'
  | 'complete';

export type Tab = 'ride' | 'activity' | 'wallet' | 'account';

/** Driver-side lifecycle, mirroring the rider trip from the other seat. */
export type DriverPhase =
  | 'offline'
  | 'idle'
  | 'incoming'
  | 'to_pickup'
  | 'waiting'
  | 'on_trip'
  | 'summary';

export interface DriverLogEntry {
  id: string;
  rider: string;
  dropoff: string;
  earnings: number;
  minutes: number;
  km: number;
}

export interface CompletedTrip {
  id: string;
  pickup: string;
  dropoff: string;
  product: ProductId;
  fare: number;
  distanceKm: number;
  minutes: number;
  when: string;
  driver: string;
  rating: number | null;
  payment: PaymentMethodId;
}

export interface WalletEntry {
  id: string;
  label: string;
  detail: string;
  amount: number;
  when: string;
}

export interface State {
  tab: Tab;
  phase: Phase;
  /** Which field the search screen is editing. */
  editing: 'pickup' | 'dropoff';
  pickup: Place;
  dropoff: Place | null;
  route: Route | null;
  productId: ProductId;
  payment: PaymentMethodId;
  promo: string | null;
  promoDiscount: number;
  fleet: Driver[];
  driver: Driver | null;
  driverRoute: Route | null;
  /** 0–1 through the current timed phase. */
  progress: number;
  elapsed: number;
  now: Date;
  history: CompletedTrip[];
  walletBalance: number;
  walletLedger: WalletEntry[];
  rating: number | null;
  tip: number;
  driverMode: boolean;
  driverOnline: boolean;
  driverEarnings: number;
  driverTripsToday: number;
  driverPhase: DriverPhase;
  driverJob: DriverJob | null;
  /** 0–1 through the current driving leg. */
  driverProgress: number;
  driverElapsed: number;
  /** The driver's own vehicle position. */
  driverPos: LatLng;
  /** Real seconds left to accept an offer. */
  acceptSecondsLeft: number;
  /** Real seconds spent online today. */
  onlineSeconds: number;
  driverLog: DriverLogEntry[];
  lastEarned: number;
  /** Bonus paid by a challenge on the last trip, for the summary sheet. */
  lastBonus: number;
  /** Trips completed in the current rewards week. */
  driverWeekTrips: number;
  driverWeekEarnings: number;
  /** Star ratings from recent trips, newest first. */
  driverStars: number[];
  fiveStarStreak: number;
  /** Challenge ids already paid out this week, so a bonus lands once. */
  claimedChallenges: string[];
  /** Trip id issued by the payments service; null when running standalone. */
  serverTripId: string | null;

  /** Whether the next trip is billed to the rider or to their company. */
  tripProfile: 'personal' | 'business';
  tripPurpose: string;
  /** Business trips taken in this session, newest first. */
  businessTrips: BusinessTrip[];
  /** Company spend this session, on top of the seeded month to date. */
  businessSessionSpend: number;

  autoTopUp: AutoTopUpRule;
  /** Contacts the next fare is split with. */
  splitWith: string[];
  points: number;
  /** Cashback credited by the last completed trip, for the receipt. */
  lastCashback: number;

  sheet:
    | null | 'safety' | 'payment' | 'fare' | 'schedule' | 'contact'
    | 'pickup' | 'autoTopUp' | 'split' | 'points' | 'profile' | 'rewards';
  toast: string | null;
  scheduledFor: string | null;
  /** Full-screen panels that sit outside the tab bar. */
  panel: null | 'business';
}

type Action =
  | { type: 'tab'; tab: Tab }
  | { type: 'openSearch'; field: 'pickup' | 'dropoff' }
  | { type: 'setPlace'; field: 'pickup' | 'dropoff'; place: Place }
  | { type: 'clearDropoff' }
  | { type: 'product'; id: ProductId }
  | { type: 'payment'; id: PaymentMethodId }
  | { type: 'promo'; code: string }
  | { type: 'request' }
  | { type: 'matched'; driver: Driver; driverRoute: Route }
  | { type: 'phase'; phase: Phase }
  | { type: 'tick'; elapsed: number; progress: number; fleet: Driver[]; now: Date }
  | { type: 'cancel' }
  | { type: 'finish' }
  | { type: 'rate'; rating: number }
  | { type: 'tip'; amount: number }
  | { type: 'closeTrip' }
  | { type: 'sheet'; sheet: State['sheet'] }
  | { type: 'toast'; message: string | null }
  | { type: 'topUp'; amount: number; method: string }
  | { type: 'driverMode'; on: boolean }
  | { type: 'driverOnline'; on: boolean }
  | { type: 'driverIncoming'; job: DriverJob }
  | { type: 'driverAccept' }
  | { type: 'driverDecline' }
  | { type: 'driverPhase'; phase: DriverPhase }
  | { type: 'driverTick'; elapsed: number; progress: number; pos: LatLng; acceptSecondsLeft: number; onlineSeconds: number }
  | { type: 'driverComplete' }
  | { type: 'driverDismissSummary' }
  | { type: 'schedule'; when: string | null }
  | { type: 'serverTrip'; tripId: string | null }
  | { type: 'syncWallet'; balance: number }
  | { type: 'panel'; panel: State['panel'] }
  | { type: 'tripProfile'; profile: 'personal' | 'business' }
  | { type: 'tripPurpose'; purpose: string }
  | { type: 'autoTopUp'; rule: AutoTopUpRule }
  | { type: 'toggleSplit'; contactId: string }
  | { type: 'clearSplit' }
  | { type: 'redeem'; points: number; credit: number };

const seedHistory: CompletedTrip[] = [
  {
    id: 't-1', pickup: 'Home — East Legon Hills', dropoff: 'Kotoka International Airport (T3)',
    product: 'comfort', fare: 78.5, distanceKm: 12.4, minutes: 31, when: 'Yesterday, 05:12',
    driver: 'Nii Quartey', rating: 5, payment: 'momo-mtn',
  },
  {
    id: 't-2', pickup: 'Osu, Oxford Street', dropoff: 'Labadi Pleasure Beach',
    product: 'go', fare: 24, distanceKm: 4.1, minutes: 14, when: 'Sat, 21:48',
    driver: 'Ama Boateng', rating: 5, payment: 'cash',
  },
  {
    id: 't-3', pickup: 'Accra Mall', dropoff: 'Madina Market',
    product: 'okada', fare: 19.5, distanceKm: 8.6, minutes: 17, when: 'Sat, 11:02',
    driver: 'Fuseini Abdulai', rating: 4, payment: 'momo-mtn',
  },
  {
    id: 't-4', pickup: 'Kaneshie Market', dropoff: 'Dansoman Estates',
    product: 'aboboya', fare: 32, distanceKm: 4.8, minutes: 22, when: 'Fri, 16:35',
    driver: 'Ibrahim Hamza', rating: 5, payment: 'momo-telecel',
  },
  {
    id: 't-5', pickup: 'Tema Community 1', dropoff: 'Airport City',
    product: 'go', fare: 96, distanceKm: 27.3, minutes: 48, when: 'Thu, 07:20',
    driver: 'Selorm Dzobo', rating: 5, payment: 'card',
  },
];

const seedLedger: WalletEntry[] = [
  { id: 'w-1', label: 'Trip — Airport', detail: 'MTN MoMo', amount: -78.5, when: 'Yesterday' },
  { id: 'w-2', label: 'Top up', detail: 'MTN MoMo 024 •••• 418', amount: 150, when: 'Yesterday' },
  { id: 'w-3', label: 'Trip — Labadi', detail: 'Ryde Cash', amount: -24, when: 'Saturday' },
  { id: 'w-4', label: 'Referral bonus — Adwoa joined', detail: 'RYDE10 credit', amount: 20, when: 'Friday' },
];

const PROMOS: Record<string, number> = { RYDE10: 10, ACCRA5: 5, KENTE20: 20 };

const initialState: State = {
  tab: 'ride',
  phase: 'idle',
  editing: 'dropoff',
  pickup: SAVED.home,
  dropoff: null,
  route: null,
  productId: 'go',
  payment: 'ryde-cash',
  promo: null,
  promoDiscount: 0,
  fleet: createFleet(),
  driver: null,
  driverRoute: null,
  progress: 0,
  elapsed: 0,
  now: new Date(),
  history: seedHistory,
  walletBalance: 214.5,
  walletLedger: seedLedger,
  rating: null,
  tip: 0,
  driverMode: false,
  driverOnline: false,
  driverEarnings: 246.5,
  driverTripsToday: 7,
  driverPhase: 'offline',
  driverJob: null,
  driverProgress: 0,
  driverElapsed: 0,
  // Parked at Shiashie, a realistic place to wait for airport and Legon runs.
  driverPos: { lat: 5.6222, lng: -0.1794 },
  acceptSecondsLeft: 0,
  onlineSeconds: 6 * 3600 + 12 * 60,
  driverLog: [],
  lastEarned: 0,
  lastBonus: 0,
  driverWeekTrips: 31,
  driverWeekEarnings: 742.5,
  // Seeded from a solid week: enough stars for Silver, short of Gold's 4.75.
  driverStars: [5, 5, 4, 5, 5, 5, 5, 4, 5, 5],
  fiveStarStreak: 6,
  claimedChallenges: [],
  serverTripId: null,
  tripProfile: 'personal',
  tripPurpose: 'Client meeting',
  businessTrips: BUSINESS_TRIPS,
  businessSessionSpend: 0,
  autoTopUp: { on: true, threshold: 40, amount: 100 },
  splitWith: [],
  points: 3180,
  lastCashback: 0,
  sheet: null,
  toast: null,
  scheduledFor: null,
  panel: null,
};

function withRoute(state: State, pickup: Place, dropoff: Place | null): State {
  const route = dropoff ? buildRoute(pickup, dropoff) : null;
  return { ...state, pickup, dropoff, route };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'tab':
      return { ...state, tab: action.tab };

    case 'openSearch':
      return { ...state, phase: 'search', editing: action.field, tab: 'ride' };

    case 'setPlace': {
      const pickup = action.field === 'pickup' ? action.place : state.pickup;
      const dropoff = action.field === 'dropoff' ? action.place : state.dropoff;
      const next = withRoute(state, pickup, dropoff);
      return { ...next, phase: dropoff ? 'choosing' : 'search' };
    }

    case 'clearDropoff':
      return { ...withRoute(state, state.pickup, null), phase: 'idle', promo: null, promoDiscount: 0 };

    case 'product':
      return { ...state, productId: action.id };

    case 'payment':
      return { ...state, payment: action.id, sheet: null };

    case 'promo': {
      const code = action.code.trim().toUpperCase();
      const value = PROMOS[code];
      if (!value) return { ...state, toast: `“${code}” is not a valid promo code` };
      return { ...state, promo: code, promoDiscount: value, toast: `${code} applied — GH₵${value} off` };
    }

    case 'request':
      return { ...state, phase: 'matching', elapsed: 0, progress: 0, sheet: null, rating: null, tip: 0 };

    case 'matched':
      return {
        ...state,
        phase: 'arriving',
        driver: action.driver,
        driverRoute: action.driverRoute,
        elapsed: 0,
        progress: 0,
      };

    case 'phase':
      return { ...state, phase: action.phase, elapsed: 0, progress: 0 };

    case 'tick':
      return { ...state, elapsed: action.elapsed, progress: action.progress, fleet: action.fleet, now: action.now };

    case 'cancel':
      return {
        ...state,
        phase: state.dropoff ? 'choosing' : 'idle',
        driver: null,
        driverRoute: null,
        progress: 0,
        elapsed: 0,
        sheet: null,
        toast: 'Trip cancelled',
      };

    case 'finish':
      return { ...state, phase: 'complete', progress: 1 };

    case 'rate':
      return { ...state, rating: action.rating };

    case 'tip':
      return { ...state, tip: action.amount };

    case 'closeTrip': {
      if (!state.route || !state.dropoff || !state.driver) return { ...state, phase: 'idle' };
      const product = PRODUCT_BY_ID[state.productId];
      const traffic = trafficAt(state.now);
      const quote = quoteFor(product, state.route, traffic, 1.5, fareRulesFor(state.dropoff));
      const total = Math.max(0, quote.fare - state.promoDiscount) + state.tip;
      const stamp = Date.now();

      const business = state.tripProfile === 'business';
      const heads = state.splitWith.length + 1;
      const share = splitFare(total, state.splitWith.length);
      // The rider is charged their own share only; the rest is requested from
      // the others, and does not touch this wallet until they pay it.
      const owed = heads > 1 ? share.yours : total;

      const trip: CompletedTrip = {
        id: `t-${stamp}`,
        pickup: state.pickup.name,
        dropoff: state.dropoff.name,
        product: state.productId,
        fare: total,
        distanceKm: state.route.distanceKm,
        minutes: quote.minutes,
        when: 'Just now',
        driver: state.driver.name,
        rating: state.rating,
        payment: state.payment,
      };

      const ledger: WalletEntry[] = [];
      let balance = state.walletBalance;

      /*
       * A company trip never touches the rider's own money — it lands on the
       * monthly invoice instead. Nor do we debit twice: when the payments
       * service settled this trip, the balance we hold was already synced from
       * its ledger, which is the authority.
       */
      const settledByServer = state.serverTripId !== null;
      if (!business && !settledByServer && state.payment !== 'cash') {
        balance -= owed;
        ledger.push({
          id: `w-${stamp}`,
          label: `Trip — ${trip.dropoff}`,
          detail: heads > 1 ? `Ryde Cash · split ${heads} ways` : 'Ryde Cash',
          amount: -owed,
          when: 'Just now',
        });
      }

      /*
       * Cashback and points reward the rider's own spend. Neither is earned on
       * a trip the company paid for.
       *
       * Cashback moves money, so it is only credited when this app owns the
       * balance. With the payments service running, its ledger is the
       * authority and a credit it never issued would be a lie on screen —
       * paying cashback for real is server work, not a client concern.
       */
      const spend30d = state.history.reduce((s, t) => s + t.fare, 0);
      const cashback = business || settledByServer
        ? 0
        : Math.round(owed * cashbackTierFor(spend30d).tier.rate * 100) / 100;
      const earnedPoints = business ? 0 : pointsFor(owed);

      if (cashback > 0) {
        balance += cashback;
        ledger.push({
          id: `w-${stamp}-cb`,
          label: `Cashback — ${cashbackTierFor(spend30d).tier.name}`,
          detail: `${(cashbackTierFor(spend30d).tier.rate * 100).toFixed(1)}% of ${formatGHS(owed)}`,
          amount: cashback,
          when: 'Just now',
        });
      }

      // Top up before the balance can strand the rider on their next trip.
      const rule = state.autoTopUp;
      const topUpFired = rule.on && !business && !settledByServer && balance < rule.threshold;
      if (topUpFired) {
        balance += rule.amount;
        ledger.push({
          id: `w-${stamp}-auto`,
          label: 'Auto top up',
          detail: `Balance fell below ${formatGHS(rule.threshold)} · MTN MoMo`,
          amount: rule.amount,
          when: 'Just now',
        });
      }

      const policy = checkPolicy(ME, total, state.businessSessionSpend);
      const businessTrip: BusinessTrip | null = business
        ? {
            id: `bt-${stamp}`,
            employeeId: ME.id,
            when: 'Just now',
            from: state.pickup.name,
            to: state.dropoff.name,
            product: state.productId,
            fare: total,
            purpose: state.tripPurpose,
            flagged: !policy.withinPolicy,
          }
        : null;

      const toast = business
        ? policy.withinPolicy
          ? `Billed to ${COMPANY.name} · ${state.tripPurpose}`
          : `Billed to ${COMPANY.name} — over limit, flagged for approval`
        : topUpFired
          ? `Balance was low — ${formatGHS(rule.amount)} topped up automatically`
          : cashback > 0
            ? `${formatGHS(cashback)} cashback and ${earnedPoints} points added`
            : 'Thanks for riding with Ryde';

      return {
        ...state,
        phase: 'idle',
        tab: 'ride',
        dropoff: null,
        route: null,
        driver: null,
        driverRoute: null,
        progress: 0,
        elapsed: 0,
        promo: null,
        promoDiscount: 0,
        serverTripId: null,
        rating: null,
        tip: 0,
        splitWith: [],
        history: [trip, ...state.history],
        walletBalance: Math.round(balance * 100) / 100,
        walletLedger: [...ledger, ...state.walletLedger],
        points: state.points + earnedPoints,
        lastCashback: cashback,
        businessTrips: businessTrip ? [businessTrip, ...state.businessTrips] : state.businessTrips,
        businessSessionSpend: business ? state.businessSessionSpend + total : state.businessSessionSpend,
        toast,
      };
    }

    case 'sheet':
      return { ...state, sheet: action.sheet };

    case 'toast':
      return { ...state, toast: action.message };

    case 'topUp':
      return {
        ...state,
        walletBalance: state.walletBalance + action.amount,
        walletLedger: [
          { id: `w-${Date.now()}`, label: 'Top up', detail: action.method, amount: action.amount, when: 'Just now' },
          ...state.walletLedger,
        ],
        toast: `GH₵${action.amount} added to Ryde Cash`,
      };

    case 'driverMode':
      return {
        ...state,
        driverMode: action.on,
        tab: 'ride',
        phase: 'idle',
        // Leaving driver mode mid-job would strand a rider; require going
        // offline first, which the UI enforces.
        driverPhase: action.on ? (state.driverOnline ? 'idle' : 'offline') : 'offline',
        driverOnline: action.on ? state.driverOnline : false,
        driverJob: action.on ? state.driverJob : null,
      };

    case 'driverOnline':
      return {
        ...state,
        driverOnline: action.on,
        driverPhase: action.on ? 'idle' : 'offline',
        driverJob: action.on ? state.driverJob : null,
        driverProgress: 0,
        driverElapsed: 0,
        toast: action.on ? 'You are online — looking for trips' : 'You are offline',
      };

    case 'driverIncoming':
      return {
        ...state,
        driverPhase: 'incoming',
        driverJob: action.job,
        acceptSecondsLeft: OFFER_SECONDS,
        driverProgress: 0,
        driverElapsed: 0,
      };

    case 'driverAccept':
      return { ...state, driverPhase: 'to_pickup', driverProgress: 0, driverElapsed: 0 };

    case 'driverDecline':
      return {
        ...state,
        driverPhase: 'idle',
        driverJob: null,
        driverProgress: 0,
        driverElapsed: 0,
        acceptSecondsLeft: 0,
      };

    case 'driverPhase':
      return { ...state, driverPhase: action.phase, driverProgress: 0, driverElapsed: 0 };

    case 'driverTick':
      return {
        ...state,
        driverElapsed: action.elapsed,
        driverProgress: action.progress,
        driverPos: action.pos,
        acceptSecondsLeft: action.acceptSecondsLeft,
        onlineSeconds: action.onlineSeconds,
      };

    case 'driverComplete': {
      const job = state.driverJob;
      if (!job) return state;

      // The rider rates the trip. Most trips are five stars; the occasional
      // four is what makes the streak worth protecting.
      const stars = Math.random() < 0.82 ? 5 : Math.random() < 0.7 ? 4 : 3;
      const driverStars = [stars, ...state.driverStars].slice(0, 40);
      const rating = driverStars.reduce((s, n) => s + n, 0) / driverStars.length;

      const before = driverStats(state);
      const after: DriverStats = {
        weekTrips: state.driverWeekTrips + 1,
        weekEarnings: state.driverWeekEarnings + job.earnings,
        fiveStarStreak: stars === 5 ? state.fiveStarStreak + 1 : 0,
        rating,
      };

      // A challenge pays once per week, into the same earnings figure the top
      // bar shows — the bonus is money, not a notification.
      const crossed = challengeJustCompleted(before, after);
      const bonus = crossed && !state.claimedChallenges.includes(crossed.id) ? crossed.reward : 0;

      return {
        ...state,
        driverPhase: 'summary',
        driverEarnings: state.driverEarnings + job.earnings + bonus,
        driverTripsToday: state.driverTripsToday + 1,
        driverWeekTrips: after.weekTrips,
        driverWeekEarnings: after.weekEarnings + bonus,
        driverStars,
        fiveStarStreak: after.fiveStarStreak,
        claimedChallenges: bonus > 0 && crossed
          ? [...state.claimedChallenges, crossed.id]
          : state.claimedChallenges,
        lastEarned: job.earnings,
        lastBonus: bonus,
        toast: bonus > 0 && crossed
          ? `${crossed.title} — ${formatGHS(bonus)} bonus added`
          : state.toast,
        driverLog: [
          {
            id: job.id,
            rider: job.riderName,
            dropoff: job.dropoff.name,
            earnings: job.earnings,
            minutes: job.tripMinutes,
            km: job.trip.distanceKm,
          },
          ...state.driverLog,
        ].slice(0, 12),
        // The driver ends the trip where the rider got out.
        driverPos: { lat: job.dropoff.lat, lng: job.dropoff.lng },
      };
    }

    case 'driverDismissSummary':
      return { ...state, driverPhase: 'idle', driverJob: null, driverProgress: 0, driverElapsed: 0 };

    case 'serverTrip':
      return { ...state, serverTripId: action.tripId };

    case 'syncWallet':
      return { ...state, walletBalance: action.balance };

    case 'schedule':
      return { ...state, scheduledFor: action.when, sheet: null, toast: action.when ? `Ride scheduled for ${action.when}` : null };

    case 'panel':
      return { ...state, panel: action.panel, sheet: null };

    case 'tripProfile':
      return {
        ...state,
        tripProfile: action.profile,
        sheet: null,
        toast:
          action.profile === 'business'
            ? `Billing to ${COMPANY.name}`
            : 'Billing to your personal account',
      };

    case 'tripPurpose':
      return { ...state, tripPurpose: action.purpose, sheet: null };

    case 'autoTopUp':
      return {
        ...state,
        autoTopUp: action.rule,
        sheet: null,
        toast: action.rule.on
          ? `Auto top up ${formatGHS(action.rule.amount)} when you drop below ${formatGHS(action.rule.threshold)}`
          : 'Auto top up turned off',
      };

    case 'toggleSplit': {
      const on = state.splitWith.includes(action.contactId);
      return {
        ...state,
        splitWith: on
          ? state.splitWith.filter((c) => c !== action.contactId)
          : [...state.splitWith, action.contactId],
      };
    }

    case 'clearSplit':
      return { ...state, splitWith: [] };

    case 'redeem': {
      if (state.points < action.points) {
        return { ...state, toast: 'Not enough points yet' };
      }
      return {
        ...state,
        points: state.points - action.points,
        walletBalance: Math.round((state.walletBalance + action.credit) * 100) / 100,
        walletLedger: [
          {
            id: `w-${Date.now()}-pts`,
            label: 'Points redeemed',
            detail: `${action.points.toLocaleString()} Ryde Points`,
            amount: action.credit,
            when: 'Just now',
          },
          ...state.walletLedger,
        ],
        sheet: null,
        toast: `${formatGHS(action.credit)} ride credit added`,
      };
    }

    default:
      return state;
  }
}

/** Duration in simulated seconds of each timed phase. */
function phaseDuration(state: State, quote: Quote | null): number {
  switch (state.phase) {
    case 'matching':
      return 9;
    case 'arriving':
      return (quote?.pickupMinutes ?? 4) * 60;
    case 'arrived':
      return 45;
    case 'ontrip':
      return (quote?.minutes ?? 15) * 60;
    default:
      return 0;
  }
}

/** The driver's week so far, in the shape the rewards model reads. */
export function driverStats(state: State): DriverStats {
  const stars = state.driverStars;
  return {
    weekTrips: state.driverWeekTrips,
    weekEarnings: state.driverWeekEarnings,
    fiveStarStreak: state.fiveStarStreak,
    rating: stars.length ? stars.reduce((s, n) => s + n, 0) / stars.length : 5,
  };
}

/** Duration in simulated seconds of each driving leg. */
function driverLegDuration(state: State): number {
  const job = state.driverJob;
  if (!job) return 0;
  if (state.driverPhase === 'to_pickup') return job.pickupMinutes * 60;
  if (state.driverPhase === 'on_trip') return job.tripMinutes * 60;
  return 0;
}

function placeFrom(pos: LatLng, name: string, area: string): Place {
  return { id: `pt-${name}`, name, area, lat: pos.lat, lng: pos.lng, node: nearestNode(pos), kind: 'landmark' };
}

/** Idle drivers cruise between junctions so the map always feels alive. */
function wander(fleet: Driver[], dtSec: number): Driver[] {
  return fleet.map((d) => {
    const target = NODES[d.targetIdx];
    const dLat = target.lat - d.lat;
    const dLng = target.lng - d.lng;
    const dist = Math.hypot(dLat, dLng);
    if (dist < 0.002) {
      return { ...d, targetIdx: Math.floor(Math.random() * NODES.length) };
    }
    // ~28 km/h expressed in degrees per simulated second.
    const step = Math.min(dist, (28 / 3600 / 111) * dtSec);
    return {
      ...d,
      lat: d.lat + (dLat / dist) * step,
      lng: d.lng + (dLng / dist) * step,
      heading: (Math.atan2(dLng, dLat) * 180) / Math.PI,
    };
  });
}


/**
 * Advance the driver simulation by one tick.
 *
 * Offers arrive after a short random search, expire on a real-time countdown
 * the way they do in the real app, and the two driving legs are time-compressed
 * so a 20-minute run plays out in about twenty seconds.
 */
function driveTick(
  s: State,
  dispatch: (a: Action) => void,
  traffic: TrafficState,
  searchTarget: { current: number },
) {
  const dtReal = TICK_MS / 1000;
  const dtSim = dtReal * TIME_SCALE;
  const onlineSeconds = s.onlineSeconds + dtReal;

  // Searching: wait out the interval, then offer a trip.
  if (s.driverPhase === 'idle') {
    const elapsed = s.driverElapsed + dtReal;
    if (elapsed >= searchTarget.current) {
      // The driver's tier sets the commission on this job, so climbing the
      // ladder shows up in the very next offer they are shown.
      const { commission } = tierFor(s.driverWeekTrips, driverStats(s).rating).tier;
      const job = createJob(s.driverPos, traffic, commission);
      searchTarget.current = SEARCH_MIN_S + Math.random() * (SEARCH_MAX_S - SEARCH_MIN_S);
      if (job) {
        dispatch({ type: 'driverIncoming', job });
        return;
      }
    }
    dispatch({
      type: 'driverTick',
      elapsed,
      progress: Math.min(1, elapsed / searchTarget.current),
      pos: s.driverPos,
      acceptSecondsLeft: 0,
      onlineSeconds,
    });
    return;
  }

  // Offer on screen: count down in real seconds, then let it lapse.
  if (s.driverPhase === 'incoming') {
    const left = s.acceptSecondsLeft - dtReal;
    if (left <= 0) {
      dispatch({ type: 'driverDecline' });
      dispatch({ type: 'toast', message: 'Offer expired' });
      return;
    }
    dispatch({
      type: 'driverTick',
      elapsed: s.driverElapsed + dtReal,
      progress: 1 - left / OFFER_SECONDS,
      pos: s.driverPos,
      acceptSecondsLeft: left,
      onlineSeconds,
    });
    return;
  }

  // Waiting at the kerb — the driver decides when to start, so only the clock
  // moves here.
  if (s.driverPhase === 'waiting' || s.driverPhase === 'summary') {
    dispatch({
      type: 'driverTick',
      elapsed: s.driverElapsed + dtReal,
      progress: s.driverProgress,
      pos: s.driverPos,
      acceptSecondsLeft: 0,
      onlineSeconds,
    });
    return;
  }

  // Driving: follow the active route.
  const duration = driverLegDuration(s);
  if (duration === 0 || !s.driverJob) return;

  const leg = s.driverPhase === 'to_pickup' ? s.driverJob.toPickup : s.driverJob.trip;
  const elapsed = s.driverElapsed + dtSim;
  const progress = Math.min(1, elapsed / duration);
  const { pos } = pointAt(leg.points, progress);

  dispatch({ type: 'driverTick', elapsed, progress, pos, acceptSecondsLeft: 0, onlineSeconds });

  if (progress >= 1) {
    if (s.driverPhase === 'to_pickup') dispatch({ type: 'driverPhase', phase: 'waiting' });
    else dispatch({ type: 'driverComplete' });
  }
}

interface Ctx {
  state: State;
  dispatch: (a: Action) => void;
  traffic: TrafficState;
  quotes: Quote[];
  quote: Quote | null;
  total: number;
  /** Fare policy in force for this destination — the cap and why it applies. */
  rules: FareRules;
  /** Where the fare is heading if the rider waits, or null when it is flat. */
  forecast: FareForecast | null;
  /** Faster places to be collected from, ranked. */
  advice: PickupAdvice;
  cashback: CashbackStanding;
  /** Rider spend over the trailing month, which sets the cashback tier. */
  spend30d: number;
}

const RydeContext = createContext<Ctx | null>(null);

export function RydeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const traffic = useMemo(() => trafficAt(state.now), [state.now]);

  const nearestDriverKm = useMemo(() => {
    let best = 4;
    for (const d of state.fleet) {
      if (d.product !== state.productId) continue;
      const km = haversineKm(d, state.pickup);
      if (km < best) best = km;
    }
    return Math.max(0.4, best);
  }, [state.fleet, state.pickup, state.productId]);

  const rules = useMemo(() => fareRulesFor(state.dropoff), [state.dropoff]);

  const quotes = useMemo(() => {
    if (!state.route) return [];
    return PRODUCTS.map((p) => quoteFor(p, state.route!, traffic, nearestDriverKm, rules));
  }, [state.route, traffic, nearestDriverKm, rules]);

  const quote = useMemo(
    () => quotes.find((q) => q.product.id === state.productId) ?? null,
    [quotes, state.productId],
  );

  const total = quote ? Math.max(0, quote.fare - state.promoDiscount) : 0;

  /**
   * Re-quoting the route across the next two and a half hours is not free, so
   * it is keyed to the minute rather than to `now` — which ticks continuously.
   */
  const minuteStamp = Math.floor(state.now.getTime() / 60000);
  const forecast = useMemo(() => {
    if (!state.route || state.phase !== 'choosing') return null;
    return forecastFare(
      PRODUCT_BY_ID[state.productId],
      state.route,
      nearestDriverKm,
      new Date(minuteStamp * 60000),
      rules,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.route, state.productId, state.phase, nearestDriverKm, rules, minuteStamp]);

  const advice = useMemo(
    () => pickupAdvice(state.pickup, state.fleet, state.productId, traffic),
    [state.pickup, state.fleet, state.productId, traffic],
  );

  const spend30d = useMemo(
    () => state.history.reduce((s, t) => s + t.fare, 0),
    [state.history],
  );
  const cashback = useMemo(() => cashbackTierFor(spend30d), [spend30d]);

  // Master simulation loop: advances the active phase and drifts the fleet.
  const quoteRef = useRef(quote);
  quoteRef.current = quote;

  const trafficRef = useRef(traffic);
  trafficRef.current = traffic;

  // How long the current "searching" stretch should last, re-rolled per offer
  // so requests don't arrive on a metronome.
  const searchTarget = useRef(SEARCH_MIN_S + Math.random() * (SEARCH_MAX_S - SEARCH_MIN_S));

  const tickCount = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const s = stateRef.current;
      const dt = (TICK_MS / 1000) * TIME_SCALE;
      const duration = phaseDuration(s, quoteRef.current);

      // ---- Driver side -------------------------------------------------
      if (s.driverMode && s.driverOnline) {
        driveTick(s, dispatch, trafficRef.current, searchTarget);
        // A driver on a job doesn't need the rider simulation running too.
        if (s.driverPhase !== 'offline') return;
      }

      tickCount.current += 1;
      // Nothing is moving between trips, so ease off the fleet updates.
      const idleTick = duration === 0 && tickCount.current % 5 !== 0;
      if (idleTick) return;

      const elapsedReal = (TICK_MS / 1000) * (duration === 0 ? 5 : 1);
      const fleet = wander(s.fleet, elapsedReal * FLEET_SPEEDUP);

      // Only take a new clock reading when the minute actually rolls over —
      // the fare and traffic model both key off it.
      const wall = new Date();
      const now = wall.getMinutes() === s.now.getMinutes() ? s.now : wall;

      if (duration === 0) {
        dispatch({ type: 'tick', elapsed: 0, progress: 0, fleet, now });
        return;
      }

      const elapsed = s.elapsed + dt;
      const progress = Math.min(1, elapsed / duration);
      dispatch({ type: 'tick', elapsed, progress, fleet, now });

      if (progress >= 1) {
        if (s.phase === 'matching') {
          const candidates = fleet
            .filter((d) => d.product === s.productId)
            .sort((a, b) => haversineKm(a, s.pickup) - haversineKm(b, s.pickup));
          const driver = candidates[0] ?? fleet[0];
          const driverRoute = buildRoute(
            placeFrom(driver, `${driver.name}'s car`, 'En route'),
            s.pickup,
          );
          dispatch({ type: 'matched', driver, driverRoute });
        } else if (s.phase === 'arriving') {
          dispatch({ type: 'phase', phase: 'arrived' });
        } else if (s.phase === 'arrived') {
          dispatch({ type: 'phase', phase: 'ontrip' });
        } else if (s.phase === 'ontrip') {
          dispatch({ type: 'finish' });
        }
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Auto-dismiss toasts.
  useEffect(() => {
    if (!state.toast) return;
    const t = window.setTimeout(() => dispatch({ type: 'toast', message: null }), 2800);
    return () => window.clearTimeout(t);
  }, [state.toast]);

  const value = useMemo<Ctx>(
    () => ({ state, dispatch, traffic, quotes, quote, total, rules, forecast, advice, cashback, spend30d }),
    [state, traffic, quotes, quote, total, rules, forecast, advice, cashback, spend30d],
  );

  return <RydeContext.Provider value={value}>{children}</RydeContext.Provider>;
}

export function useRyde(): Ctx {
  const ctx = useContext(RydeContext);
  if (!ctx) throw new Error('useRyde must be used inside RydeProvider');
  return ctx;
}

export interface MapView {
  /** Polyline currently being driven, or the previewed trip. */
  route: Route | null;
  /** 0–1 along that route. */
  progress: number;
  /** Whether a vehicle marker should be drawn and animated. */
  moving: boolean;
  /** Park the marker at the end of the route without animating. */
  parked: boolean;
  origin: LatLng;
  destination: LatLng | null;
  bike: boolean;
  /** Fit the camera tightly, as when following a car. */
  following: boolean;
}

/**
 * What the map should draw right now, from whichever seat the user is in.
 *
 * Keeping this in one place means MapCanvas has no idea whether it is showing
 * a rider waiting for a car or a driver running a job.
 */
export function useMapView(): MapView {
  const { state } = useRyde();

  return useMemo(() => {
    if (state.driverMode) {
      const job = state.driverJob;
      const at = state.driverPos;

      if (!job || state.driverPhase === 'idle' || state.driverPhase === 'offline') {
        return {
          route: null, progress: 0, moving: false, parked: false,
          origin: at, destination: null, bike: false, following: false,
        };
      }

      if (state.driverPhase === 'incoming') {
        // Preview the whole job: where to collect, and where it ends up.
        return {
          route: job.preview, progress: 0, moving: false, parked: false,
          origin: at, destination: job.pickup, bike: false, following: false,
        };
      }

      const onTrip = state.driverPhase === 'on_trip';
      const leg = onTrip ? job.trip : job.toPickup;
      return {
        route: leg,
        progress: state.driverProgress,
        moving: state.driverPhase === 'to_pickup' || onTrip,
        parked: state.driverPhase === 'waiting' || state.driverPhase === 'summary',
        origin: at,
        destination: onTrip ? job.dropoff : job.pickup,
        bike: false,
        following: true,
      };
    }

    // Rider side.
    const arriving = state.phase === 'arriving' || state.phase === 'arrived';
    const leg = arriving ? state.driverRoute : state.route;
    return {
      route: leg,
      progress: state.progress,
      moving: state.phase === 'arriving' || state.phase === 'ontrip',
      parked: state.phase === 'arrived',
      origin: state.pickup,
      destination: arriving ? null : state.dropoff,
      bike: state.driver?.product === 'okada' || state.driver?.product === 'aboboya',
      following: arriving || state.phase === 'ontrip',
    };
  }, [state]);
}

