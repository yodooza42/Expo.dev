import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';

const SAF            = FileSystem.StorageAccessFramework;
const SAF_KEY        = '@yoann2_saf_photos_uri';
export const SAF_BACKUP_KEY = '@yoann2_saf_backup_uri';
export const SAF_ROOT_KEY   = '@yoann2_saf_root_uri';

// Per-project dir URIs — keyed by sanitized project name
const PROJECT_DIR_PREFIX = '@yoann2_saf_proj_';

// In-memory cache: survives the lifetime of a JS session (covers same-batch case instantly)
const _projectDirCache = new Map<string, string>();

// ── Verrou singleton : un seul dialog de permission à la fois ─────────────────
let _pendingPermission: Promise<string | null> | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitize(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'Sans_nom';
}

// ── Permission — demandée une seule fois, dédupliquée ────────────────────────

export async function getOrRequestPhotosDir(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(SAF_KEY);
    if (stored) return stored;
  } catch {
    return null;
  }

  if (_pendingPermission) return _pendingPermission;

  _pendingPermission = new Promise(resolve => {
    Alert.alert(
      'Dossier Yoann2.0',
      'Première utilisation : choisissez où créer le dossier "Yoann2.0" pour sauvegarder vos photos de projets.',
      [
        {
          text: 'Plus tard',
          style: 'cancel',
          onPress: () => { _pendingPermission = null; resolve(null); },
        },
        {
          text: "Choisir l'emplacement",
          onPress: async () => {
            try {
              const perm = await SAF.requestDirectoryPermissionsAsync();
              if (!perm.granted) { _pendingPermission = null; resolve(null); return; }

              const yoann2     = await _makeDir(perm.directoryUri, 'Yoann2.0');
              const backupDir  = await _makeDir(yoann2, 'Sauvegarde');
              const photosDir  = await _makeDir(yoann2, 'Photos');

              await AsyncStorage.setItem(SAF_ROOT_KEY, yoann2);
              await AsyncStorage.setItem(SAF_BACKUP_KEY, backupDir);
              await AsyncStorage.setItem(SAF_KEY, photosDir);
              _pendingPermission = null;
              resolve(photosDir);
            } catch {
              _pendingPermission = null;
              resolve(null);
            }
          },
        },
      ],
    );
  });

  return _pendingPermission;
}

export async function resetPhotosDir(): Promise<void> {
  await AsyncStorage.removeItem(SAF_KEY);
  _pendingPermission = null;
}

// ── Find an existing subfolder in a SAF tree, or create it ───────────────────
//
// readDirectoryAsync returns opaque content URIs. For ExternalStorageProvider,
// each URI encodes the document path (e.g. primary%3AYoann2.0%2FPhotos).
// We decode and check whether the URI ends with the folder name before falling
// back to makeDirectoryAsync to avoid duplicate creation.

async function _findOrCreateSubfolder(treeUri: string, name: string): Promise<string> {
  try {
    const children = await SAF.readDirectoryAsync(treeUri);
    const nameLower = name.toLowerCase();
    const found = children.find(uri => {
      const decoded = decodeURIComponent(uri).toLowerCase();
      return decoded.endsWith('/' + nameLower);
    });
    if (found) return found;
  } catch { /* fall through to create */ }
  return SAF.makeDirectoryAsync(treeUri, name);
}

// ── Public: (re)configure the Yoann2.0 root folder ──────────────────────────
//
// Call when the user taps "Configurer le dossier Yoann2.0" in settings.
// Works for first install AND reinstall: existing subfolders are found, not
// duplicated. Returns true on success, false if the user cancelled.

export async function reconfigureStorage(): Promise<boolean> {
  try {
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (!perm.granted) return false;

    const treeUri = perm.directoryUri;
    await AsyncStorage.setItem(SAF_ROOT_KEY, treeUri);

    const [backupDir, photosDir] = await Promise.all([
      _findOrCreateSubfolder(treeUri, 'Sauvegarde'),
      _findOrCreateSubfolder(treeUri, 'Photos'),
    ]);

    await AsyncStorage.setItem(SAF_BACKUP_KEY, backupDir);
    await AsyncStorage.setItem(SAF_KEY, photosDir);

    // Clear per-project dir cache so next photo use re-resolves against new root
    _projectDirCache.clear();

    return true;
  } catch {
    return false;
  }
}

// ── Project-dir resolution ────────────────────────────────────────────────────
//
// Strategy (ordered, cheapest first):
//   1. In-memory session cache  → instant, covers every photo in the same batch
//   2. AsyncStorage             → survives across sessions, no SAF round-trip
//   3. makeDirectoryAsync       → only on first-ever use, result stored in 1 & 2
//
// We deliberately AVOID the readDirectoryAsync name-scan approach: SAF URIs are
// opaque blobs on Android, not reliable path strings, so suffix-matching produces
// false negatives and triggers duplicate-folder creation.

async function _makeDir(parentUri: string, name: string): Promise<string> {
  return SAF.makeDirectoryAsync(parentUri, name);
}

async function _resolveProjectDir(photosBaseDir: string, projectName: string): Promise<string> {
  const key = sanitize(projectName);

  // 1) Session cache (covers batch: photos 2, 3, 4 get here instantly)
  const cached = _projectDirCache.get(key);
  if (cached) return cached;

  // 2) AsyncStorage (covers photos added in a later session)
  try {
    const stored = await AsyncStorage.getItem(PROJECT_DIR_PREFIX + key);
    if (stored) {
      _projectDirCache.set(key, stored);
      return stored;
    }
  } catch { /* fall through */ }

  // 3) Create the folder (first time ever for this project)
  const dirUri = await _makeDir(photosBaseDir, key);
  _projectDirCache.set(key, dirUri);
  try {
    await AsyncStorage.setItem(PROJECT_DIR_PREFIX + key, dirUri);
  } catch { /* best-effort */ }

  return dirUri;
}

