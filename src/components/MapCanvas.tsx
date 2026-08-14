import { memo, useMemo, type CSSProperties } from 'react';
import { EDGES, NODE_BY_ID, NODES } from '../data/network';
import type { Driver } from '../data/fleet';
import { MINOR_STREETS } from '../data/minorStreets';
import { pointAt, sliceFrom, type LatLng } from '../lib/router';
import { VIEW_H, VIEW_W, fitCamera, project, toSmoothPath } from '../lib/projection';
import { useElementSize } from '../lib/useElementSize';
import { useRyde } from '../store/RydeStore';

/** Approximate Gulf of Guinea shoreline through the Accra–Tema coast. */
const COAST: LatLng[] = [
  { lat: 5.508, lng: -0.445 },
  { lat: 5.5135, lng: -0.39 },
  { lat: 5.519, lng: -0.335 },
  { lat: 5.5245, lng: -0.278 },
  { lat: 5.5285, lng: -0.234 },
  { lat: 5.5305, lng: -0.212 },
  { lat: 5.5355, lng: -0.1855 },
  { lat: 5.5455, lng: -0.1655 },
  { lat: 5.5525, lng: -0.148 },
  { lat: 5.5665, lng: -0.126 },
  { lat: 5.5785, lng: -0.1045 },
  { lat: 5.5935, lng: -0.0775 },
  { lat: 5.6115, lng: -0.0625 },
  { lat: 5.6195, lng: -0.0405 },
  { lat: 5.6205, lng: -0.0175 },
  { lat: 5.6255, lng: 0.015 },
];

const COAST_LINE = COAST.map(project)
  .map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
  .join(' L');
const SEA_PATH = `M${COAST_LINE} L${VIEW_W} ${VIEW_H} L0 ${VIEW_H} Z`;

interface Blob {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
}

function blob(lat: number, lng: number, rxKm: number, ryKm: number, rot = 0): Blob {
  const p = project({ lat, lng });
  const kmToUnitsX = VIEW_W / (0.46 * 111.32 * Math.cos((5.6 * Math.PI) / 180));
  const kmToUnitsY = VIEW_H / (0.227 * 110.57);
  return { cx: p.x, cy: p.y, rx: rxKm * kmToUnitsX, ry: ryKm * kmToUnitsY, rot };
}

const WATER_BODIES: Blob[] = [
  blob(5.5735, -0.3565, 2.9, 1.5, -18), // Weija Lake
  blob(5.5395, -0.2215, 0.95, 0.5, 22), // Korle Lagoon
  blob(5.6105, -0.0655, 1.5, 0.9, -8), // Sakumo Lagoon
  blob(5.5535, -0.1465, 0.55, 0.32, 12), // Kpeshie Lagoon
];

const GREEN_AREAS: Blob[] = [
  blob(5.6155, -0.2215, 2.1, 1.35, 14), // Achimota Forest
  blob(5.6535, -0.1885, 1.35, 1.0, -6), // Legon campus grounds
  blob(5.7005, -0.2035, 2.4, 1.5, 8), // Northern scrub
  blob(5.6455, -0.0955, 1.5, 1.0, -14), // Ramsar wetland
];

const BUILT_UP: Blob[] = [
  blob(5.5605, -0.2055, 4.6, 2.6, 6),
  blob(5.6155, -0.1755, 4.0, 2.6, -4),
  blob(5.5955, -0.2555, 3.6, 2.2, 10),
  blob(5.6655, -0.1855, 3.4, 2.2, 0),
  blob(5.6455, -0.0455, 3.4, 2.4, -6),
  blob(5.5455, -0.3055, 2.6, 1.6, 4),
];

