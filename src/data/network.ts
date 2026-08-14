/**
 * Greater Accra road network.
 *
 * Nodes are junctions/landmarks at their real WGS84 coordinates; edges are the
 * roads that actually connect them, weighted by a per-road speed profile so the
 * router prefers the motorway over inner-city streets the way a driver would.
 */

export type NodeId = string;

export interface GraphNode {
  id: NodeId;
  name: string;
  lat: number;
  lng: number;
}

/** Road class drives both the drawn map style and the routing cost. */
export type RoadClass = 'motorway' | 'trunk' | 'primary' | 'street';

export interface GraphEdge {
  a: NodeId;
  b: NodeId;
  road: string;
  cls: RoadClass;
}

export const NODES: GraphNode[] = [
  { id: 'airport', name: 'Kotoka International Airport', lat: 5.6052, lng: -0.1668 },
  { id: 'airportcity', name: 'Airport City', lat: 5.6045, lng: -0.178 },
  { id: 'tetteh', name: 'Tetteh Quarshie Interchange', lat: 5.618, lng: -0.1722 },
  { id: 'shiashie', name: 'Shiashie', lat: 5.6222, lng: -0.1794 },
  { id: 'okponglo', name: 'Okponglo', lat: 5.6376, lng: -0.1826 },
  { id: 'legon', name: 'University of Ghana, Legon', lat: 5.6505, lng: -0.1869 },
  { id: 'haatso', name: 'Haatso', lat: 5.6598, lng: -0.2019 },
  { id: 'dome', name: 'Dome', lat: 5.6564, lng: -0.2204 },
  { id: 'madina', name: 'Madina Zongo Junction', lat: 5.6832, lng: -0.1663 },
  { id: 'adenta', name: 'Adenta Barrier', lat: 5.7083, lng: -0.1668 },
  { id: 'eastlegon', name: 'East Legon (A&C Mall)', lat: 5.6383, lng: -0.1553 },
  { id: 'spintex', name: 'Spintex Road', lat: 5.6254, lng: -0.1053 },
  { id: 'sakumono', name: 'Sakumono', lat: 5.6281, lng: -0.0631 },
  { id: 'tema', name: 'Tema Community 1', lat: 5.6698, lng: -0.0176 },
  { id: 'ashaiman', name: 'Ashaiman', lat: 5.6899, lng: -0.0341 },
  { id: 'nungua', name: 'Nungua Barrier', lat: 5.6003, lng: -0.0801 },
  { id: 'teshie', name: 'Teshie', lat: 5.5853, lng: -0.1049 },
  { id: 'labadi', name: 'La (Labadi Beach)', lat: 5.5591, lng: -0.1521 },
  { id: 'tradefair', name: 'Trade Fair, La', lat: 5.5779, lng: -0.1424 },
  { id: 'burma', name: 'Burma Camp', lat: 5.5901, lng: -0.1618 },
  { id: 'cantonments', name: 'Cantonments', lat: 5.5793, lng: -0.1725 },
  { id: 'osu', name: 'Osu, Oxford Street', lat: 5.5573, lng: -0.1822 },
  { id: 'ridge', name: 'Ridge Roundabout', lat: 5.5621, lng: -0.1962 },
  { id: 'thirtyseven', name: '37 Military Hospital', lat: 5.5852, lng: -0.1873 },
  { id: 'circle', name: 'Kwame Nkrumah Circle', lat: 5.5702, lng: -0.2071 },
  { id: 'accracentral', name: 'Accra Central (Makola)', lat: 5.5472, lng: -0.2098 },
  { id: 'jamestown', name: 'Jamestown', lat: 5.5311, lng: -0.2113 },
  { id: 'korlebu', name: 'Korle Bu Teaching Hospital', lat: 5.5371, lng: -0.2261 },
  { id: 'kaneshie', name: 'Kaneshie Market', lat: 5.5622, lng: -0.2362 },
  { id: 'dansoman', name: 'Dansoman', lat: 5.5451, lng: -0.2653 },
  { id: 'mallam', name: 'Mallam Junction', lat: 5.5673, lng: -0.2939 },
  { id: 'weija', name: 'Weija', lat: 5.5583, lng: -0.3301 },
  { id: 'kasoa', name: 'Kasoa Toll Booth', lat: 5.5343, lng: -0.4139 },
  { id: 'awoshie', name: 'Awoshie', lat: 5.5966, lng: -0.2801 },
  { id: 'lapaz', name: 'Lapaz', lat: 5.6074, lng: -0.2443 },
  { id: 'abeka', name: 'Abeka', lat: 5.5998, lng: -0.2504 },
  { id: 'tesano', name: 'Tesano', lat: 5.5941, lng: -0.2338 },
  { id: 'achimota', name: 'Achimota Retail Centre', lat: 5.6152, lng: -0.2281 },
  { id: 'pokuase', name: 'Pokuase Interchange', lat: 5.6803, lng: -0.2654 },
  { id: 'amasaman', name: 'Amasaman', lat: 5.7024, lng: -0.2937 },
];

