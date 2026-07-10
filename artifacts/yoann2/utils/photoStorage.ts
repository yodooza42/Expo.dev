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

export function sanitize(name: string): string {
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

// ── Version silencieuse (pas de dialog) ──────────────────────────────────────
// Retourne null si l'utilisateur n'a pas encore configuré le dossier SAF.
// Utilisée pour la création proactive de dossiers (aucune interaction voulue).

async function _getPhotosDirSilent(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SAF_KEY);
  } catch {
    return null;
  }
}

// ── Pré-création du dossier d'une tâche ──────────────────────────────────────
// Fire-and-forget : à appeler à la création d'une tâche ou au démarrage.
// Ne fait rien si le dossier SAF n'est pas configuré.

/** Nom de dossier canonique pour une tâche : "<titre>_tache_<id>" */
export function taskFolderName(taskTitle: string, taskId: string): string {
  return `${sanitize(taskTitle)}_tache_${taskId}`;
}

/** Extrait l'ID embarqué dans un nom de dossier tâche, ou null si absent. */
export function extractTaskId(folderName: string): string | null {
  const m = folderName.match(/_tache_([a-z0-9]+)$/i);
  return m ? m[1]! : null;
}

export async function ensureTaskFolder(
  projectName: string,
  taskTitle: string,
  taskId: string,
): Promise<void> {
  try {
    const photosDir = await _getPhotosDirSilent();
    if (!photosDir) return;
    const projDir = await _resolveProjectDir(photosDir, projectName);
    await _findOrCreateSubfolder(projDir, taskFolderName(taskTitle, taskId));
  } catch { /* silent */ }
}

// ── Bulk : pré-créer les dossiers de toutes les tâches existantes ─────────────

export async function ensureAllTaskFolders(
  tasks: Array<{ id: string; title: string; projectName: string }>,
): Promise<void> {
  const photosDir = await _getPhotosDirSilent();
  if (!photosDir) return;
  for (const t of tasks) {
    try {
      const projDir = await _resolveProjectDir(photosDir, t.projectName);
      await _findOrCreateSubfolder(projDir, taskFolderName(t.title, t.id));
    } catch { /* continue on any per-task error */ }
  }
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
  subFolder?: string | null,
): Promise<void> {
  try {
    const photosDir = await getOrRequestPhotosDir();
    if (!photosDir) return;

    let dir = projectDirUri ?? await _resolveProjectDir(photosDir, projectName);
    if (subFolder) {
      dir = await _findOrCreateSubfolder(dir, subFolder);
    }

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
  subFolder?: string,
): Promise<string | null> {
  try {
    const photosDir = await getOrRequestPhotosDir();
    if (!photosDir) return null;
    let dir = await _resolveProjectDir(photosDir, projectName);
    if (subFolder) {
      dir = await _findOrCreateSubfolder(dir, subFolder);
    }
    return dir;
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
// Iterates over every project name, finds the matching external SAF folder.
// Root images → project photos.  Sub-folder "taches" → task photos.
// Returns separate mappings so the caller can batch-update both project & tasks.

export interface TaskFolderResult {
  /** Nom brut du dossier SAF, ex: "Changer_roue_doblo_tache_m5k3x2abc" */
  folderName: string;
  /** ID de tâche extrait du suffixe _tache_<id>, null pour anciens dossiers */
  taskId: string | null;
  uris: string[];
}

export interface RecoverResult {
  projectName: string;
  /** Images from the project root folder */
  projectUris: string[];
  /**
   * Images from task sub-folders, grouped BY folder name.
   * folderName = sanitize(task.title) — use it to find the matching task.
   */
  taskFolders: TaskFolderResult[];
}

export async function recoverAllPhotosFromExternal(
  projectNames: string[],
): Promise<RecoverResult[]> {
  const photosDir = await getOrRequestPhotosDir();
  if (!photosDir) return [];

  const localDir = FileSystem.documentDirectory + 'project_photos/';
  const localDirInfo = await FileSystem.getInfoAsync(localDir);
  if (!localDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(localDir, { intermediates: true });
  }

  const results: RecoverResult[] = [];

  for (const projectName of projectNames) {
    const key = sanitize(projectName);
    try {
      const children = await SAF.readDirectoryAsync(photosDir);
      const found = children.find(uri => {
        const decoded = decodeURIComponent(uri).toLowerCase();
        return decoded.endsWith('/' + key.toLowerCase());
      });
      if (!found) continue;

      const projectUris: string[] = [];
      const taskFolders: TaskFolderResult[] = [];

      const rootEntries = await SAF.readDirectoryAsync(found);

      for (const entryUri of rootEntries) {
        const decoded = decodeURIComponent(entryUri);
        const lastSegment = decoded.split('/').pop() ?? '';

        if (/\.(jpe?g|png|gif|webp|heic)$/i.test(lastSegment)) {
          // Root image → project photo
          const filename = lastSegment || `recovered_${Date.now()}.jpg`;
          const base64 = await SAF.readAsStringAsync(entryUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const localPath = localDir + filename;
          await FileSystem.writeAsStringAsync(localPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          projectUris.push(localPath);
        } else {
          // Sub-folder → task photos; preserve folder name + extract embedded task ID
          const folderName = lastSegment;
          const taskId = extractTaskId(folderName);
          const taskUris: string[] = [];
          try {
            const taskFiles = await SAF.readDirectoryAsync(entryUri);
            for (const fileUri of taskFiles) {
              const fileDecoded = decodeURIComponent(fileUri);
              const fileName = fileDecoded.split('/').pop() ?? '';
              if (/\.(jpe?g|png|gif|webp|heic)$/i.test(fileName)) {
                const base64 = await SAF.readAsStringAsync(fileUri, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                const localPath = localDir + fileName;
                await FileSystem.writeAsStringAsync(localPath, base64, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                taskUris.push(localPath);
              }
            }
          } catch { /* sub-folder empty or unreadable */ }
          if (taskUris.length > 0) taskFolders.push({ folderName, taskId, uris: taskUris });
        }
      }

      if (projectUris.length > 0 || taskFolders.length > 0) {
        results.push({ projectName, projectUris, taskFolders });
      }
    } catch {
      // ignore per-project errors
    }
  }

  return results;
}