/** Areas riders actually name when they give directions. */
const LABELS: { id: string; size: number }[] = [
  { id: 'accracentral', size: 12 },
  { id: 'osu', size: 11 },
  { id: 'circle', size: 11 },
  { id: 'airport', size: 11 },
  { id: 'eastlegon', size: 11 },
  { id: 'madina', size: 11 },
  { id: 'tema', size: 12 },
  { id: 'kasoa', size: 11 },
  { id: 'achimota', size: 10 },
  { id: 'spintex', size: 10 },
  { id: 'legon', size: 10 },
  { id: 'kaneshie', size: 10 },
  { id: 'teshie', size: 10 },
  { id: 'adenta', size: 10 },
  { id: 'dansoman', size: 10 },
  { id: 'lapaz', size: 10 },
  { id: 'tetteh', size: 10 },
  { id: 'nungua', size: 10 },
];

const ROAD_ORDER = ['street', 'primary', 'trunk', 'motorway'] as const;

const ROAD_STYLE = {
  motorway: { w: 6.5, casing: 9.5, colour: 'var(--road-motorway)' },
  trunk: { w: 4.6, casing: 7, colour: 'var(--road-trunk)' },
  primary: { w: 3.2, casing: 5, colour: 'var(--road-primary)' },
  street: { w: 2, casing: 3.4, colour: 'var(--road-street)' },
} as const;

/** Edge endpoints, projected once at module load. */
const EDGE_GEOM = EDGES.map((e) => {
  const a = project(NODE_BY_ID[e.a]);
  const b = project(NODE_BY_ID[e.b]);
  return { cls: e.cls, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
});

/**
 * Basemap redraws only when the zoom step changes. `k` converts a screen pixel
 * into world units, so road weights stay readable at every zoom level.
 */
const Basemap = memo(({ k }: { k: number }) => {
  return (
    <g>
      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="var(--land)" />

      {/* Land use is impressionistic — gradient fills fade it into the ground
          without the repaint cost of a full-map blur filter. */}
      {BUILT_UP.map((b, i) => (
        <ellipse
          key={`b${i}`} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry}
          transform={`rotate(${b.rot} ${b.cx} ${b.cy})`} fill="url(#blobBuilt)"
        />
      ))}
      {GREEN_AREAS.map((b, i) => (
        <ellipse
          key={`g${i}`} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry}
          transform={`rotate(${b.rot} ${b.cx} ${b.cy})`} fill="url(#blobGreen)"
        />
      ))}

      <path d={SEA_PATH} fill="var(--water)" />
      <path d={`M${COAST_LINE}`} fill="none" stroke="var(--water-edge)" strokeWidth={1.6 * k} />

      {WATER_BODIES.map((b, i) => (
        <ellipse
          key={`w${i}`} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry}
          transform={`rotate(${b.rot} ${b.cx} ${b.cy})`}
          fill="var(--water)" stroke="var(--water-edge)" strokeWidth={k}
        />
      ))}

      <g
        fill="none" stroke="var(--road-street)" strokeWidth={1.5 * k}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.85}
      >
        {MINOR_STREETS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      {/* Casings for every class first, then fills, so junctions knit together. */}
      {ROAD_ORDER.map((cls) => (
        <g key={`casing-${cls}`} strokeLinecap="round" stroke="var(--road-casing)" strokeWidth={ROAD_STYLE[cls].casing * k}>
          {EDGE_GEOM.filter((e) => e.cls === cls).map((e, i) => (
            <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
          ))}
        </g>
      ))}
      {ROAD_ORDER.map((cls) => (
        <g key={`fill-${cls}`} strokeLinecap="round" stroke={ROAD_STYLE[cls].colour} strokeWidth={ROAD_STYLE[cls].w * k}>
          {EDGE_GEOM.filter((e) => e.cls === cls).map((e, i) => (
            <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
          ))}
        </g>
      ))}
    </g>
  );
});
Basemap.displayName = 'Basemap';