// ── Public: clear cached URI for a project (e.g. after rename) ────────────────

export async function clearProjectDirCache(projectName: string): Promise<void> {
  const key = sanitize(projectName);
  _projectDirCache.delete(key);
  try {
    await AsyncStorage.removeItem(PROJECT_DIR_PREFIX + key);
  } catch { /* ignore */ }
}

// ── Copie bit-pour-bit ────────────────────────────────────────────────────────
//
// `projectDirUri` is optional: callers that already resolved the dir (e.g. a
// batch loop that called resolveProjectDirForBatch once) can pass it to skip
// ALL AsyncStorage lookups for subsequent photos.

export async function savePhotoToProject(
  sourceUri: string,
  projectName: string,
  originalFilename?: string | null,
  projectDirUri?: string | null,
): Promise<void> {
  try {
    const photosDir = await getOrRequestPhotosDir();
    if (!photosDir) return;

    const dir = projectDirUri ?? await _resolveProjectDir(photosDir, projectName);

    const ext      = (sourceUri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
    const base     = originalFilename
      ? sanitize(originalFilename.replace(/\.[^.]+$/, ''))
      : `photo_${Date.now()}`;
    const filename = `${base}.${ext}`;
    const mime     = ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg';

    const base64  = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const destUri = await SAF.createFileAsync(dir, filename, mime);
    await SAF.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    // La copie interne reste toujours disponible
  }
}

// ── Helper for callers that know they'll do a batch ───────────────────────────
//
// Resolve (and cache) the project dir once before a loop.
// Returns null if the photos root dir is not yet configured.

export async function resolveProjectDirForBatch(
  projectName: string,
): Promise<string | null> {
  try {
    const photosDir = await getOrRequestPhotosDir();
    if (!photosDir) return null;
    return await _resolveProjectDir(photosDir, projectName);
  } catch {
    return null;
  }
}

// ── Recover photos from external storage after reinstall ─────────────────────
//
// Scans the SAF external folder for a project, copies every image file back
// into the app's private project_photos/ dir, and returns the new local URIs.
// This lets users recover photos after an APK reinstall without re-adding
// them one by one.

export async function recoverPhotosFromExternal(
  projectName: string,
): Promise<string[]> {
  const photosDir = await getOrRequestPhotosDir();
  if (!photosDir) return [];

  const projectDir = await _resolveProjectDir(photosDir, projectName);
  const localDir = FileSystem.documentDirectory + 'project_photos/';
  const localDirInfo = await FileSystem.getInfoAsync(localDir);
  if (!localDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(localDir, { intermediates: true });
  }

  const newUris: string[] = [];
  try {
    const files = await SAF.readDirectoryAsync(projectDir);
    for (const fileUri of files) {
      const decoded = decodeURIComponent(fileUri);
      const isImage = /\.(jpe?g|png|gif|webp|heic)$/i.test(decoded);
      if (!isImage) continue;

      const filename = decoded.split('/').pop() ?? `recovered_${Date.now()}.jpg`;
      const base64 = await SAF.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const localPath = localDir + filename;
      await FileSystem.writeAsStringAsync(localPath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      newUris.push(localPath);
    }
  } catch {
    // ignore scan errors
  }

  return newUris;
}

// ── Check whether external photos exist for a project ──────────────────────────

export async function hasExternalPhotos(projectName: string): Promise<boolean> {
  try {
    const photosDir = await getOrRequestPhotosDir();
    if (!photosDir) return false;
    const projectDir = await _resolveProjectDir(photosDir, projectName);
    const files = await SAF.readDirectoryAsync(projectDir);
    return files.some(uri => /\.(jpe?g|png|gif|webp|heic)$/i.test(decodeURIComponent(uri)));
  } catch {
    return false;
  }
}

// ── Recover ALL external photos across every project folder ─────────────────────
//
// Iterates over every project name, finds the matching external SAF folder,
// copies every image back into the app's private storage, and returns the
// mappings so the caller can batch-update project states.

export async function recoverAllPhotosFromExternal(
  projectNames: string[],
): Promise<{ projectName: string; uris: string[] }[]> {
  const photosDir = await getOrRequestPhotosDir();
  if (!photosDir) return [];

  const localDir = FileSystem.documentDirectory + 'project_photos/';
  const localDirInfo = await FileSystem.getInfoAsync(localDir);
  if (!localDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(localDir, { intermediates: true });
  }

  const results: { projectName: string; uris: string[] }[] = [];

  for (const projectName of projectNames) {
    const key = sanitize(projectName);
    try {
      const children = await SAF.readDirectoryAsync(photosDir);
      const found = children.find(uri => {
        const decoded = decodeURIComponent(uri).toLowerCase();
        return decoded.endsWith('/' + key.toLowerCase());
      });
      if (!found) continue;

      const files = await SAF.readDirectoryAsync(found);
      const uris: string[] = [];
      for (const fileUri of files) {
        const decoded = decodeURIComponent(fileUri);
        if (!/\.(jpe?g|png|gif|webp|heic)$/i.test(decoded)) continue;
        const filename = decoded.split('/').pop() ?? `recovered_${Date.now()}.jpg`;
        const base64 = await SAF.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const localPath = localDir + filename;
        await FileSystem.writeAsStringAsync(localPath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        uris.push(localPath);
      }
      if (uris.length > 0) results.push({ projectName, uris });
    } catch {
      // ignore per-project errors
    }
  }

  return results;
}
