import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import type { Project, Task } from '@/types';
import type { Trip } from '@/types/trips';
import { lastBackupTime, saveBackup } from '@/utils/backup';
import { allEntries, getEntry, loadCatalogue, putEntries, removeEntries, type PhotoEntry } from '@/utils/library/catalogue';
import { flushJournal, logEvent } from '@/utils/library/journal';
import { PHOTOS_DIR, TRASH_DIR, idFromPhotoFileName, imageKindFromHeader, isLibraryRef, joinRel, relDir, relName } from '@/utils/library/paths';
import { collectReferences, expectedFolders, selectionUris, type PhotoData } from '@/utils/library/placement';
import { createFile, deleteRel, fileUri, libraryAccessible, listDir, md5Of } from '@/utils/library/saf';
import { readRange } from '@/utils/imageExifDate';
import { getTrips } from '@/utils/tripStorage';
import { loadLifeAlbum } from '@/utils/lifeAlbum';

/**
 * "Bilan du dossier": compares the data, the catalogue and the files really
 * present in Yoann2.0. Checking never moves or deletes anything; only
 * catalogue paths are corrected when the user moved a file by hand.
 */

export const FOLDER_REPORT_KEY = '@yoann2_folder_report_v2';
const LAST_MAINTENANCE_KEY = '@yoann2_last_maintenance_v2';
const WEEK_MS = 7 * 86_400_000;
const TRASH_DAYS = 30;
const ORPHAN_GRACE_MS = 86_400_000;

export type FolderReport = {
  checkedAt: number;
  ok: number;
  /** Files found elsewhere in Photos/ (moved by hand): catalogue updated. */
  relocated: number;
  missing: Array<{ id: string; rel?: string }>;
  misplaced: Array<{ id: string; from: string; to: string }>;
  orphans: Array<{ id: string; rel: string }>;
  inTrash: number;
  purged: number;
  legacyLinks: number;
  lastBackupAt: number | null;
};

export function reportNeedsAttention(report: FolderReport | null): boolean {
  if (!report) return false;
  const backupOld = !report.lastBackupAt || Date.now() - report.lastBackupAt > 3 * 86_400_000;
  return report.missing.length > 0 || report.misplaced.length > 0 || report.orphans.length > 0 || backupOld;
}

function parseList<T>(raw: string | null): T[] {
  try { const value = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value : []; } catch { return []; }
}

export async function readPhotoData(): Promise<PhotoData> {
  const [projects, tasks] = await AsyncStorage.multiGet(['@yoann2_projects', '@yoann2_tasks']);
  return {
    projects: parseList<Project>(projects[1]),
    tasks: parseList<Task>(tasks[1]),
    trips: await getTrips(),
    album: await loadLifeAlbum(),
  };
}

/** Every file in Photos/ and Corbeille/ whose name carries a photo id. */
async function scanFiles(): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const walk = async (rel: string, depth: number) => {
    if (depth > 8) return;
    let children: Map<string, string>;
    try { children = await listDir(rel); } catch { return; }
    for (const [name] of children) {
      if (name.startsWith('.')) continue;
      const id = idFromPhotoFileName(name);
      if (id) { if (!found.has(id)) found.set(id, joinRel(rel, name)); continue; }
      if (!/\.[a-z0-9]{2,5}$/i.test(name)) await walk(joinRel(rel, name), depth + 1);
    }
  };
  await walk(PHOTOS_DIR, 0);
  await walk(TRASH_DIR, 0);
  return found;
}

async function entryFromFile(id: string, rel: string): Promise<PhotoEntry | null> {
  const uri = await fileUri(rel);
  const md5 = await md5Of(uri);
  if (!md5) return null;
  let mime = 'image/jpeg';
  try { mime = imageKindFromHeader(await readRange(uri, 0, 16))?.mime ?? mime; } catch { /* keep default */ }
  return { id, rel, md5, mime, addedAt: Date.now(), verifiedAt: Date.now() };
}