/** Place names keep a constant on-screen size regardless of zoom. */
const MapLabels = memo(({ k }: { k: number }) => (
  <g>
    {LABELS.map(({ id, size }) => {
      const node = NODE_BY_ID[id];
      const p = project(node);
      const short = node.name.split(/[,(]/)[0].trim();
      return (
        <text
          key={id} x={p.x} y={p.y - 8 * k}
          fontSize={size * k} textAnchor="middle" className="map-label"
          style={{ strokeWidth: 3 * k }}
        >
          {short}
        </text>
      );
    })}
    {NODES.filter((n) => !LABELS.some((l) => l.id === n.id)).map((n) => {
      const p = project(n);
      return <circle key={n.id} cx={p.x} cy={p.y} r={1.5 * k} fill="var(--road-street)" opacity={0.8} />;
    })}
  </g>
));
MapLabels.displayName = 'MapLabels';

function DriverDots({ fleet, activeId, k }: { fleet: Driver[]; activeId?: string; k: number }) {
  return (
    <g opacity={0.75}>
      {fleet.map((d) => {
        if (d.id === activeId) return null;
        const p = project(d);
        const two = d.product === 'okada' || d.product === 'aboboya';
        const w = (two ? 3.2 : 4.8) * k;
        const h = 7.2 * k;
        return (
          <rect
            key={d.id}
            x={-w / 2} y={-h / 2} width={w} height={h} rx={1.6 * k}
            transform={`translate(${p.x} ${p.y}) rotate(${d.heading})`}
            fill={two ? 'var(--fleet-bike)' : 'var(--fleet-car)'}
          />
        );
      })}
    </g>
  );
}

function PinPickup({ at, k }: { at: LatLng; k: number }) {
  const p = project(at);
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${k})`}>
      <circle r={11} className="pin-pulse" />
      <circle r={7} fill="var(--ink)" opacity={0.85} />
      <circle r={5} fill="#ffffff" />
      <circle r={2.2} fill="var(--brand)" />
    </g>
  );
}

function PinDropoff({ at, k }: { at: LatLng; k: number }) {
  const p = project(at);
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${k})`}>
      <path
        d="M0 2 L-8 -12 A9 9 0 1 1 8 -12 Z"
        fill="var(--brand)" stroke="var(--surface-1)" strokeWidth={2.5}
      />
      <circle cy={-13} r={3.4} fill="var(--surface-1)" />
    </g>
  );
}

