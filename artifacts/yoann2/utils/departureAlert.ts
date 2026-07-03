import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

export interface DepartureAlertInput {
  id: string;
  title: string;
  date: string;
  time?: string;
  addressLat: number;
  addressLng: number;
}

export type DepartureAlertResult =
  | { ok: true; departureTime: Date; travelMin: number }
  | { ok: false; reason: string };

export async function scheduleDepartureAlert(
  appt: DepartureAlertInput,
): Promise<DepartureAlertResult> {
  if (!appt.time) return { ok: false, reason: 'Pas d\'heure définie pour ce RDV' };

  const [h, mStr] = appt.time.split(':');
  const apptDate = new Date(appt.date);
  apptDate.setHours(parseInt(h, 10), parseInt(mStr ?? '0', 10), 0, 0);
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
  const osrmUrl =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${lng},${lat};${appt.addressLng},${appt.addressLat}?overview=false`;

  let travelSecs = 0;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(osrmUrl, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json() as any;
    if (data.code === 'Ok' && data.routes?.[0]) {
      travelSecs = data.routes[0].duration as number;
    }
  } catch {
    return { ok: false, reason: 'Impossible de calculer l\'itinéraire (pas de connexion)' };
  }

  if (travelSecs === 0) return { ok: false, reason: 'Itinéraire introuvable via OSRM' };

  const BUFFER_SECS = 10 * 60;
  const departureMs = apptDate.getTime() - (travelSecs + BUFFER_SECS) * 1000;
  if (departureMs <= Date.now()) {
    const travelMin = Math.round(travelSecs / 60);
    return { ok: false, reason: `Il est déjà l'heure de partir ! (trajet ~${travelMin} min)` };
  }

  const { status: notifStatus } = await Notifications.requestPermissionsAsync();
  if (notifStatus !== 'granted') return { ok: false, reason: 'Permission notifications refusée' };

  const identifier = `departure_${appt.id}`;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  const travelMin = Math.round(travelSecs / 60);
  const departureDate = new Date(departureMs);

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: `🚗 Départ pour : ${appt.title}`,
      body: `Trajet estimé ${travelMin} min — partez maintenant pour arriver à l'heure !`,
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: departureDate },
  });

  return { ok: true, departureTime: departureDate, travelMin };
}

export async function cancelDepartureAlert(apptId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`departure_${apptId}`).catch(() => {});
}
