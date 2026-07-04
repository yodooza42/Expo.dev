import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import type { LocationPoint } from '@/utils/locationTracking';
import { haversineKm } from '@/utils/haversine';
import { matchRouteOSRM, computeRouteDistanceKm } from '@/utils/osrmMatching';
import { reverseGeocode } from '@/utils/geocoding';
import { genId } from '@/utils/ids';
import { simplifyRoute } from '@/utils/routeSimplification';
import {
  getTripDetectionState,
  saveTrip,
  saveTripDetectionState,
} from '@/utils/tripStorage';
import { findNearestPlace } from '@/utils/placesStorage';
import type { RoutePoint, Trip, TripDetectionState } from '@/types/trips';

const VEHICLE_SPEED_KMH = 15;
const CANDIDATE_DURATION_MS = 30_000;
const STOP_DURATION_MS = 180_000;
const MIN_TRIP_KM = 0.3;
// Cap raw points to avoid huge AsyncStorage entries (~3 000 pts ≈ 10 km at 3-sec interval)
const MAX_RAW_ROUTE_POINTS = 3_000;

// Key shared with locationTracking to signal desired GPS frequency
export const TRACKING_MODE_KEY = '@yoann2_tracking_mode';


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
  if (s.routePoints.length < MAX_RAW_ROUTE_POINTS) {
    s.routePoints.push({ lat, lng } as RoutePoint);
  }
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
          state.status = 'idle';
          state.distanceKm = 0;
          state.pointCount = 0;
          state.lastTimestamp = 0;
          state.routePoints = [];
          state.candidatePauseSince = 0;
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
            const osrmRoute = await matchRouteOSRM(state.routePoints);
            const route = osrmRoute ?? simplifyRoute(state.routePoints);
            const distanceKm = osrmRoute
              ? Math.round(computeRouteDistanceKm(osrmRoute) * 100) / 100
              : Math.round(state.distanceKm * 100) / 100;
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
              routeSource: osrmRoute ? 'osrm' : 'gps',
            };
          }
          state.status = 'idle';
          state.distanceKm = 0;
          state.pointCount = 0;
          state.lastTimestamp = 0;
          state.routePoints = [];
        }
      }
      break;
    }
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
        body: `${completedTrip.distanceKm.toFixed(1)} km · Tapez pour choisir le véhicule et la catégorie`,
        data: { url: '/(tabs)/trips', type: 'trip_completed' },
      },
      trigger: null,
    }).catch(() => {});
  }

  return completedTrip;
}
