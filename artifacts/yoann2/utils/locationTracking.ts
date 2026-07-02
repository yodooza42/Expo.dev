import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { autoBackup } from '@/utils/locationBackup';
import { haversineKm } from '@/utils/haversine';
import { processPointForTrip } from '@/utils/tripDetection';

export { haversineKm };

export const LOCATION_TASK_NAME = 'background-location-task';
const KEY_PREFIX = '@yoann2_location_';
const MAX_DAYS = 7;

export type ActivityType = 'walk' | 'car' | 'unknown';

export type LocationPoint = {
  lat: number;
  lng: number;
  timestamp: number;
  activity?: ActivityType;
  speedKmh?: number;
};

function classifyActivity(speedMs: number | null | undefined): ActivityType {
  if (speedMs == null || speedMs < 0) return 'unknown';
  if (speedMs < 2) return 'walk';
  if (speedMs > 5) return 'car';
  return 'unknown';
}

// ── Key helpers ───────────────────────────────────────────────────────────────

export function dateKey(date: Date | string): string {
  if (typeof date === 'string') return date;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function storageKey(dayKey: string): string {
  return KEY_PREFIX + dayKey;
}

// ── Storage operations ────────────────────────────────────────────────────────

export async function loadDayPoints(day: string): Promise<LocationPoint[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(day));
    return raw ? (JSON.parse(raw) as LocationPoint[]) : [];
  } catch {
    return [];
  }
}

export async function appendPoint(point: LocationPoint): Promise<void> {
  const day = dateKey(new Date(point.timestamp));
  const key = storageKey(day);
  try {
    const raw = await AsyncStorage.getItem(key);
    const points: LocationPoint[] = raw ? JSON.parse(raw) : [];
    points.push(point);
    await AsyncStorage.setItem(key, JSON.stringify(points));
    await autoBackup();
  } catch {
    // silently ignore storage errors
  }
}

export async function saveDayPoints(day: string, points: LocationPoint[]): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(day), JSON.stringify(points));
  } catch {
    // silently ignore storage errors
  }
}

export async function deleteDayPoints(day: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(day));
  } catch {
    // silently ignore storage errors
  }
}

export async function correctActivity(
  day: string,
  timestamp: number,
  newActivity: ActivityType,
): Promise<boolean> {
  try {
    const points = await loadDayPoints(day);
    const idx = points.findIndex(p => p.timestamp === timestamp);
    if (idx === -1) return false;
    points[idx] = { ...points[idx]!, activity: newActivity };
    await saveDayPoints(day, points);
    return true;
  } catch {
    return false;
  }
}

// ── Multi-day load ────────────────────────────────────────────────────────────

export async function loadMultiDayPoints(
  startTs: number,
  endTs: number,
): Promise<LocationPoint[]> {
  const startDate = new Date(startTs);
  const endDate   = new Date(endTs);
  const startDay  = dateKey(startDate);
  const endDay    = dateKey(endDate);

  const days: string[] = [];
  const cur = new Date(startDay + 'T12:00:00');
  while (dateKey(cur) <= endDay) {
    days.push(dateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }

  const all: LocationPoint[] = [];
  for (const day of days) {
    const pts = await loadDayPoints(day);
    all.push(...pts);
  }
  return all.filter(p => p.timestamp >= startTs && p.timestamp <= endTs);
}

// ── Purge old data (>90 days) ─────────────────────────────────────────────────

export async function purgeOldData(): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_DAYS);
    const allKeys = await AsyncStorage.getAllKeys();
    const locationKeys = allKeys.filter(k => k.startsWith(KEY_PREFIX));
    const toDelete: string[] = [];
    for (const k of locationKeys) {
      const day = k.replace(KEY_PREFIX, '');
      if (day < dateKey(cutoff)) {
        toDelete.push(k);
      }
    }
    if (toDelete.length > 0) {
      await AsyncStorage.multiRemove(toDelete);
    }
  } catch {
    // silently ignore
  }
}

// ── Tracking state ────────────────────────────────────────────────────────────

const PAUSED_KEY = '@yoann2_location_paused';
const GPS_INTERVAL_KEY = '@yoann2_gps_interval';
const LAST_VALID_KEY = '@yoann2_last_valid_point';

