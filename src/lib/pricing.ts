import type { Product } from '../data/products';
import type { Route } from './router';

export interface TrafficState {
  /** Multiplier applied to free-flow travel time. 1 = clear roads. */
  factor: number;
  label: string;
  /** Surge multiplier applied to the fare. */
  surge: number;
  reason: string;
}

/**
 * Accra traffic is extremely time-of-day driven: the 6–9am crawl into town and
 * the 4–8pm crawl out of it. Weekends and late nights run clear.
 */
export function trafficAt(date: Date): TrafficState {
  const hour = date.getHours() + date.getMinutes() / 60;
  const day = date.getDay();
  const weekend = day === 0 || day === 6;

  let factor = 1.15;
  let label = 'Light traffic';
  let reason = 'Roads are moving well';

  if (!weekend && hour >= 6 && hour < 9.5) {
    factor = 2.1;
    label = 'Heavy traffic';
    reason = 'Morning rush into town';
  } else if (!weekend && hour >= 15.5 && hour < 20) {
    factor = 2.25;
    label = 'Heavy traffic';
    reason = 'Evening rush on the Motorway and Ring Road';
  } else if (hour >= 11 && hour < 15.5) {
    factor = 1.45;
    label = 'Moderate traffic';
    reason = 'Steady midday flow';
  } else if (hour >= 22 || hour < 5.5) {
    factor = 0.95;
    label = 'Clear roads';
    reason = 'Quiet at this hour';
  } else if (weekend && hour >= 18 && hour < 23) {
    factor = 1.6;
    label = 'Moderate traffic';
    reason = 'Weekend night out in Osu and East Legon';
  }

  // Demand tracks congestion, plus a late-night premium when few drivers are on.
  let surge = 1;
  if (factor >= 2) surge = 1.6;
  else if (factor >= 1.4) surge = 1.2;
  if (hour >= 23 || hour < 4.5) surge = Math.max(surge, 1.35);

  return { factor, label, surge, reason };
}

export interface Quote {
  product: Product;
  fare: number;
  /** Fare before surge, for the strike-through. */
  baseFare: number;
  surge: number;
  /** What the demand model asked for, before the cap trimmed it. */
  rawSurge: number;
  /** Cedis the cap took off this fare; 0 when the cap did not bind. */
  capSaving: number;
  minutes: number;
  distanceKm: number;
  pickupMinutes: number;
  available: boolean;
  breakdown: { label: string; amount: number }[];
}

/**
 * Ceiling on the demand multiplier, whatever the surge model asks for.
 *
 * A cap is the one fairness lever a rider can actually verify: they see the
 * multiplier that was applied and what it would have been. Trips nobody
 * chooses to take — a hospital run at 2am — get a tighter one.
 */
export interface FareRules {
  surgeCap: number;
  capReason: string;
}

function round50p(value: number): number {
  // Cedi fares are quoted to the nearest 50 pesewas.
  return Math.round(value * 2) / 2;
}

export function quoteFor(
  product: Product,
  route: Route,
  traffic: TrafficState,
  distanceToDriverKm: number,
  rules?: FareRules,
): Quote {
  const minutes = route.baseMinutes * (1 + (traffic.factor - 1) * product.trafficResilience);
  const distance = route.distanceKm;

  const distanceCost = distance * product.perKm;
  const timeCost = minutes * product.perMin;
  const preMin = product.base + distanceCost + timeCost;
  const beforeFees = Math.max(preMin, product.minimum);
  const baseFare = round50p(beforeFees + product.bookingFee);

  // Sharing already halves the exposure to demand, so the multiplier is halved
  // before the cap rather than after — the cap is a ceiling, not a floor.
  const rawSurge = product.id === 'share' ? 1 + (traffic.surge - 1) * 0.5 : traffic.surge;
  const surge = Math.min(rawSurge, rules?.surgeCap ?? Infinity);
  const fare = round50p(baseFare * surge);
  const capSaving = round50p(baseFare * rawSurge) - fare;

  // Larger vehicles are thinner on the ground, so pickups take longer.
  const pickupMinutes = Math.max(
    1,
    Math.round((distanceToDriverKm / (product.id === 'okada' ? 26 : 20)) * 60 * (1 / product.supply) * 0.6),
  );

  const availabilityRoll = product.supply + (product.id === 'share' ? -0.15 : 0);

  return {
    product,
    fare,
    baseFare,
    surge,
    rawSurge,
    capSaving,
    minutes: Math.max(2, Math.round(minutes)),
    distanceKm: distance,
    pickupMinutes,
    available: availabilityRoll > 0.3,
    breakdown: [
      { label: 'Base fare', amount: product.base },
      { label: `Distance (${distance.toFixed(1)} km)`, amount: distanceCost },
      { label: `Time (${Math.round(minutes)} min)`, amount: timeCost },
      { label: 'Booking fee', amount: product.bookingFee },
      ...(surge > 1
        ? [{ label: `Busy area (${surge.toFixed(1)}×)`, amount: fare - baseFare }]
        : []),
      ...(capSaving > 0
        ? [{ label: `Surge cap (${rawSurge.toFixed(1)}× trimmed to ${surge.toFixed(1)}×)`, amount: -capSaving }]
        : []),
    ],
  };
}

export function formatGHS(amount: number): string {
  return `GH₵${amount.toFixed(2)}`;
}

export function formatGHSShort(amount: number): string {
  return `GH₵${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}
