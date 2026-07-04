import type { RoutePoint } from '@/types/trips';
import { haversineKm } from '@/utils/haversine';

const MAX_OSRM_POINTS = 100;
const OSRM_BASE       = 'https://router.project-osrm.org';
const TIMEOUT_MS      = 10_000;

function subsample(points: RoutePoint[], max: number): RoutePoint[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: RoutePoint[] = [];
  for (let i = 0; i < max; i++) {
    out.push(points[Math.min(Math.round(i * step), points.length - 1)]!);
  }
  return out;
}

export function computeRouteDistanceKm(points: RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(
      points[i - 1]!.lat, points[i - 1]!.lng,
      points[i]!.lat,     points[i]!.lng,
    );
  }
  return total;
}

/**
 * Send GPS points to the OSRM map-matching API and return a road-snapped
 * RoutePoint[] on success, or null on any failure (network, no match, etc.).
 *
 * Only for vehicle trips — do not call for walking/cycling.
 */
export async function matchRouteOSRM(points: RoutePoint[]): Promise<RoutePoint[] | null> {
  if (points.length < 2) return null;

  const sampled  = subsample(points, MAX_OSRM_POINTS);
  const coords   = sampled.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const radiuses = sampled.map(() => '50').join(';');
  const url = `${OSRM_BASE}/match/v1/driving/${coords}?overview=full&geometries=geojson&radiuses=${radiuses}`;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) return null;

    const data = await resp.json() as {
      code: string;
      matchings?: Array<{ geometry: { coordinates: Array<[number, number]> } }>;
    };

    if (data.code !== 'Ok' || !data.matchings?.length) return null;

    const result: RoutePoint[] = [];
    for (const matching of data.matchings) {
      for (const [lng, lat] of matching.geometry.coordinates) {
        result.push({ lat, lng });
      }
    }

    return result.length >= 2 ? result : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}