export const EDGES: GraphEdge[] = [
  // N1 / George Walker Bush Motorway — the western spine
  { a: 'kasoa', b: 'weija', road: 'N1 Winneba Road', cls: 'motorway' },
  { a: 'weija', b: 'mallam', road: 'N1 Winneba Road', cls: 'motorway' },
  { a: 'mallam', b: 'awoshie', road: 'Mallam–Awoshie Road', cls: 'primary' },
  { a: 'mallam', b: 'dansoman', road: 'Dansoman Highway', cls: 'primary' },
  { a: 'mallam', b: 'lapaz', road: 'N1 George Walker Bush Mwy', cls: 'motorway' },
  { a: 'lapaz', b: 'achimota', road: 'N1 George Walker Bush Mwy', cls: 'motorway' },
  { a: 'achimota', b: 'tetteh', road: 'N1 George Walker Bush Mwy', cls: 'motorway' },
  { a: 'awoshie', b: 'abeka', road: 'Awoshie–Abeka Road', cls: 'primary' },
  { a: 'abeka', b: 'lapaz', road: 'Abeka Lapaz Road', cls: 'primary' },
  { a: 'abeka', b: 'tesano', road: 'Nsawam Road', cls: 'primary' },
  { a: 'tesano', b: 'circle', road: 'Nsawam Road', cls: 'trunk' },
  { a: 'tesano', b: 'kaneshie', road: 'Winneba Road', cls: 'primary' },
  { a: 'achimota', b: 'pokuase', road: 'N6 Nsawam Road', cls: 'motorway' },
  { a: 'pokuase', b: 'amasaman', road: 'N6 Nsawam Road', cls: 'motorway' },
  { a: 'pokuase', b: 'dome', road: 'Pokuase–Dome Road', cls: 'primary' },

  // Ring Road & the central core
  { a: 'circle', b: 'ridge', road: 'Ring Road Central', cls: 'trunk' },
  { a: 'ridge', b: 'osu', road: 'Ring Road East', cls: 'trunk' },
  { a: 'ridge', b: 'accracentral', road: 'Kojo Thompson Road', cls: 'primary' },
  { a: 'circle', b: 'kaneshie', road: 'Ring Road West', cls: 'trunk' },
  { a: 'kaneshie', b: 'accracentral', road: 'Winneba Road', cls: 'primary' },
  { a: 'kaneshie', b: 'korlebu', road: 'Graphic Road', cls: 'primary' },
  { a: 'kaneshie', b: 'dansoman', road: 'Dansoman Road', cls: 'primary' },
  { a: 'korlebu', b: 'jamestown', road: 'Korle Bu Road', cls: 'street' },
  { a: 'jamestown', b: 'accracentral', road: 'High Street', cls: 'street' },
  { a: 'accracentral', b: 'osu', road: 'Independence Avenue', cls: 'primary' },
  { a: 'circle', b: 'thirtyseven', road: 'Liberation Road', cls: 'trunk' },
  { a: 'ridge', b: 'thirtyseven', road: 'Independence Avenue', cls: 'trunk' },
  { a: 'thirtyseven', b: 'airportcity', road: 'Liberation Road', cls: 'trunk' },
  { a: 'thirtyseven', b: 'cantonments', road: 'Giffard Road', cls: 'primary' },
  { a: 'osu', b: 'labadi', road: 'Labadi Road', cls: 'primary' },
  { a: 'osu', b: 'cantonments', road: 'Cantonments Road', cls: 'primary' },
  { a: 'cantonments', b: 'burma', road: 'Burma Camp Road', cls: 'primary' },
  { a: 'labadi', b: 'tradefair', road: 'Labadi–La Road', cls: 'primary' },
  { a: 'tradefair', b: 'burma', road: 'La Road', cls: 'street' },
  { a: 'tradefair', b: 'teshie', road: 'Teshie–Nungua Road', cls: 'primary' },
  { a: 'teshie', b: 'nungua', road: 'Teshie–Nungua Road', cls: 'primary' },
  { a: 'nungua', b: 'sakumono', road: 'Beach Road', cls: 'primary' },
  { a: 'nungua', b: 'spintex', road: 'Nungua Barrier Link', cls: 'primary' },

  // Airport / Spintex / Motorway east
  { a: 'airportcity', b: 'airport', road: 'Airport Bypass', cls: 'primary' },
  { a: 'airport', b: 'tetteh', road: 'Liberation Road', cls: 'trunk' },
  { a: 'airport', b: 'burma', road: 'Giffard Road', cls: 'primary' },
  { a: 'tetteh', b: 'shiashie', road: 'Legon Road', cls: 'primary' },
  { a: 'tetteh', b: 'eastlegon', road: 'Lagos Avenue', cls: 'primary' },
  { a: 'tetteh', b: 'spintex', road: 'Accra–Tema Motorway', cls: 'motorway' },
  { a: 'spintex', b: 'sakumono', road: 'Spintex Road', cls: 'primary' },
  { a: 'spintex', b: 'tema', road: 'Accra–Tema Motorway', cls: 'motorway' },
  { a: 'sakumono', b: 'tema', road: 'Beach Road', cls: 'primary' },
  { a: 'tema', b: 'ashaiman', road: 'Ashaiman Link', cls: 'primary' },

  // Northern corridor
  { a: 'shiashie', b: 'okponglo', road: 'Legon Road', cls: 'primary' },
  { a: 'okponglo', b: 'legon', road: 'Legon Road', cls: 'primary' },
  { a: 'okponglo', b: 'madina', road: 'Legon–Madina Road', cls: 'trunk' },
  { a: 'eastlegon', b: 'okponglo', road: 'Boundary Road', cls: 'street' },
  { a: 'madina', b: 'adenta', road: 'Aburi Road', cls: 'trunk' },
  { a: 'madina', b: 'haatso', road: 'Madina–Haatso Road', cls: 'primary' },
  { a: 'legon', b: 'haatso', road: 'Legon–Haatso Road', cls: 'primary' },
  { a: 'haatso', b: 'dome', road: 'Haatso–Dome Road', cls: 'primary' },
  { a: 'dome', b: 'achimota', road: 'Ofankor Road', cls: 'primary' },
];

/** Free-flow speed by road class, km/h. Used as the routing cost basis. */
export const ROAD_SPEED: Record<RoadClass, number> = {
  motorway: 78,
  trunk: 46,
  primary: 34,
  street: 22,
};

export const NODE_BY_ID: Record<NodeId, GraphNode> = Object.fromEntries(
  NODES.map((n) => [n.id, n]),
);

export interface AdjacentEdge {
  to: NodeId;
  road: string;
  cls: RoadClass;
  km: number;
}

/** Great-circle distance in km. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const ADJACENCY: Record<NodeId, AdjacentEdge[]> = (() => {
  const adj: Record<NodeId, AdjacentEdge[]> = Object.fromEntries(
    NODES.map((n) => [n.id, [] as AdjacentEdge[]]),
  );
  for (const e of EDGES) {
    const km = haversineKm(NODE_BY_ID[e.a], NODE_BY_ID[e.b]);
    adj[e.a].push({ to: e.b, road: e.road, cls: e.cls, km });
    adj[e.b].push({ to: e.a, road: e.road, cls: e.cls, km });
  }
  return adj;
})();
