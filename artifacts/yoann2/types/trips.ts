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
}

export interface MaintenanceItem {
  id: string;
  name: string;
  intervalKm: number;
  lastResetKm: number;
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
