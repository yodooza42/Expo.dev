import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FuelEntry } from '@/types/fuel';

const KEY = '@yoann2_fuel_log';
const KEY_LAST_FUEL_TYPE = '@yoann2_last_fuel_type';

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

export async function getLastFuelType(vehicleId: string): Promise<'gazole' | 'sp95' | 'sp98'> {
  try {
    const raw = await AsyncStorage.getItem(KEY_LAST_FUEL_TYPE);
    if (!raw) return 'sp95';
    const map = JSON.parse(raw) as Record<string, string>;
    const val = map[vehicleId];
    if (val === 'gazole' || val === 'sp95' || val === 'sp98') return val;
    return 'sp95';
  } catch {
    return 'sp95';
  }
}

export async function saveLastFuelType(vehicleId: string, fuelType: 'gazole' | 'sp95' | 'sp98'): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY_LAST_FUEL_TYPE);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    map[vehicleId] = fuelType;
    await AsyncStorage.setItem(KEY_LAST_FUEL_TYPE, JSON.stringify(map));
  } catch {}
}

export function computeFuelStats(
  entries: FuelEntry[],
  vehicleIds: string[],
): Record<string, { totalLiters: number; totalCost: number; count: number }> {
  const result: Record<string, { totalLiters: number; totalCost: number; count: number }> = {};
  for (const vid of vehicleIds) {
    const es = entries.filter(e => e.vehicleId === vid && !e.isExternal);
    result[vid] = {
      totalLiters: es.reduce((s, e) => s + e.liters, 0),
      totalCost: es.reduce((s, e) => s + e.totalCost, 0),
      count: es.length,
    };
  }
  return result;
}
