import { haversineKm } from '../data/network';
import { PLACES, type Place } from '../data/places';
import { PAYMENT_METHODS, PRODUCT_BY_ID, type ProductId } from '../data/products';
import { quoteFor, type TrafficState } from './pricing';
import { buildRoute, nearestNode, type LatLng, type Route } from './router';

export interface DriverJob {
  id: string;
  riderName: string;
  riderRating: number;
  product: ProductId;
  pickup: Place;
  dropoff: Place;
  /** Driver's current position to the pickup point. */
  toPickup: Route;
  /** Pickup to dropoff — the paid leg. */
  trip: Route;
  /** Both legs joined, for previewing the whole job on the offer screen. */
  preview: Route;
  fare: number;
  /** Driver's share after Ryde's commission. */
  earnings: number;
  pickupMinutes: number;
  tripMinutes: number;
  paymentLabel: string;
  note?: string;
}

const RIDER_NAMES = [
  'Akosua D.', 'Kwesi A.', 'Naa D.', 'Yaw B.', 'Efua M.', 'Kojo T.', 'Adjoa S.',
  'Nii A.', 'Abena O.', 'Fiifi K.', 'Hawa I.', 'Selorm A.', 'Maame Y.', 'Kofi N.',
];

const NOTES = [
  'Meet me at the gate',
  'I have one small bag',
  'Coming from the second floor',
  undefined,
  undefined,
  undefined,
  'Please call when you arrive',
];

/** Commission Ryde retains by default, matching the payments service. */
const COMMISSION = 0.2;

/** Products a car driver would be offered. */
const CAR_PRODUCTS: ProductId[] = ['go', 'go', 'go', 'share', 'comfort', 'xl'];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Build a plausible trip request for a driver sitting at `from`.
 *
 * Pickups are drawn from places near the driver — a request 20 km away is one
 * no driver would ever see — and the fare comes from the same engine the rider
 * app quotes with, so both sides of the marketplace agree on the number.
 */
export function createJob(
  from: LatLng,
  traffic: TrafficState,
  commission = COMMISSION,
): DriverJob | null {
  const nearby = PLACES.filter((p) => {
    const km = haversineKm(from, p);
    return km > 0.6 && km < 7;
  });
  if (nearby.length === 0) return null;

  const pickup = pick(nearby);
  const candidates = PLACES.filter((p) => haversineKm(pickup, p) > 2.5);
  if (candidates.length === 0) return null;
  const dropoff = pick(candidates);

  const driverPlace: Place = {
    id: 'driver-pos',
    name: 'Your position',
    area: 'En route',
    lat: from.lat,
    lng: from.lng,
    node: nearestNode(from),
    kind: 'landmark',
  };

  const toPickup = buildRoute(driverPlace, pickup);
  const trip = buildRoute(pickup, dropoff);
  const product = pick(CAR_PRODUCTS);
  const quote = quoteFor(PRODUCT_BY_ID[product], trip, traffic, haversineKm(from, pickup));

  // Joining the legs lets the offer screen show the full shape of the job —
  // how far out the pickup is and where it ends up — in one glance.
  const preview: Route = {
    points: [...toPickup.points, ...trip.points],
    legs: [...toPickup.legs, ...trip.legs],
    distanceKm: toPickup.distanceKm + trip.distanceKm,
    baseMinutes: toPickup.baseMinutes + trip.baseMinutes,
    directions: [...toPickup.directions, ...trip.directions],
  };

  return {
    id: `job-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    riderName: pick(RIDER_NAMES),
    riderRating: Math.round((4.4 + Math.random() * 0.6) * 10) / 10,
    product,
    pickup,
    dropoff,
    toPickup,
    trip,
    preview,
    fare: quote.fare,
    earnings: Math.round(quote.fare * (1 - commission) * 2) / 2,
    pickupMinutes: Math.max(
      1,
      Math.round((toPickup.baseMinutes * (1 + (traffic.factor - 1) * 0.8))),
    ),
    tripMinutes: quote.minutes,
    paymentLabel: pick(PAYMENT_METHODS).label,
    note: pick(NOTES),
  };
}
