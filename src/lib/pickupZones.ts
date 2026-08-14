/**
 * Predictive pickup zones.
 *
 * A pickup point is not just a dot on a map — some are genuinely faster to be
 * collected from. A spot on the far side of a dual carriageway costs the driver
 * a U-turn; a junction where four cars are already waiting costs them nothing.
 *
 * For each candidate point nearby we predict when the rider would actually get
 * moving: the driver has to arrive *and* the rider has to walk there, so the
 * wait is the later of the two, not the sum and not the driver's ETA alone.
 * A suggestion is only made when that beats standing still by a real margin.
 */

import {
  ADJACENCY, EDGES, NODES, NODE_BY_ID, haversineKm, type NodeId, type RoadClass,
} from '../data/network';
import { PLACES, type Place } from '../data/places';
import { nearestNode } from './router';

import type { Driver } from '../data/fleet';
import type { ProductId } from '../data/products';
import type { TrafficState } from './pricing';
import type { LatLng } from './router';

export interface PickupZone {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  /** Minutes to walk here from where the rider is standing now. */
  walkMinutes: number;
  /** Minutes for the nearest matching driver to reach this point. */
  driverMinutes: number;
  /** When the rider is actually moving: both things have to have happened. */
  waitMinutes: number;
  driversNearby: number;
  reason: string;
  /** True for the rider's current pickup point. */
  current: boolean;
  /** Ready to hand straight back to `setPlace` when the rider accepts. */
  place: Place;
}

export interface PickupAdvice {
  current: PickupZone;
  /** Ranked alternatives, best first. Never includes the current point. */
  zones: PickupZone[];
  /** The one worth interrupting the rider about, if any. */
  best: PickupZone | null;
  savingMinutes: number;
}

/** Comfortable walking pace on Accra pavements, allowing for crossings. */
const WALK_KMH = 4.2;
/** Beyond this, a suggestion stops being a shortcut and becomes a hike. */
const MAX_WALK_KM = 0.85;
/** A suggestion has to be worth the walk. */
const MIN_SAVING_MIN = 2;

const ROAD_RANK: Record<RoadClass, number> = { motorway: 3, trunk: 2, primary: 1, street: 0 };

function walkMinutes(from: LatLng, to: LatLng): number {
  return (haversineKm(from, to) / WALK_KMH) * 60;
}

/** Best road a junction sits on, which is what makes it easy to pull into. */
function bestRoadAt(node: NodeId): { road: string; cls: RoadClass } | null {
  const edges = ADJACENCY[node] ?? [];
  let best: { road: string; cls: RoadClass } | null = null;
  for (const e of edges) {
    if (!best || ROAD_RANK[e.cls] > ROAD_RANK[best.cls]) best = { road: e.road, cls: e.cls };
  }
  return best;
}

/**
 * Driver ETA to a point, in minutes.
 *
 * Only drivers on the requested product count — a rider waiting for an XL is
 * not helped by six okadas idling at the junction.
 */
function driverEta(
  point: LatLng,
  fleet: Driver[],
  productId: ProductId,
  traffic: TrafficState,
): { minutes: number; nearbyCount: number } {
  const speed = productId === 'okada' ? 26 : 20;
  let nearestKm = Infinity;
  let nearbyCount = 0;

  for (const d of fleet) {
    if (d.product !== productId) continue;
    const km = haversineKm(d, point);
    if (km < nearestKm) nearestKm = km;
    if (km < 0.7) nearbyCount += 1;
  }

  if (nearestKm === Infinity) return { minutes: 99, nearbyCount: 0 };

  // Okadas filter through standing traffic, so congestion costs them less.
  const drag = 1 + (traffic.factor - 1) * (productId === 'okada' ? 0.4 : 0.85);
  const approach = (nearestKm / speed) * 60 * drag;

  /*
   * The last stretch off the main network is what separates two points a
   * street apart: a car crawls the final few hundred metres through an estate
   * at walking pace, turns around, and crawls back out. A point sitting on the
   * road itself skips all of that, which is exactly why standing on the main
   * road gets you collected sooner.
   */
  const node = NODE_BY_ID[nearestNode(point)];
  const tailKm = haversineKm(point, node);
  const tail = (tailKm / (productId === 'okada' ? 16 : 11)) * 60 * (tailKm > 0.05 ? 2 : 0);

  return { minutes: approach + tail, nearbyCount };
}

/**
 * Closest point on a road segment to the rider, in lat/lng.
 *
 * Longitude is scaled by cos(lat) so the projection is locally square — over
 * a segment a few kilometres long that is well inside the error of the rest of
 * this model, and it avoids dragging in a full geodesic library.
 */