/** Dry run, plus catalogue-only corrections for files moved by hand. */
export async function checkFolder(): Promise<FolderReport> {
  if (!await libraryAccessible()) throw new Error('Dossier Yoann2.0 inaccessible : choisis-le à nouveau dans les paramètres.');
  await loadCatalogue();
  const data = await readPhotoData();
  const refs = collectReferences(data);
  const expected = expectedFolders(data);
  const files = await scanFiles();
  const report: FolderReport = {
    checkedAt: Date.now(), ok: 0, relocated: 0, missing: [], misplaced: [], orphans: [],
    inTrash: 0, purged: 0, legacyLinks: refs.legacy.size, lastBackupAt: await lastBackupTime(),
  };
  const fixes: PhotoEntry[] = [];
  const known = new Map(allEntries().map(entry => [entry.id, entry]));
  // Referenced photos: present where the catalogue says, moved by hand, or missing.
  for (const id of refs.ids) {
    const entry = known.get(id);
    const onDisk = files.get(id);
    if (!onDisk) { report.missing.push({ id, rel: entry?.rel }); continue; }
    if (!entry) {
      const rebuilt = await entryFromFile(id, onDisk);
      if (rebuilt) { fixes.push(rebuilt); known.set(id, rebuilt); report.relocated++; }
      else report.missing.push({ id, rel: onDisk });
      continue;
    }
    if (entry.rel !== onDisk) {
      const moved = { ...entry, rel: onDisk };
      if (!onDisk.startsWith(TRASH_DIR + '/')) delete moved.trashedAt;
      fixes.push(moved);
      known.set(id, moved);
      report.relocated++;
    }
    const current = known.get(id)!;
    const target = expected.get(id);
    if (target && relDir(current.rel) !== target) report.misplaced.push({ id, from: current.rel, to: joinRel(target, relName(current.rel)) });
    else report.ok++;
  }
  // Catalogue entries nobody references anymore.
  for (const entry of known.values()) {
    if (refs.ids.has(entry.id)) continue;
    const onDisk = files.get(entry.id);
    if (entry.trashedAt || onDisk?.startsWith(TRASH_DIR + '/')) { report.inTrash++; continue; }
    if (!onDisk) continue;
    if (Date.now() - entry.addedAt < ORPHAN_GRACE_MS) continue;
    report.orphans.push({ id: entry.id, rel: onDisk });
  }
  if (fixes.length) {
    await putEntries(fixes);
    logEvent('bilan', `${fixes.length} chemin(s) corrigé(s) après déplacement manuel`);
  }
  report.purged = await purgeTrash(refs.ids);
  await AsyncStorage.setItem(FOLDER_REPORT_KEY, JSON.stringify(report));
  logEvent('bilan', `ok ${report.ok}, à ranger ${report.misplaced.length}, manquantes ${report.missing.length}, inutilisées ${report.orphans.length}, anciens liens ${report.legacyLinks}`);
  void flushJournal();
  return report;
}

export async function lastFolderReport(): Promise<FolderReport | null> {
  try { const raw = await AsyncStorage.getItem(FOLDER_REPORT_KEY); return raw ? JSON.parse(raw) as FolderReport : null; }
  catch { return null; }
}

/** Copy → verify fingerprint → update catalogue → delete the old file. */
async function moveEntry(entry: PhotoEntry, toRel: string, patch: Partial<PhotoEntry> = {}): Promise<void> {
  if (!FileSystem.cacheDirectory) throw new Error('Stockage temporaire indisponible.');
  const temp = `${FileSystem.cacheDirectory}y2-move-${entry.id}`;
  let created: string | null = null;
  try {
    await FileSystem.copyAsync({ from: await fileUri(entry.rel), to: temp });
    const tempMd5 = await md5Of(temp);
    if (tempMd5 !== entry.md5) throw new Error(`Contenu différent de l’original : ${entry.rel}`);
    created = await createFile(toRel, entry.mime);
    const base64 = await FileSystem.readAsStringAsync(temp, { encoding: FileSystem.EncodingType.Base64 });
    await FileSystem.writeAsStringAsync(created, base64, { encoding: FileSystem.EncodingType.Base64 });
    if (await md5Of(created) !== entry.md5) throw new Error(`Copie incorrecte : ${toRel}`);
    const next: PhotoEntry = { ...entry, ...patch, rel: toRel, verifiedAt: Date.now() };
    if (!('trashedAt' in patch)) delete next.trashedAt;
    await putEntries([next]);
    created = null;
    await deleteRel(entry.rel).catch(() => {});
    logEvent('rangement', `${entry.rel} → ${toRel}`);
  } finally {
    FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => {});
    if (created) await FileSystem.deleteAsync(created, { idempotent: true }).catch(() => {});
  }
}

export type ActionResult = { done: number; failed: string[] };

/** Move photos to the folder matching their project / task / trip. */
export async function arrangePhotos(report: FolderReport, onProgress?: (done: number, total: number) => void): Promise<ActionResult> {
  await loadCatalogue();
  const result: ActionResult = { done: 0, failed: [] };
  for (const [index, item] of report.misplaced.entries()) {
    onProgress?.(index, report.misplaced.length);
    const entry = getEntry(item.id);
    if (!entry || entry.rel !== item.from) continue;
    try { await moveEntry(entry, item.to); result.done++; }
    catch (error) { result.failed.push(error instanceof Error ? error.message : item.from); }
  }
  void flushJournal();
  return result;
}

/** Unused photos go to Corbeille/ and are deleted 30 days later. */
export async function trashOrphans(report: FolderReport): Promise<ActionResult> {
  await loadCatalogue();
  const stillReferenced = collectReferences(await readPhotoData()).ids;
  const result: ActionResult = { done: 0, failed: [] };
  for (const item of report.orphans) {
    const entry = getEntry(item.id);
    if (!entry || stillReferenced.has(item.id) || entry.rel !== item.rel) continue;
    const target = joinRel(TRASH_DIR, entry.rel.startsWith(PHOTOS_DIR + '/') ? entry.rel.slice(PHOTOS_DIR.length + 1) : relName(entry.rel));
    try { await moveEntry(entry, target, { trashedAt: Date.now() }); result.done++; }
    catch (error) { result.failed.push(error instanceof Error ? error.message : item.rel); }
  }
  void flushJournal();
  return result;
}

