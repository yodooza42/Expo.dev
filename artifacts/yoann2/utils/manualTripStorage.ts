import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@yoann2_manual_trip';

export interface TripSegment {
  /** Timestamp de début d'une phase active (GPS allumé). */
  start: number;
  /** Timestamp de fin — absent si le segment est toujours en cours. */
  end?: number;
}

export interface ManualTripState {
  active: boolean;
  paused: boolean;
  /** Vrai quand l'utilisateur est en train de choisir le mode (entre idle et active). */
  selecting?: boolean;
  /** Mode de trajet choisi. */
  tripMode?: 'voiture' | 'moto' | 'balade' | null;
  startTime: number;
  startLat: number;
  startLon: number;
  /** Phases de conduite active (GPS allumé). GPS est coupé pendant les pauses. */
  segments: TripSegment[];
}

export async function getManualTripState(): Promise<ManualTripState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ManualTripState>;
    if (!parsed.active && !parsed.selecting) return null;
    return {
      active: parsed.active ?? false,
      paused: parsed.paused ?? false,
      selecting: parsed.selecting ?? false,
      tripMode: parsed.tripMode ?? null,
      startTime: parsed.startTime ?? Date.now(),
      startLat: parsed.startLat ?? 0,
      startLon: parsed.startLon ?? 0,
      segments: Array.isArray(parsed.segments) ? parsed.segments : [],
    };
  } catch {
    return null;
  }
}

export async function saveManualTripState(state: ManualTripState): Promise<boolean> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export async function clearManualTripState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

export async function isManualTripActive(): Promise<boolean> {
  const state = await getManualTripState();
  return state !== null && state.active;
}

export async function getManualTripStatus(): Promise<'idle' | 'selecting' | 'active' | 'paused'> {
  const state = await getManualTripState();
  if (!state) return 'idle';
  if (state.selecting) return 'selecting';
  return state.paused ? 'paused' : 'active';
}
