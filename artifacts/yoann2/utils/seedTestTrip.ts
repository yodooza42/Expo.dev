import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Trip } from '@/types/trips';
import type { LocationPoint } from '@/utils/locationTracking';

const KEY_TRIPS = '@yoann2_trips';
const KEY_PREFIX = '@yoann2_location_';

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export const TEST_TRIP_ID = '__test_trip_yoann2__';

export async function seedTestTrip(): Promise<void> {
  const now = new Date();
  now.setHours(now.getHours() - 1);

  const startTs = now.getTime();
  const durationMs = 28 * 60 * 1000;
  const endTs = startTs + durationMs;

  const waypoints: Array<{ lat: number; lng: number; alt: number }> = [
    { lat: 49.1196, lng: 6.1758, alt: 175 },
    { lat: 49.1250, lng: 6.1900, alt: 195 },
    { lat: 49.1320, lng: 6.2050, alt: 220 },
    { lat: 49.1380, lng: 6.2200, alt: 260 },
    { lat: 49.1420, lng: 6.2350, alt: 295 },
    { lat: 49.1390, lng: 6.2500, alt: 318 },
    { lat: 49.1330, lng: 6.2620, alt: 305 },
    { lat: 49.1260, lng: 6.2700, alt: 280 },
    { lat: 49.1180, lng: 6.2750, alt: 255 },
    { lat: 49.1100, lng: 6.2680, alt: 235 },
    { lat: 49.1040, lng: 6.2560, alt: 215 },
    { lat: 49.1010, lng: 6.2420, alt: 200 },
    { lat: 49.1030, lng: 6.2280, alt: 190 },
    { lat: 49.1070, lng: 6.2150, alt: 185 },
    { lat: 49.1090, lng: 6.2000, alt: 182 },
    { lat: 49.1120, lng: 6.1850, alt: 178 },
  ];

  const speedProfile: Array<{ pct: number; kmh: number }> = [
    { pct: 0.00, kmh: 0 },
    { pct: 0.03, kmh: 25 },
    { pct: 0.08, kmh: 65 },
    { pct: 0.15, kmh: 85 },
    { pct: 0.20, kmh: 102 },
    { pct: 0.28, kmh: 95 },
    { pct: 0.32, kmh: 50 },
    { pct: 0.35, kmh: 15 },
    { pct: 0.38, kmh: 70 },
    { pct: 0.45, kmh: 110 },
    { pct: 0.52, kmh: 95 },
    { pct: 0.58, kmh: 72 },
    { pct: 0.62, kmh: 35 },
    { pct: 0.65, kmh: 0 },
    { pct: 0.68, kmh: 45 },
    { pct: 0.75, kmh: 90 },
    { pct: 0.82, kmh: 98 },
    { pct: 0.88, kmh: 75 },
    { pct: 0.92, kmh: 45 },
    { pct: 0.96, kmh: 20 },
    { pct: 1.00, kmh: 0 },
  ];

  function getSpeed(pct: number): number {
    for (let i = 1; i < speedProfile.length; i++) {
      const prev = speedProfile[i - 1]!;
      const next = speedProfile[i]!;
      if (pct <= next.pct) {
        const t = (pct - prev.pct) / (next.pct - prev.pct);
        const base = lerp(prev.kmh, next.kmh, t);
        const noise = (Math.sin(pct * 173.7) * 3 + Math.sin(pct * 97.3) * 2);
        return Math.max(0, base + noise);
      }
    }
    return 0;
  }

  function getWaypoint(pct: number): { lat: number; lng: number; alt: number } {
    const seg = pct * (waypoints.length - 1);
    const idx = Math.min(Math.floor(seg), waypoints.length - 2);
    const t = seg - idx;
    const a = waypoints[idx]!;
    const b = waypoints[idx + 1]!;
    const altNoise = Math.sin(pct * 53.1) * 4 + Math.sin(pct * 137.2) * 2;
    return {
      lat: lerp(a.lat, b.lat, t) + (Math.sin(pct * 211.3) * 0.0001),
      lng: lerp(a.lng, b.lng, t) + (Math.sin(pct * 173.7) * 0.0001),
      alt: Math.round(lerp(a.alt, b.alt, t) + altNoise),
    };
  }

  const N = 220;
  const points: LocationPoint[] = [];
  for (let i = 0; i < N; i++) {
    const pct = i / (N - 1);
    const wp = getWaypoint(pct);
    const spd = getSpeed(pct);
    points.push({
      lat: wp.lat,
      lng: wp.lng,
      timestamp: Math.round(startTs + pct * durationMs),
      speedKmh: parseFloat(spd.toFixed(1)),
      altitudeM: wp.alt,
      activity: spd < 5 ? 'unknown' : 'car',
    });
  }

  const trip: Trip = {
    id: TEST_TRIP_ID,
    startTime: startTs,
    endTime: endTs,
    distanceKm: 20.4,
    vehicle: 'car',
    pointCount: N,
    startLat: waypoints[0]!.lat,
    startLon: waypoints[0]!.lng,
    endLat: waypoints[waypoints.length - 1]!.lat,
    endLon: waypoints[waypoints.length - 1]!.lng,
    route: points
      .filter((_, i) => i % 4 === 0 || i === N - 1)
      .map(p => ({ lat: p.lat, lng: p.lng })),
    routeSource: 'gps',
    startAddress: 'Maison',
    endAddress: 'Travail',
    startPlaceId: undefined,
    endPlaceId: undefined,
    source: 'auto',
    labelId: undefined,
  };

  const dayKey = dateKey(new Date(startTs));
  const locationKey = KEY_PREFIX + dayKey;

  const existingRaw = await AsyncStorage.getItem(KEY_TRIPS);
  const existingTrips: Trip[] = existingRaw ? JSON.parse(existingRaw) : [];
  const filtered = existingTrips.filter(t => t.id !== TEST_TRIP_ID);
  filtered.push(trip);
  await AsyncStorage.setItem(KEY_TRIPS, JSON.stringify(filtered));

  const existingPtsRaw = await AsyncStorage.getItem(locationKey);
  const existingPts: LocationPoint[] = existingPtsRaw ? JSON.parse(existingPtsRaw) : [];
  const filteredPts = existingPts.filter(p => p.timestamp < startTs || p.timestamp > endTs);
  filteredPts.push(...points);
  filteredPts.sort((a, b) => a.timestamp - b.timestamp);
  await AsyncStorage.setItem(locationKey, JSON.stringify(filteredPts));
}

export async function removeTestTrip(): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY_TRIPS);
  if (!raw) return;
  const trips: Trip[] = JSON.parse(raw);
  await AsyncStorage.setItem(KEY_TRIPS, JSON.stringify(trips.filter(t => t.id !== TEST_TRIP_ID)));
}