async function purgeTrash(referenced: Set<string>): Promise<number> {
  const expired = allEntries().filter(entry => entry.trashedAt && !referenced.has(entry.id)
    && Date.now() - entry.trashedAt > TRASH_DAYS * 86_400_000);
  const removed: string[] = [];
  for (const entry of expired) {
    try { await deleteRel(entry.rel); removed.push(entry.id); logEvent('corbeille', `supprimée après ${TRASH_DAYS} jours : ${entry.rel}`); }
    catch { /* retried next week */ }
  }
  await removeEntries(removed);
  return removed.length;
}

/** Weekly automatic check (dry run + catalogue fixes + Corbeille purge). */
export async function runWeeklyMaintenanceIfNeeded(): Promise<void> {
  try {
    const last = Number(await AsyncStorage.getItem(LAST_MAINTENANCE_KEY));
    if (Number.isFinite(last) && Date.now() - last < WEEK_MS) return;
    if (!await libraryAccessible()) return;
    await checkFolder();
    await AsyncStorage.setItem(LAST_MAINTENANCE_KEY, String(Date.now()));
  } catch { /* retried on a later launch */ }
}

/**
 * Removes links of the former photo system (they cannot be repaired) from
 * projects, tasks and trips. A backup is made first. The caller reloads the app.
 */
export async function detachLegacyPhotos(): Promise<{ removed: number }> {
  if (!await saveBackup('avant-detachement')) {
    throw new Error('La sauvegarde de sécurité a échoué : rien n’a été modifié.');
  }
  const data = await readPhotoData();
  let removed = 0;
  const keep = (uri: string | undefined) => {
    const ok = isLibraryRef(uri);
    if (!ok) removed++;
    return ok;
  };
  const projects = data.projects.map(project => {
    const before = selectionUris(project.journalBeforeAfter?.before).filter(uri => !isLibraryRef(uri)).length
      + selectionUris(project.journalBeforeAfter?.after).filter(uri => !isLibraryRef(uri)).length;
    removed += before;
    const clean = (selection: NonNullable<Project['journalBeforeAfter']>['before']) => {
      if (!selection) return undefined;
      const items = (Array.isArray(selection) ? selection : [selection]).filter(item => isLibraryRef(item.uri));
      return items.length ? items : undefined;
    };
    return {
      ...project,
      photos: (project.photos ?? []).filter(keep),
      ...(project.journalBeforeAfter ? { journalBeforeAfter: {
        before: clean(project.journalBeforeAfter.before), after: clean(project.journalBeforeAfter.after),
      } } : {}),
    };
  });
  const tasks = data.tasks.map(task => {
    const photos = (task.photos ?? []).filter(keep);
    const kept = new Set(photos);
    const photoTakenAt = task.photoTakenAt
      ? Object.fromEntries(Object.entries(task.photoTakenAt).filter(([uri]) => isLibraryRef(uri))) : undefined;
    const photoDateScanAttempted = task.photoDateScanAttempted
      ? Object.fromEntries(Object.entries(task.photoDateScanAttempted).filter(([uri]) => isLibraryRef(uri))) as Record<string, true> : undefined;
    return {
      ...task, photos,
      ...(photoTakenAt ? { photoTakenAt } : {}),
      ...(photoDateScanAttempted ? { photoDateScanAttempted } : {}),
      ...(task.projectPhotoUris ? { projectPhotoUris: task.projectPhotoUris.filter(uri => isLibraryRef(uri)) } : {}),
      ...(task.subTasks ? { subTasks: task.subTasks.map(subTask => subTask.photoUris
        ? { ...subTask, photoUris: subTask.photoUris.filter(uri => kept.has(uri)) } : subTask) } : {}),
    };
  });
  const trips: Trip[] = data.trips.map(trip => {
    if (!trip.photos?.length) return trip;
    const photos = trip.photos.filter(photo => keep(photo.uri));
    const ids = new Set(photos.map(photo => photo.id));
    return {
      ...trip, photos,
      ...(trip.activityMoments ? { activityMoments: trip.activityMoments.map(moment =>
        moment.photoId && !ids.has(moment.photoId) ? { ...moment, photoId: undefined } : moment) } : {}),
    };
  });
  await AsyncStorage.multiSet([
    ['@yoann2_projects', JSON.stringify(projects)],
    ['@yoann2_tasks', JSON.stringify(tasks)],
    ['@yoann2_trips', JSON.stringify(trips)],
  ]);
  logEvent('détachement', `${removed} ancien(s) lien(s) photo retiré(s)`);
  await flushJournal();
  return { removed };
}
