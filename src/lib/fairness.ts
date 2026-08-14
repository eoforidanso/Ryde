/**
 * Fare fairness engine.
 *
 * Three jobs, all of them about the rider being able to check our working:
 * cap the demand multiplier before it reaches the fare, explain in plain words
 * which inputs moved the price, and look forward through the traffic model so
 * a rider who can wait is told what waiting is worth.
 *
 * Nothing here invents a number. Every factor and forecast is derived from the
 * same `quoteFor` the booking screen quotes with, so an explanation can never
 * drift away from what is actually charged.
 */

import type { Place } from '../data/places';
import type { Product } from '../data/products';
import { quoteFor, trafficAt, type FareRules, type Quote, type TrafficState } from './pricing';
import type { Route } from './router';

/**
 * The everyday ceiling. Demand can double the wait; it cannot double the fare.
 *
 * Set below the peak the demand model reaches on purpose: a cap that never
 * binds is a press release, not a policy. At the 6–9am and 4–8pm peaks the
 * model asks for 1.6× and riders are charged 1.5×.
 */
export const STANDARD_SURGE_CAP = 1.5;

/**
 * Trips nobody chooses to take. Someone heading to Korle Bu at 2am is not a
 * discretionary customer to be priced against, so the cap is close to flat.
 */
export const ESSENTIAL_SURGE_CAP = 1.2;

export function fareRulesFor(dropoff: Place | null): FareRules {
  if (dropoff?.kind === 'hospital') {
    return {
      surgeCap: ESSENTIAL_SURGE_CAP,
      capReason: 'Hospital trips are capped at 1.2× at every hour',
    };
  }
  return {
    surgeCap: STANDARD_SURGE_CAP,
    capReason: `Ryde never charges more than ${STANDARD_SURGE_CAP}× the standard fare`,
  };
}

export type FactorTone = 'up' | 'down' | 'flat';

export interface FareFactor {
  label: string;
  detail: string;
  tone: FactorTone;
  /** Signed cedis this factor contributed, where that is meaningful. */
  amount?: number;
}

/**
 * Why this price — one line per input that actually moved.
 *
 * Ordered by size of effect rather than by category, because the rider's real
 * question is "what made this expensive", and the answer should be first.
 */
export function explainFare(quote: Quote, traffic: TrafficState, now: Date): FareFactor[] {
  const factors: FareFactor[] = [];
  const distanceCost = quote.distanceKm * quote.product.perKm;
  const timeCost = quote.minutes * quote.product.perMin;

  factors.push({
    label: `${quote.distanceKm.toFixed(1)} km of driving`,
    detail: `${quote.product.name} charges GH₵${quote.product.perKm.toFixed(2)} per kilometre`,
    tone: 'flat',
    amount: distanceCost,
  });

  factors.push({
    label: `${quote.minutes} minutes behind the wheel`,
    detail:
      traffic.factor > 1.3
        ? `${traffic.reason.toLowerCase()} — the same trip runs ${Math.round(
            quote.minutes / traffic.factor,
          )} min on clear roads`
        : 'Roads are moving, so the time component is small',
    tone: traffic.factor > 1.3 ? 'up' : 'flat',
    amount: timeCost,
  });

  if (quote.surge > 1) {
    factors.push({
      label: `Demand is ${quote.surge.toFixed(1)}× right now`,
      detail: `${traffic.reason} — more riders than drivers near you`,
      tone: 'up',
      amount: quote.fare - quote.baseFare,
    });
  } else {
    factors.push({
      label: 'No surge on this trip',
      detail: 'Enough drivers are free nearby, so you pay the standard fare',
      tone: 'down',
    });
  }

  if (quote.capSaving > 0) {
    factors.push({
      label: `Surge capped at ${quote.surge.toFixed(1)}×`,
      detail: `Demand asked for ${quote.rawSurge.toFixed(1)}× — the cap took GH₵${quote.capSaving.toFixed(
        2,
      )} off`,
      tone: 'down',
      amount: -quote.capSaving,
    });
  }

  const hour = now.getHours();
  if (hour >= 23 || hour < 5) {
    factors.push({
      label: 'Late-night driving',
      detail: 'Fewer drivers are on the road after 23:00, which lifts the base rate',
      tone: 'up',
    });
  }

  return factors;
}

export interface FareForecast {
  /** Where the fare is heading, from the rider's point of view. */
  direction: 'falling' | 'rising';
  /** Minutes from now to the quoted moment. */
  minutes: number;
  at: Date;
  fare: number;
  /** Signed change against the fare right now. */
  delta: number;
  pct: number;
  headline: string;
  detail: string;
}

const HORIZON_MIN = 120;
const STEP_MIN = 15;
/**
 * Longest wait worth suggesting.
 *
 * "Wait two and a half hours and save GH₵17" is a timetable, not advice — past
 * an hour, nobody is standing on the roadside holding out for a cheaper fare.
 */
const MAX_WAIT_MIN = 60;

/**
 * Predictive fare alert.
 *
 * Walks the traffic model forward in quarter-hour steps and re-quotes the same
 * route at each one. A drop is only worth telling someone about if it is both
 * large enough to notice and near enough to wait for; a rise is only worth
 * mentioning if it lands soon enough to beat by booking now.
 */
export function forecastFare(
  product: Product,
  route: Route,
  distanceToDriverKm: number,
  now: Date,
  rules: FareRules,
): FareForecast | null {
  const nowFare = quoteFor(product, route, trafficAt(now), distanceToDriverKm, rules).fare;

  let cheapest = { fare: nowFare, minutes: 0, at: now };
  let firstRise: { fare: number; minutes: number; at: Date } | null = null;

  for (let m = STEP_MIN; m <= HORIZON_MIN; m += STEP_MIN) {
    const at = new Date(now.getTime() + m * 60000);
    const fare = quoteFor(product, route, trafficAt(at), distanceToDriverKm, rules).fare;

    if (fare < cheapest.fare) cheapest = { fare, minutes: m, at };
    if (!firstRise && fare > nowFare * 1.1) firstRise = { fare, minutes: m, at };
  }

  const clock = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const saving = nowFare - cheapest.fare;
  if (cheapest.minutes > 0 && cheapest.minutes <= MAX_WAIT_MIN && saving >= 3 && saving / nowFare >= 0.08) {
    const pct = Math.round((saving / nowFare) * 100);
    return {
      direction: 'falling',
      minutes: cheapest.minutes,
      at: cheapest.at,
      fare: cheapest.fare,
      delta: -saving,
      pct,
      headline: `Wait ${cheapest.minutes} min and save about GH₵${saving.toFixed(2)}`,
      detail: `Fares on this route usually fall ${pct}% by ${clock(cheapest.at)} as demand eases`,
    };
  }

  // Only warn about a rise the rider can still act on — an hour's notice is a
  // fact about tomorrow, not a reason to book now.
  if (firstRise && firstRise.minutes <= 45) {
    const rise = firstRise.fare - nowFare;
    const pct = Math.round((rise / nowFare) * 100);
    return {
      direction: 'rising',
      minutes: firstRise.minutes,
      at: firstRise.at,
      fare: firstRise.fare,
      delta: rise,
      pct,
      headline: `Fares rise about ${pct}% after ${clock(firstRise.at)}`,
      detail: `Booking now holds this price — the same trip is GH₵${firstRise.fare.toFixed(
        2,
      )} in ${firstRise.minutes} min`,
    };
  }

  return null;
}
