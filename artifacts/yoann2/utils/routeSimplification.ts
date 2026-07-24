import type { RoutePoint } from '@/types/trips';

// Perpendicular distance from point p to the segment (start → end) in degree space.
// Degrees are "good enough" for RDP — what matters is relative, not absolute distance.
function perpendicularDistanceDeg(
  p: RoutePoint,
  start: RoutePoint,
  end: RoutePoint,
): number {
  const dx = end.lat - start.lat;
  const dy = end.lng - start.lng;
  if (dx === 0 && dy === 0) {
    return Math.sqrt((p.lat - start.lat) ** 2 + (p.lng - start.lng) ** 2);
  }
  const t = ((p.lat - start.lat) * dx + (p.lng - start.lng) * dy) / (dx * dx + dy * dy);
  const closestLat = start.lat + t * dx;
  const closestLng = start.lng + t * dy;
  return Math.sqrt((p.lat - closestLat) ** 2 + (p.lng - closestLng) ** 2);
}

function rdpRecursive(points: RoutePoint[], epsilon: number): RoutePoint[] {
  if (points.length <= 2) return [...points];
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistanceDeg(points[i]!, first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdpRecursive(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpRecursive(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

// ~15m tolerance in degree space (1° lat ≈ 111 km → 15m ≈ 0.000135°).
// Keeps one point per ~15m of path deviation — enough for a car/moto map polyline.
const EPSILON_DEG = 0.000135;

// ~4m tolerance for walks — preserves fine path detail (winding park trails, etc.)
export const EPSILON_DEG_WALK = 0.000036;

export function simplifyRoute(points: RoutePoint[], epsilon = EPSILON_DEG): RoutePoint[] {
  if (points.length <= 2) return [...points];
  return rdpRecursive(points, epsilon);
}
