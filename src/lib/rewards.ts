/**
 * Driver rewards — tiers, weekly challenges and zone leaderboards.
 *
 * The rule this module follows: nothing here is decoration. A tier changes the
 * commission the driver actually pays, a challenge pays a bonus into the same
 * earnings figure the top bar shows, and the leaderboard ranks the driver by
 * the week they have actually had. A badge that means nothing is worse than no
 * badge, because it teaches drivers to ignore the whole section.
 */

import { mulberry32 } from './random';

export type TierId = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Tier {
  id: TierId;
  name: string;
  /** Trips in the current week to hold this tier. */
  minTrips: number;
  /** Rating floor — volume alone does not buy a tier. */
  minRating: number;
  /** Ryde's cut at this tier. Lower is better for the driver. */
  commission: number;
  perk: string;
  colour: string;
}

/**
 * Four tiers, each with a commission the driver can feel.
 *
 * The step from Bronze to Platinum is five points of commission — on a
 * GH₵1,200 week that is GH₵60, which is the point: the ladder pays for itself
 * rather than handing out coloured badges.
 */
export const TIERS: Tier[] = [
  { id: 'bronze', name: 'Bronze', minTrips: 0, minRating: 0, commission: 0.2, perk: 'Standard 20% commission', colour: '#b0793f' },
  { id: 'silver', name: 'Silver', minTrips: 25, minRating: 4.6, commission: 0.18, perk: '18% commission · priority airport queue', colour: '#a9b4bd' },
  { id: 'gold', name: 'Gold', minTrips: 55, minRating: 4.75, commission: 0.165, perk: '16.5% commission · free vehicle inspection', colour: '#e0b45c' },
  { id: 'platinum', name: 'Platinum', minTrips: 90, minRating: 4.85, commission: 0.15, perk: '15% commission · fuel discount at Goil', colour: '#8fd8ff' },
];

export interface TierStanding {
  tier: Tier;
  next: Tier | null;
  /** Trips still needed for the next tier. */
  tripsToNext: number;
  /** 0–1 across the current tier band. */
  progress: number;
  /** Set when rating, not volume, is what is holding the driver back. */
  ratingBlocked: boolean;
}

export function tierFor(weekTrips: number, rating: number): TierStanding {
  let earned = TIERS[0];
  for (const t of TIERS) {
    if (weekTrips >= t.minTrips && rating >= t.minRating) earned = t;
  }

  const next = TIERS[TIERS.indexOf(earned) + 1] ?? null;
  if (!next) {
    return { tier: earned, next: null, tripsToNext: 0, progress: 1, ratingBlocked: false };
  }

  const span = next.minTrips - earned.minTrips;
  const done = Math.min(span, weekTrips - earned.minTrips);
  return {
    tier: earned,
    next,
    tripsToNext: Math.max(0, next.minTrips - weekTrips),
    progress: span > 0 ? Math.max(0, done / span) : 1,
    // A driver on 60 trips at 4.7 is not short of trips — they are short of stars.
    ratingBlocked: weekTrips >= next.minTrips && rating < next.minRating,
  };
}

export type ChallengeUnit = 'trips' | 'ghs' | 'stars';

export interface Challenge {
  id: string;
  title: string;
  detail: string;
  unit: ChallengeUnit;
  target: number;
  progress: number;
  /** Bonus in cedis, paid into earnings the moment the target is crossed. */
  reward: number;
  done: boolean;
}

export interface DriverStats {
  weekTrips: number;
  weekEarnings: number;
  /** Consecutive trips rated five stars. */
  fiveStarStreak: number;
  rating: number;
}

/**
 * This week's challenges.
 *
 * Three at a time: one on volume, one on takings, one on service — so a driver
 * who has a quiet week on trips can still be paid for driving well.
 */
export function weeklyChallenges(stats: DriverStats): Challenge[] {
  const defs: Omit<Challenge, 'done'>[] = [
    {
      id: 'trips-40',
      title: 'Complete 40 trips',
      detail: 'Resets Monday at 04:00',
      unit: 'trips',
      target: 40,
      progress: stats.weekTrips,
      reward: 60,
    },
    {
      id: 'earn-900',
      title: 'Take GH₵900 in fares',
      detail: 'Counts your share, before tips',
      unit: 'ghs',
      target: 900,
      progress: stats.weekEarnings,
      reward: 75,
    },
    {
      id: 'stars-15',
      title: '15 five-star trips in a row',
      detail: 'One rating below five starts the streak again',
      unit: 'stars',
      target: 15,
      progress: stats.fiveStarStreak,
      reward: 50,
    },
  ];

  return defs.map((d) => ({ ...d, done: d.progress >= d.target }));
}

/** Bonus a just-finished trip has unlocked, if it crossed a target. */
export function challengeJustCompleted(
  before: DriverStats,
  after: DriverStats,
): Challenge | null {
  const was = weeklyChallenges(before);
  const now = weeklyChallenges(after);
  const crossed = now.find((c, i) => c.done && !was[i].done);
  return crossed ?? null;
}

export interface LeaderRow {
  rank: number;
  name: string;
  trips: number;
  earnings: number;
  tier: TierId;
  you: boolean;
}

const RIVAL_NAMES = [
  'Kwabena O.', 'Naa Adjeley T.', 'Selorm A.', 'Ibrahim M.', 'Yaw B.', 'Esi D.',
  'Nii Armah L.', 'Gifty A.', 'Mawuli K.', 'Abena S.', 'Fuseini I.', 'Ekow B.',
];

/**
 * Leaderboard for the zone the driver is working.
 *
 * Rivals are generated from the zone name, so a driver sees the same field of
 * names every time they open it — a leaderboard that reshuffles its rivals on
 * every render is obviously fictional. The driver's own row is placed by the
 * week they have actually had.
 */
export function leaderboard(zone: string, stats: DriverStats): LeaderRow[] {
  let hash = 0;
  for (let i = 0; i < zone.length; i += 1) hash = (hash * 31 + zone.charCodeAt(i)) | 0;
  const rand = mulberry32(hash);

  const rows: LeaderRow[] = RIVAL_NAMES.slice(0, 9).map((name) => {
    const trips = 28 + Math.floor(rand() * 70);
    return {
      rank: 0,
      name,
      trips,
      earnings: Math.round((trips * (22 + rand() * 12)) / 5) * 5,
      tier: tierFor(trips, 4.7 + rand() * 0.29).tier.id,
      you: false,
    };
  });

  rows.push({
    rank: 0,
    name: 'You',
    trips: stats.weekTrips,
    earnings: Math.round(stats.weekEarnings),
    tier: tierFor(stats.weekTrips, stats.rating).tier.id,
    you: true,
  });

  return rows
    .sort((a, b) => b.earnings - a.earnings)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
