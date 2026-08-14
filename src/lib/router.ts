import {
  ADJACENCY,
  NODES,
  NODE_BY_ID,
  ROAD_SPEED,
  haversineKm,
  type NodeId,
  type RoadClass,
} from '../data/network';
import type { Place } from '../data/places';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteLeg {
  road: string;
  cls: RoadClass;
  km: number;
}

export interface Route {
  /** Ordered coordinates from pickup to dropoff, including the off-graph tails. */
  points: LatLng[];
  legs: RouteLeg[];
  distanceKm: number;
  /** Free-flow duration in minutes, before traffic is applied. */
  baseMinutes: number;
  /** Human-readable turn list, de-duplicated by road name. */
  directions: { road: string; km: number }[];
}

const FASTEST_SPEED = Math.max(...Object.values(ROAD_SPEED));

/** Nearest graph junction to an arbitrary coordinate. */
export function nearestNode(p: LatLng): NodeId {
  let best = NODES[0].id;
  let bestKm = Infinity;
  for (const n of NODES) {
    const km = haversineKm(p, n);
    if (km < bestKm) {
      bestKm = km;
      best = n.id;
    }
  }
  return best;
}

/**
 * A* over the road graph, minimising travel time rather than raw distance so
 * the motorway wins over a shorter crawl through Circle.
 */
export function findPath(from: NodeId, to: NodeId): NodeId[] {
  if (from === to) return [from];

  const heuristic = (id: NodeId) => (haversineKm(NODE_BY_ID[id], NODE_BY_ID[to]) / FASTEST_SPEED) * 60;

  const gScore = new Map<NodeId, number>([[from, 0]]);
  const cameFrom = new Map<NodeId, NodeId>();
  const open = new Set<NodeId>([from]);

  while (open.size > 0) {
    let current: NodeId | null = null;
    let bestF = Infinity;
    for (const id of open) {
      const f = (gScore.get(id) ?? Infinity) + heuristic(id);
      if (f < bestF) {
        bestF = f;
        current = id;
      }
    }
    if (current === null) break;
    if (current === to) {
      const path: NodeId[] = [current];
      let cur = current;
      while (cameFrom.has(cur)) {
        cur = cameFrom.get(cur)!;
        path.unshift(cur);
      }
      return path;
    }

    open.delete(current);
    for (const edge of ADJACENCY[current] ?? []) {
      const minutes = (edge.km / ROAD_SPEED[edge.cls]) * 60;
      const tentative = (gScore.get(current) ?? Infinity) + minutes;
      if (tentative < (gScore.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, current);
        gScore.set(edge.to, tentative);
        open.add(edge.to);
      }
    }
  }
  return [from, to];
}

function edgeBetween(a: NodeId, b: NodeId) {
  return (ADJACENCY[a] ?? []).find((e) => e.to === b);
}

/** Build the full route between two places, tails included. */
export function buildRoute(from: Place, to: Place): Route {
  const path = findPath(from.node, to.node);
  const legs: RouteLeg[] = [];
  const points: LatLng[] = [{ lat: from.lat, lng: from.lng }];

  for (let i = 0; i < path.length; i += 1) {
    const node = NODE_BY_ID[path[i]];
    points.push({ lat: node.lat, lng: node.lng });
    if (i > 0) {
      const edge = edgeBetween(path[i - 1], path[i]);
      if (edge) {
        legs.push({ road: edge.road, cls: edge.cls, km: edge.km });
      } else {
        const km = haversineKm(NODE_BY_ID[path[i - 1]], node);
        legs.push({ road: 'Local road', cls: 'street', km });
      }
    }
  }
  points.push({ lat: to.lat, lng: to.lng });

  // Off-graph tails: the walk-in from the pin to the first junction.
  const headKm = haversineKm(from, NODE_BY_ID[path[0]]);
  const tailKm = haversineKm(NODE_BY_ID[path[path.length - 1]], to);
  if (headKm > 0.05) legs.unshift({ road: `${from.area} local streets`, cls: 'street', km: headKm });
  if (tailKm > 0.05) legs.push({ road: `${to.area} local streets`, cls: 'street', km: tailKm });

  const distanceKm = legs.reduce((sum, l) => sum + l.km, 0);
  const baseMinutes = legs.reduce((sum, l) => sum + (l.km / ROAD_SPEED[l.cls]) * 60, 0);

  const directions: { road: string; km: number }[] = [];
  for (const leg of legs) {
    const last = directions[directions.length - 1];
    if (last && last.road === leg.road) last.km += leg.km;
    else directions.push({ road: leg.road, km: leg.km });
  }

  return { points, legs, distanceKm, baseMinutes, directions };
}

/** Cumulative length of a polyline, in km, per vertex. */
export function cumulative(points: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i += 1) {
    out.push(out[i - 1] + haversineKm(points[i - 1], points[i]));
  }
  return out;
}

/** Interpolate a position along a polyline at progress `t` in [0,1]. */
export function pointAt(points: LatLng[], t: number): { pos: LatLng; bearing: number } {
  if (points.length === 0) return { pos: { lat: 0, lng: 0 }, bearing: 0 };
  if (points.length === 1) return { pos: points[0], bearing: 0 };

  const cum = cumulative(points);
  const total = cum[cum.length - 1];
  const target = Math.max(0, Math.min(1, t)) * total;

  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i += 1;

  const segStart = points[i - 1];
  const segEnd = points[i];
  const segLen = cum[i] - cum[i - 1] || 1e-9;
  const f = Math.max(0, Math.min(1, (target - cum[i - 1]) / segLen));

  return {
    pos: {
      lat: segStart.lat + (segEnd.lat - segStart.lat) * f,
      lng: segStart.lng + (segEnd.lng - segStart.lng) * f,
    },
    bearing: bearingBetween(segStart, segEnd),
  };
}

export function bearingBetween(a: LatLng, b: LatLng): number {
  const y = b.lng - a.lng;
  const x = b.lat - a.lat;
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Slice a polyline from progress t to the end — used to draw remaining path. */
export function sliceFrom(points: LatLng[], t: number): LatLng[] {
  const cum = cumulative(points);
  const total = cum[cum.length - 1];
  const target = Math.max(0, Math.min(1, t)) * total;
  const { pos } = pointAt(points, t);
  const rest = points.filter((_, i) => cum[i] > target);
  return [pos, ...rest];
}
