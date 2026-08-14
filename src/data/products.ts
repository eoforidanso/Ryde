/**
 * Ryde products and their fare cards, in Ghana cedis.
 *
 * Fares follow the local structure riders expect: a base pickup fee, distance
 * and time components, a small booking fee, and a per-product minimum.
 */

export type ProductId = 'okada' | 'go' | 'comfort' | 'xl' | 'share' | 'aboboya';

export interface Product {
  id: ProductId;
  name: string;
  tagline: string;
  seats: number;
  /** GHS */
  base: number;
  perKm: number;
  perMin: number;
  bookingFee: number;
  minimum: number;
  /** Multiplier on ETA — okadas filter through traffic, XLs don't. */
  trafficResilience: number;
  /** Rough share of the fleet on the road, used for pickup ETA + availability. */
  supply: number;
  badge?: string;
}

export const PRODUCTS: Product[] = [
  {
    id: 'okada',
    name: 'Ryde Okada',
    tagline: 'Motorbike — beat the traffic',
    seats: 1,
    base: 3,
    perKm: 1.6,
    perMin: 0.2,
    bookingFee: 1,
    minimum: 8,
    trafficResilience: 0.45,
    supply: 0.9,
    badge: 'Fastest',
  },
  {
    id: 'share',
    name: 'Ryde Share',
    tagline: 'Share the car, split the fare',
    seats: 1,
    base: 4,
    perKm: 1.9,
    perMin: 0.24,
    bookingFee: 1,
    minimum: 10,
    trafficResilience: 1.15,
    supply: 0.5,
    badge: 'Cheapest',
  },
  {
    id: 'go',
    name: 'Ryde Go',
    tagline: 'Everyday cars, everyday prices',
    seats: 4,
    base: 6,
    perKm: 2.6,
    perMin: 0.32,
    bookingFee: 1.5,
    minimum: 15,
    trafficResilience: 1,
    supply: 1,
    badge: 'Popular',
  },
  {
    id: 'comfort',
    name: 'Ryde Comfort',
    tagline: 'Newer cars, extra legroom, AC',
    seats: 4,
    base: 9,
    perKm: 3.6,
    perMin: 0.45,
    bookingFee: 2,
    minimum: 22,
    trafficResilience: 1,
    supply: 0.55,
  },
  {
    id: 'xl',
    name: 'Ryde XL',
    tagline: 'Vans and SUVs for up to 6',
    seats: 6,
    base: 12,
    perKm: 4.4,
    perMin: 0.55,
    bookingFee: 2,
    minimum: 30,
    trafficResilience: 1.1,
    supply: 0.35,
  },
  {
    id: 'aboboya',
    name: 'Ryde Aboboya',
    tagline: 'Tricycle for parcels and market runs',
    seats: 1,
    base: 5,
    perKm: 2.1,
    perMin: 0.22,
    bookingFee: 1,
    minimum: 12,
    trafficResilience: 0.75,
    supply: 0.4,
  },
];

export const PRODUCT_BY_ID: Record<ProductId, Product> = Object.fromEntries(
  PRODUCTS.map((p) => [p.id, p]),
) as Record<ProductId, Product>;

export type PaymentMethodId =
  | 'ryde-cash'
  | 'momo-mtn'
  | 'momo-telecel'
  | 'momo-at'
  | 'cash'
  | 'card';

export interface PaymentMethod {
  id: PaymentMethodId;
  label: string;
  detail: string;
  /** Brand colour for the tile. */
  tint: string;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  // Listed first and used by default: a prepaid balance settles instantly and
  // can't fail with the rider already standing on the pavement.
  { id: 'ryde-cash', label: 'Ryde Cash', detail: 'Wallet balance', tint: '#14D07D' },
  { id: 'momo-mtn', label: 'MTN MoMo', detail: '024 •••• 418', tint: '#FFCC00' },
  { id: 'momo-telecel', label: 'Telecel Cash', detail: '050 •••• 907', tint: '#E4002B' },
  { id: 'momo-at', label: 'AT Money', detail: '027 •••• 233', tint: '#0091DA' },
  { id: 'cash', label: 'Cash', detail: 'Pay the driver directly', tint: '#4CAF7D' },
  { id: 'card', label: 'Visa', detail: '•••• 4417', tint: '#1A5CFF' },
];
