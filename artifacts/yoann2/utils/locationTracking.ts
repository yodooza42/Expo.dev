import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { autoBackup } from '@/utils/locationBackup';

export const LOCATION_TASK_NAME = 'background-location-task';
const KEY_PREFIX = '@yoann2_location_';
const MAX_DAYS = 90;

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

// ── Haversine distance in km ──────────────────────────────────────────────────

export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 30_000,
    distanceInterval: 10,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Yoann2.0',
      notificationBody: 'Enregistrement de la position en arrière-plan',
      notificationColor: '#FFC107',
    },
  });
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
  for (const loc of locations) {
    const speedMs = loc.coords.speed;
    await appendPoint({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      timestamp: loc.timestamp,
      activity: classifyActivity(speedMs),
      speedKmh: speedMs != null && speedMs >= 0 ? Math.round(speedMs * 3.6) : undefined,
    });
  }
  await purgeOldData();
});
