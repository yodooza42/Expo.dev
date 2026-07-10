import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@yoann2_consumption_log';

export type ConsumptionType = 'coffee' | 'cigarette';

export interface ConsumptionEntry {
  timestamp: string;
  type: ConsumptionType;
}

export async function addConsumption(type: ConsumptionType): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY).catch(() => null);
    const entries: ConsumptionEntry[] = raw ? (JSON.parse(raw) as ConsumptionEntry[]) : [];
    entries.push({ timestamp: new Date().toISOString(), type });
    await AsyncStorage.setItem(KEY, JSON.stringify(entries));
  } catch {}
}

export async function getConsumptionLog(): Promise<ConsumptionEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ConsumptionEntry[]) : [];
  } catch {
    return [];
  }
}

export async function getTodayEntries(): Promise<ConsumptionEntry[]> {
  const log = await getConsumptionLog();
  const today = new Date().toDateString();
  return log.filter(e => new Date(e.timestamp).toDateString() === today);
}

export async function getWeekEntries(): Promise<ConsumptionEntry[]> {
  const log = await getConsumptionLog();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return log.filter(e => new Date(e.timestamp).getTime() >= weekAgo);
}

export interface DayStats {
  date: string;
  coffee: number;
  cigarette: number;
  entries: ConsumptionEntry[];
}

export function groupByDay(entries: ConsumptionEntry[]): DayStats[] {
  const map = new Map<string, ConsumptionEntry[]>();
  for (const e of entries) {
    const key = new Date(e.timestamp).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries())
    .map(([date, es]) => ({
      date,
      coffee: es.filter(e => e.type === 'coffee').length,
      cigarette: es.filter(e => e.type === 'cigarette').length,
      entries: es.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
