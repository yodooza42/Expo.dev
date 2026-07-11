import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { autoBackup } from '@/utils/locationBackup';
import { haversineKm } from '@/utils/haversine';
import { processPointForTrip, TRACKING_MODE_KEY } from '@/utils/tripDetection';

export { haversineKm };

export const LOCATION_TASK_NAME = 'background-location-task';
const KEY_PREFIX = '@yoann2_location_';
const MAX_DAYS = 7;

// Throttle autoBackup : au maximum 1×/minute pour ne pas surcharger le stockage
// à chaque point GPS (~3s en trajet actif).
let _lastAutoBackupTs = 0;
const AUTO_BACKUP_THROTTLE_MS = 60_000;

// ── Live trip notification ────────────────────────────────────────────────────
//
// Architecture :
//  • La notification de trajet EST la notification du foreground service GPS.
//    C'est le seul mécanisme réellement non-suppressible sur Android 13+.
//  • Pour mettre à jour le texte sans flicker : startLocationUpdatesAsync sur
//    une tâche déjà enregistrée patche les options via startForeground(id, notif)
//    Android côté natif — même ID, mise à jour en place, pas de re-création.
//  • Throttle à 15 s : évite de ré-enregistrer les listeners GPS à chaque point
//    (3 s) et élimine tout clignotement perceptible.
//  • _tripDistKm est persisté dans AsyncStorage pour survivre aux redémarrages
//    du process JS (le foreground service Android peut rester vivant mais le
//    moteur JS redémarre → perte de l'in-memory sans persistance).

const TRIP_DIST_KEY    = '@yoann2_trip_dist_km';
const NOTIF_THROTTLE_MS = 15_000; // mise à jour notification max 1×/15 s

let _tripDistKm        = 0;
let _tripDistLoaded    = false;   // true dès la première lecture AsyncStorage
let _lastNotifUpdateTs = 0;
let _lastNotifBody     = '';      // évite un re-patch si le texte est identique

export function resetTripTracking(): void {
  _tripDistKm        = 0;
  _tripDistLoaded    = true;  // pas besoin de recharger : on repart de 0
  _lastNotifUpdateTs = 0;
  _lastNotifBody     = '';
  AsyncStorage.removeItem(TRIP_DIST_KEY).catch(() => {});
}

/**
 * Met à jour la notification du foreground service GPS en place (sans flicker).
 *
 * Throttlé à 15 s max — ignoré si le texte n'a pas changé.
 * Le GPS continue de tourner sans interruption entre les mises à jour.
 */
async function updateTripNotification(distKm: number, activeMs: number): Promise<void> {
  const now = Date.now();
  if (now - _lastNotifUpdateTs < NOTIF_THROTTLE_MS) return;

  const hh = Math.floor(activeMs / 3_600_000);
  const mm = Math.floor((activeMs % 3_600_000) / 60_000);
  const ss = Math.floor((activeMs % 60_000) / 1_000);
  const duration = hh > 0
    ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  const body = `${distKm.toFixed(2)} km · ${duration}`;
  if (body === _lastNotifBody) return; // pas de changement → pas de patch

  try {
    const isRegistered = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
    if (!isRegistered) return;

    // Patch en place via startForeground(id, notification) Android → pas de clignotement
    const opts = await buildLocationOptions('active');
    opts.foregroundService!.notificationBody = body;
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, opts);

    _lastNotifUpdateTs = now;
    _lastNotifBody     = body;
    // Persiste la distance pour survivre à un redémarrage du process JS
    AsyncStorage.setItem(TRIP_DIST_KEY, String(distKm)).catch(() => {});
  } catch {}
}

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
    // Throttle : backup au maximum 1×/minute pour ne pas écrire sur
    // le stockage externe à chaque point GPS (~toutes les 3 s en trajet).
    const now = Date.now();
    if (now - _lastAutoBackupTs >= AUTO_BACKUP_THROTTLE_MS) {
      _lastAutoBackupTs = now;
      await autoBackup();
    }
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

// ── Purge old data (>7 days) ──────────────────────────────────────────────────

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
const TRACKING_STARTED_MODE_KEY = '@yoann2_tracking_started_mode';

// GPS accuracy filter: ignore points with horizontal accuracy worse than this.
// 50m — generous enough to capture trip start in covered/urban areas without
// letting obvious drift through (200m+ accuracy points are always noise).
const MAX_ACCURACY_METERS = 50;

// Speed sanity filter: ignore points implying faster than 200 km/h
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

// ── Adaptive interval helpers ─────────────────────────────────────────────────

