import { parse as parseExif } from 'exifr/dist/lite.esm.mjs';
import * as FileSystem from 'expo-file-system/legacy';
import { photoCandidates } from '@/utils/photoReferences';
import { photoTakenAt } from '@/utils/tripPhotoPlacement';
import { protectedPhotoSource } from '@/utils/photoProtection';

export const SUBTASK_PHOTO_GAP_MS = 24 * 60 * 60 * 1000;

export function hasSubtaskPhotoDateSpread(uris: string[], photoDates: Record<string, number> = {}): boolean {
  const dates = uris.map(uri => photoDates[uri]).filter((date): date is number =>
    typeof date === 'number' && Number.isFinite(date) && date > 0);
  if (dates.length < 2) return false;
  return Math.max(...dates) - Math.min(...dates) > SUBTASK_PHOTO_GAP_MS;
}

function mimeType(uri: string): string {
  const extension = decodeURIComponent(uri).split(/[?#]/, 1)[0]!.split('.').pop()?.toLowerCase();
  if (extension === 'heic' || extension === 'heif') return 'image/heic';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'tif' || extension === 'tiff') return 'image/tiff';
  if (extension === 'avif') return 'image/avif';
  return 'image/jpeg';
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
      const base64 = await FileSystem.readAsStringAsync(candidate, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!base64) continue;
      const exif = await parseExif(`data:${mimeType(candidate)};base64,${base64}`, {
        exif: { pick: ['DateTimeOriginal', 'OffsetTimeOriginal', 'DateTime', 'OffsetTime'] },
        gps: false,
        xmp: false,
        iptc: false,
        icc: false,
      });
      const timestamp = photoTakenAt(exif as Record<string, unknown> | undefined);
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
  for (const [index, uri] of uris.entries()) {
    onProgress(`Lecture des métadonnées des photos ${index + 1}/${uris.length}…`);
    const timestamp = await readPhotoDate(uri);
    if (timestamp) dates[uri] = timestamp;
    scanned++;
  }
  return { dates, unmatched: uris.length - Object.keys(dates).length, scanned };
}
