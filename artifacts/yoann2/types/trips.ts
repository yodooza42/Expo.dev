export type VehicleType = 'car' | 'moto' | 'ignored';

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface Trip {
  id: string;
  startTime: number;
  endTime: number;
  distanceKm: number;
  vehicle: VehicleType | null;
  pointCount: number;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  /** Simplified GPS trace stored for map display. */
  route?: RoutePoint[];
  /** Reference to a TripCategory grouping similar routes. */
  categoryId?: string;
  /** True when this trip is a return journey relative to its category. */
  isReturn?: boolean;
  /** How the trip was created. */
  source?: 'auto' | 'manual';
}

/** A named group of trips with a similar start/end geography. */
export interface TripCategory {
  id: string;
  name: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  createdAt: number;
}

export interface MaintenanceItem {
  id: string;
  name: string;
  intervalKm: number;
  lastResetKm: number;
  /** Optional date-based alert: interval in days (e.g. 730 for CT tous les 2 ans) */
  intervalDays?: number;
  /** ISO timestamp of last reset for date-based tracking */
  lastResetDate?: number;
  /** ID of the task created by the maintenance scheduler (avoids duplicates) */
  linkedTaskId?: string;
}

export interface Vehicle {
  id: string;
  name: string;
  type: 'car' | 'moto' | 'other';
  costPerKm: number;
  odometerBaseKm: number;
  maintenanceItems: MaintenanceItem[];
  /** Project ID where maintenance tasks are auto-created */
  maintenanceProjectId?: string;
}

/** Array of vehicles — replaces the old {car, moto} fixed object */
export type VehicleSettings = Vehicle[];

export interface TripDetectionState {
  status: 'idle' | 'candidate' | 'active' | 'ending';
  candidateSince: number;
  startTime: number;
  startLat: number;
  startLon: number;
  lastLat: number;
  lastLon: number;
  lastTimestamp: number;
  lastMovingTime: number;
  distanceKm: number;
  pointCount: number;
  /** Raw GPS points accumulated during the current trip (capped at 3 000). */
  routePoints: RoutePoint[];
}
