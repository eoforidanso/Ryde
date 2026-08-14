import { mulberry32 } from '../lib/random';
import { NODES } from './network';
import type { ProductId } from './products';

export interface Driver {
  id: string;
  name: string;
  rating: number;
  trips: number;
  vehicle: string;
  colour: string;
  plate: string;
  product: ProductId;
  language: string;
  /** Live position, updated by the fleet simulation. */
  lat: number;
  lng: number;
  heading: number;
  /** Index into NODES that this idle driver is currently cruising toward. */
  targetIdx: number;
}

const FIRST = [
  'Kwame', 'Yaw', 'Kojo', 'Kofi', 'Ama', 'Akosua', 'Abena', 'Adwoa', 'Kwabena',
  'Nii', 'Naa', 'Emmanuel', 'Selorm', 'Mawuli', 'Fuseini', 'Ibrahim', 'Gifty',
  'Esi', 'Kwaku', 'Bright', 'Prince', 'Enoch', 'Hamza', 'Afia', 'Ekow', 'Sena',
];

const LAST = [
  'Mensah', 'Boateng', 'Owusu', 'Asante', 'Addo', 'Tetteh', 'Quartey', 'Lartey',
  'Agyemang', 'Nkrumah', 'Amoah', 'Danso', 'Osei', 'Ansah', 'Dzobo', 'Adjei',
  'Sarpong', 'Baidoo', 'Antwi', 'Yeboah', 'Abdulai', 'Nyarko', 'Appiah',
];

const CARS: Record<ProductId, string[]> = {
  go: ['Toyota Corolla', 'Kia Rio', 'Hyundai Accent', 'Nissan Sunny', 'Toyota Vitz', 'Suzuki Swift'],
  comfort: ['Toyota Camry', 'Honda Accord', 'Hyundai Elantra', 'Kia Optima', 'Toyota Avalon'],
  xl: ['Toyota Sienna', 'Hyundai H1', 'Toyota Highlander', 'Kia Carnival', 'Nissan Quest'],
  share: ['Toyota Corolla', 'Kia Rio', 'Hyundai i10', 'Toyota Yaris'],
  okada: ['Haojue HJ150', 'Royal 150', 'Sanya SY150', 'Apsonic AP150'],
  aboboya: ['Apsonic Tricycle', 'Sanya Aboboyaa', 'Royal Tricycle'],
};

const COLOURS = ['Silver', 'White', 'Black', 'Dark blue', 'Grey', 'Red', 'Champagne'];
const LANGUAGES = ['Twi, English', 'Ga, English', 'Ewe, English', 'Hausa, Twi, English', 'English, Twi'];

function plate(rand: () => number): string {
  const regions = ['GR', 'GT', 'GE', 'GN', 'GW', 'AS'];
  const region = regions[Math.floor(rand() * regions.length)];
  const num = String(Math.floor(rand() * 8999) + 1000);
  const year = String(Math.floor(rand() * 8) + 17);
  return `${region} ${num}-${year}`;
}

export function createFleet(count = 64): Driver[] {
  const rand = mulberry32(20260814);
  const products: ProductId[] = ['go', 'go', 'go', 'okada', 'okada', 'share', 'comfort', 'xl', 'aboboya'];

  return Array.from({ length: count }, (_, i) => {
    const product = products[Math.floor(rand() * products.length)];
    const anchor = NODES[Math.floor(rand() * NODES.length)];
    const cars = CARS[product];
    return {
      id: `drv-${i}`,
      name: `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`,
      rating: Math.round((4.55 + rand() * 0.44) * 100) / 100,
      trips: Math.floor(280 + rand() * 7400),
      vehicle: cars[Math.floor(rand() * cars.length)],
      colour: COLOURS[Math.floor(rand() * COLOURS.length)],
      plate: plate(rand),
      product,
      language: LANGUAGES[Math.floor(rand() * LANGUAGES.length)],
      lat: anchor.lat + (rand() - 0.5) * 0.012,
      lng: anchor.lng + (rand() - 0.5) * 0.012,
      heading: rand() * 360,
      targetIdx: Math.floor(rand() * NODES.length),
    };
  });
}
