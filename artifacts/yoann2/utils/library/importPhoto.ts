import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Platform } from 'react-native';

import { genId } from '@/utils/ids';
import { readImageExifDateFields, readRange } from '@/utils/imageExifDate';
import { allEntries, loadCatalogue, putEntries, type PhotoEntry } from '@/utils/library/catalogue';
import { logEvent } from '@/utils/library/journal';
import { imageKindFromHeader, isLibraryRef, joinRel, makeRef, photoFileName } from '@/utils/library/paths';
import { chooseLibraryFolder, createFile, libraryAccessible, md5Of } from '@/utils/library/saf';
import { photoTakenAt } from '@/utils/tripPhotoPlacement';

/**
 * Copies a picked photo into Yoann2.0/Photos/… and returns its stable
 * reference. The original in the gallery is only read, never modified; the
 * copy is byte-identical (dates and EXIF untouched), checked by fingerprint.
 */

export type ImportItem = { uri: string; takenAt?: number; originalName?: string | null };
export type ImportedPhoto = { source: string; ref: string; takenAt?: number; reused: boolean };

let queue: Promise<unknown> = Promise.resolve();
let askingFolder: Promise<boolean> | null = null;

/** Ask once for the folder when it is missing (fresh install, new phone). */
export function ensureLibraryReady(): Promise<boolean> {
  if (Platform.OS !== 'android') return Promise.resolve(false);
  if (askingFolder) return askingFolder;
  askingFolder = (async () => {
    if (await libraryAccessible()) return true;
    const choose = await new Promise<boolean>(resolve => Alert.alert(
      'Dossier Yoann2.0',
      'Les photos sont rangées dans ton dossier Yoann2.0. Choisis-le (ou l’endroit où le créer) pour continuer.',
      [
        { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Choisir le dossier', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ));
    if (!choose) return false;
    try { return !!await chooseLibraryFolder(); }
    catch (error) {
      Alert.alert('Dossier non configuré', error instanceof Error ? error.message : 'Choix du dossier impossible.');
      return false;
    }
  })().finally(() => { askingFolder = null; });
  return askingFolder;
}

async function importOne(item: ImportItem, folder: string): Promise<ImportedPhoto> {
  if (isLibraryRef(item.uri)) return { source: item.uri, ref: item.uri, takenAt: item.takenAt, reused: true };
  if (!FileSystem.cacheDirectory) throw new Error('Stockage temporaire indisponible.');
  const id = genId();
  const temp = `${FileSystem.cacheDirectory}y2-import-${id}`;
  let created: string | null = null;
  try {
    // A private temporary copy: gallery content:// URIs cannot be read in pieces directly.
    await FileSystem.copyAsync({ from: item.uri, to: temp });
    const tempInfo = await FileSystem.getInfoAsync(temp, { md5: true });
    if (!tempInfo.exists || !('md5' in tempInfo) || !tempInfo.md5 || !tempInfo.size) {
      throw new Error('Photo illisible ou vide.');
    }
    const md5 = tempInfo.md5;
    const duplicate = allEntries().find(entry => entry.md5 === md5 && !entry.trashedAt);
    if (duplicate) {
      return { source: item.uri, ref: makeRef(duplicate.id), takenAt: duplicate.takenAt ?? item.takenAt, reused: true };
    }
    const kind = imageKindFromHeader(await readRange(temp, 0, 16));
    if (!kind) throw new Error('Format d’image non reconnu.');
    let takenAt = item.takenAt;
    if (!takenAt) {
      try { takenAt = photoTakenAt(await readImageExifDateFields(temp) as unknown as Record<string, unknown> | undefined); }
      catch { /* No readable date: the import time names the file instead. */ }
    }
    const addedAt = Date.now();
    const rel = joinRel(folder, photoFileName(id, takenAt ?? addedAt, kind.extension));
    created = await createFile(rel, kind.mime);
    const base64 = await FileSystem.readAsStringAsync(temp, { encoding: FileSystem.EncodingType.Base64 });
    await FileSystem.writeAsStringAsync(created, base64, { encoding: FileSystem.EncodingType.Base64 });
    const written = await md5Of(created);
    if (written !== md5) throw new Error('La copie dans Yoann2.0 ne correspond pas à l’original.');
    const entry: PhotoEntry = {
      id, rel, md5, size: tempInfo.size, mime: kind.mime, takenAt, addedAt,
      originalName: item.originalName ?? undefined, verifiedAt: addedAt,
    };
    await putEntries([entry]);
    created = null;
    logEvent('import', `${rel}`);
    return { source: item.uri, ref: makeRef(id), takenAt, reused: false };
  } finally {
    FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => {});
    if (created) {
      // Never leave a half-written copy behind.
      await FileSystem.deleteAsync(created, { idempotent: true }).catch(() => {});
    }
  }
}

/**
 * Import several photos into `folder` (relative to Yoann2.0). Each file is
 * handled on its own: one unreadable photo does not cancel the others.
 */
export async function importPhotos(items: ImportItem[], folder: string): Promise<{ imported: ImportedPhoto[]; failed: string[] }> {
  if (!items.length) return { imported: [], failed: [] };
  if (!await ensureLibraryReady()) throw new Error('Choisis le dossier Yoann2.0 pour ajouter des photos.');
  await loadCatalogue();
  const run = queue.then(async () => {
    const imported: ImportedPhoto[] = [];
    const failed: string[] = [];
    for (const item of items) {
      try { imported.push(await importOne(item, folder)); }
      catch (error) {
        const message = error instanceof Error ? error.message : 'Copie impossible.';
        failed.push(message);
        logEvent('erreur', `import ${folder} : ${message}`);
      }
    }
    return { imported, failed };
  });
  queue = run.catch(() => {});
  return run;
}

/** Shows a short message when some photos could not be copied. */
export function reportImportFailures(failed: string[]): void {
  if (!failed.length) return;
  Alert.alert(
    'Photo non ajoutée',
    `${failed.length} photo(s) n’ont pas pu être copiées dans Yoann2.0.\n${[...new Set(failed)].slice(0, 2).join('\n')}`,
  );
}