const MIN_DISTANCE_METERS = 15;
const MAX_SPEED_MS = 55.56; // 200 km/h

export type GpsInterval = {
  label: string;
  timeIntervalMs: number;
  distanceIntervalM: number;
};

export const GPS_INTERVALS: GpsInterval[] = [
  { label: 'Économique (30s)', timeIntervalMs: 30_000, distanceIntervalM: 10 },
  { label: 'Standard (10s)',    timeIntervalMs: 10_000, distanceIntervalM: 5 },
  { label: 'Précis (5s)',       timeIntervalMs: 5_000,  distanceIntervalM: 3 },
  { label: 'Rapide (3s)',       timeIntervalMs: 3_000,  distanceIntervalM: 2 },
];

export async function getGpsInterval(): Promise<GpsInterval> {
  try {
    const raw = await AsyncStorage.getItem(GPS_INTERVAL_KEY);
    if (raw) {
      const idx = parseInt(raw, 10);
      if (idx >= 0 && idx < GPS_INTERVALS.length) return GPS_INTERVALS[idx]!;
    }
  } catch {}
  return GPS_INTERVALS[0]!;
}

export async function setGpsInterval(index: number): Promise<void> {
  if (index < 0 || index >= GPS_INTERVALS.length) return;
  await AsyncStorage.setItem(GPS_INTERVAL_KEY, String(index));
}

export async function isTrackingPaused(): Promise<boolean> {
  const v = await AsyncStorage.getItem(PAUSED_KEY);
  return v === '1';
}

export async function setTrackingPaused(paused: boolean): Promise<void> {
  await AsyncStorage.setItem(PAUSED_KEY, paused ? '1' : '0');
}

// ── Permission request ────────────────────────────────────────────────────────

export async function requestLocationPermissions(): Promise<boolean> {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') return false;
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  return bgStatus === 'granted';
}

// ── Start / stop tracking ─────────────────────────────────────────────────────

export async function startTracking(): Promise<void> {
  const paused = await isTrackingPaused();
  if (paused) return;

  const hasPerms = await Location.hasServicesEnabledAsync();
  if (!hasPerms) return;

  const isRegistered = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (isRegistered) return;

  const interval = await getGpsInterval();
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: interval.timeIntervalMs,
    distanceInterval: interval.distanceIntervalM,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Yoann2.0',
      notificationBody: 'Enregistrement de la position en arrière-plan',
      notificationColor: '#FFC107',
    },
  });
}

export async function restartTracking(): Promise<void> {
  const isRegistered = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  await startTracking();
}

export async function stopTracking(): Promise<void> {
  const isRegistered = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}

// ── Background task definition ────────────────────────────────────────────────

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) return;
  if (!data) return;
  const { locations } = data as { locations: Location.LocationObject[] };

  let lastValid: LocationPoint | null = null;
  try {
    const raw = await AsyncStorage.getItem(LAST_VALID_KEY);
    if (raw) lastValid = JSON.parse(raw) as LocationPoint;
  } catch {}
  if (!lastValid) {
    try {
      const today = dateKey(new Date());
      const pts = await loadDayPoints(today);
      if (pts.length > 0) lastValid = pts[pts.length - 1]!;
    } catch {}
  }

  for (const loc of locations) {
    const lat = loc.coords.latitude;
    const lng = loc.coords.longitude;
    const timestamp = loc.timestamp;
    const speedMs = loc.coords.speed;

    if (lastValid) {
      const distM = haversineKm(lastValid.lat, lastValid.lng, lat, lng) * 1000;
      const timeS = (timestamp - lastValid.timestamp) / 1000;

      if (distM < MIN_DISTANCE_METERS) continue;
      if (timeS > 0 && distM / timeS > MAX_SPEED_MS) continue;
    }

    const point: LocationPoint = {
      lat,
      lng,
      timestamp,
      activity: classifyActivity(speedMs),
      speedKmh: speedMs != null && speedMs >= 0 ? Math.round(speedMs * 3.6) : undefined,
    };

    await appendPoint(point);
    await processPointForTrip(point).catch(() => {});
    lastValid = point;
    try {
      await AsyncStorage.setItem(LAST_VALID_KEY, JSON.stringify(point));
    } catch {}
  }

  await purgeOldData();
});
