import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALERT_KEY_PREFIX  = 'departure_alert_';
const ALERTS_INDEX_KEY  = 'departure_alerts_index';
const BUFFER_SECS       = 10 * 60;
const MORNING_HOURS     = [6, 7, 8, 9, 10];

export const DEPARTURE_CHECK_PREFIX = 'departure_check_';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DepartureAlertInput {
  id: string;
  title: string;
  date: string;
  time?: string;
  addressLat: number;
  addressLng: number;
}

export type DepartureAlertResult =
  | { ok: true; departureTime: Date; travelMin: number; routeCount: number }
  | { ok: false; reason: string };

interface AlertStore {
  apptId: string;
  apptTitle: string;
  apptDateMs: number;
  destLat: number;
  destLng: number;
  departureMs: number;
  travelMin: number;
  routeCount: number;
  /** Timestamp of last morning recalculation (undefined = initial scheduling only) */
  lastRecalcAt?: number;
}

// ── Public read type ──────────────────────────────────────────────────────────

export interface DepartureAlertInfo {
  departureMs: number;
  travelMin: number;
  routeCount: number;
  /** Whether a morning recalculation happened today */
  recalcToday: boolean;
}

// ── OSRM helper ───────────────────────────────────────────────────────────────

/**
 * Query OSRM with alternatives=true.
 * Returns the LONGEST duration among returned routes and the route count.
 * Returns { maxSecs: 0, count: 0 } on any failure.
 */
async function queryOsrm(
  fromLat: number, fromLng: number,
  toLat: number,  toLng: number,
): Promise<{ maxSecs: number; count: number }> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${fromLng},${fromLat};${toLng},${toLat}?overview=false&alternatives=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json() as any;
    if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      return { maxSecs: 0, count: 0 };
    }
    const durations = (data.routes as any[]).map(r => r.duration as number);
    return { maxSecs: Math.max(...durations), count: durations.length };
  } catch {
    clearTimeout(timer);
    return { maxSecs: 0, count: 0 };
  }
}

// ── AsyncStorage index helpers ────────────────────────────────────────────────

async function getAlertIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(ALERTS_INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function addToIndex(apptId: string): Promise<void> {
  try {
    const index = await getAlertIndex();
    if (!index.includes(apptId)) {
      index.push(apptId);
      await AsyncStorage.setItem(ALERTS_INDEX_KEY, JSON.stringify(index));
    }
  } catch {}
}

async function removeFromIndex(apptId: string): Promise<void> {
  try {
    const index = (await getAlertIndex()).filter(id => id !== apptId);
    await AsyncStorage.setItem(ALERTS_INDEX_KEY, JSON.stringify(index));
  } catch {}
}

// ── Notification helpers ──────────────────────────────────────────────────────

/** Write (or overwrite) the main departure notification */
async function writeMainNotification(store: AlertStore): Promise<void> {
  const identifier = `departure_${store.apptId}`;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  const departureDate = new Date(store.departureMs);
  const hh = String(departureDate.getHours()).padStart(2, '0');
  const mm = String(departureDate.getMinutes()).padStart(2, '0');
  const rdvTime = new Date(store.apptDateMs).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit',
  });
  const routesSuffix = store.routeCount > 1 ? ` des ${store.routeCount} itinéraires` : '';

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: `🚗 Départ pour : ${store.apptTitle}`,
      body:
        `Partez à ${hh}:${mm} pour arriver à ${rdvTime} ` +
        `(trajet ~${store.travelMin} min, le plus long${routesSuffix} + 10 min tampon)`,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: departureDate,
    },
  });
}

/** Schedule the 5 silent morning-check notifications for the RDV day */
async function writeMorningChecks(store: AlertStore): Promise<void> {
  const rdv = new Date(store.apptDateMs);
  const y   = rdv.getFullYear();
  const mo  = rdv.getMonth();
  const d   = rdv.getDate();

  for (const hour of MORNING_HOURS) {
    const triggerMs = new Date(y, mo, d, hour, 0, 0, 0).getTime();
    if (triggerMs <= Date.now()) continue;
    if (triggerMs >= store.apptDateMs) continue;

    const identifier = `${DEPARTURE_CHECK_PREFIX}${store.apptId}_${hour}`;
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `🗺️ RDV : ${store.apptTitle}`,
        body: `Recalcul de l'itinéraire en cours (RDV à ${
          rdv.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        })…`,
        sound: false,
        data: { action: 'departure_check', apptId: store.apptId },
        ...(Notifications.AndroidNotificationPriority
          ? { priority: Notifications.AndroidNotificationPriority.LOW }
          : {}),
      } as Notifications.NotificationContentInput,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(triggerMs),
      },
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Schedule a departure alert for an appointment.
 * Fetches 3 OSRM alternatives, retains the longest, schedules the main
 * departure notification + 5 silent morning recalculation checks.
 */
