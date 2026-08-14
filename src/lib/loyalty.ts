/**
 * Rider loyalty — cashback tiers and Ryde Points.
 *
 * Two different promises, deliberately kept apart. Cashback is automatic and
 * proportional: spend more in a month, keep a bigger slice of every fare, paid
 * back into the wallet the moment a trip ends. Points are earned on every trip
 * and spent when the rider chooses, in whole chunks, so the balance is
 * something they decide what to do with rather than a number that decays.
 */

export interface CashbackTier {
  id: 'bronze' | 'silver' | 'gold';
  name: string;
  /** Spend over the trailing 30 days that holds this tier. */
  minSpend: number;
  /** Share of each fare returned to Ryde Cash. */
  rate: number;
  perk: string;
  colour: string;
}

export const CASHBACK_TIERS: CashbackTier[] = [
  { id: 'bronze', name: 'Bronze', minSpend: 0, rate: 0.01, perk: '1% back on every trip', colour: '#b0793f' },
  { id: 'silver', name: 'Silver', minSpend: 300, rate: 0.02, perk: '2% back · priority support', colour: '#a9b4bd' },
  { id: 'gold', name: 'Gold', minSpend: 800, rate: 0.035, perk: '3.5% back · free cancellations', colour: '#e0b45c' },
];

export interface CashbackStanding {
  tier: CashbackTier;
  next: CashbackTier | null;
  /** Cedis of further spend needed for the next tier. */
  toNext: number;
  /** 0–1 across the current band. */
  progress: number;
}

export function cashbackTierFor(spend30d: number): CashbackStanding {
  let earned = CASHBACK_TIERS[0];
  for (const t of CASHBACK_TIERS) if (spend30d >= t.minSpend) earned = t;

  const next = CASHBACK_TIERS[CASHBACK_TIERS.indexOf(earned) + 1] ?? null;
  if (!next) return { tier: earned, next: null, toNext: 0, progress: 1 };

  const span = next.minSpend - earned.minSpend;
  return {
    tier: earned,
    next,
    toNext: Math.max(0, next.minSpend - spend30d),
    progress: span > 0 ? Math.min(1, (spend30d - earned.minSpend) / span) : 1,
  };
}

/** Points earned per cedi of fare. */
export const POINTS_PER_CEDI = 4;

export interface Redemption {
  points: number;
  credit: number;
  label: string;
}

/**
 * Redemption ladder.
 *
 * The rate improves as the chunk gets bigger — 100 points to the cedi at the
 * bottom, 83 at the top — which is the whole reason to save rather than cash
 * out the moment redemption becomes possible.
 */
export const REDEMPTIONS: Redemption[] = [
  { points: 500, credit: 5, label: 'GH₵5 ride credit' },
  { points: 1200, credit: 13, label: 'GH₵13 ride credit' },
  { points: 2500, credit: 30, label: 'GH₵30 ride credit' },
];

export function pointsFor(fare: number): number {
  return Math.round(fare * POINTS_PER_CEDI);
}

export interface SplitContact {
  id: string;
  name: string;
  msisdn: string;
}

/** People the rider splits fares with most often. */
export const SPLIT_CONTACTS: SplitContact[] = [
  { id: 'c-kojo', name: 'Kojo Mensah', msisdn: '024 ••• 7781' },
  { id: 'c-adwoa', name: 'Adwoa Sarpong', msisdn: '055 ••• 2140' },
  { id: 'c-nii', name: 'Nii Armah', msisdn: '020 ••• 6633' },
  { id: 'c-efua', name: 'Efua Mensimah', msisdn: '027 ••• 9012' },
];

/**
 * Split a fare across the rider and everyone they picked.
 *
 * Cedis do not divide evenly, so the rider carries the remainder rather than
 * quietly rounding everyone up and collecting more than the fare.
 */
export function splitFare(total: number, others: number): { each: number; yours: number } {
  const heads = others + 1;
  const each = Math.floor((total / heads) * 100) / 100;
  return { each, yours: Math.round((total - each * others) * 100) / 100 };
}

export interface AutoTopUpRule {
  on: boolean;
  /** Balance that triggers a top up. */
  threshold: number;
  /** How much goes in when it fires. */
  amount: number;
}

export const TOP_UP_THRESHOLDS = [20, 40, 60];
export const TOP_UP_AMOUNTS = [50, 100, 200];
