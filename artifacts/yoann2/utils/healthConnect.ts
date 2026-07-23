/**
 * Utilitaire Health Connect — lecture de la fréquence cardiaque.
 *
 * Health Connect est le hub de santé Android. Garmin Connect y écrit
 * automatiquement les données de la montre après synchronisation Bluetooth.
 *
 * Flux : Garmin Watch → (BT) → Garmin Connect → Health Connect → cette app
 */

import { Platform } from 'react-native';

export interface HrPoint {
  /** Timestamp Unix en ms */
  ts: number;
  /** Battements par minute */
  bpm: number;
}

export interface HrSummary {
  pts: HrPoint[];
  avgBpm: number;
  maxBpm: number;
  minBpm: number;
  /** Durée (ms) passée dans chaque zone, Z1..Z5 */
  zones: [number, number, number, number, number];
}

/**
 * Zones cardiaques par fréquence absolue (battements/min).
 * Ces seuils correspondent à un adulte moyen (FC max ~185 bpm).
 * Z1 Récup · Z2 Endurance · Z3 Tempo · Z4 Seuil · Z5 VO2max
 */
export const HR_ZONES = [
  { label: 'Z1', color: '#64B5F6', max: 115 },  // < 115 bpm — Récupération
  { label: 'Z2', color: '#66BB6A', max: 130 },  // 115-130   — Endurance
  { label: 'Z3', color: '#FFF176', max: 145 },  // 130-145   — Tempo
  { label: 'Z4', color: '#FFA726', max: 160 },  // 145-160   — Seuil
  { label: 'Z5', color: '#EF5350', max: Infinity }, // > 160  — VO2max
] as const;

export function hrZoneIndex(bpm: number): number {
  for (let i = 0; i < HR_ZONES.length; i++) {
    if (bpm < HR_ZONES[i]!.max) return i;
  }
  return HR_ZONES.length - 1;
}

/**
 * Initialise Health Connect et demande la permission de lecture FC.
 * Retourne true si la permission est accordée.
 */
export async function requestHeartRatePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const HC = await import('react-native-health-connect');
    const ok = await HC.initialize();
    if (!ok) return false;
    const granted = await HC.requestPermission([
      { accessType: 'read', recordType: 'HeartRate' },
    ]);
    return granted.some((g: { recordType: string }) => g.recordType === 'HeartRate');
  } catch (e) {
    console.warn('[HealthConnect] permission error', e);
    return false;
  }
}

/**
 * Lit tous les samples de fréquence cardiaque dans la fenêtre [startMs, endMs].
 * Retourne les points triés par timestamp, ou [] si unavailable/denied.
 */
export async function fetchHeartRateForTrip(
  startMs: number,
  endMs: number,
): Promise<HrPoint[]> {
  if (Platform.OS !== 'android') return [];
  try {
    const HC = await import('react-native-health-connect');
    const ok = await HC.initialize();
    if (!ok) return [];

    const result = await HC.readRecords('HeartRate', {
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
      },
    });

    const pts: HrPoint[] = [];
    for (const record of result.records) {
      for (const sample of (record as any).samples ?? []) {
        const ts = new Date(sample.time as string).getTime();
        const bpm = sample.beatsPerMinute as number;
        if (ts >= startMs && ts <= endMs && bpm > 0 && bpm < 250) {
          pts.push({ ts, bpm });
        }
      }
    }
    pts.sort((a, b) => a.ts - b.ts);
    return pts;
  } catch (e) {
    console.warn('[HealthConnect] read error', e);
    return [];
  }
}

/** Calcule le résumé FC (moy, max, min, zones) à partir des points bruts. */
export function computeHrSummary(pts: HrPoint[], startMs: number): HrSummary {
  if (pts.length === 0) {
    return { pts, avgBpm: 0, maxBpm: 0, minBpm: 0, zones: [0, 0, 0, 0, 0] };
  }

  let sum = 0, maxBpm = 0, minBpm = Infinity;
  const zones: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  for (let i = 0; i < pts.length; i++) {
    const { bpm, ts } = pts[i]!;
    sum += bpm;
    if (bpm > maxBpm) maxBpm = bpm;
    if (bpm < minBpm) minBpm = bpm;

    // Durée de ce segment = demi-intervalle avant + demi-intervalle après
    const prevTs = i > 0 ? pts[i - 1]!.ts : startMs;
    const nextTs = i < pts.length - 1 ? pts[i + 1]!.ts : ts;
    const halfBefore = (ts - prevTs) / 2;
    const halfAfter = (nextTs - ts) / 2;
    const segMs = halfBefore + halfAfter;

    zones[hrZoneIndex(bpm)] += segMs;
  }

  return {
    pts,
    avgBpm: Math.round(sum / pts.length),
    maxBpm,
    minBpm,
    zones,
  };
}
