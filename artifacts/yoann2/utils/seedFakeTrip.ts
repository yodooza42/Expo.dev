import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LocationPoint } from '@/utils/locationTracking';
import { getTrips } from '@/utils/tripStorage';
import type { Trip, RoutePoint } from '@/types/trips';

const FAKE_TRIP_ID = '__fake_test_trip__';
const KEY_PREFIX   = '@yoann2_location_';

function dateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Trajet fictif : Bron → Lyon Part-Dieu via N6/A43 ~18 km
// Coordonnées réalistes autour de Lyon
const WAYPOINTS: RoutePoint[] = [
  { lat: 45.730, lng: 4.940 }, // Bron départ
  { lat: 45.733, lng: 4.920 },
  { lat: 45.736, lng: 4.905 },
  { lat: 45.740, lng: 4.890 },
  { lat: 45.745, lng: 4.875 }, // Rocade Est
  { lat: 45.750, lng: 4.862 },
  { lat: 45.755, lng: 4.852 },
  { lat: 45.758, lng: 4.842 },
  { lat: 45.762, lng: 4.835 }, // Approche Part-Dieu
  { lat: 45.764, lng: 4.828 }, // Part-Dieu arrivée
];

// Profil de vitesse par tranche (km/h)
const SPEED_PROFILE = [
  0, 15, 35, 65, 90, 110, 105, 95, 70, 50, 40, 30, 20, 10, 0,
];

// Profil d'altitude (m) — montée légère puis descente
const ALT_PROFILE = [
  192, 195, 200, 208, 215, 220, 218, 212, 205, 198, 190, 183, 180, 177, 175,
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateRoute(waypoints: RoutePoint[], totalPts: number): RoutePoint[] {
  const result: RoutePoint[] = [];
  const segs = waypoints.length - 1;
  for (let i = 0; i < totalPts; i++) {
    const t = i / (totalPts - 1);
    const segF = t * segs;
    const seg = Math.min(Math.floor(segF), segs - 1);
    const segT = segF - seg;
    result.push({
      lat: lerp(waypoints[seg]!.lat, waypoints[seg + 1]!.lat, segT),
      lng: lerp(waypoints[seg]!.lng, waypoints[seg + 1]!.lng, segT),
    });
  }
  return result;
}

function buildGpsPoints(startTs: number, durationMs: number, intervalMs = 8_000): LocationPoint[] {
  const count = Math.floor(durationMs / intervalMs);
  const routePts = interpolateRoute(WAYPOINTS, count);
  const result: LocationPoint[] = [];

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    // Interpole dans les profils
    const profileIdx = t * (SPEED_PROFILE.length - 1);
    const pi = Math.floor(profileIdx);
    const pt = profileIdx - pi;
    const spd = lerp(SPEED_PROFILE[pi]!, SPEED_PROFILE[Math.min(pi + 1, SPEED_PROFILE.length - 1)]!, pt);
    const alt = lerp(ALT_PROFILE[pi]!, ALT_PROFILE[Math.min(pi + 1, ALT_PROFILE.length - 1)]!, pt);

    // Petit bruit
    const noise = (Math.random() - 0.5) * 4;
    const altNoise = (Math.random() - 0.5) * 3;

    result.push({
      lat: routePts[i]!.lat + (Math.random() - 0.5) * 0.0002,
      lng: routePts[i]!.lng + (Math.random() - 0.5) * 0.0002,
      timestamp: startTs + i * intervalMs,
      speedKmh: Math.max(0, Math.round(spd + noise)),
      altitudeM: Math.round(alt + altNoise),
      activity: spd > 8 ? 'car' : 'unknown',
    });
  }
  return result;
}

export async function seedFakeTrip(): Promise<string> {
  // Heure de départ : aujourd'hui 08h15
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 15, 0).getTime();
  const end   = start + 28 * 60_000; // 28 minutes

  // Vérif : pas déjà seedé
  const existing = await getTrips();
  const already = existing.find(t => t.id === FAKE_TRIP_ID);
  if (already) return FAKE_TRIP_ID;

  // Trajet
  const trip: Trip = {
    id: FAKE_TRIP_ID,
    startTime: start,
    endTime: end,
    distanceKm: 18.3,
    vehicle: 'car',
    pointCount: 210,
    startLat: WAYPOINTS[0]!.lat,
    startLon: WAYPOINTS[0]!.lng,
    endLat: WAYPOINTS[WAYPOINTS.length - 1]!.lat,
    endLon: WAYPOINTS[WAYPOINTS.length - 1]!.lng,
    route: interpolateRoute(WAYPOINTS, 60),
    routeSource: 'osrm',
    startAddress: 'Bron Centre',
    endAddress: 'Lyon Part-Dieu',
    source: 'auto',
  };

  // Sauvegarder le trajet
  const trips = [...existing, trip];
  await AsyncStorage.setItem('@yoann2_trips', JSON.stringify(trips));

  // Sauvegarder les points GPS sur la bonne clé de jour
  const gpsPoints = buildGpsPoints(start, end - start);
  const dayK = dateKey(start);
  const storageKey = KEY_PREFIX + dayK;

  const rawDay = await AsyncStorage.getItem(storageKey);
  const existing_pts: LocationPoint[] = rawDay ? JSON.parse(rawDay) : [];

  // Éviter les doublons si on re-seed
  const filtered = existing_pts.filter(p => p.timestamp < start || p.timestamp > end);
  await AsyncStorage.setItem(storageKey, JSON.stringify([...filtered, ...gpsPoints]));

  return FAKE_TRIP_ID;
}

export async function deleteFakeTrip(): Promise<void> {
  const trips = await getTrips();
  await AsyncStorage.setItem('@yoann2_trips', JSON.stringify(trips.filter(t => t.id !== FAKE_TRIP_ID)));
}