export async function scheduleDepartureAlert(
  appt: DepartureAlertInput,
): Promise<DepartureAlertResult> {
  if (!appt.time) return { ok: false, reason: 'Pas d\'heure définie pour ce RDV' };

  const [hStr, mStr] = appt.time.split(':');
  const apptDate = new Date(appt.date);
  apptDate.setHours(parseInt(hStr ?? '0', 10), parseInt(mStr ?? '0', 10), 0, 0);
  if (apptDate.getTime() <= Date.now()) {
    return { ok: false, reason: 'Ce rendez-vous est déjà passé' };
  }

  const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
  if (locStatus !== 'granted') return { ok: false, reason: 'Permission de localisation refusée' };

  let loc: Location.LocationObject;
  try {
    loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    return { ok: false, reason: 'Impossible d\'obtenir votre position' };
  }

  const { latitude: lat, longitude: lng } = loc.coords;
  const { maxSecs, count } = await queryOsrm(lat, lng, appt.addressLat, appt.addressLng);
  if (maxSecs === 0) {
    return { ok: false, reason: 'Impossible de calculer l\'itinéraire (réseau indisponible ou itinéraire introuvable)' };
  }

  const departureMs = apptDate.getTime() - (maxSecs + BUFFER_SECS) * 1000;
  if (departureMs <= Date.now()) {
    return { ok: false, reason: `Il est déjà l'heure de partir ! (trajet ~${Math.round(maxSecs / 60)} min)` };
  }

  const { status: notifStatus } = await Notifications.requestPermissionsAsync();
  if (notifStatus !== 'granted') return { ok: false, reason: 'Permission notifications refusée' };

  const store: AlertStore = {
    apptId:     appt.id,
    apptTitle:  appt.title,
    apptDateMs: apptDate.getTime(),
    destLat:    appt.addressLat,
    destLng:    appt.addressLng,
    departureMs,
    travelMin:  Math.round(maxSecs / 60),
    routeCount: count,
  };

  await AsyncStorage.setItem(`${ALERT_KEY_PREFIX}${appt.id}`, JSON.stringify(store));
  await addToIndex(appt.id);
  await writeMainNotification(store);
  await writeMorningChecks(store);

  return {
    ok: true,
    departureTime: new Date(departureMs),
    travelMin: store.travelMin,
    routeCount: count,
  };
}

/**
 * Recalculate departure time from a given position (or live GPS if no override).
 * Updates AsyncStorage + reschedules the main notification silently.
 * Called by morning check triggers and post-trip updates.
 */
export async function rescheduleIfNeeded(
  apptId: string,
  overrideLat?: number,
  overrideLng?: number,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(`${ALERT_KEY_PREFIX}${apptId}`);
    if (!raw) return;
    const store: AlertStore = JSON.parse(raw);
    if (store.apptDateMs <= Date.now()) return;

    let fromLat: number;
    let fromLng: number;

    if (overrideLat !== undefined && overrideLng !== undefined) {
      fromLat = overrideLat;
      fromLng = overrideLng;
    } else {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let loc: Location.LocationObject;
      try {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } catch {
        return;
      }
      fromLat = loc.coords.latitude;
      fromLng = loc.coords.longitude;
    }

    const { maxSecs, count } = await queryOsrm(fromLat, fromLng, store.destLat, store.destLng);
    if (maxSecs === 0) return;

    const newDepartureMs = store.apptDateMs - (maxSecs + BUFFER_SECS) * 1000;
    if (newDepartureMs <= Date.now()) return;

    const updated: AlertStore = {
      ...store,
      departureMs: newDepartureMs,
      travelMin:   Math.round(maxSecs / 60),
      routeCount:  count,
      lastRecalcAt: Date.now(),
    };

    await AsyncStorage.setItem(`${ALERT_KEY_PREFIX}${apptId}`, JSON.stringify(updated));
    await writeMainNotification(updated);
  } catch {
    // Non-fatal
  }
}

/**
 * Called after a trip is saved.
 * If there is an active departure alert for today, and the trip ended between
 * 10:00 and the current scheduled departure, reschedule from the trip's endpoint.
 */
export async function checkDepartureAlertAfterTrip(
  tripEndLat: number,
  tripEndLng: number,
  tripEndMs: number,
): Promise<void> {
  try {
    const index = await getAlertIndex();
    if (index.length === 0) return;

    const now  = new Date(tripEndMs);
    const hour = now.getHours() + now.getMinutes() / 60;
    if (hour < 10) return; // only act after 10:00

    for (const apptId of index) {
      const raw = await AsyncStorage.getItem(`${ALERT_KEY_PREFIX}${apptId}`);
      if (!raw) continue;
      const store: AlertStore = JSON.parse(raw);

      // Appointment must be today (same calendar day as trip end)
      const apptDay = new Date(store.apptDateMs);
      if (
        apptDay.getFullYear() !== now.getFullYear() ||
        apptDay.getMonth()    !== now.getMonth()    ||
        apptDay.getDate()     !== now.getDate()
      ) continue;

      // Trip must have ended before current scheduled departure
      if (tripEndMs >= store.departureMs) continue;

      // All conditions met — recalculate from trip's arrival point
      await rescheduleIfNeeded(apptId, tripEndLat, tripEndLng);
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Read the stored departure alert info for a given appointment.
 * Returns null if no alert is saved.
 * `recalcToday` is true when a morning recalculation occurred today.
 */
export async function getDepartureAlertInfo(
  apptId: string,
): Promise<DepartureAlertInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(`${ALERT_KEY_PREFIX}${apptId}`);
    if (!raw) return null;
    const store: AlertStore = JSON.parse(raw);

    const today = new Date();
    let recalcToday = false;
    if (store.lastRecalcAt !== undefined) {
      const d = new Date(store.lastRecalcAt);
      recalcToday =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth()    === today.getMonth()    &&
        d.getDate()     === today.getDate();
    }

    return {
      departureMs: store.departureMs,
      travelMin:   store.travelMin,
      routeCount:  store.routeCount,
      recalcToday,
    };
  } catch {
    return null;
  }
}

/**
 * Cancel all notifications (main + morning checks) and remove AsyncStorage entry.
 */
export async function cancelDepartureAlert(apptId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`departure_${apptId}`).catch(() => {});
  for (const hour of MORNING_HOURS) {
    await Notifications.cancelScheduledNotificationAsync(
      `${DEPARTURE_CHECK_PREFIX}${apptId}_${hour}`,
    ).catch(() => {});
  }
  await AsyncStorage.removeItem(`${ALERT_KEY_PREFIX}${apptId}`).catch(() => {});
  await removeFromIndex(apptId);
}
