import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { CATALOGUE_KEY, adoptCatalogue, catalogueSnapshot, flushCatalogue, loadCatalogue, parseCatalogue } from '@/utils/library/catalogue';
import { flushJournal, logEvent } from '@/utils/library/journal';
import { BACKUPS_DIR, fileStamp, isLibraryRef, joinRel, refId } from '@/utils/library/paths';
import { collectReferences } from '@/utils/library/placement';
import { libraryAccessible, listDir, writeText } from '@/utils/library/saf';
import type { Project, Task } from '@/types';
import type { Trip } from '@/types/trips';

/**
 * Backups of every stored setting and record, written to Yoann2.0/Sauvegardes.
 * They contain no device-specific links: photos are referenced by id and
 * found through the catalogue, so a backup works on another phone.
 */

const LAST_BACKUP_KEY = '@yoann2_last_backup_v2_ts';
const BACKUP_KEY_PREFIXES = ['@yoann2', '@marie_', '@anna_', '@work_'];
const DEVICE_LOCAL_PREFIXES = ['@yoann2_saf_', '@yoann2_lock_'];
const DEVICE_LOCAL_KEYS = new Set([
  '@yoann2_backup_list', '@yoann2_last_backup_ts', LAST_BACKUP_KEY,
  '@yoann2_widget_debug_log', '@yoann2_photo_protection_v1', '@yoann2_photo_protection_missing',
  '@yoann2_trip_detection_state', '@yoann2_last_valid_point', '@yoann2_battery_opt_prompted',
  '@yoann2_folder_report_v2', '@yoann2_last_maintenance_v2', '@yoann2_library_onboarding_v2',
  '@yoann2_fresh_install_v2',
]);

export type BackupReason = 'auto' | 'manuel' | 'avant-restauration' | 'avant-detachement';
export type BackupEntry = { uri: string; ts: number; filename: string; reason: string };
export type BackupFile = {
  app?: string;
  version: number;
  exportedAt: string;
  reason?: string;
  inventory?: { included: number; excluded: string[] };
  data: Record<string, string | null>;
};

export function isDeviceLocalKey(key: string): boolean {
  return DEVICE_LOCAL_KEYS.has(key) || DEVICE_LOCAL_PREFIXES.some(prefix => key.startsWith(prefix))
    || /^@yoann2_notif_.*_ids$/.test(key);
}

/** Every stored key, split between what is saved and what only makes sense on this phone. */
export async function storageInventory(): Promise<{ included: string[]; excluded: string[] }> {
  const keys = (await AsyncStorage.getAllKeys()).filter(key => BACKUP_KEY_PREFIXES.some(prefix => key.startsWith(prefix)));
  return {
    included: keys.filter(key => !isDeviceLocalKey(key)).sort(),
    excluded: keys.filter(isDeviceLocalKey).sort(),
  };
}

async function collect(reason: BackupReason): Promise<BackupFile> {
  await loadCatalogue();
  const inventory = await storageInventory();
  const pairs = await AsyncStorage.multiGet(inventory.included);
  const data: Record<string, string | null> = {};
  for (const [key, value] of pairs) data[key] = value;
  // Always the in-memory catalogue: it is the newest version.
  data[CATALOGUE_KEY] = JSON.stringify(catalogueSnapshot());
  return {
    app: 'Yoann2.0', version: 2, exportedAt: new Date().toISOString(), reason,
    inventory: { included: Object.keys(data).length, excluded: inventory.excluded },
    data,
  };
}

const NAME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:_([a-z-]+))?\.json$/;

export async function listBackups(): Promise<BackupEntry[]> {
  try {
    const children = await listDir(BACKUPS_DIR);
    const entries: BackupEntry[] = [];
    for (const [filename, uri] of children) {
      const match = filename.match(NAME_PATTERN);
      if (!match) continue;
      const [, y, mo, d, h, mi, s, reason] = match;
      const ts = new Date(+y!, +mo! - 1, +d!, +h!, +mi!, +s!).getTime();
      entries.push({ uri, ts, filename, reason: reason ?? 'auto' });
    }
    return entries.sort((a, b) => b.ts - a.ts);
  } catch { return []; }
}

const dayKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const monthKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}`; };
function weekKey(ts: number) {
  const d = new Date(ts);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(monday.getTime());
}

/** 7 daily, 4 weekly, 12 monthly (newest of each), plus 30 days of safety copies. */
export function backupsToKeep(entries: BackupEntry[], now = Date.now()): Set<string> {
  const keep = new Set<string>();
  const sorted = [...entries].sort((a, b) => b.ts - a.ts);
  if (sorted[0]) keep.add(sorted[0].uri);
  const tiers: Array<[(ts: number) => string, number]> = [[dayKey, 7], [weekKey, 4], [monthKey, 12]];
  for (const [key, count] of tiers) {
    const seen = new Set<string>();
    for (const entry of sorted) {
      const k = key(entry.ts);
      if (seen.has(k)) continue;
      if (seen.size >= count) break;
      seen.add(k);
      keep.add(entry.uri);
    }
  }
  for (const entry of sorted) {
    if (entry.reason.startsWith('avant-') && now - entry.ts < 30 * 86_400_000) keep.add(entry.uri);
  }
  return keep;
}

let saving: Promise<boolean> | null = null;

export function saveBackup(reason: BackupReason = 'auto'): Promise<boolean> {
  if (saving) return saving;
  saving = (async () => {
    try {
      if (!await libraryAccessible()) return false;
      await flushCatalogue().catch(() => {});
      const file = await collect(reason);
      const ts = Date.now();
      const filename = `${fileStamp(ts)}_${reason}.json`;
      // writeText reads the file back and compares it before reporting success.
      await writeText(joinRel(BACKUPS_DIR, filename), JSON.stringify(file));
      await AsyncStorage.setItem(LAST_BACKUP_KEY, String(ts));
      const entries = await listBackups();
      const keep = backupsToKeep(entries);
      for (const entry of entries) {
        if (!keep.has(entry.uri)) await FileSystem.deleteAsync(entry.uri, { idempotent: true }).catch(() => {});
      }
      logEvent('sauvegarde', `${filename} (${file.inventory?.included ?? 0} clés)`);
      void flushJournal();
      return true;
    } catch (error) {
      logEvent('erreur', `sauvegarde : ${error instanceof Error ? error.message : 'échec'}`);
      return false;
    }
  })().finally(() => { saving = null; });
  return saving;
}

export async function lastBackupTime(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(LAST_BACKUP_KEY);
  const local = raw ? Number(raw) : NaN;
  if (Number.isFinite(local)) return local;
  return (await listBackups())[0]?.ts ?? null;
}

/** Once a day from 10:00, on the first time the app is in the foreground. */
export async function runDailyBackupIfNeeded(): Promise<void> {
  try {
    const now = new Date();
    if (now.getHours() < 10) return;
    const last = await lastBackupTime();
    const todayAt10 = new Date(now);
    todayAt10.setHours(10, 0, 0, 0);
    if (last && last >= todayAt10.getTime()) return;
    await saveBackup('auto');
  } catch { /* retried on the next foreground */ }
}

export function parseBackup(raw: string): BackupFile {
  let parsed: BackupFile;
  try { parsed = JSON.parse(raw) as BackupFile; }
  catch { throw new Error('Ce fichier n’est pas une sauvegarde lisible (JSON invalide ou incomplet).'); }
  if (!parsed?.data || typeof parsed.data !== 'object' || (parsed.version !== 1 && parsed.version !== 2)) {
    throw new Error('Ce fichier n’est pas une sauvegarde Yoann2.0.');
  }
  return parsed;
}

export async function readBackupFile(uri: string): Promise<BackupFile> {
  return parseBackup(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 }));
}

export type BackupReport = {
  exportedAt: string;
  version: number;
  keys: number;
  projects: number;
  tasks: number;
  trips: number;
  libraryPhotos: number;
  libraryPhotosKnown: number;
  legacyLinks: number;
};

function parseList<T>(raw: string | null | undefined): T[] {
  try { const value = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value : []; } catch { return []; }
}

export function describeBackup(file: BackupFile): BackupReport {
  const projects = parseList<Project>(file.data['@yoann2_projects']);
  const tasks = parseList<Task>(file.data['@yoann2_tasks']);
  const trips = parseList<Trip>(file.data['@yoann2_trips']);
  const refs = collectReferences({ projects, tasks, trips });
  const backupCatalogue = parseCatalogue(file.data[CATALOGUE_KEY]);
  const current = catalogueSnapshot();
  const known = [...refs.ids].filter(id => backupCatalogue?.photos[id] || current.photos[id]).length;
  return {
    exportedAt: file.exportedAt,
    version: file.version,
    keys: Object.values(file.data).filter(value => typeof value === 'string').length,
    projects: projects.length, tasks: tasks.length, trips: trips.length,
    libraryPhotos: refs.ids.size, libraryPhotosKnown: known, legacyLinks: refs.legacy.size,
  };
}

export function formatBackupReport(report: BackupReport): string {
  const date = new Date(report.exportedAt);
  const lines = [
    `Sauvegarde du ${date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
    `${report.projects} projets · ${report.tasks} tâches · ${report.trips} trajets`,
    `${report.keys} éléments enregistrés`,
  ];
  if (report.libraryPhotos) lines.push(`${report.libraryPhotosKnown}/${report.libraryPhotos} photos retrouvées dans le catalogue`);
  if (report.legacyLinks) lines.push(`${report.legacyLinks} anciens liens photo (ancien système, ne seront pas réparés)`);
  return lines.join('\n');
}

/**
 * Restores the saved values. A safety backup of the current state is made
 * first when the folder is available. Device-only keys are never imported.
 * The caller restarts the app afterwards.
 */
export async function restoreBackupFile(file: BackupFile): Promise<void> {
  if (await libraryAccessible()) await saveBackup('avant-restauration');
  const pairs = Object.entries(file.data)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !isDeviceLocalKey(entry[0]) && entry[0] !== CATALOGUE_KEY);
  await AsyncStorage.multiSet(pairs);
  await adoptCatalogue(parseCatalogue(file.data[CATALOGUE_KEY]));
  await flushCatalogue().catch(() => {});
  logEvent('restauration', `sauvegarde du ${file.exportedAt} (${pairs.length} clés)`);
  await flushJournal();
}

/** Pick any backup file (including old version-1 files from the former Sauvegarde folder). */
export async function pickBackupFile(): Promise<BackupFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return null;
  return parseBackup(await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 }));
}

/** Newest backup in the folder that can actually be read. */
export async function latestValidBackup(): Promise<{ entry: BackupEntry; file: BackupFile } | null> {
  for (const entry of (await listBackups()).slice(0, 10)) {
    try { return { entry, file: await readBackupFile(entry.uri) }; } catch { /* try the previous one */ }
  }
  return null;
}

export function countLibraryRefs(uris: string[]): number {
  return uris.filter(isLibraryRef).map(refId).length;
}
