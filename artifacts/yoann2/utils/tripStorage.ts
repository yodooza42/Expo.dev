import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Trip, TripDetectionState, VehicleSettings } from '@/types/trips';

const KEY_TRIPS = '@yoann2_trips';
const KEY_VEHICLE_SETTINGS = '@yoann2_vehicle_settings';
const KEY_DETECTION_STATE = '@yoann2_trip_detection_state';

const DEFAULT_DETECTION_STATE: TripDetectionState = {
  status: 'idle',
  candidateSince: 0,
  startTime: 0,
  startLat: 0,
  startLon: 0,
  lastLat: 0,
  lastLon: 0,
  lastTimestamp: 0,
  lastMovingTime: 0,
  distanceKm: 0,
  pointCount: 0,
  routePoints: [],
};

export const DEFAULT_VEHICLE_SETTINGS: VehicleSettings = {
  car: {
    costPerKm: 0.15,
    odometerBaseKm: 0,
    maintenanceItems: [],
  },
  moto: {
    costPerKm: 0.10,
    odometerBaseKm: 0,
    maintenanceItems: [],
  },
};

export async function getTrips(): Promise<Trip[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_TRIPS);
    return raw ? (JSON.parse(raw) as Trip[]) : [];
  } catch {
    return [];
  }
}

export async function saveTrip(trip: Trip): Promise<void> {
  try {
    const trips = await getTrips();
    trips.push(trip);
    await AsyncStorage.setItem(KEY_TRIPS, JSON.stringify(trips));
  } catch {}
}

export async function updateTrip(id: string, updates: Partial<Trip>): Promise<void> {
  try {
    const trips = await getTrips();
    const idx = trips.findIndex(t => t.id === id);
    if (idx === -1) return;
    trips[idx] = { ...trips[idx]!, ...updates };
    await AsyncStorage.setItem(KEY_TRIPS, JSON.stringify(trips));
  } catch {}
}

export async function deleteTrip(id: string): Promise<void> {
  try {
    const trips = await getTrips();
    await AsyncStorage.setItem(KEY_TRIPS, JSON.stringify(trips.filter(t => t.id !== id)));
  } catch {}
}

export async function getTripDetectionState(): Promise<TripDetectionState> {
  try {
    const raw = await AsyncStorage.getItem(KEY_DETECTION_STATE);
    if (!raw) return { ...DEFAULT_DETECTION_STATE };
    const parsed = JSON.parse(raw) as TripDetectionState;
    // Migration: routePoints field was added later — ensure it always exists
    if (!Array.isArray(parsed.routePoints)) {
      parsed.routePoints = [];
    }
    return parsed;
  } catch {
    return { ...DEFAULT_DETECTION_STATE };
  }
}

export async function saveTripDetectionState(state: TripDetectionState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_DETECTION_STATE, JSON.stringify(state));
  } catch {}
}

// ── Helpers used by UI components ────────────────────────────────────────────

export function computeOdometer(
  trips: Trip[],
  vehicle: 'car' | 'moto',
  baseKm: number,
): number {
  const accumulated = trips
    .filter(t => t.vehicle === vehicle)
    .reduce((sum, t) => sum + t.distanceKm, 0);
  return Math.round((baseKm + accumulated) * 10) / 10;
}

export async function purgeOldTrips(maxAgeDays: number): Promise<void> {
  try {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const trips = await getTrips();
    const kept = trips.filter(t => t.endTime >= cutoff);
    if (kept.length !== trips.length) {
      await AsyncStorage.setItem(KEY_TRIPS, JSON.stringify(kept));
    }
  } catch {}
}

export async function getVehicleSettings(): Promise<VehicleSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY_VEHICLE_SETTINGS);
    return raw ? (JSON.parse(raw) as VehicleSettings) : DEFAULT_VEHICLE_SETTINGS;
  } catch {
    return DEFAULT_VEHICLE_SETTINGS;
  }
}

export async function saveVehicleSettings(settings: VehicleSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_VEHICLE_SETTINGS, JSON.stringify(settings));
  } catch {}
}
