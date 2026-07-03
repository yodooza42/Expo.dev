import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FuelEntry } from '@/types/fuel';

const KEY = '@yoann2_fuel_log';

export async function getFuelEntries(): Promise<FuelEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FuelEntry[]) : [];
  } catch {
    return [];
  }
}

export async function saveFuelEntry(entry: FuelEntry): Promise<void> {
  try {
    const entries = await getFuelEntries();
    entries.push(entry);
    await AsyncStorage.setItem(KEY, JSON.stringify(entries));
  } catch {}
}

export async function deleteFuelEntry(id: string): Promise<void> {
  try {
    const entries = await getFuelEntries();
    await AsyncStorage.setItem(KEY, JSON.stringify(entries.filter(e => e.id !== id)));
  } catch {}
}

/** Returns total fuel cost and liters per vehicle. */
export function computeFuelStats(entries: FuelEntry[]): {
  car: { totalLiters: number; totalCost: number; count: number };
  moto: { totalLiters: number; totalCost: number; count: number };
} {
  const stat = (v: 'car' | 'moto') => {
    const es = entries.filter(e => e.vehicle === v);
    return {
      totalLiters: es.reduce((s, e) => s + e.liters, 0),
      totalCost: es.reduce((s, e) => s + e.liters * e.pricePerLiter, 0),
      count: es.length,
    };
  };
  return { car: stat('car'), moto: stat('moto') };
}
