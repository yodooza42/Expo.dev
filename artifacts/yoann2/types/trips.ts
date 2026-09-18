export type VehicleType = 'car' | 'moto' | 'ignored';

export interface RoutePoint {
  lat: number;
  lng: number;
  /** Real GPS timestamp (ms epoch) of this point, when known (raw GPS trace only — absent on OSRM-matched/synthetic points). */
  t?: number;
}

/** A photo referenced from the device gallery (not copied into app storage) and attached to a trip. */
export interface TripPhoto {
  id: string;
  /** Gallery/content URI of the original asset — never copied locally. */
  uri: string;
  /** Moment the photo was taken (ms epoch), from EXIF/asset metadata when available. */
  takenAt: number;
  /** Optional note shown alongside this photo (e.g. in the Story Période). */
  note?: string;
  /**
   * Index into this trip's `route` array anchoring the photo to a specific GPS point,
   * chosen by tapping a point on the trip map. Becomes stale/ignored if the route is
   * later re-simplified or regenerated (point count/order changes) — not auto-migrated.
   */
  routeIndex?: number;
}

export interface RouteSegment {
  points: RoutePoint[];
  distanceKm: number;
  source: 'osrm' | 'gps';
}

export interface Trip {
  id: string;
  startTime: number;
  endTime: number;
  distanceKm: number;
  /** Vehicle ID (e.g. 'car', 'moto', or a custom uuid for walk / other vehicles). 'ignored' skips stats. */
  vehicle: string | null;
  pointCount: number;
  startLat?: number;
  startLon?: number;
  endLat?: number;
  endLon?: number;
  /** Simplified GPS trace stored for map display. */
  route?: RoutePoint[];
  /** Whether the route was road-matched by OSRM or kept as raw GPS trace. */
  routeSource?: 'osrm' | 'gps';
  /** Resolved departure address (known-place name or Nominatim reverse geocode). */
  startAddress?: string;
  /** Resolved arrival address (known-place name or Nominatim reverse geocode). */
  endAddress?: string;
  /** ID of the KnownPlace matching the departure, if any. */
  startPlaceId?: string;
  /** ID of the KnownPlace matching the arrival, if any. */
  endPlaceId?: string;
  /** Reference to a TripCategory grouping similar routes. */
  categoryId?: string;
  /** True when this trip is a return journey relative to its category. */
  isReturn?: boolean;
  /** How the trip was created. */
  source?: 'auto' | 'manual';
  /** Number of OSRM-matched segments (debug info for long trips). */
  osrmSegments?: number;
  /** IDs of walk participants present on this trip (only for walk-type vehicles). */
  walkParticipants?: string[];
  /** ID of the WalkRoute chosen for this trip. */
  walkRouteId?: string;
  /** ID of a user-defined TripLabel (free grouping, any itinerary). */
  labelId?: string;
  /** Intermediate stops for multi-waypoint manual trips. */
  intermediates?: Array<{ name: string; placeId?: string }>;
  /** Photos referenced from the device gallery, attached to this trip. */
  photos?: TripPhoto[];
  /** Trip caption/note — shown in place of the date label in the Story Période when set. */
  note?: string;
}

/** A user-defined free group that can contain trips with any itinerary. */
export interface TripLabel {
  id: string;
  name: string;
  createdAt: number;
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
  /** Estimated cost of this maintenance operation in EUR */
  cost?: number;
}

export interface VehicleInsurance {
  /** Annual premium in EUR */
  annualCost: number;
  /** ISO date "YYYY-MM-DD" of the last payment */
  paymentDate: string;
  /** BankTransaction id of the last recorded payment (to detect duplicates) */
  transactionId?: string;
}

export interface OdometerAdjustment {
  /** Timestamp when the user entered the recalibration. */
  at: number;
  /** The odometer reading the user typed (km). */
  realKm: number;
  /** The theoretical odometer at that moment (base + trips). */
  theoreticalKm: number;
  /** Gap = realKm - theoreticalKm (positive = the app was behind). */
  deltaKm: number;
}

/** A participant on a walk trip (human or dog). */
export interface WalkParticipant {
  id: string;
  name: string;
  type: 'human' | 'dog';
  /** For dogs: alert if not walked for this many days. */
  reminderDays?: number;
}

export interface Vehicle {
  id: string;
  name: string;
  type: 'car' | 'moto' | 'other' | 'walk';
  costPerKm: number;
  odometerBaseKm: number;
  maintenanceItems: MaintenanceItem[];
  /** Project ID where maintenance tasks are auto-created */
  maintenanceProjectId?: string;
  /** Whether costPerKm is manually entered or auto-calculated from fuel + maintenance */
  costMode?: 'manual' | 'auto';
  /** Annual insurance data */
  insurance?: VehicleInsurance;
  /** History of manual odometer recalibrations. */
  odometerAdjustments?: OdometerAdjustment[];
  /** Walk-type only: list of configurable participants. */
  walkParticipants?: WalkParticipant[];
}

/** Array of vehicles — replaces the old {car, moto} fixed object */
export type VehicleSettings = Vehicle[];

