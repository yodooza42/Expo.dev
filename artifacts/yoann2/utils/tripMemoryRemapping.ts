import type { ActivityMoment, RoutePoint, Trip } from '@/types/trips';
import { locatePhotoOnTrip, type PhotoGpsPoint } from '@/utils/tripPhotoPlacement';

type Anchor = Pick<ActivityMoment, 'routeIndex' | 'lat' | 'lng' | 'placementMethod'>;

function validPosition<T extends { lat?: number; lng?: number }>(point?: T): point is T & { lat: number; lng: number } {
  return point != null && Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    Math.abs(point.lat!) <= 90 && Math.abs(point.lng!) <= 180;
}

function routePoint(route: RoutePoint[] | undefined, index?: number) {
  return index != null && Number.isInteger(index) && index >= 0 ? route?.[index] : undefined;
}

/** Rebuild only placement metadata; never change capture clocks or memory content. */
export function remapTripMemories(trip: Trip, route: RoutePoint[], gps: PhotoGpsPoint[] = []): Pick<Trip, 'photos' | 'activityMoments'> {
  const target = { ...trip, route };
  const remap = (anchor: Anchor, time?: number): Anchor => {
    const oldPoint = routePoint(trip.route, anchor.routeIndex);
    let position = validPosition(anchor) ? anchor : validPosition(oldPoint) ? oldPoint : undefined;
    // No method on a legacy anchor: it may have been a manual correction.
    const preserve = anchor.placementMethod === 'manual' ||
      (anchor.placementMethod == null && position != null);
    let method = preserve ? 'manual' as const : anchor.placementMethod;
    let automaticIndex: number | undefined;
    if (!preserve && time != null && Number.isFinite(time) && time > 0) {
      const placement = locatePhotoOnTrip(target, time, gps);
      // Retained route clocks locate the playback anchor, not the true location
      // between endpoints of a simplified straight segment. Ask the shared
      // placement utility for the timestamp-matched RAW GPS location separately.
      const rawPlacement = locatePhotoOnTrip({ ...target, route: route.map(point => ({ lat: point.lat, lng: point.lng })) }, time, gps);
      if (rawPlacement?.method === 'gps') {
        position = rawPlacement;
        automaticIndex = placement?.routeIndex ?? rawPlacement.routeIndex;
        method = placement?.method ?? 'gps';
      } else if (validPosition(anchor) && (anchor.placementMethod === 'time' || anchor.placementMethod === 'gps')) {
        // Raw GPS may have expired: a previously reliable location is still
        // better than moving the memory to a retained endpoint.
        position = anchor;
        automaticIndex = placement?.routeIndex;
      } else if (placement) {
        position = placement;
        automaticIndex = placement.routeIndex;
        method = placement.method;
      }
    }
    if (!position) return { routeIndex: undefined, lat: undefined, lng: undefined, placementMethod: anchor.placementMethod };
    // Geographic distance wins. At a repeated location (loop/out-and-back), prefer
    // the old anchor's GPS clock, otherwise its progress, NOT the photo's clock.
    const expected = automaticIndex ?? (oldPoint?.t != null && Number.isFinite(oldPoint.t)
      ? locatePhotoOnTrip(target, oldPoint.t, gps)?.routeIndex : undefined);
    const progressIndex = expected ?? (anchor.routeIndex != null && (trip.route?.length ?? 0) > 1
      ? anchor.routeIndex / (trip.route!.length - 1) * Math.max(0, route.length - 1) : 0);
    const distance = (point: RoutePoint) => (point.lat - position.lat) ** 2 +
      ((point.lng - position.lng) * Math.cos(position.lat * Math.PI / 180)) ** 2;
    let best: number | undefined;
    route.forEach((point, index) => {
      if (!validPosition(point)) return;
      if (best == null || distance(point) < distance(route[best]!) - 1e-12 ||
          (Math.abs(distance(point) - distance(route[best]!)) <= 1e-12 &&
            Math.abs(index - progressIndex) < Math.abs(best - progressIndex))) best = index;
    });
    return { routeIndex: best, lat: position.lat, lng: position.lng,
      placementMethod: method };
  };
  const photosById = new Map((trip.photos ?? []).map(photo => [photo.id, photo]));
  const linkedAnchors = new Map<string, Anchor>();
  const activityMoments = trip.activityMoments?.map(moment => {
    const photo = moment.photoId ? photosById.get(moment.photoId) : undefined;
    const legacyPhotoCorrection = photo?.placementMethod == null && photo?.routeIndex != null &&
      photo.routeIndex !== moment.routeIndex && validPosition(routePoint(trip.route, photo.routeIndex));
    const manualPhoto = photo?.placementMethod === 'manual' || legacyPhotoCorrection;
    // Legacy trip-map corrections changed only the photo index, even when the
    // moment was already manual. That differing photo index is the later edit.
    const anchor = legacyPhotoCorrection || (manualPhoto && moment.placementMethod !== 'manual')
      ? { ...photo!, placementMethod: 'manual' as const } : moment;
    // For a photo memory only its real capture time is trustworthy; a moment's
    // timestamp can be the review's default end time when photo metadata is absent.
    const time = photo ? (photo.takenAtEstimated ? undefined : photo.takenAt)
      : moment.placementMethod != null && moment.placementMethod !== 'manual' ? moment.timestamp : undefined;
    const next = remap(anchor, time);
    if (photo) linkedAnchors.set(photo.id, next);
    return { ...moment, ...next };
  });
  const photos = trip.photos?.map(photo => ({
    ...photo,
    ...(linkedAnchors.get(photo.id) ?? remap(photo, photo.takenAtEstimated ? undefined : photo.takenAt)),
  }));
  return { photos, activityMoments };
}