// Returns the Location options adapted to current trip phase.
// - idle  → economy mode (user-selected interval, balanced accuracy)
// - active → dense mode (3s / 2m, high accuracy) for precise trace + distance
async function buildLocationOptions(
  tripPhase: 'active' | 'paused' | 'idle',
): Promise<Location.LocationTaskOptions> {
  const baseInterval = await getGpsInterval();
  const isActive = tripPhase === 'active';
  const isPaused = tripPhase === 'paused';
  return {
    accuracy: isActive ? Location.Accuracy.High : Location.Accuracy.Balanced,
    timeInterval: isActive ? 3_000 : isPaused ? 30_000 : baseInterval.timeIntervalMs,
    distanceInterval: isActive ? 2 : isPaused ? 50 : baseInterval.distanceIntervalM,
    // Automotive navigation hint: tells FLP this is a navigation use-case so it
    // never throttles or pauses updates on its own (critical for widget trips).
    ...(isActive && {
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
    }),
    showsBackgroundLocationIndicator: isActive,
    foregroundService: {
      notificationTitle: isActive
        ? 'Yoann2.0 — Trajet en cours'
        : isPaused
          ? 'Yoann2.0 — Trajet en pause'
          : 'Yoann2.0',
      notificationBody: isActive
        ? 'Suivi GPS actif — trajet en cours'
        : isPaused
          ? 'GPS en veille — appuie sur ▶ pour reprendre'
          : 'Surveillance des déplacements en arrière-plan',
      notificationColor: isPaused ? '#888888' : '#FFC107',
    },
  };
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

  const hasServices = await Location.hasServicesEnabledAsync();
  if (!hasServices) return;

  const isRegistered = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (isRegistered) return;

  const mode = (await AsyncStorage.getItem(TRACKING_MODE_KEY).catch(() => null)) ?? 'idle';
  const tripPhase = mode === 'active' ? 'active' : 'idle';

  await AsyncStorage.setItem(TRACKING_STARTED_MODE_KEY, tripPhase).catch(() => {});
  const opts = await buildLocationOptions(tripPhase);
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, opts);
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

export async function startManualTracking(): Promise<void> {
  const hasServices = await Location.hasServicesEnabledAsync();
  if (!hasServices) return;

  const isRegistered = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }

  // Use the same high-accuracy active options as the auto-tracking mode:
  // Accuracy.High (real GPS chip), 3s/2m intervals, automotive navigation hint.
  const opts = await buildLocationOptions('active');
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, opts);
}

/**
 * Passe le foreground service GPS en mode "pause" sans l'arrêter.
 *
 * Avantage : la notification du foreground service reste ACTIVE (et donc
 * non-dismissable sur Android 13+), mais le GPS passe en basse fréquence
 * (30 s / 50 m) pour économiser la batterie.
 *
 * La notification passe automatiquement à "Trajet en pause" via les options.
 * À reprendre : appeler startManualTracking() pour revenir en haute fréquence.
 */
export async function pauseManualTracking(): Promise<void> {
  const hasServices = await Location.hasServicesEnabledAsync();
  if (!hasServices) return;

  // startLocationUpdatesAsync sur une tâche déjà enregistrée patche les options
  // (titre/corps/fréquence) sans recréer le foreground service — la notification
  // reste à l'écran et ne peut pas être swipée.
  const opts = await buildLocationOptions('paused');
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, opts);
}

// ── Background task definition ────────────────────────────────────────────────

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) return;
  if (!data) return;
  const { locations } = data as { locations: Location.LocationObject[] };

  // ── Load last valid point ───────────────────────────────────────────────────
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

  // ── Vérification trajet manuel (une seule lecture par batch) ─────────────────
  const manualRaw = await AsyncStorage.getItem('@yoann2_manual_trip').catch(() => null);
  type ManualRaw = { active?: boolean; paused?: boolean; startTime?: number; segments?: { start: number; end?: number }[] };
  const manualParsed: ManualRaw | null = manualRaw ? (JSON.parse(manualRaw) as ManualRaw) : null;
  const manualActive = manualParsed?.active === true;
  const manualPaused = manualParsed?.paused === true;

  // ── Récupération distance si process JS redémarré (foreground service vivant) ─
  if (manualActive && !_tripDistLoaded) {
    try {
      const saved = await AsyncStorage.getItem(TRIP_DIST_KEY);
      if (saved) _tripDistKm = parseFloat(saved) || 0;
    } catch {}
    _tripDistLoaded = true;
  }

  // ── Process each location ───────────────────────────────────────────────────
  for (const loc of locations) {
    const lat = loc.coords.latitude;
    const lng = loc.coords.longitude;
    const timestamp = loc.timestamp;
    const speedMs = loc.coords.speed;
    const accuracy = loc.coords.accuracy;

    // 1. Precision filter: skip points with degraded horizontal accuracy
    if (accuracy != null && accuracy > MAX_ACCURACY_METERS) continue;

    // 2. Distance filter: skip micro-movements
    if (lastValid) {
      const distM = haversineKm(lastValid.lat, lastValid.lng, lat, lng) * 1000;
      const timeS = (timestamp - lastValid.timestamp) / 1000;

      if (distM < MIN_DISTANCE_METERS) continue;
      // 3. Speed sanity filter: skip physically impossible jumps
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
    // Pas de détection auto si un trajet manuel est en cours
    if (!manualActive) {
      await processPointForTrip(point).catch(() => {});
    }

    // ── Suivi distance + notification foreground (throttlée à 15 s) ─────────
    if (manualActive && !manualPaused && lastValid) {
      _tripDistKm += haversineKm(lastValid.lat, lastValid.lng, lat, lng);

      // Durée active = somme des segments (pauses exclues)
      const segs = manualParsed?.segments ?? [];
      let activeMs = 0;
      for (const s of segs) {
        activeMs += (s.end ?? timestamp) - s.start;
      }

      await updateTripNotification(_tripDistKm, activeMs);
    }

    lastValid = point;
    try {
      await AsyncStorage.setItem(LAST_VALID_KEY, JSON.stringify(point));
    } catch {}
  }

  await purgeOldData();
});
