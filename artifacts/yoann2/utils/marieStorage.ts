import AsyncStorage from '@react-native-async-storage/async-storage';

const MARIE_KEY = '@marie_planning_v1';

export type Shift = 'PB' | 'PD';

export type MariePlanning = Record<string, Shift>;

export const SHIFT_TIMES: Record<Shift, { start: string; end: string; label: string; color: string }> = {
  PB: { start: '07:00', end: '14:40', label: 'Matin (PB)', color: '#2196F3' },
  PD: { start: '12:30', end: '19:40', label: 'Après-midi (PD)', color: '#FF9800' },
};

export async function loadMariePlanning(): Promise<MariePlanning> {
  try {
    const raw = await AsyncStorage.getItem(MARIE_KEY);
    return raw ? (JSON.parse(raw) as MariePlanning) : {};
  } catch {
    return {};
  }
}

export async function saveMariePlanning(planning: MariePlanning): Promise<void> {
  await AsyncStorage.setItem(MARIE_KEY, JSON.stringify(planning));
}

export async function setMarieDay(date: string, shift: Shift | null): Promise<MariePlanning> {
  const planning = await loadMariePlanning();
  if (shift) {
    planning[date] = shift;
  } else {
    delete planning[date];
  }
  await saveMariePlanning(planning);
  return planning;
}
