/**
 * Server-authoritative fare engine.
 *
 * The client has its own copy of this logic for live estimates, but the number
 * that is actually charged is only ever the one computed here and stored on the
 * trip row at quote time. A client can change what it displays; it cannot
 * change what it is billed.
 */

import { cedisToPesewas, type Pesewas } from './money.ts';

export type ProductId = 'okada' | 'share' | 'go' | 'comfort' | 'xl' | 'aboboya';

interface Tariff {
  base: Pesewas;
  perKm: Pesewas;
  perMin: Pesewas;
  bookingFee: Pesewas;
  minimum: Pesewas;
}

export const TARIFFS: Record<ProductId, Tariff> = {
  okada: { base: 300, perKm: 160, perMin: 20, bookingFee: 100, minimum: 800 },
  share: { base: 400, perKm: 190, perMin: 24, bookingFee: 100, minimum: 1000 },
  go: { base: 600, perKm: 260, perMin: 32, bookingFee: 150, minimum: 1500 },
  comfort: { base: 900, perKm: 360, perMin: 45, bookingFee: 200, minimum: 2200 },
  xl: { base: 1200, perKm: 440, perMin: 55, bookingFee: 200, minimum: 3000 },
  aboboya: { base: 500, perKm: 210, perMin: 22, bookingFee: 100, minimum: 1200 },
};

/** Round to the nearest 50 pesewas, the way cedi fares are quoted. */
function round50p(p: number): Pesewas {
  return Math.round(p / 50) * 50;
}

export interface FareInput {
  product: ProductId;
  distanceM: number;
  durationS: number;
  /** Surge in basis points; 10000 = 1.0×. */
  surgeBp: number;
}

export function computeFare(input: FareInput): Pesewas {
  const t = TARIFFS[input.product];
  if (!t) throw new Error(`Unknown product ${input.product}`);

  const km = input.distanceM / 1000;
  const minutes = input.durationS / 60;

  const metered = t.base + km * t.perKm + minutes * t.perMin;
  const beforeFees = Math.max(metered, t.minimum);
  const beforeSurge = beforeFees + t.bookingFee;

  return round50p((beforeSurge * input.surgeBp) / 10000);
}

const EARTH_R_KM = 6371;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(h));
}

/**
 * Sanity-check a client-reported route length against the great-circle
 * distance between its own endpoints.
 *
 * This is a guard rail, not a proof. Until the A* router itself runs on the
 * server (see README, "Closing the distance gap") a client could still inflate
 * or deflate distance within this envelope — it just can't claim a 2 km hop is
 * a 40 km motorway run, or that a Kasoa–Tema trip was 500 metres.
 */
export function distanceIsPlausible(
  distanceM: number,
  pickup: { lat: number; lng: number },
  dropoff: { lat: number; lng: number },
): boolean {
  const straightM = haversineKm(pickup, dropoff) * 1000;
  if (straightM < 200) return distanceM <= 5000;
  return distanceM >= straightM * 0.85 && distanceM <= straightM * 3;
}

/** Convenience for seeding and tests. */
export const ghs = cedisToPesewas;
