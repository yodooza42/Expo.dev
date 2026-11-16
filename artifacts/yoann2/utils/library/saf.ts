import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { LIBRARY_FOLDER_NAME, MARKER_FILE, PHOTOS_DIR, relDir, relName } from '@/utils/library/paths';

/**
 * Access to the user's Yoann2.0 folder through Android's Storage Access
 * Framework. Only the phone's shared storage provider is accepted: its
 * document ids are paths, so a relative path always maps to the same file,
 * on this phone and on the next one.
 */

const SAF = FileSystem.StorageAccessFramework;
const PROVIDER = 'com.android.externalstorage.documents';
/** Device-local: Android grants are not transferable, so this key is never backed up. */
export const LIBRARY_ROOT_KEY = '@yoann2_saf_library_v2';
const LEGACY_ROOT_KEY = '@yoann2_saf_root_uri';

export type LibraryRoot = { treeUri: string; rootDocId: string };

let root: LibraryRoot | null | undefined;
const knownDirs = new Map<string, string>();
const rootListeners = new Set<() => void>();

export function onLibraryRootChange(listener: () => void): () => void {
  rootListeners.add(listener);
  return () => { rootListeners.delete(listener); };
}

function parseTree(treeUri: string): { treeUri: string; treeDocId: string } | null {
  const match = treeUri.match(/^content:\/\/([^/]+)\/tree\/([^/]+)$/);
  if (!match || match[1] !== PROVIDER) return null;
  return { treeUri, treeDocId: decodeURIComponent(match[2]!) };
}

function joinDocId(parent: string, name: string): string {
  return parent.endsWith(':') ? parent + name : `${parent}/${name}`;
}

function docName(docId: string): string {
  const afterColon = docId.slice(docId.indexOf(':') + 1);
  return afterColon.slice(afterColon.lastIndexOf('/') + 1);
}

export function nameFromDocUri(uri: string): string {
  const encoded = uri.slice(uri.lastIndexOf('/document/') + '/document/'.length);
  try { return docName(decodeURIComponent(encoded)); } catch { return ''; }
}

export function docUriFor(base: LibraryRoot, rel: string): string {
  const docId = rel ? joinDocId(base.rootDocId, rel) : base.rootDocId;
  return `${base.treeUri}/document/${encodeURIComponent(docId)}`;
}

export function getLoadedRoot(): LibraryRoot | null {
  return root ?? null;
}

async function persistRoot(next: LibraryRoot | null) {
  root = next;
  knownDirs.clear();
  if (next) await AsyncStorage.setItem(LIBRARY_ROOT_KEY, JSON.stringify(next));
  else await AsyncStorage.removeItem(LIBRARY_ROOT_KEY);
  rootListeners.forEach(listener => listener());
}

export async function canReadDir(uri: string): Promise<boolean> {
  try { await SAF.readDirectoryAsync(uri); return true; } catch { return false; }
}

/** Loads the configured folder. Adopts the existing Yoann2.0 grant of older versions once. */
export async function loadLibraryRoot(): Promise<LibraryRoot | null> {
  if (root !== undefined) return root;
  if (Platform.OS !== 'android') { root = null; return null; }
  try {
    const raw = await AsyncStorage.getItem(LIBRARY_ROOT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LibraryRoot;
      if (parsed?.treeUri && parsed?.rootDocId) { root = parsed; return root; }
    }
    const legacy = await AsyncStorage.getItem(LEGACY_ROOT_KEY);
    const tree = legacy ? parseTree(legacy) : null;
    if (tree && docName(tree.treeDocId) === LIBRARY_FOLDER_NAME) {
      const candidate = { treeUri: tree.treeUri, rootDocId: tree.treeDocId };
      if (await canReadDir(docUriFor(candidate, ''))) {
        await persistRoot(candidate);
        await prepareLayout();
        return root!;
      }
    }
  } catch { /* An unreadable setting means the folder has to be chosen again. */ }
  root = null;
  return null;
}

export async function requireRoot(): Promise<LibraryRoot> {
  const current = await loadLibraryRoot();
  if (!current) throw new Error('Le dossier Yoann2.0 n’est pas configuré. Choisis-le dans Paramètres › Dossier Yoann2.0.');
  return current;
}

/** True when the grant still works (it is lost after a reinstall). */
export async function libraryAccessible(): Promise<boolean> {
  const current = await loadLibraryRoot();
  return !!current && canReadDir(docUriFor(current, ''));
}

/** List direct children: name → document URI. */
export async function listDir(rel: string): Promise<Map<string, string>> {
  const base = await requireRoot();
  const children = await SAF.readDirectoryAsync(docUriFor(base, rel));
  return new Map(children.map(uri => [nameFromDocUri(uri), uri]));
}

/** Create missing folders one by one. Never accepts an Android auto-renamed duplicate. */
export async function ensureDir(rel: string): Promise<string> {
  const base = await requireRoot();
  if (!rel) return docUriFor(base, '');
  const cached = knownDirs.get(rel);
  if (cached) return cached;
  const parts = rel.split('/');
  let current = '';
  for (const part of parts) {
    const next = current ? `${current}/${part}` : part;
    if (!knownDirs.has(next)) {
      const siblings = await listDir(current);
      if (!siblings.has(part)) {
        const created = await SAF.makeDirectoryAsync(docUriFor(base, current), part);
        if (nameFromDocUri(created) !== part) {
          await FileSystem.deleteAsync(created, { idempotent: true }).catch(() => {});
          throw new Error(`Impossible de créer le dossier « ${part} » : un fichier porte déjà ce nom.`);
        }
      }
      knownDirs.set(next, docUriFor(base, next));
    }
    current = next;
  }
  return knownDirs.get(rel)!;
}

