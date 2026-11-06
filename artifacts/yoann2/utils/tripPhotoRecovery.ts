import type { Trip, TripPhoto } from '@/types/trips';
import type { PhotoSource, TripPhotoRecoveryEntry } from '@/types/tripPhotoRecovery';
import type { RecoverResult } from '@/utils/photoStorage';
import { photoCandidates, photoExists, photoFilename } from '@/utils/photoReferences';
import { getTrips, updateTrip } from '@/utils/tripStorage';
import { tripEvents } from '@/utils/tripEvents';
import { protectPhoto } from '@/utils/photoProtection';

function sourceOf(photo: TripPhoto): PhotoSource {
  return { uri: photo.uri, ...(photo.galleryMetadata ? { galleryMetadata: { ...photo.galleryMetadata } } : {}) };
}

function sameSource(photo: PhotoSource, expected: PhotoSource) {
  const a = photo.galleryMetadata ?? {}, b = expected.galleryMetadata ?? {};
  return photo.uri === expected.uri
    && [...new Set([...Object.keys(a), ...Object.keys(b)])].every(key =>
      a[key as keyof typeof a] === b[key as keyof typeof b]);
}

export function canUndoPhotoRecovery(photo: TripPhoto | undefined, entry: TripPhotoRecoveryEntry) {
  return !!photo && entry.undoneAt == null && photo.recoveryRevision === entry.id && sameSource(photo, entry.after);
}

export async function tripPhotoSourceReadable(uri: string) {
  for (const candidate of await photoCandidates(uri)) if (await photoExists(candidate)) return true;
  return false;
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
  const uri = await protectPhoto(source, { project: 'Trajets', folder: tripId });
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

/** Restore only source fields, never delete bytes or restore stale notes/anchors. */
export async function undoTripPhotoRecovery(tripId: string, recoveryId: string) {
  let restored!: TripPhoto;
  await updateTrip(tripId, current => {
    const entry = current.photoRecoveryHistory?.find(value => value.id === recoveryId);
    if (!entry) throw new Error('Ce rattachement est introuvable dans l’historique local.');
    const photo = current.photos?.find(value => value.id === entry.photoId);
    if (!canUndoPhotoRecovery(photo, entry)) {
      throw new Error('Annulation impossible : ce souvenir a été supprimé, déjà annulé ou sa source a changé depuis ce rattachement.');
    }
    // A fresh revision also prevents an older undo from becoming valid again (ABA).
    restored = { ...photo!, uri: entry.before.uri, recoveryRevision: `undo-${entry.id}` };
    delete restored.galleryMetadata;
    if (entry.before.galleryMetadata) restored.galleryMetadata = { ...entry.before.galleryMetadata };
    return {
      photos: current.photos!.map(value => value.id === entry.photoId ? restored : value),
      photoRecoveryHistory: current.photoRecoveryHistory!.map(value =>
        value.id === recoveryId ? { ...value, undoneAt: Date.now() } : value),
    };
  }, true);
  tripEvents.emitTripUpdated();
  return restored;
}

/** Match only exact filenames inside this trip's folder; never guess from dates. */
export async function repairTripPhotos(photos: TripPhoto[], candidates: string[]) {
  const byName = new Map<string, string[]>();
  for (const uri of new Set(candidates)) {
    if (!await photoExists(uri)) continue;
    const name = photoFilename(uri);
    byName.set(name, [...(byName.get(name) ?? []), uri]);
  }
  const replacements = new Map<string, string>();
  let missing = 0;
  for (const photo of photos) {
    if (await photoExists(photo.uri)) continue;
    const matches = byName.get(photoFilename(photo.uri)) ?? [];
    if (matches.length === 1) replacements.set(photo.uri, matches[0]!);
    else missing++;
  }
  return { replacements, missing };
}

/** Re-read before writing so recovery cannot overwrite newer notes or anchors. */
export async function recoverTripPhotos(results: RecoverResult[]) {
  let repaired = 0;
  let missing = 0;
  let changed = false;
  try {
    for (const trip of await getTrips()) {
      const candidates = results
        .filter(result => result.projectName === 'Trajets')
        .flatMap(result => result.taskFolders.filter(folder => folder.folderName === trip.id)
          .flatMap(folder => folder.uris));
      const repair = await repairTripPhotos(trip.photos ?? [], candidates);
      missing += repair.missing;
      if (!repair.replacements.size) continue;
      let count = 0;
      await updateTrip(trip.id, current => {
        const photos = current.photos?.map(photo => {
          const uri = repair.replacements.get(photo.uri);
          if (!uri) return photo;
          count++;
          return { ...photo, uri };
        });
        return { photos };
      }, true);
      if (!count) continue;
      repaired += count;
      changed = true;
    }
    return { repaired, missing };
  } finally {
    if (changed) tripEvents.emitTripUpdated();
  }
}