function closestPointOnEdge(from: LatLng, a: LatLng, b: LatLng): LatLng {
  const kx = Math.cos((from.lat * Math.PI) / 180);
  const ax = (a.lng - from.lng) * kx;
  const ay = a.lat - from.lat;
  const bx = (b.lng - from.lng) * kx;
  const by = b.lat - from.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;

  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

function reasonFor(zone: {
  driversNearby: number;
  walkMinutes: number;
  road: { road: string; cls: RoadClass } | null;
}): string {
  if (zone.driversNearby >= 3) {
    return `${zone.driversNearby} drivers waiting here right now`;
  }
  if (zone.road && ROAD_RANK[zone.road.cls] >= 2) {
    return `On ${zone.road.road} — drivers reach you without turning off`;
  }
  if (zone.walkMinutes <= 2) {
    return 'Just around the corner';
  }
  return 'Easier for a driver to stop';
}

/**
 * Rank the pickup points around a rider.
 *
 * Candidates come from two places: named landmarks riders would recognise, and
 * the road junctions themselves, which is where drivers naturally wait.
 */
export function pickupAdvice(
  origin: Place,
  fleet: Driver[],
  productId: ProductId,
  traffic: TrafficState,
): PickupAdvice {
  const build = (
    id: string,
    name: string,
    area: string,
    point: Place,
    road: { road: string; cls: RoadClass } | null,
    isCurrent: boolean,
  ): PickupZone => {
    const walk = isCurrent ? 0 : walkMinutes(origin, point);
    const { minutes: drive, nearbyCount } = driverEta(point, fleet, productId, traffic);
    return {
      id,
      name,
      area,
      lat: point.lat,
      lng: point.lng,
      place: point,
      walkMinutes: Math.round(walk),
      driverMinutes: Math.max(1, Math.round(drive)),
      waitMinutes: Math.max(1, Math.round(Math.max(walk, drive))),
      driversNearby: nearbyCount,
      reason: reasonFor({ driversNearby: nearbyCount, walkMinutes: walk, road }),
      current: isCurrent,
    };
  };

  const current = build(origin.id, origin.name, origin.area, origin, bestRoadAt(origin.node), true);

  const candidates: PickupZone[] = [];
  const seen = new Set<string>([origin.id]);

  for (const place of PLACES) {
    if (seen.has(place.id)) continue;
    const km = haversineKm(origin, place);
    // A saved place is often a renamed landmark — same kerb, different id.
    if (km > MAX_WALK_KM || km < 0.12) continue;
    seen.add(place.id);
    candidates.push(build(place.id, place.name, place.area, place, bestRoadAt(place.node), false));
  }

  for (const node of NODES) {
    const km = haversineKm(origin, node);
    if (km > MAX_WALK_KM || km < 0.12) continue;
    // A junction sitting on top of a landmark we already offer is the same spot.
    if (candidates.some((c) => haversineKm(c, node) < 0.15)) continue;
    const asPlace: Place = {
      id: `zone-${node.id}`,
      name: node.name,
      area: 'Junction',
      lat: node.lat,
      lng: node.lng,
      node: node.id,
      kind: 'landmark',
    };
    candidates.push(build(asPlace.id, node.name, 'Junction', asPlace, bestRoadAt(node.id), false));
  }

  /**
   * Roadside points.
   *
   * Landmarks alone are far too sparse to answer "where should I stand" — the
   * honest answer is usually a stretch of the main road rather than a named
   * place, so the nearest point on each nearby road is a candidate too.
   */
  for (const edge of EDGES) {
    const a = NODE_BY_ID[edge.a];
    const b = NODE_BY_ID[edge.b];
    // Skip roads that pass nowhere near, before sampling along them.
    if (haversineKm(origin, closestPointOnEdge(origin, a, b)) > MAX_WALK_KM) continue;

    // Walk the road in ~200 m steps: "go up the road a bit" is a real answer,
    // and only sampling the single closest point misses it entirely.
    const lengthKm = haversineKm(a, b);
    const steps = Math.max(1, Math.round(lengthKm / 0.2));

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
      const km = haversineKm(origin, point);
      if (km > MAX_WALK_KM || km < 0.15) continue;
      // Within 250 m of something already offered, this is the same kerb.
      if (candidates.some((c) => haversineKm(c, point) < 0.25)) continue;

      const asPlace: Place = {
        id: `road-${edge.a}-${edge.b}-${i}`,
        name: edge.road,
        area: 'Roadside pickup',
        lat: point.lat,
        lng: point.lng,
        node: nearestNode(point),
        kind: 'landmark',
      };
      candidates.push(
        build(asPlace.id, edge.road, 'Roadside pickup', asPlace, { road: edge.road, cls: edge.cls }, false),
      );
    }
  }

  // The list is always offered, even when standing still already wins — a
  // rider who opens it deserves to see the options and why they lose.
  const ranked = candidates.sort(
    (a, b) => a.waitMinutes - b.waitMinutes || a.walkMinutes - b.walkMinutes,
  );

  // One entry per road: three rows reading "Boundary Road" is a list of the
  // same answer, and the rider only needs the best point on each.
  const byName = new Set<string>();
  const zones: PickupZone[] = [];
  for (const z of ranked) {
    if (byName.has(z.name)) continue;
    byName.add(z.name);
    zones.push(z);
    if (zones.length === 3) break;
  }

  const top = zones[0] ?? null;
  const saving = top ? current.waitMinutes - top.waitMinutes : 0;

  return {
    current,
    zones,
    best: top && saving >= MIN_SAVING_MIN ? top : null,
    savingMinutes: saving,
  };
}
