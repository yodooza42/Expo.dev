import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@yoann2_manual_trip';

export interface ManualTripState {
  active: boolean;
  startTime: number;
  startLat: number;
  startLon: number;
}

export async function getManualTripState(): Promise<ManualTripState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ManualTripState;
    return parsed.active ? parsed : null;
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
