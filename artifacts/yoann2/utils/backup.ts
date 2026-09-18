import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { SAF_BACKUP_KEY } from '@/utils/photoStorage';

const SAF              = FileSystem.StorageAccessFramework;
const BACKUP_LIST_KEY  = '@yoann2_backup_list';
const LAST_BACKUP_KEY  = '@yoann2_last_backup_ts';
const MAX_BACKUPS      = 5;

type BackupEntry = { uri: string; ts: number; filename: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getBackupDir(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SAF_BACKUP_KEY);
  } catch {
    return null;
  }
}

async function getBackupList(): Promise<BackupEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(BACKUP_LIST_KEY);
    return raw ? (JSON.parse(raw) as BackupEntry[]) : [];
  } catch {
    return [];
  }
}

async function setBackupList(list: BackupEntry[]): Promise<void> {
  await AsyncStorage.setItem(BACKUP_LIST_KEY, JSON.stringify(list));
}

// ── Collect all app data from AsyncStorage ────────────────────────────────────
// Préfixes inclus : @yoann2 (principal) + modules Marie, Anna, Work qui
// utilisent leurs propres préfixes et seraient perdus lors d'un transfert
// si on ne les capture pas explicitement.
const BACKUP_KEY_PREFIXES = ['@yoann2', '@marie_', '@anna_', '@work_'];

async function collectAllData(): Promise<string> {
  const allKeys = await AsyncStorage.getAllKeys();
  const keys = allKeys.filter(k => BACKUP_KEY_PREFIXES.some(p => k.startsWith(p)));
  const pairs = await AsyncStorage.multiGet(keys);
  const data: Record<string, string | null> = {};
  for (const [k, v] of pairs) data[k] = v;
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: 1,
    data,
  }, null, 2);
}

// ── Save one backup (SAF write + rotate) ─────────────────────────────────────

export async function saveBackup(): Promise<boolean> {
  try {
    const backupDir = await getBackupDir();
    if (!backupDir) return false;

    const jsonData  = await collectAllData();
    const ts        = Date.now();
    const dateStr   = new Date(ts).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename  = `backup_${dateStr}.json`;

    const tmpPath = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(tmpPath, jsonData, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const base64 = await FileSystem.readAsStringAsync(tmpPath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const fileUri = await SAF.createFileAsync(backupDir, filename, 'application/json');
    await SAF.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});

    const list = await getBackupList();
    list.push({ uri: fileUri, ts, filename });

    if (list.length > MAX_BACKUPS) {
      const toDelete = list.splice(0, list.length - MAX_BACKUPS);
      for (const entry of toDelete) {
        FileSystem.deleteAsync(entry.uri, { idempotent: true }).catch(() => {});
      }
    }

    await setBackupList(list);
    await AsyncStorage.setItem(LAST_BACKUP_KEY, String(ts));
    return true;
  } catch {
    return false;
  }
}

// ── Daily trigger — call on each foreground ───────────────────────────────────
//
// Runs if: no backup today AND current time >= 10:00

export async function runDailyBackupIfNeeded(): Promise<void> {
  try {
    const now = new Date();
    if (now.getHours() < 10) return;

    const raw = await AsyncStorage.getItem(LAST_BACKUP_KEY);
    if (raw) {
      const last = new Date(parseInt(raw, 10));
      const todayAt10 = new Date(now);
      todayAt10.setHours(10, 0, 0, 0);
      if (last >= todayAt10) return;
    }

    await saveBackup();
  } catch {
    // silently ignore
  }
}

// ── Read helpers (for future restore UI) ─────────────────────────────────────

export async function listBackups(): Promise<BackupEntry[]> {
  const list = await getBackupList();
  return [...list].reverse();
}