function CarMarker({ at, bearing, bike, k }: { at: LatLng; bearing: number; bike: boolean; k: number }) {
  const p = project(at);
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${k}) rotate(${bearing})`}>
      <circle r={14} fill="var(--brand-bright)" opacity={0.18} />
      <g className="car-marker">
        <rect
          x={bike ? -4 : -5.5} y={-8} width={bike ? 8 : 11} height={16}
          rx={3.5} fill="var(--ink)" stroke="var(--gold)" strokeWidth={1.6}
        />
        <rect x={bike ? -2.4 : -3.6} y={-4.6} width={bike ? 4.8 : 7.2} height={5} rx={1.4} fill="var(--gold)" opacity={0.55} />
      </g>
    </g>
  );
}

export default function MapCanvas() {
  const { state } = useRyde();
  const { phase, route, driverRoute, progress, pickup, dropoff, driver } = state;
  const { ref, width, height } = useElementSize<SVGSVGElement>();

  // The viewBox matches the element's aspect ratio, so one world unit maps to a
  // predictable number of screen pixels and nothing needs cropping.
  const vh = VIEW_H;
  const vw = height > 0 ? (VIEW_H * width) / height : VIEW_W;

  const legRoute = phase === 'arriving' || phase === 'arrived' ? driverRoute : route;
  const travelling = phase === 'arriving' || phase === 'ontrip';

  const remaining = useMemo(() => {
    if (!legRoute) return [];
    if (travelling) return sliceFrom(legRoute.points, progress);
    return legRoute.points;
  }, [legRoute, travelling, progress]);

  const vehicle = useMemo(() => {
    if (!legRoute) return null;
    if (travelling) return pointAt(legRoute.points, progress);
    if (phase === 'arrived') return { pos: legRoute.points[legRoute.points.length - 1], bearing: 0 };
    return null;
  }, [legRoute, progress, travelling, phase]);

  const camera = useMemo(() => {
    const box = { vw, vh };
    if (phase === 'arriving' || phase === 'arrived') {
      return fitCamera(driverRoute ? driverRoute.points : [pickup], {
        ...box, padding: 14, maxScale: 5, focusY: 0.3, usableH: 0.5,
      });
    }
    if (phase === 'ontrip' && route && vehicle) {
      return fitCamera([vehicle.pos, ...sliceFrom(route.points, progress)], {
        ...box, padding: 14, maxScale: 4.5, focusY: 0.3, usableH: 0.5,
      });
    }
    if (route) {
      return fitCamera(route.points, { ...box, padding: 12, maxScale: 4, focusY: 0.18, usableH: 0.24 });
    }
    return fitCamera([pickup], { ...box, padding: 60, maxScale: 1.55, focusY: 0.33, usableH: 0.55 });
  }, [phase, route, driverRoute, pickup, vehicle, progress, vw, vh]);

  /** One screen pixel expressed in world units, after the camera scale. */
  const pxPerUnit = (height > 0 ? height / vh : 1) * camera.scale;
  const k = pxPerUnit > 0 ? 1 / pxPerUnit : 1;
  // Roads thicken gently with zoom rather than tracking it one-for-one.
  const roadK = k * Math.pow(camera.scale, 0.3);
  const zoomStep = Math.round(roadK * 200) / 200;

  return (
    <svg
      ref={ref}
      className="map"
      viewBox={`0 0 ${vw.toFixed(1)} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Map of Greater Accra"
    >
      <defs>
        {/* Region is the whole map: a proportional region clips the glow of a
            thin, near-vertical route into a visible rectangle. */}
        <filter
          id="routeGlow" filterUnits="userSpaceOnUse"
          x={-VIEW_W} y={-VIEW_H} width={VIEW_W * 3} height={VIEW_H * 3}
        >
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="blobBuilt">
          <stop offset="45%" stopColor="var(--built)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--built)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="blobGreen">
          <stop offset="40%" stopColor="var(--green)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand-bright)" />
          <stop offset="100%" stopColor="var(--gold)" />
        </linearGradient>
      </defs>

      <g className="map-camera" transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
        <Basemap k={zoomStep} />
        <MapLabels k={k} />
        <DriverDots fleet={state.fleet} activeId={driver?.id} k={k} />

        {legRoute && (
          <g>
            <path
              d={toSmoothPath(legRoute.points, 7 * k)}
              fill="none" stroke="var(--route-done)" strokeWidth={7 * k}
              strokeLinecap="round" strokeLinejoin="round"
            />
            <path
              d={toSmoothPath(remaining, 7 * k)}
              fill="none" stroke="url(#routeGrad)" strokeWidth={7 * k}
              strokeLinecap="round" strokeLinejoin="round" filter="url(#routeGlow)"
            />
            <path
              d={toSmoothPath(remaining, 7 * k)}
              fill="none" stroke="var(--surface-1)" strokeWidth={2.4 * k}
              strokeLinecap="round" strokeDasharray={`${0.1 * k} ${16 * k}`}
              className="route-flow" opacity={0.85}
              style={{ '--dash': `${16 * k}px` } as CSSProperties}
            />
          </g>
        )}

        <PinPickup at={pickup} k={k} />
        {dropoff && phase !== 'arriving' && phase !== 'arrived' && <PinDropoff at={dropoff} k={k} />}
        {vehicle && (
          <CarMarker
            at={vehicle.pos}
            bearing={vehicle.bearing}
            bike={driver?.product === 'okada' || driver?.product === 'aboboya'}
            k={k}
          />
        )}
      </g>
    </svg>
  );
}
