import { mulberry32 } from '../lib/random';
import { project } from '../lib/projection';
import { NODES, haversineKm } from './network';
import type { LatLng } from '../lib/router';

/**
 * Decorative street lattice.
 *
 * The routable graph only holds junctions a driver would actually name, which
 * leaves the basemap looking empty. These generated residential streets carry
 * no routing meaning — they exist so the neighbourhoods read as neighbourhoods.
 */

const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LNG = 110.79;

function offset(p: LatLng, bearingRad: number, km: number): LatLng {
  return {
    lat: p.lat + (Math.cos(bearingRad) * km) / KM_PER_DEG_LAT,
    lng: p.lng + (Math.sin(bearingRad) * km) / KM_PER_DEG_LNG,
  };
}

export const MINOR_STREETS: string[] = (() => {
  const rand = mulberry32(4418);
  const paths: string[] = [];

  // Residential spurs radiating out of every junction.
  for (const node of NODES) {
    const spurs = 4 + Math.floor(rand() * 5);
    for (let i = 0; i < spurs; i += 1) {
      const start = offset(node, rand() * Math.PI * 2, rand() * 0.9);
      const bearing = rand() * Math.PI * 2;
      const first = offset(start, bearing, 0.35 + rand() * 0.8);
      const second = offset(first, bearing + (rand() - 0.5) * 1.1, 0.3 + rand() * 0.9);

      const pts = [start, first, second].map(project);
      paths.push(`M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}`);

      // Occasional cross-street off the spur.
      if (rand() > 0.55) {
        const cross = offset(first, bearing + Math.PI / 2, 0.25 + rand() * 0.5);
        const a = project(first);
        const b = project(cross);
        paths.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
      }
    }
  }

  // Faint links between neighbours that share no formal road in the graph.
  for (let i = 0; i < NODES.length; i += 1) {
    for (let j = i + 1; j < NODES.length; j += 1) {
      const km = haversineKm(NODES[i], NODES[j]);
      if (km > 2.9 || rand() > 0.45) continue;
      const mid = {
        lat: (NODES[i].lat + NODES[j].lat) / 2 + (rand() - 0.5) * 0.012,
        lng: (NODES[i].lng + NODES[j].lng) / 2 + (rand() - 0.5) * 0.012,
      };
      const pts = [NODES[i], mid, NODES[j]].map(project);
      paths.push(`M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}`);
    }
  }

  return paths;
})();
