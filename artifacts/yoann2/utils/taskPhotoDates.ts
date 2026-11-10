import * as FileSystem from 'expo-file-system/legacy';
import { photoCandidates } from '@/utils/photoReferences';
import { photoTakenAt } from '@/utils/tripPhotoPlacement';
import { protectedPhotoSource } from '@/utils/photoProtection';

export const SUBTASK_PHOTO_GAP_MS = 24 * 60 * 60 * 1000;
const MAX_PHOTO_BYTES_TO_READ = 4 * 1024 * 1024;

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

async function readPhotoDate(
  uri: string,
  parseExif: typeof import('exifr/dist/lite.esm.mjs').parse,
): Promise<{ timestamp?: number; limited: boolean }> {
  const source = await protectedPhotoSource(uri);
  const candidates = [...new Set([
    uri,
    ...(await photoCandidates(uri)),
    source,
    ...(source === uri ? [] : await photoCandidates(source)),
  ])];
  let limited = false;
  for (const candidate of candidates) {
    if (/^(https?:|ph:)/i.test(candidate)) continue;
    try {
      let fileSize: number | undefined;
      try {
        const info = await FileSystem.getInfoAsync(candidate);
        if (info.exists && 'size' in info && typeof info.size === 'number') fileSize = info.size;
      } catch { /* Some SAF providers do not expose size; the read remains capped. */ }
      const readLength = Math.min(fileSize ?? MAX_PHOTO_BYTES_TO_READ, MAX_PHOTO_BYTES_TO_READ);
      const isLimited = fileSize !== undefined && fileSize > MAX_PHOTO_BYTES_TO_READ;
      const base64 = await FileSystem.readAsStringAsync(candidate, {
        encoding: FileSystem.EncodingType.Base64,
        position: 0,
        length: readLength,
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
      if (timestamp) return { timestamp, limited: false };
      limited ||= isLimited;
    } catch {
      // Try the next local/protected copy; never scan unrelated gallery assets.
    }
  }
  return { limited };
}

/**
 * Read capture dates from the files already attached to this task.
 * This avoids scanning unrelated gallery photos and does not need gallery permission.
 */
export async function scanTaskPhotoDates(
  uris: string[],
  onProgress: (message: string) => void = () => {},
): Promise<{ dates: Record<string, number>; unmatched: number; scanned: number; limited: number }> {
  const dates: Record<string, number> = {};
  let scanned = 0;
  let limited = 0;
  if (uris.length === 0) return { dates, unmatched: 0, scanned, limited };
  const { parse: parseExif } = await import('exifr/dist/lite.esm.mjs');
  for (const [index, uri] of uris.entries()) {
    onProgress(`Lecture des métadonnées des photos ${index + 1}/${uris.length}…`);
    const result = await readPhotoDate(uri, parseExif);
    if (result.timestamp) dates[uri] = result.timestamp;
    else if (result.limited) limited++;
    scanned++;
  }
  return { dates, unmatched: uris.length - Object.keys(dates).length, scanned, limited };
}
