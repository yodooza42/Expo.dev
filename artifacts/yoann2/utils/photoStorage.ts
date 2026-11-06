import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Platform } from 'react-native';
import { photoFilename } from '@/utils/photoReferences';

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
let _hiddenPhotosRoot: string | null = null;

/** Keep backup copies out of Android's gallery without changing image dates/EXIF. */
export async function ensurePhotosHidden(photosDir: string): Promise<void> {
  if (_hiddenPhotosRoot === photosDir) return;
  const children = await SAF.readDirectoryAsync(photosDir);
  if (!children.some(uri => photoFilename(uri) === '.nomedia')) {
    const marker = await SAF.createFileAsync(photosDir, '.nomedia', 'application/octet-stream');
    if (photoFilename(marker) !== '.nomedia') throw new Error('Le dossier ne permet pas de masquer les copies de photos.');
    await SAF.writeAsStringAsync(marker, '', { encoding: FileSystem.EncodingType.UTF8 });
  }
  _hiddenPhotosRoot = photosDir;
}

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
              await ensurePhotosHidden(photosDir);

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
    if (photoFilename(treeUri).split(':').pop()?.toLowerCase() === 'photos') {
      Alert.alert('Choisir le dossier parent', 'Sélectionne le dossier Yoann2.0, et non son sous-dossier Photos.');
      return false;
    }
    await AsyncStorage.setItem(SAF_ROOT_KEY, treeUri);

    const [backupDir, photosDir] = await Promise.all([
      _findOrCreateSubfolder(treeUri, 'Sauvegarde'),
      _findOrCreateSubfolder(treeUri, 'Photos'),
    ]);

    await AsyncStorage.setItem(SAF_BACKUP_KEY, backupDir);
    await AsyncStorage.setItem(SAF_KEY, photosDir);
    await ensurePhotosHidden(photosDir);

    // Clear per-project dir cache so next photo use re-resolves against new root
    _projectDirCache.clear();
    const staleKeys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(PROJECT_DIR_PREFIX));
    if (staleKeys.length) await AsyncStorage.multiRemove(staleKeys);

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
//   3. Find an existing directory before creating one.
// The primary external-storage provider used by this app exposes document paths.
// Reuse those names after reauthorization instead of creating "Project (2)".

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

  // 3) Reuse an existing folder after reinstall/reconfiguration when possible.
  const dirUri = await _findOrCreateSubfolder(photosBaseDir, key);
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
): Promise<string | null> {
  try {
    const photosDir = await getOrRequestPhotosDir();
    if (!photosDir) return null;
    await ensurePhotosHidden(photosDir);

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
    const verified = await SAF.readAsStringAsync(destUri, { encoding: FileSystem.EncodingType.Base64 });
    if (verified !== base64) throw new Error('La copie externe est incomplète.');
    return destUri;
  } catch {
    return null;
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
  const report = await recoverAllPhotosFromExternal([projectName]);
  if (!report.projects.length && report.errors.length) throw new Error(report.errors[0]);
  return report.projects.flatMap(result => result.projectUris);
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

export interface PhotoRecoveryReport {
  projects: RecoverResult[];
  scannedImages: number;
  errors: string[];
}

export async function recoverAllPhotosFromExternal(
  projectNames: string[],
): Promise<PhotoRecoveryReport> {
  if (Platform.OS === 'web') throw new Error('La récupération des photos est disponible sur le téléphone.');
  const photosDir = await getOrRequestPhotosDir();
  if (!photosDir) throw new Error('Sélection du dossier annulée. Aucune photo n’a été modifiée.');
  let children: string[];
  try { children = await SAF.readDirectoryAsync(photosDir); }
  catch {
    throw new Error('Le dossier Photos est inaccessible. Configure à nouveau le dossier Yoann2.0 existant dans les paramètres pour autoriser son accès, puis relance la récupération.');
  }
  if (!FileSystem.documentDirectory) throw new Error('Stockage local indisponible.');

  const localDir = FileSystem.documentDirectory + 'project_photos/recovered/';
  const report: PhotoRecoveryReport = { projects: [], scannedImages: 0, errors: [] };
  const visited = new Set<string>();
  const imagePattern = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
  let visitedCount = 0;
  for (const projectName of projectNames) {
    const key = sanitize(projectName).toLowerCase();
    const matches = children.filter(uri => photoFilename(uri).toLowerCase().replace(/ \(\d+\)$/, '') === key);
    const result: RecoverResult = { projectName, projectUris: [], taskFolders: [] };
    const folders = new Map<string, TaskFolderResult>();
    async function visit(directory: string, path: string[], taskName?: string): Promise<void> {
      if (visited.has(directory)) return;
      if (path.length > 12 || visitedCount >= 10_000) {
        report.errors.push('Limite de parcours des sous-dossiers atteinte. Récupération partielle.');
        return;
      }
      visited.add(directory);
      visitedCount++;
      let entries: string[];
      try { entries = await SAF.readDirectoryAsync(directory); }
      catch { report.errors.push(`Sous-dossier inaccessible : ${path.join('/')}`); return; }
      for (const uri of entries) {
        const name = photoFilename(uri);
        if (imagePattern.test(name)) {
          report.scannedImages++;
          try {
            // Full-path namespace prevents cross-project/task filename collisions.
            const destinationDir = localDir + path.map(part => encodeURIComponent(part)).join('/') + '/';
            await FileSystem.makeDirectoryAsync(destinationDir, { intermediates: true });
            const destination = destinationDir + encodeURIComponent(name);
            const base64 = await SAF.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            await FileSystem.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64 });
            if (!taskName) result.projectUris.push(destination);
            else {
              const folder = folders.get(taskName) ?? {
                folderName: taskName, taskId: extractTaskId(taskName), uris: [],
              };
              folder.uris.push(destination);
              folders.set(taskName, folder);
            }
          } catch { report.errors.push(`Photo non récupérée : ${path.join('/')}/${name}`); }
        } else if (!/\.[a-z0-9]{1,5}$/i.test(name)) {
          // A nested album is not a new task. Keep the enclosing task identity.
          const owner = extractTaskId(name) ? name : taskName
            ?? (/^(taches|tâches|tasks)$/i.test(name) ? undefined : name);
          await visit(uri, [...path, name], owner);
        }
      }
    }
    for (const match of matches) await visit(match, [photoFilename(match)]);
    result.taskFolders = [...folders.values()];
    if (result.projectUris.length || result.taskFolders.length) report.projects.push(result);
  }
  return report;
}
