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

export async function purgeOldTrips(keepDays = 90): Promise<void> {
  try {
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
    const trips = await getTrips();
    const kept = trips.filter(t => t.endTime > cutoff);
    await AsyncStorage.setItem(KEY_TRIPS, JSON.stringify(kept));
  } catch {}
}

export async function getVehicleSettings(): Promise<VehicleSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY_VEHICLE_SETTINGS);
    if (!raw) return DEFAULT_VEHICLE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<VehicleSettings>;
    return {
      car: { ...DEFAULT_VEHICLE_SETTINGS.car, ...(parsed.car ?? {}) },
      moto: { ...DEFAULT_VEHICLE_SETTINGS.moto, ...(parsed.moto ?? {}) },
    };
  } catch {
    return DEFAULT_VEHICLE_SETTINGS;
  }
}

export async function saveVehicleSettings(settings: VehicleSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_VEHICLE_SETTINGS, JSON.stringify(settings));
  } catch {}
}

export async function getTripDetectionState(): Promise<TripDetectionState> {
  try {
    const raw = await AsyncStorage.getItem(KEY_DETECTION_STATE);
    if (!raw) return { ...DEFAULT_DETECTION_STATE };
    return { ...DEFAULT_DETECTION_STATE, ...(JSON.parse(raw) as Partial<TripDetectionState>) };
  } catch {
    return { ...DEFAULT_DETECTION_STATE };
  }
}

export async function saveTripDetectionState(state: TripDetectionState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_DETECTION_STATE, JSON.stringify(state));
  } catch {}
}

export function computeOdometer(trips: Trip[], vehicle: 'car' | 'moto', baseKm: number): number {
  const tagged = trips.filter(t => t.vehicle === vehicle).reduce((s, t) => s + t.distanceKm, 0);
  return Math.round((baseKm + tagged) * 10) / 10;
}
