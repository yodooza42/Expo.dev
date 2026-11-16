import type { Trip, TripPhoto } from '@/types/trips';
import type { PhotoSource, TripPhotoRecoveryEntry } from '@/types/tripPhotoRecovery';
import { importPhotos } from '@/utils/library/importPhoto';
import { tripFolder } from '@/utils/library/placement';
import { getTrips, updateTrip } from '@/utils/tripStorage';
import { tripEvents } from '@/utils/tripEvents';

function sourceOf(photo: TripPhoto): PhotoSource {
  return { uri: photo.uri, ...(photo.galleryMetadata ? { galleryMetadata: { ...photo.galleryMetadata } } : {}) };
}

function sameSource(photo: PhotoSource, expected: PhotoSource) {
  const a = photo.galleryMetadata ?? {}, b = expected.galleryMetadata ?? {};
  return photo.uri === expected.uri
    && [...new Set([...Object.keys(a), ...Object.keys(b)])].every(key =>
      a[key as keyof typeof a] === b[key as keyof typeof b]);
}

/** Explicit user selection only; retain the existing souvenir's identity and anchors. */
export async function relinkTripPhoto(
  tripId: string, photoId: string, source: string,
  options: {
    metadata?: TripPhoto['galleryMetadata']; isCurrent?: () => boolean; expectedUri?: string;
    expectedPhoto?: TripPhoto; automatic?: boolean;
  } = {},
) {
  const before = (await getTrips()).find(trip => trip.id === tripId);
  const initial = before?.photos?.find(photo => photo.id === photoId);
  if (!initial) {
    throw new Error('Ce souvenir est introuvable. Aucune photo n’a été ajoutée.');
  }
  const { imported, failed } = await importPhotos(
    [{ uri: source, takenAt: options.metadata?.takenAt, originalName: options.metadata?.filename }], tripFolder(before!),
  );
  if (!imported[0]) throw new Error(failed[0] ?? 'Copie dans Yoann2.0 impossible.');
  const uri = imported[0].ref;
  if (options.isCurrent && !options.isCurrent()) throw new Error('Recherche annulée. Ce lien n’a pas été modifié.');
  let result!: Trip;
  await updateTrip(tripId, current => {
    if (options.isCurrent && !options.isCurrent()) throw new Error('Recherche annulée. Ce lien n’a pas été modifié.');
    const existing = current.photos?.find(photo => photo.id === photoId);
    if (!existing) throw new Error('Ce souvenir a été supprimé pendant la sélection.');
    const expected = options.expectedPhoto ?? initial;
    if ((options.expectedUri != null && existing.uri !== options.expectedUri)
      || !sameSource(existing, expected) || existing.recoveryRevision !== expected.recoveryRevision) {
      throw new Error('Ce souvenir a changé depuis la recherche. Relance la recherche pour ne pas écraser sa nouvelle photo.');
    }
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 11);
    const replacement = {
      ...existing, uri, recoveryRevision: id,
      ...(options.metadata ? { galleryMetadata: { ...options.metadata } } : {}),
    };
    const entry: TripPhotoRecoveryEntry = {
      id, photoId, repairedAt: Date.now(), before: sourceOf(existing), after: sourceOf(replacement),
      context: {
        automatic: options.automatic ?? false, source,
        tripStartTime: current.startTime, tripEndTime: current.endTime,
        note: existing.note, expectedAt: existing.takenAt,
      },
    };
    const patch = {
      photos: current.photos!.map(photo => photo.id === photoId ? replacement : photo),
      photoRecoveryHistory: [...(current.photoRecoveryHistory ?? []), entry],
    };
    result = { ...current, ...patch };
    return patch;
  }, true);
  tripEvents.emitTripUpdated();
  return result;
}

