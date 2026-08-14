import type { LatLng } from './router';

/** Map extent covering Greater Accra from Kasoa in the west to Tema in the east. */
export const BOUNDS = {
  minLng: -0.445,
  maxLng: 0.015,
  minLat: 5.508,
  maxLat: 5.735,
};

const LNG_SPAN = BOUNDS.maxLng - BOUNDS.minLng;
const LAT_SPAN = BOUNDS.maxLat - BOUNDS.minLat;

export const VIEW_W = 1000;
/** Latitude and longitude degrees are near-equal in length this close to the
 *  equator, so a plain equirectangular fit keeps the city undistorted. */
export const VIEW_H = Math.round((LAT_SPAN / LNG_SPAN) * VIEW_W);

export function project(p: LatLng): { x: number; y: number } {
  return {
    x: ((p.lng - BOUNDS.minLng) / LNG_SPAN) * VIEW_W,
    y: ((BOUNDS.maxLat - p.lat) / LAT_SPAN) * VIEW_H,
  };
}

export function toPath(points: LatLng[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => {
      const { x, y } = project(p);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

/** Rounded-corner polyline — real roads don't turn at hard right angles. */
export function toSmoothPath(points: LatLng[], radius = 7): string {
  const pts = points.map(project);
  if (pts.length < 3) return toPath(points);

  let d = `M${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];

    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
    const r = Math.min(radius, inLen / 2, outLen / 2);

    const p1 = { x: cur.x - ((cur.x - prev.x) / inLen) * r, y: cur.y - ((cur.y - prev.y) / inLen) * r };
    const p2 = { x: cur.x + ((next.x - cur.x) / outLen) * r, y: cur.y + ((next.y - cur.y) / outLen) * r };

    d += ` L${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Q${cur.x.toFixed(2)} ${cur.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return d;
}

export interface Camera {
  scale: number;
  x: number;
  y: number;
}

export interface FitOptions {
  /** Visible viewport in world units — matches the SVG viewBox. */
  vw: number;
  vh: number;
  /** Padding around the fitted content, in world units. */
  padding?: number;
  maxScale?: number;
  /** Where the content settles vertically, as a fraction of the viewport. */
  focusY?: number;
  /** Fraction of viewport height not covered by the bottom sheet. */
  usableH?: number;
}

/**
 * Fit coordinates into the visible window. The bottom sheet covers roughly half
 * the screen, so content is fitted into — and centred on — the clear upper band.
 */
export function fitCamera(points: LatLng[], opts: FitOptions): Camera {
  const { vw, vh, padding = 40, maxScale = 3.4, focusY = 0.34, usableH = 0.56 } = opts;
  if (points.length === 0) return { scale: 1, x: 0, y: 0 };

  const projected = points.map(project);
  const minX = Math.min(...projected.map((p) => p.x));
  const maxX = Math.max(...projected.map((p) => p.x));
  const minY = Math.min(...projected.map((p) => p.y));
  const maxY = Math.max(...projected.map((p) => p.y));

  const w = Math.max(maxX - minX, 1) + padding * 2;
  const h = Math.max(maxY - minY, 1) + padding * 2;
  const scale = Math.max(0.4, Math.min(vw / w, (vh * usableH) / h, maxScale));

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return {
    scale,
    x: vw / 2 - cx * scale,
    y: vh * focusY - cy * scale,
  };
}
