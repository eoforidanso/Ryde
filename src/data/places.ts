import type { NodeId } from './network';

export type PlaceKind = 'airport' | 'mall' | 'hospital' | 'school' | 'market' | 'beach' | 'home' | 'work' | 'landmark';

export interface Place {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  node: NodeId;
  kind: PlaceKind;
}

/** Searchable pickup/dropoff points, each snapped to its nearest graph junction. */
export const PLACES: Place[] = [
  { id: 'kia', name: 'Kotoka International Airport (T3)', area: 'Airport', lat: 5.6055, lng: -0.1672, node: 'airport', kind: 'airport' },
  { id: 'accramall', name: 'Accra Mall', area: 'Tetteh Quarshie', lat: 5.6215, lng: -0.1723, node: 'tetteh', kind: 'mall' },
  { id: 'westhills', name: 'West Hills Mall', area: 'Weija', lat: 5.5566, lng: -0.3288, node: 'weija', kind: 'mall' },
  { id: 'acmall', name: 'A&C Square', area: 'East Legon', lat: 5.6382, lng: -0.1556, node: 'eastlegon', kind: 'mall' },
  { id: 'junction', name: 'Junction Mall', area: 'Nungua', lat: 5.6009, lng: -0.0812, node: 'nungua', kind: 'mall' },
  { id: 'marina', name: 'Marina Mall', area: 'Airport City', lat: 5.605, lng: -0.1778, node: 'airportcity', kind: 'mall' },
  { id: 'oxford', name: 'Oxford Street', area: 'Osu', lat: 5.5574, lng: -0.1824, node: 'osu', kind: 'landmark' },
  { id: 'labadibeach', name: 'Labadi Pleasure Beach', area: 'La', lat: 5.5583, lng: -0.1508, node: 'labadi', kind: 'beach' },
  { id: 'korlebu', name: 'Korle Bu Teaching Hospital', area: 'Korle Bu', lat: 5.5372, lng: -0.226, node: 'korlebu', kind: 'hospital' },
  { id: 'ridgehosp', name: 'Greater Accra Regional Hospital', area: 'Ridge', lat: 5.5636, lng: -0.1975, node: 'ridge', kind: 'hospital' },
  { id: '37hosp', name: '37 Military Hospital', area: 'Cantonments', lat: 5.5854, lng: -0.1875, node: 'thirtyseven', kind: 'hospital' },
  { id: 'ug', name: 'University of Ghana, Legon', area: 'Legon', lat: 5.6508, lng: -0.1871, node: 'legon', kind: 'school' },
  { id: 'ashesi', name: 'Ashesi University Shuttle Stop', area: 'Madina', lat: 5.6836, lng: -0.1659, node: 'madina', kind: 'school' },
  { id: 'upsa', name: 'UPSA Campus', area: 'Madina', lat: 5.6683, lng: -0.1721, node: 'madina', kind: 'school' },
  { id: 'makola', name: 'Makola Market', area: 'Accra Central', lat: 5.5473, lng: -0.2094, node: 'accracentral', kind: 'market' },
  { id: 'kaneshiemkt', name: 'Kaneshie Market', area: 'Kaneshie', lat: 5.5624, lng: -0.2364, node: 'kaneshie', kind: 'market' },
  { id: 'madinamkt', name: 'Madina Market', area: 'Madina', lat: 5.6841, lng: -0.1667, node: 'madina', kind: 'market' },
  { id: 'circlestation', name: 'Kwame Nkrumah Circle', area: 'Circle', lat: 5.5704, lng: -0.2073, node: 'circle', kind: 'landmark' },
  { id: 'blackstar', name: 'Black Star Square', area: 'Osu Klottey', lat: 5.5476, lng: -0.1919, node: 'osu', kind: 'landmark' },
  { id: 'jamestownlh', name: 'Jamestown Lighthouse', area: 'Jamestown', lat: 5.5313, lng: -0.2115, node: 'jamestown', kind: 'landmark' },
  { id: 'temaharbour', name: 'Tema Harbour', area: 'Tema', lat: 5.6262, lng: -0.0086, node: 'tema', kind: 'landmark' },
  { id: 'temac1', name: 'Tema Community 1', area: 'Tema', lat: 5.6699, lng: -0.0178, node: 'tema', kind: 'landmark' },
  { id: 'ashaimanmkt', name: 'Ashaiman Market', area: 'Ashaiman', lat: 5.6902, lng: -0.0344, node: 'ashaiman', kind: 'market' },
  { id: 'spintexpalace', name: 'Palace Mall, Spintex', area: 'Spintex', lat: 5.6257, lng: -0.1051, node: 'spintex', kind: 'mall' },
  { id: 'sakumonobeach', name: 'Sakumono Beach', area: 'Sakumono', lat: 5.6255, lng: -0.0629, node: 'sakumono', kind: 'beach' },
  { id: 'achimotamall', name: 'Achimota Retail Centre', area: 'Achimota', lat: 5.6155, lng: -0.2284, node: 'achimota', kind: 'mall' },
  { id: 'lapazstation', name: 'Lapaz Station', area: 'Lapaz', lat: 5.6076, lng: -0.2445, node: 'lapaz', kind: 'landmark' },
  { id: 'domemkt', name: 'Dome Market', area: 'Dome', lat: 5.6566, lng: -0.2207, node: 'dome', kind: 'market' },
  { id: 'adentabarrier', name: 'Adenta Barrier', area: 'Adenta', lat: 5.7085, lng: -0.167, node: 'adenta', kind: 'landmark' },
  { id: 'dansomanest', name: 'Dansoman Estates', area: 'Dansoman', lat: 5.5453, lng: -0.2655, node: 'dansoman', kind: 'landmark' },
  { id: 'kasoatoll', name: 'Kasoa Toll Booth', area: 'Kasoa', lat: 5.5345, lng: -0.4141, node: 'kasoa', kind: 'landmark' },
  { id: 'mallamjn', name: 'Mallam Junction', area: 'Mallam', lat: 5.5675, lng: -0.2941, node: 'mallam', kind: 'landmark' },
  { id: 'pokuaseint', name: 'Pokuase Interchange', area: 'Pokuase', lat: 5.6805, lng: -0.2656, node: 'pokuase', kind: 'landmark' },
  { id: 'amasamanjn', name: 'Amasaman Township', area: 'Amasaman', lat: 5.7026, lng: -0.2939, node: 'amasaman', kind: 'landmark' },
  { id: 'cantonmentscity', name: 'Cantonments City', area: 'Cantonments', lat: 5.5795, lng: -0.1727, node: 'cantonments', kind: 'landmark' },
  { id: 'burmacamp', name: 'Burma Camp', area: 'Burma Camp', lat: 5.5903, lng: -0.162, node: 'burma', kind: 'landmark' },
  { id: 'tradefairla', name: 'Ghana Trade Fair Centre', area: 'La', lat: 5.5781, lng: -0.1426, node: 'tradefair', kind: 'landmark' },
  { id: 'teshiedodowa', name: 'Teshie Nungua Estates', area: 'Teshie', lat: 5.5855, lng: -0.1051, node: 'teshie', kind: 'landmark' },
  { id: 'awoshiejn', name: 'Awoshie Junction', area: 'Awoshie', lat: 5.5968, lng: -0.2803, node: 'awoshie', kind: 'landmark' },
  { id: 'tesanopolice', name: 'Tesano Police Station', area: 'Tesano', lat: 5.5943, lng: -0.234, node: 'tesano', kind: 'landmark' },
  { id: 'abekamkt', name: 'Abeka Market', area: 'Abeka', lat: 5.6, lng: -0.2506, node: 'abeka', kind: 'market' },
  { id: 'haatsojn', name: 'Haatso Junction', area: 'Haatso', lat: 5.66, lng: -0.2021, node: 'haatso', kind: 'landmark' },
  { id: 'okponglojn', name: 'Okponglo Junction', area: 'Okponglo', lat: 5.6378, lng: -0.1828, node: 'okponglo', kind: 'landmark' },
  { id: 'shiashiejn', name: 'Shiashie', area: 'Shiashie', lat: 5.6224, lng: -0.1796, node: 'shiashie', kind: 'landmark' },
];

export const PLACE_BY_ID: Record<string, Place> = Object.fromEntries(
  PLACES.map((p) => [p.id, p]),
);

/** Saved shortcuts on the rider's profile. */
export const SAVED = {
  home: { ...PLACE_BY_ID['acmall'], id: 'saved-home', name: 'Home', area: 'East Legon Hills', kind: 'home' as PlaceKind },
  work: { ...PLACE_BY_ID['marina'], id: 'saved-work', name: 'Work', area: 'Airport City', kind: 'work' as PlaceKind },
};

export function searchPlaces(query: string, limit = 8): Place[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = PLACES.map((p) => {
    const name = p.name.toLowerCase();
    const area = p.area.toLowerCase();
    let score = 0;
    if (name.startsWith(q)) score = 100;
    else if (area.startsWith(q)) score = 90;
    else if (name.includes(q)) score = 60;
    else if (area.includes(q)) score = 50;
    return { p, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.length - b.p.name.length);
  return scored.slice(0, limit).map((s) => s.p);
}
