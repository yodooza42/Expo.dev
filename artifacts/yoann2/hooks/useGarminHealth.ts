import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const GARMIN_STORAGE_KEY = '@yoann2_garmin_health';

export interface GarminHealthData {
  date: string;
  sleepScore: number | null;
  sleepDurationMin: number | null;
  sleepDeepMin: number | null;
  sleepLightMin: number | null;
  sleepRemMin: number | null;
  bodyBatteryMin: number | null;
  bodyBatteryMax: number | null;
  bodyBatteryCurrent: number | null;
  hrvStatus: string | null;
  stressAvg: number | null;
  steps: number | null;
  syncedAt: string;
}

export interface GarminTodayResponse {
  today: GarminHealthData | null;
  yesterday: GarminHealthData | null;
}

const API_BASE = process.env['EXPO_PUBLIC_API_BASE_URL'] ?? '/api';

async function fetchGarminToday(): Promise<GarminTodayResponse> {
  const res = await fetch(`${API_BASE}/garmin/today`);
  if (!res.ok) throw new Error(`Garmin API error: ${res.status}`);
  const data = (await res.json()) as GarminTodayResponse;
  await AsyncStorage.setItem(GARMIN_STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  return data;
}

export function useGarminHealth() {
  return useQuery<GarminTodayResponse, Error>({
    queryKey: ['garmin', 'today'],
    queryFn: fetchGarminToday,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function bodyBatteryColor(value: number | null | undefined): string {
  if (value == null) return '#9E9E9E';
  if (value >= 75) return '#4CAF50';
  if (value >= 50) return '#8BC34A';
  if (value >= 25) return '#FF9800';
  return '#F44336';
}

export function stressColor(value: number | null | undefined): string {
  if (value == null) return '#9E9E9E';
  if (value < 26) return '#4CAF50';
  if (value < 51) return '#8BC34A';
  if (value < 76) return '#FF9800';
  return '#F44336';
}

export function formatSleepDuration(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}
