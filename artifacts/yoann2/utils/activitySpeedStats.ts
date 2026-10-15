import type { ActivityKind } from '@/types/trips';
import { haversineKm } from '@/utils/haversine';

/** User-selected plausibility limits, not targets or speed recommendations. */
export const ACTIVITY_MAX_SPEED_KMH: Record<ActivityKind, number> = {
  walk: 21,
  run: 40,
  bike: 75,
  kayak: 15,
};

export function activitySpeedLimit(kind?: string): number {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_MAX_SPEED_KMH, kind ?? '')
    ? ACTIVITY_MAX_SPEED_KMH[kind as ActivityKind]
    // The widget starts GPS before the activity picker is confirmed. Do not
    // irreversibly throw away cycling points while that choice is still open.
    : ACTIVITY_MAX_SPEED_KMH.bike;
}

type SpeedPoint = {
  lat: number;
  lng: number;
  timestamp: number;
  speedKmh?: number;
};

/** Non-destructive view of usable samples; the original recording is untouched. */
export function filterActivitySpeedPoints<T extends SpeedPoint>(points: T[], kind: ActivityKind): T[] {
  const limit = activitySpeedLimit(kind);
  const accepted: T[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    if (point.speedKmh != null && (!Number.isFinite(point.speedKmh) || point.speedKmh < 0 || point.speedKmh > limit)) continue;
    const previous = accepted[accepted.length - 1];
    if (previous) {
      const dt = point.timestamp - previous.timestamp;
      if (dt <= 0) continue;
      const speed = haversineKm(previous.lat, previous.lng, point.lat, point.lng) * 3_600_000 / dt;
      if (speed > limit) continue;
    }
    accepted.push(point);
  }
  return accepted;
}

/**
 * Estimate movement on time intervals, not an arithmetic mean of samples.
 * Long GPS gaps are unknown, never silently classified as pauses.
 */
export function activitySpeedStats(
  points: SpeedPoint[],
  kind: ActivityKind,
  startTime: number,
  endTime: number,
  segments?: Array<{ start: number; end?: number }>,
) {
  const totalMs = Math.max(0, endTime - startTime);
  const active: Array<{ start: number; end: number }> = [];
  for (const segment of (segments ?? [{ start: startTime, end: endTime }])
    .map(item => ({ start: Math.max(startTime, item.start), end: Math.min(endTime, item.end ?? endTime) }))
    .filter(item => item.end > item.start)
    .sort((a, b) => a.start - b.start)) {
    const previous = active[active.length - 1];
    if (previous && segment.start <= previous.end) previous.end = Math.max(previous.end, segment.end);
    else active.push(segment);
  }
  const activeDuration = (start: number, end: number) => active.reduce((sum, segment) =>
    sum + Math.max(0, Math.min(end, segment.end) - Math.max(start, segment.start)), 0);
  const samples = filterActivitySpeedPoints(
    points.filter(point => point.timestamp >= startTime && point.timestamp <= endTime
      && active.some(segment => point.timestamp >= segment.start && point.timestamp <= segment.end)), kind,
  );
  let movingMs = 0;
  let pauseMs = totalMs - activeDuration(startTime, endTime);
  let movingKm = 0;
  let observedKm = 0;
  let maxSpeed = 0;
  const movingThreshold = kind === 'bike' || kind === 'run' ? 2 : 1;
  for (let index = 0; index < samples.length; index++) {
    const point = samples[index]!;
    maxSpeed = Math.max(maxSpeed, point.speedKmh ?? 0);
    if (index === 0) continue;
    const previous = samples[index - 1]!;
    const dt = point.timestamp - previous.timestamp;
    const km = haversineKm(previous.lat, previous.lng, point.lat, point.lng);
    // A max based on coordinates is only meaningful with continuous fixes.
    const activeMs = activeDuration(previous.timestamp, point.timestamp);
    if (dt > 60_000 || activeMs === 0) continue;
    const implicitSpeed = km * 3_600_000 / dt;
    const intervalSpeed = previous.speedKmh != null && point.speedKmh != null
      ? (previous.speedKmh + point.speedKmh) / 2
      : implicitSpeed;
    if (point.speedKmh == null) maxSpeed = Math.max(maxSpeed, implicitSpeed);
    observedKm += km * activeMs / dt;
    if (intervalSpeed > movingThreshold) {
      movingMs += activeMs;
      movingKm += km * activeMs / dt;
    } else {
      pauseMs += activeMs;
    }
  }
  const unknownMs = Math.max(0, totalMs - movingMs - pauseMs);
  return {
    totalMs, movingMs, pauseMs, unknownMs, maxSpeed, movingKm,
    averageMovingKmh: movingMs > 0 ? movingKm * 3_600_000 / movingMs : 0,
    averageTotalKmh: totalMs > 0 ? observedKm * 3_600_000 / totalMs : 0,
  };
}
