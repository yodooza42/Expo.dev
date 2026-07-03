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
  /** Simplified GPS trace (Ramer-Douglas-Peucker, ~15m tolerance). Stored for future map display. */
  route?: RoutePoint[];
  /** Optional reference to a TripCategory grouping similar routes. */
  categoryId?: string;
  /** True when this trip is a return journey relative to its category (start/end swapped). */
  isReturn?: boolean;
}

/** A named group of trips with a similar start/end geography (within MATCH_RADIUS_M). */
export interface TripCategory {
  id: string;
  name: string;
  /** Anchor coordinates used for similarity matching */
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
}

export interface VehicleConfig {
  costPerKm: number;
  odometerBaseKm: number;
  maintenanceItems: MaintenanceItem[];
}

export interface VehicleSettings {
  car: VehicleConfig;
  moto: VehicleConfig;
}

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
