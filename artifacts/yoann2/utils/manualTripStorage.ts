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
    if (!parsed.active) return null;
    // Compatibilité ascendante : anciens états sans `paused`/`segments`
    return {
      active: true,
      paused: parsed.paused ?? false,
      startTime: parsed.startTime ?? Date.now(),
      startLat: parsed.startLat ?? 0,
      startLon: parsed.startLon ?? 0,
      segments: Array.isArray(parsed.segments) ? parsed.segments : [],
    };
  } catch {
    return null;
  }
}

export async function saveManualTripState(state: ManualTripState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
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

export async function getManualTripStatus(): Promise<'idle' | 'active' | 'paused'> {
  const state = await getManualTripState();
  if (!state) return 'idle';
  return state.paused ? 'paused' : 'active';
}
