import AsyncStorage from '@react-native-async-storage/async-storage';

import { CATALOGUE_DIR, isLibraryRef, joinRel, refId } from '@/utils/library/paths';
import { docUriFor, getLoadedRoot, loadLibraryRoot, onLibraryRootChange, readText, writeText } from '@/utils/library/saf';

/**
 * The catalogue maps each stable photo id to its file, relative to the
 * Yoann2.0 folder. It is kept in AsyncStorage (fast) and mirrored in the
 * folder as two alternating slots, so a write interrupted halfway always
 * leaves the previous complete version readable.
 */

export const CATALOGUE_KEY = '@yoann2_photo_catalogue_v2';

export type PhotoEntry = {
  id: string;
  /** Path relative to the Yoann2.0 folder, e.g. Photos/Maison/Garage/….jpg */
  rel: string;
  md5: string;
  size?: number;
  mime: string;
  takenAt?: number;
  addedAt: number;
  originalName?: string;
  /** Set while the file sits in Corbeille/; purged 30 days later. */
  trashedAt?: number;
  /** Last time the file content was compared with its fingerprint. */
  verifiedAt?: number;
};

export type CatalogueState = {
  app: 'Yoann2.0';
  kind: 'catalogue';
  version: 1;
  seq: number;
  savedAt: string;
  photos: Record<string, PhotoEntry>;
};

const SLOTS = ['catalogue-A.json', 'catalogue-B.json'] as const;

let state: CatalogueState = emptyState();
let loaded: Promise<void> | null = null;
let folderWrite: Promise<void> = Promise.resolve();
let folderTimer: ReturnType<typeof setTimeout> | null = null;
let folderSeq = 0;
let version = 0;
const listeners = new Set<() => void>();

function emptyState(): CatalogueState {
  return { app: 'Yoann2.0', kind: 'catalogue', version: 1, seq: 0, savedAt: new Date(0).toISOString(), photos: {} };
}

export function parseCatalogue(raw: string | null | undefined): CatalogueState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CatalogueState;
    if (parsed?.kind !== 'catalogue' || typeof parsed.seq !== 'number' || !parsed.photos || typeof parsed.photos !== 'object') return null;
    return parsed;
  } catch { return null; }
}

function notify() {
  version++;
  listeners.forEach(listener => listener());
}

export function onCatalogueChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function catalogueVersion(): number {
  return version;
}

async function readFolderSlots(): Promise<CatalogueState | null> {
  if (!getLoadedRoot()) return null;
  let best: CatalogueState | null = null;
  for (const slot of SLOTS) {
    const parsed = parseCatalogue(await readText(joinRel(CATALOGUE_DIR, slot)));
    if (parsed && (!best || parsed.seq > best.seq)) best = parsed;
  }
  return best;
}

async function loadInternal() {
  await loadLibraryRoot();
  const local = parseCatalogue(await AsyncStorage.getItem(CATALOGUE_KEY));
  const folder = await readFolderSlots();
  folderSeq = folder?.seq ?? 0;
  const best = [local, folder].filter((item): item is CatalogueState => !!item)
    .sort((a, b) => b.seq - a.seq)[0];
  state = best ?? emptyState();
  if (folder && (!local || folder.seq > local.seq)) {
    await AsyncStorage.setItem(CATALOGUE_KEY, JSON.stringify(state));
  }
  if (getLoadedRoot() && state.seq > folderSeq) scheduleFolderWrite(0);
  notify();
}

export function loadCatalogue(): Promise<void> {
  if (!loaded) loaded = loadInternal().catch(error => { loaded = null; throw error; });
  return loaded;
}

/** After choosing a folder (new phone, reinstall), its catalogue may be newer. */
export async function reloadCatalogue(): Promise<void> {
  loaded = null;
  await loadCatalogue();
}

onLibraryRootChange(() => { void reloadCatalogue().catch(() => {}); });

/** Adopt a catalogue coming from a restored backup when it is newer. */
export async function adoptCatalogue(incoming: CatalogueState | null): Promise<void> {
  await loadCatalogue();
  if (!incoming || incoming.seq <= state.seq) return;
  state = incoming;
  await AsyncStorage.setItem(CATALOGUE_KEY, JSON.stringify(state));
  scheduleFolderWrite(0);
  notify();
}

function scheduleFolderWrite(delay = 1500) {
  if (folderTimer) clearTimeout(folderTimer);
  folderTimer = setTimeout(() => {
    folderTimer = null;
    folderWrite = folderWrite.then(writeFolderSlot).catch(() => {});
  }, delay);
}

async function writeFolderSlot() {
  if (!getLoadedRoot() || state.seq <= folderSeq) return;
  const snapshot = JSON.stringify(state);
  const seq = state.seq;
  // Alternate slots so the other one always holds the previous complete version.
  await writeText(joinRel(CATALOGUE_DIR, SLOTS[seq % 2]!), snapshot);
  folderSeq = seq;
}

/** Wait until the folder copy matches memory (used before a backup or a move). */
export async function flushCatalogue(): Promise<void> {
  if (folderTimer) {
    clearTimeout(folderTimer);
    folderTimer = null;
    folderWrite = folderWrite.then(writeFolderSlot);
  }
  await folderWrite;
}

async function commit() {
  state = { ...state, seq: state.seq + 1, savedAt: new Date().toISOString() };
  await AsyncStorage.setItem(CATALOGUE_KEY, JSON.stringify(state));
  scheduleFolderWrite();
  notify();
}

export async function putEntries(entries: PhotoEntry[]): Promise<void> {
  await loadCatalogue();
  if (!entries.length) return;
  const photos = { ...state.photos };
  for (const entry of entries) photos[entry.id] = entry;
  state = { ...state, photos };
  await commit();
}

export async function removeEntries(ids: string[]): Promise<void> {
  await loadCatalogue();
  if (!ids.length) return;
  const photos = { ...state.photos };
  for (const id of ids) delete photos[id];
  state = { ...state, photos };
  await commit();
}

export function getEntry(id: string): PhotoEntry | undefined {
  return state.photos[id];
}

export function allEntries(): PhotoEntry[] {
  return Object.values(state.photos);
}

export function catalogueSnapshot(): CatalogueState {
  return state;
}

/** Synchronous: document URI for a y2p: reference, or the input for legacy links. */
export function resolvePhotoRef(uri: string): string {
  if (!isLibraryRef(uri)) return uri;
  const entry = state.photos[refId(uri)];
  const base = getLoadedRoot();
  if (!entry || !base) return uri;
  return docUriFor(base, entry.rel);
}

export async function resolvePhotoRefAsync(uri: string): Promise<string | null> {
  if (!isLibraryRef(uri)) return uri;
  await loadCatalogue();
  const resolved = resolvePhotoRef(uri);
  return resolved === uri ? null : resolved;
}
