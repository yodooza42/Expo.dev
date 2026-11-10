import { photoCandidates } from '@/utils/photoReferences';
import { photoTakenAt } from '@/utils/tripPhotoPlacement';
import { protectedPhotoSource } from '@/utils/photoProtection';
import { readImageExifDateFields } from '@/utils/imageExifDate';

export const SUBTASK_PHOTO_GAP_MS = 24 * 60 * 60 * 1000;

export function hasSubtaskPhotoDateSpread(uris: string[], photoDates: Record<string, number> = {}): boolean {
  const dates = uris.map(uri => photoDates[uri]).filter((date): date is number =>
    typeof date === 'number' && Number.isFinite(date) && date > 0);
  if (dates.length < 2) return false;
  return Math.max(...dates) - Math.min(...dates) > SUBTASK_PHOTO_GAP_MS;
}

async function readPhotoDate(uri: string): Promise<number | undefined> {
  const source = await protectedPhotoSource(uri);
  const candidates = [...new Set([
    uri,
    ...(await photoCandidates(uri)),
    source,
    ...(source === uri ? [] : await photoCandidates(source)),
  ])];
  for (const candidate of candidates) {
    if (/^(https?:|ph:)/i.test(candidate)) continue;
    try {
      const fields = await readImageExifDateFields(candidate);
      const timestamp = photoTakenAt(fields);
      if (timestamp) return timestamp;
    } catch {
      // Try the next local/protected copy; never scan unrelated gallery assets.
    }
  }
  return undefined;
}

/**
 * Read capture dates from the files already attached to this task.
 * This avoids scanning unrelated gallery photos and does not need gallery permission.
 */
export async function scanTaskPhotoDates(
  uris: string[],
  onProgress: (message: string) => void = () => {},
): Promise<{ dates: Record<string, number>; unmatched: number; scanned: number }> {
  const dates: Record<string, number> = {};
  let scanned = 0;
  if (uris.length === 0) return { dates, unmatched: 0, scanned };
  for (const [index, uri] of uris.entries()) {
    onProgress(`Lecture des métadonnées des photos ${index + 1}/${uris.length}…`);
    const timestamp = await readPhotoDate(uri);
    if (timestamp) dates[uri] = timestamp;
    scanned++;
  }
  return { dates, unmatched: uris.length - Object.keys(dates).length, scanned };
}
