import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Trip, TripDetectionState, Vehicle, VehicleSettings } from '@/types/trips';

const KEY_TRIPS = '@yoann2_trips';
const KEY_VEHICLE_SETTINGS = '@yoann2_vehicle_settings';
const KEY_DETECTION_STATE = '@yoann2_trip_detection_state';

const DEFAULT_DETECTION_STATE: TripDetectionState = {
  status: 'idle',
  candidateSince: 0,
  candidatePauseSince: 0,
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

export const DEFAULT_VEHICLES: Vehicle[] = [
  { id: 'car',  name: 'Doblo', type: 'car',  costPerKm: 0.15, odometerBaseKm: 0, maintenanceItems: [] },
  { id: 'moto', name: 'Msx',   type: 'moto', costPerKm: 0.10, odometerBaseKm: 0, maintenanceItems: [] },
];

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

// ── Odometer helper ───────────────────────────────────────────────────────────

export function computeOdometer(
  trips: Trip[],
  vehicleId: string,
  baseKm: number,
): number {
  const accumulated = trips
    .filter(t => t.vehicle === vehicleId)
    .reduce((sum, t) => sum + t.distanceKm, 0);
  return Math.round((baseKm + accumulated) * 10) / 10;
}

// ── Vehicle settings with migration from legacy {car, moto} format ────────────

export async function getVehicleSettings(): Promise<VehicleSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY_VEHICLE_SETTINGS);
    if (!raw) return structuredClone(DEFAULT_VEHICLES);

    const parsed: unknown = JSON.parse(raw);

    // New format — array of Vehicle
    if (Array.isArray(parsed)) {
      return parsed as VehicleSettings;
    }

    // Legacy format — { car: VehicleConfig, moto: VehicleConfig }
    const legacy = parsed as Record<string, {
      costPerKm?: number;
      odometerBaseKm?: number;
      maintenanceItems?: Vehicle['maintenanceItems'];
      maintenanceProjectId?: string;
    }>;

    const migrated: Vehicle[] = [
      {
        id: 'car',
        name: 'Doblo',
        type: 'car',
        costPerKm: legacy['car']?.costPerKm ?? 0.15,
        odometerBaseKm: legacy['car']?.odometerBaseKm ?? 0,
        maintenanceItems: legacy['car']?.maintenanceItems ?? [],
        maintenanceProjectId: legacy['car']?.maintenanceProjectId,
      },
      {
        id: 'moto',
        name: 'Msx',
        type: 'moto',
        costPerKm: legacy['moto']?.costPerKm ?? 0.10,
        odometerBaseKm: legacy['moto']?.odometerBaseKm ?? 0,
        maintenanceItems: legacy['moto']?.maintenanceItems ?? [],
        maintenanceProjectId: legacy['moto']?.maintenanceProjectId,
      },
    ];

    // Save migrated format immediately
    await AsyncStorage.setItem(KEY_VEHICLE_SETTINGS, JSON.stringify(migrated));
    return migrated;
  } catch {
    return structuredClone(DEFAULT_VEHICLES);
  }
}

export async function saveVehicleSettings(settings: VehicleSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_VEHICLE_SETTINGS, JSON.stringify(settings));
  } catch {}
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
