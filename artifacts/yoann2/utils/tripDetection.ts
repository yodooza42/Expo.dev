import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LocationPoint } from '@/utils/locationTracking';
import { haversineKm } from '@/utils/haversine';
import { matchRouteOSRM, computeRouteDistanceKm } from '@/utils/osrmMatching';
import { computeCleanedDistanceKm } from '@/utils/fallbackMatching';
import { simplifyRoute } from '@/utils/routeSimplification';
import {
  getTripDetectionState,
  saveTripDetectionState,
} from '@/utils/tripStorage';
import type { RoutePoint, RouteSegment, TripDetectionState } from '@/types/trips';

const VEHICLE_SPEED_KMH = 15;
const CANDIDATE_DURATION_MS = 30_000;
const MIN_TRIP_KM = 0.3;
// Cap raw points per segment to avoid huge AsyncStorage entries
// (~3 000 pts ≈ 10 km at 3-sec interval, then flush to OSRM)
const MAX_RAW_ROUTE_POINTS = 3_000;

// Key shared with locationTracking to signal desired GPS frequency
export const TRACKING_MODE_KEY = '@yoann2_tracking_mode';


/**
 * Append a GPS point to the current trip state.
 * Accumulates haversine distance and stores the point.
 */
function addDistance(
  s: TripDetectionState,
  lat: number,
  lng: number,
  now: number,
): void {
  if (s.lastTimestamp > 0) {
    s.distanceKm += haversineKm(s.lastLat, s.lastLon, lat, lng);
  }
  s.lastLat = lat;
  s.lastLon = lng;
  s.lastTimestamp = now;
  s.pointCount += 1;
  s.routePoints.push({ lat, lng });
}

/**
 * Flush the current segment to OSRM when it reaches the point cap.
 * - Snap the points via OSRM match API.
 * - Store the matched segment (corrected distance + snapped route).
 * - Start a new segment with the last point of the old one as seed (no gap).
 * - If OSRM fails, fallback to haversine for this segment only (distanceKm
 *   already accumulated by addDistance) and continue.
 */
async function flushSegment(state: TripDetectionState): Promise<void> {
  if (state.routePoints.length < 2) return;

  const points = state.routePoints;
  const osrmRoute = await matchRouteOSRM(points);

  if (osrmRoute) {
    const dist = Math.round(computeRouteDistanceKm(osrmRoute) * 100) / 100;
    state.segments.push({ points: osrmRoute, distanceKm: dist, source: 'osrm' });
    state.osrmSegmentsCount += 1;
    // Seed next segment from the last OSRM-snapped point (not raw GPS) so
    // the stored route is continuous without ghost lines between segments.
    state.routePoints = [osrmRoute[osrmRoute.length - 1]!];
  } else {
    // OSRM failed for this segment only: use local cleaned fallback pipeline
    // (outlier removal + smoothing + corrected haversine) as approximation.
    const rawDist = Math.round(computeCleanedDistanceKm(points) * 100) / 100;
    state.segments.push({ points: [...points], distanceKm: rawDist, source: 'gps' });
    state.routePoints = [points[points.length - 1]!];
  }
}

/**
 * Compute final trip distance from segments + current segment.
 */
function computeFinalDistance(state: TripDetectionState): number {
  let total = state.segments.reduce((sum, seg) => sum + seg.distanceKm, 0);

  // Current (unflushed) segment — use cleaned fallback for better accuracy
  if (state.routePoints.length >= 2) {
    total += Math.round(computeCleanedDistanceKm(state.routePoints) * 100) / 100;
  }

  return Math.round(total * 100) / 100;
}

/**
 * Build the full route for storage: concatenate all matched segment routes,
 * then append the current (unflushed) segment simplified.
 */
