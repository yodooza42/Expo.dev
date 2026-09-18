import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { autoBackup } from '@/utils/locationBackup';
import { haversineKm } from '@/utils/haversine';
import { updateTodoWidget } from '@/widgets/updateWidget';

export { haversineKm };

export const LOCATION_TASK_NAME = 'background-location-task';
const KEY_PREFIX = '@yoann2_location_';
const MAX_DAYS = 7;
// Chaque journée est stockée comme une seule valeur AsyncStorage. Un trajet
// très long ne doit pas rendre cette valeur assez grosse pour bloquer ensuite
// les écritures d'état du widget.
const MAX_STORED_POINTS_PER_DAY = 6_000;

// Throttle autoBackup : au maximum 1×/minute pour ne pas surcharger le stockage
// à chaque point GPS (~3s en trajet actif).
let _lastAutoBackupTs = 0;
const AUTO_BACKUP_THROTTLE_MS = 60_000;

// Throttle rafraîchissement widget pendant un trajet actif (max 1×/30 s).
let _lastWidgetUpdateMs = 0;
const WIDGET_UPDATE_THROTTLE_MS = 5_000;

// ── Distance de trajet (persistée pour survivre aux redémarrages JS) ─────────

const TRIP_DIST_KEY = '@yoann2_trip_dist_km';

let _tripDistKm     = 0;
let _tripDistLoaded = false;

let _currentTripPhase: 'active' | 'paused' | 'idle' = 'idle';

export function resetTripTracking(): void {
  _tripDistKm     = 0;
  _tripDistLoaded = true;
  AsyncStorage.removeItem(TRIP_DIST_KEY).catch(() => {});
}

/** Distance accumulée depuis le début du trajet (in-memory, mis à jour par la tâche GPS). */
export function getTripDistKm(): number {
  return _tripDistKm;
}

export type ActivityType = 'walk' | 'car' | 'unknown';