export async function readBackup(uri: string): Promise<string | null> {
  try {
    return await SAF.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch {
    return null;
  }
}

export async function deleteBackup(uri: string): Promise<void> {
  const list = await getBackupList();
  const next = list.filter(e => e.uri !== uri);
  await setBackupList(next);
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

// ── Import from any file picked by the user (document picker) ────────────────
//
// Lets the user select any backup_*.json from their device storage, bypassing
// the AsyncStorage backup list (useful after reinstall where the list was wiped).

export async function importBackupFromFile(): Promise<{ ok: boolean; canceled?: boolean; error?: string }> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', '*/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled) return { ok: false, canceled: true };

    const asset = result.assets[0];
    if (!asset) return { ok: false, error: 'Aucun fichier sélectionné.' };

    const raw = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const parsed = JSON.parse(raw) as { version?: number; data?: Record<string, string | null> };
    if (parsed?.version !== 1 || !parsed?.data || typeof parsed.data !== 'object') {
      return { ok: false, error: 'Format de fichier invalide. Vérifiez qu\'il s\'agit bien d\'une sauvegarde Yoann2.0 (version 1).' };
    }

    const pairs: [string, string][] = Object.entries(parsed.data)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([k, v]) => [k, v]);

    await AsyncStorage.multiSet(pairs);

    const ts = Date.now();
    const filename = asset.name ?? `backup_importé_${new Date(ts).toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;

    // Copy into the managed SAF backup folder so the list entry has a durable URI.
    // If no folder is configured yet, skip adding to the list (data is restored regardless).
    const backupDir = await getBackupDir();
    if (backupDir) {
      try {
        const safUri = await SAF.createFileAsync(backupDir, filename, 'application/json');
        const base64 = Buffer.from(raw).toString('base64');
        await SAF.writeAsStringAsync(safUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        const list = await getBackupList();
        list.push({ uri: safUri, ts, filename });
        if (list.length > MAX_BACKUPS) list.splice(0, list.length - MAX_BACKUPS);
        await setBackupList(list);
      } catch {
        // Durable copy failed — data is still restored, just not in the list
      }
    }

    await AsyncStorage.setItem(LAST_BACKUP_KEY, String(ts));
    return { ok: true };
  } catch {
    return { ok: false, error: 'Impossible de lire ce fichier.' };
  }
}

// ── Rebuild backup list from SAF folder ──────────────────────────────────────
//
// Scans the configured SAF backup folder for backup_*.json files and
// reconstructs @yoann2_backup_list from what is actually on disk.
// Only runs if the list is empty (unless force=true).

export async function rebuildBackupListFromSAF(force = false): Promise<boolean> {
  try {
    const backupDir = await getBackupDir();
    if (!backupDir) return false;

    if (!force) {
      const existing = await getBackupList();
      if (existing.length > 0) return false;
    }

    const uris = await SAF.readDirectoryAsync(backupDir);

    const backupEntries: BackupEntry[] = [];
    for (const uri of uris) {
      const decoded = decodeURIComponent(uri);
      const filename = decoded.split('/').pop() ?? '';
      if (!filename.startsWith('backup_') || !filename.endsWith('.json')) continue;

      // Filename format: backup_YYYY-MM-DDTHH-MM-SS.json
      const dateStr = filename.slice('backup_'.length, -'.json'.length);
      const parts = dateStr.split('T');
      if (parts.length !== 2) continue;
      const [datePart, timePart] = parts;
      const isoStr = `${datePart}T${timePart.replace(/-/g, ':')}`;
      const ts = new Date(isoStr).getTime();
      if (isNaN(ts)) continue;

      backupEntries.push({ uri, ts, filename });
    }

    backupEntries.sort((a, b) => a.ts - b.ts);
    const kept = backupEntries.slice(-MAX_BACKUPS);
    await setBackupList(kept);
    return kept.length > 0;
  } catch {
    return false;
  }
}

// ── Restore from a backup entry ───────────────────────────────────────────────
//
// Reads the JSON file and restores every key back into AsyncStorage.
// Keys that existed before but are absent from the backup are left untouched.

export async function restoreBackup(uri: string): Promise<boolean> {
  try {
    const raw = await SAF.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = JSON.parse(raw) as { version: number; data: Record<string, string | null> };
    if (!parsed?.data || typeof parsed.data !== 'object') return false;

    const pairs: [string, string][] = Object.entries(parsed.data)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([k, v]) => [k, v]);

    await AsyncStorage.multiSet(pairs);
    return true;
  } catch {
    return false;
  }
}