export async function fileUri(rel: string): Promise<string> {
  return docUriFor(await requireRoot(), rel);
}

export async function deleteRel(rel: string): Promise<void> {
  await FileSystem.deleteAsync(await fileUri(rel), { idempotent: true });
}

/**
 * Create a new file at `rel`. An existing file is replaced only when
 * `replace` is set: Android may not truncate an existing document, so a
 * rewrite is always delete + create.
 */
export async function createFile(rel: string, mime: string, replace = false): Promise<string> {
  const dir = relDir(rel);
  const name = relName(rel);
  const dirUri = await ensureDir(dir);
  if (replace) {
    const existing = (await listDir(dir)).get(name);
    if (existing) await FileSystem.deleteAsync(existing, { idempotent: true });
  }
  // Without `replace`, an existing name makes Android pick "name (1)": rejected below.
  const created = await SAF.createFileAsync(dirUri, name, mime);
  if (nameFromDocUri(created) !== name) {
    await FileSystem.deleteAsync(created, { idempotent: true }).catch(() => {});
    throw new Error(`Le fichier ${rel} n’a pas pu être créé sous son nom exact.`);
  }
  return created;
}

export async function writeText(rel: string, text: string, mime = 'application/json'): Promise<void> {
  const uri = await createFile(rel, mime, true);
  await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
  const check = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  if (check !== text) throw new Error(`Écriture incomplète : ${rel}`);
}

export async function readText(rel: string): Promise<string | null> {
  try {
    return await FileSystem.readAsStringAsync(await fileUri(rel), { encoding: FileSystem.EncodingType.UTF8 });
  } catch { return null; }
}

export async function md5Of(uri: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { md5: true });
    return info.exists && 'md5' in info && info.md5 ? info.md5 : null;
  } catch { return null; }
}

/** Folder structure and the marker that lets the app recognise a Yoann2.0 folder. */
export async function prepareLayout(): Promise<void> {
  const photos = await ensureDir(PHOTOS_DIR);
  const photoChildren = await SAF.readDirectoryAsync(photos);
  if (!photoChildren.some(uri => nameFromDocUri(uri) === '.nomedia')) {
    // Keeps the copies out of the gallery without touching image dates or EXIF.
    const marker = await SAF.createFileAsync(photos, '.nomedia', 'application/octet-stream');
    if (nameFromDocUri(marker) !== '.nomedia') {
      await FileSystem.deleteAsync(marker, { idempotent: true }).catch(() => {});
      throw new Error('Le dossier Photos ne permet pas de masquer les copies de la galerie.');
    }
  }
  const markerText = await readText(MARKER_FILE);
  if (!markerText) {
    await writeText(MARKER_FILE, JSON.stringify({
      app: 'Yoann2.0', layout: 2, createdAt: new Date().toISOString(),
      note: 'Dossier de données Yoann2.0. Copier ce dossier entier pour changer de téléphone.',
    }, null, 2));
  }
}

/**
 * Ask Android for the folder. The user may pick Yoann2.0 itself or the folder
 * that contains it (it is created there when missing).
 */
export async function chooseLibraryFolder(): Promise<LibraryRoot | null> {
  if (Platform.OS !== 'android') throw new Error('Le dossier Yoann2.0 est disponible sur le téléphone Android.');
  const permission = await SAF.requestDirectoryPermissionsAsync();
  if (!permission.granted) return null;
  const tree = parseTree(permission.directoryUri);
  if (!tree) {
    throw new Error('Choisis un dossier de la mémoire du téléphone (pas un cloud ni une carte réseau).');
  }
  const pickedName = docName(tree.treeDocId);
  if (/^(Photos|Sauvegardes|Sauvegarde|Catalogue|Journal|Corbeille)$/i.test(pickedName)) {
    throw new Error(`Tu as choisi le sous-dossier « ${pickedName} ». Choisis le dossier Yoann2.0 lui-même.`);
  }
  let candidate: LibraryRoot;
  if (pickedName === LIBRARY_FOLDER_NAME) {
    candidate = { treeUri: tree.treeUri, rootDocId: tree.treeDocId };
  } else {
    const parent = `${tree.treeUri}/document/${encodeURIComponent(tree.treeDocId)}`;
    const children = await SAF.readDirectoryAsync(parent);
    const existing = children.find(uri => nameFromDocUri(uri) === LIBRARY_FOLDER_NAME);
    if (!existing) {
      const created = await SAF.makeDirectoryAsync(parent, LIBRARY_FOLDER_NAME);
      if (nameFromDocUri(created) !== LIBRARY_FOLDER_NAME) throw new Error('Impossible de créer le dossier Yoann2.0 ici.');
    }
    candidate = { treeUri: tree.treeUri, rootDocId: joinDocId(tree.treeDocId, LIBRARY_FOLDER_NAME) };
  }
  if (!await canReadDir(docUriFor(candidate, ''))) throw new Error('Android n’autorise pas la lecture de ce dossier.');
  await persistRoot(candidate);
  await prepareLayout();
  return candidate;
}
