import type { Trip } from '@/types/trips';

export interface PhotoGpsPoint { lat: number; lng: number; timestamp: number }
export interface PhotoPlacement {
  routeIndex?: number;
  lat: number;
  lng: number;
  timestamp: number;
  method: 'time' | 'gps' | 'estimated' | 'manual';
}

/** EXIF dates use camera-local time unless an explicit UTC offset is supplied. */
export function parseExifDate(raw?: string, offset?: string): number | null {
  if (!raw) return null;
  if (/^\d{4}-/.test(raw) && /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const match = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const values = [y, mo, d, h, mi, s].map(Number);
  const check = new Date(Date.UTC(values[0]!, values[1]! - 1, values[2]!, values[3]!, values[4]!, values[5]!));
  if (check.getUTCFullYear() !== values[0] || check.getUTCMonth() + 1 !== values[1] ||
      check.getUTCDate() !== values[2] || check.getUTCHours() !== values[3] ||
      check.getUTCMinutes() !== values[4] || check.getUTCSeconds() !== values[5]) return null;
  if (offset && /^[+-]\d{2}:\d{2}$/.test(offset)) {
    const parsed = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const local = new Date(values[0]!, values[1]! - 1, values[2]!, values[3]!, values[4]!, values[5]!).getTime();
  return Number.isFinite(local) ? local : null;
}

export function photoTakenAt(exif?: Record<string, unknown> | null, creationTime?: number): number | undefined {
  const text = (key: string) => typeof exif?.[key] === 'string' ? exif[key] as string : undefined;
  const absolute = (raw?: string, offset?: string) => raw && (offset?.match(/^[+-]\d{2}:\d{2}$/) || /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw))
    ? parseExifDate(raw, offset) : null;
  const cameraUtc = absolute(text('DateTimeOriginal'), text('OffsetTimeOriginal') ?? text('OffsetTime'))
    ?? absolute(text('DateTime'), text('OffsetTime'));
  if (cameraUtc != null && cameraUtc > 0) return cameraUtc;
  // The gallery supplies an absolute epoch, avoiding a guess about the camera's timezone.
  if (creationTime != null && Number.isFinite(creationTime) && creationTime > 0) return creationTime;
  const parsed = parseExifDate(text('DateTimeOriginal'), text('OffsetTimeOriginal') ?? text('OffsetTime'))
    ?? parseExifDate(text('DateTime'), text('OffsetTime'));
  if (parsed != null && parsed > 0) return parsed;
  return undefined;
}

function validPoint(point: { lat: number; lng: number }) {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

/** Prefer real point clocks, then raw GPS; only untimed traces use an explicit estimate. */
export function locatePhotoOnTrip(trip: Trip, takenAt: number, gps: PhotoGpsPoint[] = []): PhotoPlacement | undefined {
  const route = trip.route;
  if (!Number.isFinite(takenAt) || !route || route.length < 2 ||
      takenAt < trip.startTime - 5 * 60000 || takenAt > trip.endTime + 5 * 60000) return undefined;
  const valid = route.flatMap((point, index) => validPoint(point) ? [{ ...point, index }] : []);
  if (valid.length < 2) return undefined;
  const timed = valid.filter(point => point.t != null && Number.isFinite(point.t));
  if (timed.length) {
    const point = timed.reduce((best, item) => Math.abs(item.t! - takenAt) < Math.abs(best.t! - takenAt) ? item : best);
    return { routeIndex: point.index, lat: point.lat, lng: point.lng, timestamp: takenAt, method: 'time' };
  }
  const raw = gps.filter(point => validPoint(point) && Number.isFinite(point.timestamp) &&
    point.timestamp >= trip.startTime && point.timestamp <= trip.endTime);
  const duration = trip.endTime - trip.startTime;
  const fraction = duration > 0 ? Math.max(0, Math.min(1, (takenAt - trip.startTime) / duration)) : 0;
  const expectedIndex = fraction * (route.length - 1);
  if (raw.length) {
    const point = raw.reduce((best, item) => Math.abs(item.timestamp - takenAt) < Math.abs(best.timestamp - takenAt) ? item : best);
    const distance = (item: { lat: number; lng: number }) =>
      (item.lat - point.lat) ** 2 + ((item.lng - point.lng) * Math.cos(point.lat * Math.PI / 180)) ** 2;
    const anchor = valid.reduce((best, item) => {
      const delta = distance(item) - distance(best);
      return delta < -1e-12 || (Math.abs(delta) <= 1e-12 && Math.abs(item.index - expectedIndex) < Math.abs(best.index - expectedIndex)) ? item : best;
    });
    return { routeIndex: anchor.index, lat: point.lat, lng: point.lng, timestamp: takenAt, method: 'gps' };
  }
  if (duration <= 0) return undefined;
  const estimatedIndex = Math.round(expectedIndex);
  const point = valid.reduce((best, item) => Math.abs(item.index - estimatedIndex) < Math.abs(best.index - estimatedIndex) ? item : best);
  return { routeIndex: point.index, lat: point.lat, lng: point.lng, timestamp: takenAt, method: 'estimated' };
}