function buildFullRoute(state: TripDetectionState): RoutePoint[] {
  const full: RoutePoint[] = [];
  for (const seg of state.segments) {
    // For segments after the first, skip their first point: it was seeded from
    // the previous segment's OSRM end-point and OSRM may re-snap it to a
    // slightly different road position, creating a visible "ghost" connector.
    // We bridge the gap by reusing the already-stored last point of `full`.
    const start = full.length > 0 ? 1 : 0;
    for (let j = start; j < seg.points.length; j++) {
      full.push(seg.points[j]!);
    }
  }
  // Append current (unflushed) segment — simplified to cap storage size.
  // Also skip its first point when flushed segments already populated `full`
  // (same reason: it's the seed point from the last flush).
  if (state.routePoints.length > 0) {
    const simplified = simplifyRoute(state.routePoints);
    const start = full.length > 0 ? 1 : 0;
    for (let j = start; j < simplified.length; j++) {
      full.push(simplified[j]!);
    }
  }
  return full;
}

/**
 * Determine overall routeSource for the trip.
 * 'osrm' if ALL flushed segments were OSRM-matched, 'gps' otherwise.
 */
function overallRouteSource(state: TripDetectionState): 'osrm' | 'gps' {
  if (state.segments.length === 0) return 'gps';
  return state.segments.every(s => s.source === 'osrm') ? 'osrm' : 'gps';
}

/**
 * Reset state to idle after a trip completes or is abandoned.
 */
function resetToIdle(state: TripDetectionState): void {
  state.status = 'idle';
  state.distanceKm = 0;
  state.pointCount = 0;
  state.lastTimestamp = 0;
  state.routePoints = [];
  state.segments = [];
  state.osrmSegmentsCount = 0;
  state.candidateSince = 0;
  state.candidatePauseSince = 0;
}


export async function processPointForTrip(point: LocationPoint): Promise<void> {
  const state = await getTripDetectionState();
  const speedKmh = point.speedKmh ?? 0;
  const now = point.timestamp;
  const { lat, lng } = point;

  const prevStatus = state.status;

  switch (state.status) {
    case 'idle': {
      if (speedKmh >= VEHICLE_SPEED_KMH) {
        state.status = 'candidate';
        state.candidateSince = now;
        state.startTime = now;
        state.startLat = lat;
        state.startLon = lng;
        state.lastLat = lat;
        state.lastLon = lng;
        state.lastTimestamp = now;
        state.lastMovingTime = now;
        state.distanceKm = 0;
        state.pointCount = 1;
        state.routePoints = [{ lat, lng }];
        state.segments = [];
        state.osrmSegmentsCount = 0;
      }
      break;
    }

    case 'candidate': {
      if (speedKmh >= VEHICLE_SPEED_KMH) {
        addDistance(state, lat, lng, now);
        state.lastMovingTime = now;
        state.candidatePauseSince = 0;
        if (now - state.candidateSince >= CANDIDATE_DURATION_MS) {
          state.status = 'active';
        }
      } else {
        if (state.candidatePauseSince === 0) {
          state.candidatePauseSince = now;
        } else if (now - state.candidatePauseSince >= 30_000) {
          resetToIdle(state);
        }
      }
      break;
    }

    case 'active': {
      addDistance(state, lat, lng, now);
      if (speedKmh >= VEHICLE_SPEED_KMH) {
        state.lastMovingTime = now;
      } else {
        state.status = 'ending';
      }
      break;
    }

    case 'ending': {
      if (speedKmh >= VEHICLE_SPEED_KMH) {
        addDistance(state, lat, lng, now);
        state.status = 'active';
        state.lastMovingTime = now;
      }
      // Pas d'auto-fin : le trajet reste en état "ending" jusqu'à ce que
      // l'utilisateur appuie sur Stop depuis le widget.
      break;
    }
  }

  // ── Segment flush: when current segment hits the cap, OSRM-match it immediately ──
  if (
    (state.status === 'active' || state.status === 'ending') &&
    state.routePoints.length >= MAX_RAW_ROUTE_POINTS
  ) {
    await flushSegment(state);
  }

  await saveTripDetectionState(state);

  // Signal to locationTracking that GPS frequency should change.
  // idle → candidate/active = need high frequency
  // ending/active → idle = back to economy mode
  const nowActive = state.status !== 'idle';
  const wasActive = prevStatus !== 'idle';
  if (nowActive !== wasActive) {
    await AsyncStorage.setItem(TRACKING_MODE_KEY, nowActive ? 'active' : 'idle').catch(() => {});
  }

}
