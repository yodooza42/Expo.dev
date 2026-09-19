import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Trip, RouteSegment, RoutePoint, Vehicle, VehicleSettings, OdometerAdjustment } from '@/types/trips';

const KEY_TRIPS = '@yoann2_trips';
const KEY_VEHICLE_SETTINGS = '@yoann2_vehicle_settings';
const KEY_MIGRATION_GHOST_V1 = '@yoann2_migration_ghost_clean_v1';

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

export async function saveTrip(trip: Trip): Promise<boolean> {
  try {
    const trips = await getTrips();
    trips.push(trip);
    await AsyncStorage.setItem(KEY_TRIPS, JSON.stringify(trips));
    return true;
  } catch {
    return false;
  }
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

/**
 * Keep the denormalized route labels in sync when a known place is renamed.
 * The place ID remains the source of identity; the stored address is only a
 * fallback for older trips or when the place is later removed.
 */
export async function renamePlaceInTrips(placeId: string, newName: string): Promise<void> {
  try {
    const trips = await getTrips();
    let changed = false;
    const updated = trips.map(trip => {
      let next = trip;

      if (trip.startPlaceId === placeId && trip.startAddress !== newName) {
        next = { ...next, startAddress: newName };
      }
      if (trip.endPlaceId === placeId && next.endAddress !== newName) {
        next = { ...next, endAddress: newName };
      }

      if (trip.intermediates?.some(stop => stop.placeId === placeId && stop.name !== newName)) {
        next = {
          ...next,
          intermediates: trip.intermediates.map(stop =>
            stop.placeId === placeId ? { ...stop, name: newName } : stop,
          ),
        };
      }

      if (next !== trip) changed = true;
      return next;
    });

    if (changed) {
      await AsyncStorage.setItem(KEY_TRIPS, JSON.stringify(updated));
    }
  } catch {}
}

export async function deleteTrip(id: string): Promise<void> {
  try {
    const trips = await getTrips();
    await AsyncStorage.setItem(KEY_TRIPS, JSON.stringify(trips.filter(t => t.id !== id)));
  } catch {}
}


// ── Odometer helper ───────────────────────────────────────────────────────────

export function computeOdometer(
  trips: Trip[],
  vehicleId: string,
  baseKm: number,
  adjustments?: OdometerAdjustment[],
): number {
  const accumulated = trips
    .filter(t => t.vehicle === vehicleId)
    .reduce((sum, t) => sum + t.distanceKm, 0);

  let km = baseKm + accumulated;

  // Apply cumulative delta from all manual recalibrations.
  // Each adjustment already stores the gap at the time it was made;
  // summing them gives the total correction to apply to the theoretical odometer.
  if (adjustments && adjustments.length > 0) {
    const totalDelta = adjustments.reduce((s, a) => s + a.deltaKm, 0);
    km += totalDelta;
  }

  return Math.round(km * 10) / 10;
}

// ── Odometer recalibration ───────────────────────────────────────────────────────────────────────────

/**
 * Recalibrate a vehicle's odometer against the real compteur reading.
 *
 * @param vehicles   current vehicle settings array
 * @param vehicleId  id of the vehicle to recalibrate
 * @param realKm     km value read from the physical odometer
 * @param trips      all trips (needed to compute the theoretical km at this moment)
 *
 * The adjustment is APPENDED to the vehicle's history, not retroactive.
 * Past fuel-consumption calculations remain unchanged.
 */
export function recalibrateOdometer(
  vehicles: VehicleSettings,
  vehicleId: string,
  realKm: number,
  trips: Trip[],
): VehicleSettings {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return vehicles;

  const theoreticalKm = computeOdometer(
    trips, vehicleId, vehicle.odometerBaseKm, vehicle.odometerAdjustments,
  );
  const deltaKm = realKm - theoreticalKm;

  const adjustment: OdometerAdjustment = {
    at: Date.now(),
    realKm,
    theoreticalKm,
    deltaKm,
  };

  const prev = vehicle.odometerAdjustments ?? [];
  return vehicles.map(v =>
    v.id === vehicleId
      ? { ...v, odometerAdjustments: [...prev, adjustment] }
      : v,
  );
}

/**
 * Return a human-readable recalibration status message, or null if none.
 */
export function lastOdometerRecalStatus(
  vehicle?: Vehicle,
): { text: string; daysAgo: number } | null {
  if (!vehicle?.odometerAdjustments?.length) return null;
  const last = vehicle.odometerAdjustments[vehicle.odometerAdjustments.length - 1]!;
  const daysAgo = Math.round((Date.now() - last.at) / (24 * 3_600_000));
  const sign = last.deltaKm > 0 ? '+' : '';
  const text = `Dernier recalage ${daysAgo}j (${sign}${last.deltaKm.toFixed(1)} km)`;
  return { text, daysAgo };
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

// ── Ghost-route migration ─────────────────────────────────────────────────────

/**
 * Same detection logic as the JS `isGhostSeg` in buildTripInjectScript:
 * a segment is a phantom OSRM junction connector when it combines a
 * large distance (>100 m) with a sharp bearing change (≥110°), or is
 * simply very long (>3 km) with no directional context.
 */
function isGhostPoint(pts: RoutePoint[], i: number): boolean {
  if (i < 1 || i >= pts.length) return false;
  const a = pts[i - 1]!;
  const b = pts[i]!;
  const d0 = a.lat - b.lat;
  const d1 = a.lng - b.lng;
  const d2 = d0 * d0 + d1 * d1;

  const FAR = 0.027 * 0.027;   // >3 km → fantôme certain
  const MIN = 0.0009 * 0.0009; // <100 m → jamais fantôme

  if (d2 > FAR) return true;
  if (d2 < MIN) return false;
  if (i < 2 || i >= pts.length - 1) return false;

  const prev = pts[i - 2]!;
  const next = pts[i + 1]!;
  const capBefore = Math.atan2(a.lng - prev.lng, a.lat - prev.lat) * 180 / Math.PI;
  const capAfter  = Math.atan2(b.lng - a.lng,    b.lat - a.lat)    * 180 / Math.PI;
  const diff = Math.abs(capBefore - capAfter) % 360;
  return (diff > 180 ? 360 - diff : diff) >= 110;
}

/**
 * Remove ghost-connector points from a stored route array.
 * A ghost point is the re-snapped first point of an OSRM segment that
 * diverges from the previous segment's end, creating a phantom line.
 * We skip the point itself (not the segment): the route continues from
 * the previous correct endpoint directly to the next real road point.
 */
function cleanRoute(route: RoutePoint[]): RoutePoint[] {
  if (route.length < 3) return route;
  const out: RoutePoint[] = [route[0]!];
  for (let i = 1; i < route.length; i++) {
    if (!isGhostPoint(route, i)) {
      out.push(route[i]!);
    }
  }
  return out;
}

/**
 * One-time migration: clean ghost-connector points from all stored trip routes.
 * Idempotent — guarded by a migration key in AsyncStorage.
 */
export async function migrateCleanGhostRoutes(): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(KEY_MIGRATION_GHOST_V1);
    if (done === 'done') return;

    const trips = await getTrips();
    let changed = false;
    const cleaned = trips.map(trip => {
      if (!trip.route || trip.route.length < 3) return trip;
      const newRoute = cleanRoute(trip.route);
      if (newRoute.length === trip.route.length) return trip;
      changed = true;
      return { ...trip, route: newRoute };
    });

    if (changed) {
      await AsyncStorage.setItem(KEY_TRIPS, JSON.stringify(cleaned));
    }
    await AsyncStorage.setItem(KEY_MIGRATION_GHOST_V1, 'done');
  } catch {
    // Non-fatal — will retry on next launch
  }
}
