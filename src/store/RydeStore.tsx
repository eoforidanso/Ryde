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
import { quoteFor, trafficAt, type Quote, type TrafficState } from '../lib/pricing';
import { buildRoute, nearestNode, type LatLng, type Route } from '../lib/router';

/** Trips run compressed so a 25-minute ride plays out in about 27 seconds. */
const TIME_SCALE = 55;
const TICK_MS = 90;
/** Background traffic drifts only slightly faster than real time. */
const FLEET_SPEEDUP = 5;

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
  /** Trip id issued by the payments service; null when running standalone. */
  serverTripId: string | null;
  sheet: null | 'safety' | 'payment' | 'fare' | 'schedule' | 'contact';
  toast: string | null;
  scheduledFor: string | null;
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
  | { type: 'driverAccept'; fare: number }
  | { type: 'schedule'; when: string | null }
  | { type: 'serverTrip'; tripId: string | null }
  | { type: 'syncWallet'; balance: number };

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
  serverTripId: null,
  sheet: null,
  toast: null,
  scheduledFor: null,
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
      const quote = quoteFor(product, state.route, traffic, 1.5);
      const total = Math.max(0, quote.fare - state.promoDiscount) + state.tip;
      const trip: CompletedTrip = {
        id: `t-${Date.now()}`,
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
      const paidFromWallet = state.payment !== 'cash';
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
        history: [trip, ...state.history],
        walletBalance: paidFromWallet ? state.walletBalance - total : state.walletBalance,
        walletLedger: paidFromWallet
          ? [
              { id: `w-${Date.now()}`, label: `Trip — ${trip.dropoff}`, detail: 'Ryde Cash', amount: -total, when: 'Just now' },
              ...state.walletLedger,
            ]
          : state.walletLedger,
        toast: 'Thanks for riding with Ryde',
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
      return { ...state, driverMode: action.on, tab: 'ride', phase: 'idle' };

    case 'driverOnline':
      return { ...state, driverOnline: action.on };

    case 'driverAccept':
      return {
        ...state,
        driverEarnings: state.driverEarnings + action.fare,
        driverTripsToday: state.driverTripsToday + 1,
        toast: `Trip completed — GH₵${action.fare.toFixed(2)} earned`,
      };

    case 'serverTrip':
      return { ...state, serverTripId: action.tripId };

    case 'syncWallet':
      return { ...state, walletBalance: action.balance };

    case 'schedule':
      return { ...state, scheduledFor: action.when, sheet: null, toast: action.when ? `Ride scheduled for ${action.when}` : null };

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

interface Ctx {
  state: State;
  dispatch: (a: Action) => void;
  traffic: TrafficState;
  quotes: Quote[];
  quote: Quote | null;
  total: number;
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

  const quotes = useMemo(() => {
    if (!state.route) return [];
    return PRODUCTS.map((p) => quoteFor(p, state.route!, traffic, nearestDriverKm));
  }, [state.route, traffic, nearestDriverKm]);

  const quote = useMemo(
    () => quotes.find((q) => q.product.id === state.productId) ?? null,
    [quotes, state.productId],
  );

  const total = quote ? Math.max(0, quote.fare - state.promoDiscount) : 0;

  // Master simulation loop: advances the active phase and drifts the fleet.
  const quoteRef = useRef(quote);
  quoteRef.current = quote;

  const tickCount = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const s = stateRef.current;
      const dt = (TICK_MS / 1000) * TIME_SCALE;
      const duration = phaseDuration(s, quoteRef.current);

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
    () => ({ state, dispatch, traffic, quotes, quote, total }),
    [state, traffic, quotes, quote, total],
  );

  return <RydeContext.Provider value={value}>{children}</RydeContext.Provider>;
}

export function useRyde(): Ctx {
  const ctx = useContext(RydeContext);
  if (!ctx) throw new Error('useRyde must be used inside RydeProvider');
  return ctx;
}

