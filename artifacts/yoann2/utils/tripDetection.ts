import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import type { LocationPoint } from '@/utils/locationTracking';
import { haversineKm } from '@/utils/haversine';
import { simplifyRoute } from '@/utils/routeSimplification';
import {
  getTripDetectionState,
  saveTrip,
  saveTripDetectionState,
} from '@/utils/tripStorage';
import type { RoutePoint, Trip, TripDetectionState } from '@/types/trips';

const VEHICLE_SPEED_KMH = 15;
const CANDIDATE_DURATION_MS = 30_000;
const STOP_DURATION_MS = 180_000;
const MIN_TRIP_KM = 0.3;
// Cap raw points to avoid huge AsyncStorage entries (~3 000 pts ≈ 10 km at 3-sec interval)
const MAX_RAW_ROUTE_POINTS = 3_000;

// Key shared with locationTracking to signal desired GPS frequency
export const TRACKING_MODE_KEY = '@yoann2_tracking_mode';

function genId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

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
        if (now - state.candidateSince >= CANDIDATE_DURATION_MS) {
          state.status = 'active';
        }
      } else {
        state.status = 'idle';
        state.distanceKm = 0;
        state.pointCount = 0;
        state.lastTimestamp = 0;
        state.routePoints = [];
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
            const route = simplifyRoute(state.routePoints);
            completedTrip = {
              id: genId(),
              startTime: state.startTime,
              endTime: state.lastMovingTime,
              distanceKm: Math.round(state.distanceKm * 100) / 100,
              vehicle: null,
              pointCount: state.pointCount,
              startLat: state.startLat,
              startLon: state.startLon,
              endLat: state.lastLat,
              endLon: state.lastLon,
              route,
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
    await saveTrip(completedTrip);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Trajet terminé — Yoann 2.0',
        body: `${completedTrip.distanceKm.toFixed(1)} km · Tapez pour taguer le véhicule`,
        data: { url: '/(tabs)/trips', type: 'trip_completed' },
      },
      trigger: null,
    }).catch(() => {});
  }

  return completedTrip;
}
