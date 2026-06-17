import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const HEALTH_CONNECT_STORAGE_KEY = '@yoann2_health_connect';
const LEGACY_HEALTH_KEY = '@yoann2_garmin_health';

export interface HealthConnectData {
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
  heartRateAvg: number | null;
  syncedAt: string;
}

export interface HealthConnectResponse {
  today: HealthConnectData | null;
  yesterday: HealthConnectData | null;
}

const STAGE_LIGHT = 4;
const STAGE_DEEP  = 5;
const STAGE_REM   = 6;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDayISO(d: Date): string {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r.toISOString();
}

function endOfDayISO(d: Date): string {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r.toISOString();
}

function hrvRmssdToStatus(rmssd: number): string {
  if (rmssd < 20) return 'Faible';
  if (rmssd < 50) return 'Moyen';
  if (rmssd < 80) return 'Équilibré';
  return 'Optimal';
}

async function readHealthConnectData(): Promise<HealthConnectResponse> {
  const hc = await import('react-native-health-connect');

  const initialized = await hc.initialize();
  if (!initialized) throw new Error('Health Connect non disponible');

  await hc.requestPermission([
    { accessType: 'read', recordType: 'SleepSession' },
    { accessType: 'read', recordType: 'Steps' },
    { accessType: 'read', recordType: 'HeartRate' },
    { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  ]);

  const now       = new Date();
  const today     = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  let stepsToday: number | null = null;
  try {
    const { records } = await hc.readRecords('Steps', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startOfDayISO(today),
        endTime:   endOfDayISO(today),
      },
    });
    const total = (records as Array<{ count: number }>).reduce(
      (s, r) => s + (r.count ?? 0), 0,
    );
    if (total > 0) stepsToday = total;
  } catch {}

  let sleepDurationMin: number | null = null;
  let sleepDeepMin:     number | null = null;
  let sleepLightMin:    number | null = null;
  let sleepRemMin:      number | null = null;
  let sleepScore:       number | null = null;
  let sleepDate: string = isoDate(yesterday);

  try {
    const sleepStart = new Date(yesterday);
    sleepStart.setHours(18, 0, 0, 0);

    const { records } = await hc.readRecords('SleepSession', {
      timeRangeFilter: {
        operator: 'between',
        startTime: sleepStart.toISOString(),
        endTime:   endOfDayISO(today),
      },
    });

    type SleepStage = { startTime: string; endTime: string; stage: number };
    type SleepSession = { startTime: string; endTime: string; stages?: SleepStage[] };

    if ((records as unknown[]).length > 0) {
      const session = (records as SleepSession[]).reduce((best, r) => {
        const dur     = new Date(r.endTime).getTime() - new Date(r.startTime).getTime();
        const bestDur = new Date(best.endTime).getTime() - new Date(best.startTime).getTime();
        return dur > bestDur ? r : best;
      });

      const durationMs = new Date(session.endTime).getTime() - new Date(session.startTime).getTime();
      sleepDurationMin = Math.round(durationMs / 60000);
      sleepDate        = isoDate(new Date(session.startTime));

      if (Array.isArray(session.stages)) {
        for (const stage of session.stages) {
          const stageDurMin = Math.round(
            (new Date(stage.endTime).getTime() - new Date(stage.startTime).getTime()) / 60000,
          );
          if (stage.stage === STAGE_DEEP)       sleepDeepMin  = (sleepDeepMin  ?? 0) + stageDurMin;
          else if (stage.stage === STAGE_LIGHT) sleepLightMin = (sleepLightMin ?? 0) + stageDurMin;
          else if (stage.stage === STAGE_REM)   sleepRemMin   = (sleepRemMin   ?? 0) + stageDurMin;
        }
      }

      sleepScore = Math.min(100, Math.round((sleepDurationMin / 480) * 100));
    }
  } catch {}

  let hrvStatus: string | null = null;
  try {
    const { records } = await hc.readRecords('HeartRateVariabilityRmssd', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startOfDayISO(today),
        endTime:   endOfDayISO(today),
      },
    });
    if ((records as unknown[]).length > 0) {
      const latest = (records as Array<{ heartRateVariabilityMillis?: number }>)[records.length - 1];
      const rmssd  = latest?.heartRateVariabilityMillis ?? null;
      if (rmssd != null) hrvStatus = hrvRmssdToStatus(rmssd);
    }
  } catch {}

  let heartRateAvg: number | null = null;
  try {
    const { records } = await hc.readRecords('HeartRate', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startOfDayISO(today),
        endTime:   endOfDayISO(today),
      },
    });
    type HRRecord = { samples: Array<{ beatsPerMinute: number }> };
    const allSamples = (records as HRRecord[]).flatMap(r => r.samples ?? []);
    if (allSamples.length > 0) {
      const sum = allSamples.reduce((s, sample) => s + sample.beatsPerMinute, 0);
      heartRateAvg = Math.round(sum / allSamples.length);
    }
  } catch {}

  const todayData: HealthConnectData = {
    date:               isoDate(today),
    sleepScore:         null,
    sleepDurationMin:   null,
    sleepDeepMin:       null,
    sleepLightMin:      null,
    sleepRemMin:        null,
    bodyBatteryMin:     null,
    bodyBatteryMax:     null,
    bodyBatteryCurrent: null,
    hrvStatus,
    stressAvg:          null,
    steps:              stepsToday,
    heartRateAvg,
    syncedAt:           now.toISOString(),
  };

  const yesterdayData: HealthConnectData | null = sleepDurationMin != null
    ? {
        date:               sleepDate,
        sleepScore,
        sleepDurationMin,
        sleepDeepMin,
        sleepLightMin,
        sleepRemMin,
        bodyBatteryMin:     null,
        bodyBatteryMax:     null,
        bodyBatteryCurrent: null,
        hrvStatus:          null,
        stressAvg:          null,
        steps:              null,
        heartRateAvg:       null,
        syncedAt:           now.toISOString(),
      }
    : null;

  return { today: todayData, yesterday: yesterdayData };
}

export function useHealthConnect() {
  const [data,      setData]      = useState<HealthConnectResponse | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await readHealthConnectData();
      setData(result);
      await AsyncStorage.setItem(HEALTH_CONNECT_STORAGE_KEY, JSON.stringify(result)).catch(() => {});
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      try {
        const cached = await AsyncStorage.getItem(HEALTH_CONNECT_STORAGE_KEY);
        if (cached) setData(JSON.parse(cached) as HealthConnectResponse);
      } catch {}
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadCached() {
      try {
        let cached = await AsyncStorage.getItem(HEALTH_CONNECT_STORAGE_KEY);
        if (!cached) {
          const legacy = await AsyncStorage.getItem(LEGACY_HEALTH_KEY);
          if (legacy) {
            cached = legacy;
            await AsyncStorage.setItem(HEALTH_CONNECT_STORAGE_KEY, legacy).catch(() => {});
            await AsyncStorage.removeItem(LEGACY_HEALTH_KEY).catch(() => {});
          }
        }
        if (cached) {
          try { setData(JSON.parse(cached) as HealthConnectResponse); } catch {}
        }
      } catch {}
    }
    void loadCached();
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
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
