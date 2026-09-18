import { useCallback, useEffect, useState } from 'react';

import { tryRestoreFromLocalBackup } from '@/utils/locationBackup';
import {
  dateKey,
  haversineKm,
  isTrackingPaused,
  loadDayPoints,
  requestLocationPermissions,
  setTrackingPaused,
  startTracking,
  stopTracking,
  type LocationPoint,
} from '@/utils/locationTracking';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = '@yoann2_location_';

export type DayStats = {
  points: LocationPoint[];
  distanceKm: number;
  walkKm: number;
  carKm: number;
  firstTime: string | null;
  lastTime: string | null;
};

export type PeriodAvg = {
  days: number;
  avgKmPerDay: number;
  walkAvgKmPerDay: number;
  carAvgKmPerDay: number;
};

function calcDistance(points: LocationPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += haversineKm(a.lat, a.lng, b.lat, b.lng);
  }
  return Math.round(total * 10) / 10;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function todayKey(): string {
  return dateKey(new Date());
}

export function useLocationHistory() {
  const [selectedDay, setSelectedDay]   = useState<string>(todayKey());
  const [dayStats, setDayStats]         = useState<DayStats>({ points: [], distanceKm: 0, walkKm: 0, carKm: 0, firstTime: null, lastTime: null });
  const [periodAvg7,  setPeriodAvg7]    = useState<PeriodAvg>({ days: 7,  avgKmPerDay: 0, walkAvgKmPerDay: 0, carAvgKmPerDay: 0 });
  const [periodAvg30, setPeriodAvg30]   = useState<PeriodAvg>({ days: 30, avgKmPerDay: 0, walkAvgKmPerDay: 0, carAvgKmPerDay: 0 });
  const [paused, setPaused]             = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [loading, setLoading]           = useState(true);

  // Load day stats
  const loadDay = useCallback(async (day: string) => {
    setLoading(true);
    const points    = await loadDayPoints(day);
    const distanceKm = calcDistance(points);
    const walkPts   = points.filter(p => (p.activity ?? 'walk') === 'walk');
    const carPts    = points.filter(p => p.activity === 'car');
    const walkKm    = calcDistance(walkPts);
    const carKm     = calcDistance(carPts);
    const firstTime = points.length > 0 ? formatTime(points[0]!.timestamp) : null;
    const lastTime  = points.length > 0 ? formatTime(points[points.length - 1]!.timestamp) : null;
    setDayStats({ points, distanceKm, walkKm, carKm, firstTime, lastTime });
    setLoading(false);
  }, []);

  // Load period averages
  const loadPeriodAvgs = useCallback(async () => {
    const allKeys = await AsyncStorage.getAllKeys();
    const locKeys = allKeys.filter(k => k.startsWith(KEY_PREFIX));

    async function avgForDays(n: number): Promise<{ total: number; walk: number; car: number }> {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - n);
      const cutStr = dateKey(cutoff);
      const relevant = locKeys.filter(k => {
        const d = k.replace(KEY_PREFIX, '');
        return d >= cutStr;
      });
      if (relevant.length === 0) return { total: 0, walk: 0, car: 0 };
      let totalKm = 0;
      let walkKm = 0;
      let carKm = 0;
      for (const k of relevant) {
        const raw = await AsyncStorage.getItem(k);
        const pts: LocationPoint[] = raw ? JSON.parse(raw) : [];
        totalKm += calcDistance(pts);
        walkKm  += calcDistance(pts.filter(p => (p.activity ?? 'walk') === 'walk'));
        carKm   += calcDistance(pts.filter(p => p.activity === 'car'));
      }
      const round = (v: number) => Math.round((v / n) * 10) / 10;
      return { total: round(totalKm), walk: round(walkKm), car: round(carKm) };
    }

    const [r7, r30] = await Promise.all([avgForDays(7), avgForDays(30)]);
    setPeriodAvg7({ days: 7,  avgKmPerDay: r7.total,  walkAvgKmPerDay: r7.walk,  carAvgKmPerDay: r7.car });
    setPeriodAvg30({ days: 30, avgKmPerDay: r30.total, walkAvgKmPerDay: r30.walk, carAvgKmPerDay: r30.car });
  }, []);

  // Check permissions and paused state; restore backup if AsyncStorage is empty
  const init = useCallback(async () => {
    await tryRestoreFromLocalBackup();
    const p = await isTrackingPaused();
    setPaused(p);
    const fg = await import('expo-location').then(m => m.getForegroundPermissionsAsync());
    const bg = await import('expo-location').then(m => m.getBackgroundPermissionsAsync());
    setHasPermission(fg.status === 'granted' && bg.status === 'granted');
  }, []);

  useEffect(() => {
    init();
    loadDay(selectedDay);
    loadPeriodAvgs();
  }, [init, loadDay, loadPeriodAvgs, selectedDay]);

  // Ask permissions and start tracking
  const enableTracking = useCallback(async (): Promise<boolean> => {
    const granted = await requestLocationPermissions();
    setHasPermission(granted);
    if (granted) {
      await setTrackingPaused(false);
      setPaused(false);
      await startTracking();
    }
    return granted;
  }, []);

  const togglePause = useCallback(async () => {
    const next = !paused;
    await setTrackingPaused(next);
    setPaused(next);
    if (next) {
      await stopTracking();
    } else {
      await startTracking();
    }
  }, [paused]);

  // Navigate days
  const goToPrevDay = useCallback(() => {
    const d = new Date(selectedDay + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDay(dateKey(d));
  }, [selectedDay]);

  const goToNextDay = useCallback(() => {
    const today = todayKey();
    if (selectedDay >= today) return;
    const d = new Date(selectedDay + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDay(dateKey(d));
  }, [selectedDay]);

  // Find point closest to a given HH:MM time on the selected day
  const findPointByTime = useCallback((timeStr: string): LocationPoint | null => {
    if (dayStats.points.length === 0) return null;
    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr ?? '0', 10);
    const m = parseInt(mStr ?? '0', 10);
    const base = new Date(selectedDay + 'T00:00:00');
    const target = base.getTime() + (h * 60 + m) * 60000;
    let best = dayStats.points[0]!;
    let bestDiff = Math.abs(best.timestamp - target);
    for (const pt of dayStats.points) {
      const diff = Math.abs(pt.timestamp - target);
      if (diff < bestDiff) { best = pt; bestDiff = diff; }
    }
    return best;
  }, [dayStats.points, selectedDay]);

  const refresh = useCallback(() => {
    loadDay(selectedDay);
    loadPeriodAvgs();
  }, [loadDay, loadPeriodAvgs, selectedDay]);

  return {
    selectedDay,
    setSelectedDay,
    dayStats,
    periodAvg7,
    periodAvg30,
    paused,
    hasPermission,
    loading,
    goToPrevDay,
    goToNextDay,
    enableTracking,
    togglePause,
    findPointByTime,
    refresh,
  };
}
