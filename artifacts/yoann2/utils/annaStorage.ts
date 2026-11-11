import AsyncStorage from '@react-native-async-storage/async-storage';

const ANNA_PLANNING_KEY = '@anna_nanny_days_v1';

/** Selected calendar days when Anna is at the nanny's. */
export type AnnaPlanning = Record<string, true>;

function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);
  return date.getFullYear() === year && date.getMonth() === month! - 1 && date.getDate() === day;
}

export async function loadAnnaPlanning(): Promise<AnnaPlanning> {
  try {
    const raw = await AsyncStorage.getItem(ANNA_PLANNING_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed)
      .filter(([date, selected]) => validDateKey(date) && selected === true)) as AnnaPlanning;
  } catch {
    return {};
  }
}

export async function saveAnnaPlanning(planning: AnnaPlanning): Promise<void> {
  await AsyncStorage.setItem(ANNA_PLANNING_KEY, JSON.stringify(planning));
}

export async function toggleAnnaDay(dateKey: string, selected: boolean): Promise<AnnaPlanning> {
  if (!validDateKey(dateKey)) throw new Error('Date de planning invalide.');
  const planning = await loadAnnaPlanning();
  if (selected) planning[dateKey] = true;
  else delete planning[dateKey];
  await saveAnnaPlanning(planning);
  return planning;
}
