import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Trip, RoutePoint } from '@/types/trips';
import { genId } from '@/utils/ids';
import { loadMultiDayPoints } from '@/utils/locationTracking';
import { computeRouteDistanceKm, matchRouteOSRM } from '@/utils/osrmMatching';
import { simplifyRoute } from '@/utils/routeSimplification';
import { getTrips, saveTrip } from '@/utils/tripStorage';

/**
 * One-time recovery requested for the manual trip that was calculated and
 * notified, but was not visible in the saved trips list.
 *
 * Date constructors intentionally use the device's local timezone, just like
 * the original manual-trip code.
 */
const RECOVERY = {
  key: '@yoann2_recovery_manual_2026-09-17_0730_1930',
  startTime: new Date(2026, 8, 17, 7, 30, 0, 0).getTime(),
  endTime: new Date(2026, 8, 17, 19, 30, 0, 0).getTime(),
  vehicle: 'car' as const,
};

export type ManualTripRecoveryResult =
  | { status: 'recovered'; trip: Trip }
  | { status: 'already_recovered' }
  | { status: 'not_found' }
  | { status: 'save_failed' };

function firstAndLast(points: RoutePoint[]): { first: RoutePoint; last: RoutePoint } | null {
  if (points.length < 2) return null;
  return { first: points[0]!, last: points[points.length - 1]! };
}

export async function recoverConfiguredManualTrip(): Promise<ManualTripRecoveryResult> {
  try {
    if (await AsyncStorage.getItem(RECOVERY.key)) {
      return { status: 'already_recovered' };
    }

    const existingTrips = await getTrips();
    if (existingTrips.some(trip =>
      trip.startTime < RECOVERY.endTime &&
      trip.endTime > RECOVERY.startTime &&
      trip.source === 'manual',
    )) {
      await AsyncStorage.setItem(RECOVERY.key, 'existing');
      return { status: 'already_recovered' };
    }

    const points = (await loadMultiDayPoints(RECOVERY.startTime, RECOVERY.endTime))
      .filter(point =>
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng) &&
        Number.isFinite(point.timestamp),
      )
      .sort((a, b) => a.timestamp - b.timestamp);
    const routePoints: RoutePoint[] = points.map(point => ({
      lat: point.lat,
      lng: point.lng,
      t: point.timestamp,
    }));
    const endpoints = firstAndLast(routePoints);
    if (!endpoints) return { status: 'not_found' };

    const distanceKm = computeRouteDistanceKm(routePoints);
    // A 200 km notification should produce a substantial trace. This guard
    // prevents normal background history from becoming a false manual trip.
    if (distanceKm < 20) return { status: 'not_found' };

    let osrmRoute: RoutePoint[] | null = null;
    try {
      osrmRoute = await matchRouteOSRM(routePoints);
    } catch {
      osrmRoute = null;
    }
    const osrmDistanceKm = osrmRoute ? computeRouteDistanceKm(osrmRoute) : null;
    const osrmIsPlausible =
      osrmDistanceKm != null &&
      (osrmDistanceKm >= distanceKm * 0.7 && osrmDistanceKm <= distanceKm * 1.4);
    const trustedRoute = osrmIsPlausible ? osrmRoute : null;

    const trip: Trip = {
      id: genId(),
      startTime: endpoints.first.t ?? RECOVERY.startTime,
      endTime: endpoints.last.t ?? RECOVERY.endTime,
      distanceKm: Math.round(distanceKm * 100) / 100,
      pointCount: routePoints.length,
      vehicle: RECOVERY.vehicle,
      startLat: endpoints.first.lat,
      startLon: endpoints.first.lng,
      endLat: endpoints.last.lat,
      endLon: endpoints.last.lng,
      route: simplifyRoute(trustedRoute ?? routePoints),
      routeSource: trustedRoute ? 'osrm' : 'gps',
      source: 'manual',
    };

    if (!await saveTrip(trip)) return { status: 'save_failed' };
    await AsyncStorage.setItem(RECOVERY.key, trip.id);
    return { status: 'recovered', trip };
  } catch {
    return { status: 'save_failed' };
  }
}