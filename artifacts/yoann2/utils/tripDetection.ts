import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import type { LocationPoint } from '@/utils/locationTracking';
import { haversineKm } from '@/utils/haversine';
import { matchRouteOSRM, computeRouteDistanceKm } from '@/utils/osrmMatching';
import { computeCleanedDistanceKm } from '@/utils/fallbackMatching';
import { reverseGeocode } from '@/utils/geocoding';
import { genId } from '@/utils/ids';
import { simplifyRoute } from '@/utils/routeSimplification';
import {
  getTripDetectionState,
  saveTrip,
  saveTripDetectionState,
} from '@/utils/tripStorage';
import { findNearestPlace } from '@/utils/placesStorage';
import type { RoutePoint, RouteSegment, Trip, TripDetectionState } from '@/types/trips';

const VEHICLE_SPEED_KMH = 15;
const CANDIDATE_DURATION_MS = 30_000;
const STOP_DURATION_MS = 180_000;
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
  } else {
    // OSRM failed for this segment only: use local cleaned fallback pipeline
    // (outlier removal + smoothing + corrected haversine) as approximation.
    const rawDist = Math.round(computeCleanedDistanceKm(points) * 100) / 100;
    state.segments.push({ points: [...points], distanceKm: rawDist, source: 'gps' });
  }

  // Seed next segment with the last point so the path is continuous.
  const lastPoint = points[points.length - 1]!;
  state.routePoints = [lastPoint];
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
    for (const p of seg.points) {
      full.push(p);
    }
  }
  // Append current segment simplified to keep storage size reasonable
  if (state.routePoints.length > 0) {
    const simplified = simplifyRoute(state.routePoints);
    for (const p of simplified) {
      full.push(p);
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


export async function processPointForTrip(point: LocationPoint): Promise<Trip | null> {
  const state = await getTripDetectionState();
  const speedKmh = point.speedKmh ?? 0;
  const now = point.timestamp;
  const { lat, lng } = point;
  let completedTrip: Trip | null = null;

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
      } else {
        const stoppedMs = now - state.lastMovingTime;
        if (stoppedMs >= STOP_DURATION_MS) {
          if (state.distanceKm >= MIN_TRIP_KM) {
            const distanceKm = computeFinalDistance(state);
            const route = buildFullRoute(state);
            const routeSource = overallRouteSource(state);
            completedTrip = {
              id: genId(),
              startTime: state.startTime,
              endTime: state.lastMovingTime,
              distanceKm,
              vehicle: null,
              pointCount: state.pointCount,
              startLat: state.startLat,
              startLon: state.startLon,
              endLat: state.lastLat,
              endLon: state.lastLon,
              route,
              routeSource,
              osrmSegments: state.osrmSegmentsCount,
            };
          }
          resetToIdle(state);
        }
      }
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

  if (completedTrip) {
    // Resolve start/end addresses — known places first, Nominatim fallback
    const [startPlace, endPlace] = await Promise.all([
      findNearestPlace(completedTrip.startLat, completedTrip.startLon).catch(() => null),
      findNearestPlace(completedTrip.endLat, completedTrip.endLon).catch(() => null),
    ]);

    if (startPlace) {
      completedTrip.startAddress = startPlace.name;
      completedTrip.startPlaceId = startPlace.id;
    } else {
      completedTrip.startAddress =
        await reverseGeocode(completedTrip.startLat, completedTrip.startLon).catch(() => null) ?? undefined;
    }

    if (endPlace) {
      completedTrip.endAddress = endPlace.name;
      completedTrip.endPlaceId = endPlace.id;
    } else {
      // reverseGeocode enforces ≥1.1 s gap internally when Nominatim is called
      completedTrip.endAddress =
        await reverseGeocode(completedTrip.endLat, completedTrip.endLon).catch(() => null) ?? undefined;
    }

    await saveTrip(completedTrip);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Trajet terminé — Yoann 2.0',
        body: `${completedTrip.distanceKm.toFixed(1)} km${completedTrip.osrmSegments ? ` · ${completedTrip.osrmSegments} tronçon${completedTrip.osrmSegments > 1 ? 's' : ''} OSRM` : ''} · Tapez pour choisir le véhicule et la catégorie`,
        data: { url: '/(tabs)/trips', type: 'trip_completed' },
      },
      trigger: null,
    }).catch(() => {});
  }

  return completedTrip;
}
