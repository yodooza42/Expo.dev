import type { TripPhoto } from '@/types/trips';
import type { RecoverResult } from '@/utils/photoStorage';
import { photoExists, photoFilename } from '@/utils/photoReferences';
import { getTrips, updateTrip } from '@/utils/tripStorage';
import { tripEvents } from '@/utils/tripEvents';

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
      const current = (await getTrips()).find(item => item.id === trip.id);
      if (!current) continue;
      let count = 0;
      const photos = current.photos?.map(photo => {
        const uri = repair.replacements.get(photo.uri);
        if (!uri) return photo;
        count++;
        return { ...photo, uri };
      });
      if (!count) continue;
      await updateTrip(trip.id, { photos }, true);
      repaired += count;
      changed = true;
    }
    return { repaired, missing };
  } finally {
    if (changed) tripEvents.emitTripUpdated();
  }
}
