import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { photoFilename } from '@/utils/photoReferences';
import { photoTakenAt } from '@/utils/tripPhotoPlacement';
import { protectedPhotoSource } from '@/utils/photoProtection';

export const SUBTASK_PHOTO_GAP_MS = 24 * 60 * 60 * 1000;
const GALLERY_SCAN_LIMIT = 5000;
const GALLERY_PAGE_SIZE = 100;

export function hasSubtaskPhotoDateSpread(uris: string[], photoDates: Record<string, number> = {}): boolean {
  const dates = uris.map(uri => photoDates[uri]).filter((date): date is number =>
    typeof date === 'number' && Number.isFinite(date) && date > 0);
  if (dates.length < 2) return false;
  return Math.max(...dates) - Math.min(...dates) > SUBTASK_PHOTO_GAP_MS;
}

/**
 * Match already-protected task photos to their gallery originals by exact URI,
 * or by a filename only when that filename is unique on both sides.
 */
export async function scanTaskPhotoDates(
  uris: string[],
  onProgress: (message: string) => void = () => {},
): Promise<{ dates: Record<string, number>; unmatched: number; scanned: number; limited: boolean }> {
  if (Platform.OS === 'web') throw new Error('L’analyse des dates est disponible dans l’application sur le téléphone.');
  if (!uris.length) return { dates: {}, unmatched: 0, scanned: 0, limited: false };
  const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  if (!permission.granted) throw new Error('Autorise l’accès aux photos pour analyser leurs dates.');

  const targets = await Promise.all(uris.map(async uri => {
    const source = await protectedPhotoSource(uri);
    return { uri, source, filename: photoFilename(source) };
  }));
  const targetNameCounts = new Map<string, number>();
  targets.forEach(target => targetNameCounts.set(target.filename, (targetNameCounts.get(target.filename) ?? 0) + 1));
  const exact = new Map<string, MediaLibrary.Asset[]>();
  const byFilename = new Map<string, MediaLibrary.Asset[]>();
  let cursor: string | undefined, scanned = 0, limited = false;
  do {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo', first: Math.min(GALLERY_PAGE_SIZE, GALLERY_SCAN_LIMIT - scanned),
      after: cursor, sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    for (const asset of page.assets) {
      const sameUri = targets.filter(target => target.source === asset.uri || target.source === asset.id);
      for (const target of sameUri) exact.set(target.uri, [...(exact.get(target.uri) ?? []), asset]);
      const targetsWithName = targets.filter(target => target.filename && target.filename === asset.filename);
      for (const target of targetsWithName) byFilename.set(target.uri, [...(byFilename.get(target.uri) ?? []), asset]);
    }
    scanned += page.assets.length;
    onProgress(`${scanned} photos de la galerie examinées…`);
    if (scanned >= GALLERY_SCAN_LIMIT && page.hasNextPage) { limited = true; break; }
    if (!page.hasNextPage) break;
    if (!page.endCursor || page.endCursor === cursor) {
      throw new Error('La galerie n’a pas fourni toutes les pages. Réessaie dans quelques instants.');
    }
    cursor = page.endCursor;
  } while (true);

  const matches = new Map<string, MediaLibrary.Asset>();
  for (const target of targets) {
    const exactMatches = exact.get(target.uri) ?? [];
    if (exactMatches.length === 1) { matches.set(target.uri, exactMatches[0]!); continue; }
    const filenameMatches = byFilename.get(target.uri) ?? [];
    if (exactMatches.length === 0 && targetNameCounts.get(target.filename) === 1 && filenameMatches.length === 1)
      matches.set(target.uri, filenameMatches[0]!);
  }

  const dates: Record<string, number> = {};
  for (const [index, [uri, asset]] of [...matches].entries()) {
    onProgress(`Lecture des dates des photos ${index + 1}/${matches.size}…`);
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
      const timestamp = photoTakenAt(info.exif as Record<string, unknown> | undefined, info.creationTime);
      if (timestamp) dates[uri] = timestamp;
    } catch { /* Keep inaccessible or cloud-only originals for manual date entry. */ }
  }
  return { dates, unmatched: uris.length - Object.keys(dates).length, scanned, limited };
}