export type LocationPoint = {
  lat: number;
  lng: number;
  timestamp: number;
  activity?: ActivityType;
  speedKmh?: number;
  altitudeM?: number;
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
    await AsyncStorage.setItem(key, JSON.stringify(compactPoints(points)));
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

function compactPoints(points: LocationPoint[]): LocationPoint[] {
  if (points.length <= MAX_STORED_POINTS_PER_DAY) return points;
  const step = (points.length - 1) / (MAX_STORED_POINTS_PER_DAY - 1);
  const compacted: LocationPoint[] = [];
  for (let i = 0; i < MAX_STORED_POINTS_PER_DAY; i++) {
    compacted.push(points[Math.min(Math.round(i * step), points.length - 1)]!);
  }
  return compacted;
}

/**
 * Compacts old raw GPS days before a new trip. Saved trips keep their
 * simplified route; raw history remains available to charts, sampled at a
 * bounded size.
 */
export async function compactStoredLocationHistory(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys())
      .filter(key => key.startsWith(KEY_PREFIX));
    for (const key of keys) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      const points = JSON.parse(raw) as LocationPoint[];
      if (!Array.isArray(points) || points.length <= MAX_STORED_POINTS_PER_DAY) continue;
      await AsyncStorage.setItem(key, JSON.stringify(compactPoints(points)));
    }
  } catch {
    // A malformed old day must not prevent a new trip from starting.
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

// Clé persistant le mode de trajet actif (voiture / moto / balade)
// — lue par la tâche background pour adapter les filtres.
export const TRIP_MODE_KEY = '@yoann2_trip_mode_active';

// ── Filtres GPS par mode ──────────────────────────────────────────────────────
// Mode normal (voiture / moto)
const MAX_ACCURACY_METERS = 50;
const MIN_DISTANCE_METERS = 15;
const MAX_SPEED_MS = 55.56; // 200 km/h

// Mode balade (piéton) — précision et seuils réduits
const WALKING_MAX_ACCURACY_METERS = 20;
const WALKING_MIN_DISTANCE_METERS = 1.5;
const WALKING_MAX_SPEED_MS = 6; // ~22 km/h max pour un piéton / jogger

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

// Returns the Location options adapted to current trip phase and mode.
// - idle    → economy mode (user-selected interval, balanced accuracy)
// - active  → dense mode (3s/2m for voiture/moto, 1s/1m for balade)
// - paused  → low-power mode (30s / 50m) — FGS reste actif pour garder le process vivant
//
async function buildLocationOptions(
  tripPhase: 'active' | 'paused' | 'idle',
  walkingMode?: boolean,
): Promise<Location.LocationTaskOptions> {
  const baseInterval = await getGpsInterval();
  const isActive = tripPhase === 'active';
  const isPaused = tripPhase === 'paused';
  return {
    accuracy: isActive ? Location.Accuracy.High : Location.Accuracy.Balanced,
    timeInterval: isActive
      ? (walkingMode ? 1_000 : 3_000)
      : isPaused ? 30_000 : baseInterval.timeIntervalMs,
    distanceInterval: isActive
      ? (walkingMode ? 1 : 2)
      : isPaused ? 50 : baseInterval.distanceIntervalM,
    ...(isActive && {
      activityType: walkingMode
        ? Location.ActivityType.Fitness
        : Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
    }),
    showsBackgroundLocationIndicator: isActive,
    foregroundService: {
      notificationTitle: 'Yoann2.0',
      notificationBody:  'GPS actif en arrière-plan',
      notificationColor: '#FFC107',
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

  const savedMode = (await AsyncStorage.getItem(TRIP_MODE_KEY).catch(() => null));
  const tripPhase = savedMode ? 'active' : 'idle';
  const isWalking = savedMode === 'balade';

  await AsyncStorage.setItem(TRACKING_STARTED_MODE_KEY, tripPhase).catch(() => {});
  _currentTripPhase = tripPhase;
  const opts = await buildLocationOptions(tripPhase, isWalking);
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

export async function startManualTracking(
  mode?: 'voiture' | 'moto' | 'balade',
): Promise<void> {
  const hasServices = await Location.hasServicesEnabledAsync();
  if (!hasServices) return;

  // Persiste le mode pour que la tâche background adapte ses filtres.
  // Si mode est undefined (reprise après pause), on conserve la valeur existante.
  if (mode !== undefined) {
    if (mode) {
      await AsyncStorage.setItem(TRIP_MODE_KEY, mode).catch(() => {});
    } else {
      await AsyncStorage.removeItem(TRIP_MODE_KEY).catch(() => {});
    }
  }

  // NE JAMAIS stop/start ici : startLocationUpdatesAsync sur une tâche déjà
  // enregistrée patche les options en place (startForeground même ID côté
  // Android). Un stop + start détruit le foreground service et Android 12+
  // INTERDIT d'en recréer un depuis l'arrière-plan hors fenêtre d'exemption
  // (~10 s après l'appui widget) → ForegroundServiceStartNotAllowedException,
  // pas de notification, pas de GPS.
  _currentTripPhase = 'active';
  const opts = await buildLocationOptions('active', mode === 'balade');
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
  _currentTripPhase = 'paused';
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

  // ── Mode actif (voiture / moto / balade) → adapte les filtres ────────────────
  const tripModeRaw = await AsyncStorage.getItem(TRIP_MODE_KEY).catch(() => null);
  const isWalkingMode = tripModeRaw === 'balade';
  const effectiveMaxAccuracy = isWalkingMode ? WALKING_MAX_ACCURACY_METERS : MAX_ACCURACY_METERS;
  const effectiveMinDistance = isWalkingMode ? WALKING_MIN_DISTANCE_METERS : MIN_DISTANCE_METERS;
  const effectiveMaxSpeed   = isWalkingMode ? WALKING_MAX_SPEED_MS        : MAX_SPEED_MS;

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
    if (accuracy != null && accuracy > effectiveMaxAccuracy) continue;

    // 2. Distance filter: skip micro-movements
    if (lastValid) {
      const distM = haversineKm(lastValid.lat, lastValid.lng, lat, lng) * 1000;
      const timeS = (timestamp - lastValid.timestamp) / 1000;

      if (distM < effectiveMinDistance) continue;
      // 3. Speed sanity filter: skip physically impossible jumps
      if (timeS > 0 && distM / timeS > effectiveMaxSpeed) continue;
    }

    const altM = loc.coords.altitude;
    const point: LocationPoint = {
      lat,
      lng,
      timestamp,
      activity: classifyActivity(speedMs),
      speedKmh: speedMs != null && speedMs >= 0 ? Math.round(speedMs * 3.6) : undefined,
      altitudeM: altM != null ? Math.round(altM) : undefined,
    };

    await appendPoint(point);

    // ── Suivi distance + notification FGS expo-location (throttlée à 15 s) ──
    if (manualActive && !manualPaused && lastValid) {
      // Début du segment actif (celui sans `end`) = moment où "play" a été pressé.
      // On n'additionne la distance que si lastValid date d'APRÈS ce début de segment,
      // pour éviter le saut fictif depuis la dernière position connue avant le trajet.
      const segs = manualParsed?.segments ?? [];
      const activeSegStart = segs.find(
        (s: { start: number; end?: number }) => s.end === undefined,
      )?.start ?? manualParsed?.startTime ?? 0;

      if (lastValid.timestamp >= activeSegStart) {
        _tripDistKm += haversineKm(lastValid.lat, lastValid.lng, lat, lng);
      }

      // Durée active = somme des segments (pauses exclues)
      let activeMs = 0;
      for (const s of segs) {
        activeMs += (s.end ?? timestamp) - s.start;
      }

      // Formate la durée hh:mm:ss / mm:ss
      const hh = Math.floor(activeMs / 3_600_000);
      const mm = Math.floor((activeMs % 3_600_000) / 60_000);
      const ss = Math.floor((activeMs % 60_000) / 1_000);
      const dur = hh > 0
        ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
        : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

      // Persiste la distance pour survivre à un redémarrage du process JS
      AsyncStorage.setItem(TRIP_DIST_KEY, String(_tripDistKm)).catch(() => {});

      // Rafraîchit le widget Android (km + durée) — throttlé à 1×/30 s pour
      // ne pas saturer le renderer natif à chaque point GPS.
      const nowMs = Date.now();
      if (nowMs - _lastWidgetUpdateMs >= WIDGET_UPDATE_THROTTLE_MS) {
        _lastWidgetUpdateMs = nowMs;
        updateTodoWidget().catch(() => {});
      }
    }

    lastValid = point;
    try {
      await AsyncStorage.setItem(LAST_VALID_KEY, JSON.stringify(point));
    } catch {}
  }

  await purgeOldData();
});
