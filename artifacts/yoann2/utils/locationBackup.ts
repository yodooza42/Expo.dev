import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const KEY_PREFIX        = '@yoann2_location_';
const LOCAL_BACKUP_PATH = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}yoann2_gps_backup.json`
  : null;

type BackupData = {
  version: 1;
  exportedAt: string;
  days: Record<string, Array<{ lat: number; lng: number; timestamp: number }>>;
};

// ── Local auto-backup (called after each appendPoint) ─────────────────────────

export async function autoBackup(): Promise<void> {
  if (!LOCAL_BACKUP_PATH) return;
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const locKeys = allKeys.filter(k => k.startsWith(KEY_PREFIX));
    if (locKeys.length === 0) return;

    const pairs = await AsyncStorage.multiGet(locKeys);
    const days: BackupData['days'] = {};
    for (const [key, value] of pairs) {
      if (value) days[key.replace(KEY_PREFIX, '')] = JSON.parse(value);
    }

    const backup: BackupData = { version: 1, exportedAt: new Date().toISOString(), days };
    await FileSystem.writeAsStringAsync(LOCAL_BACKUP_PATH, JSON.stringify(backup));
  } catch {
    // silently ignore
  }
}

// ── Restore from local backup on startup (if AsyncStorage is empty) ───────────

export async function tryRestoreFromLocalBackup(): Promise<boolean> {
  if (!LOCAL_BACKUP_PATH) return false;
  try {
    const info = await FileSystem.getInfoAsync(LOCAL_BACKUP_PATH);
    if (!info.exists) return false;

    const allKeys = await AsyncStorage.getAllKeys();
    const locKeys = allKeys.filter(k => k.startsWith(KEY_PREFIX));
    if (locKeys.length > 0) return false;

    const raw    = await FileSystem.readAsStringAsync(LOCAL_BACKUP_PATH);
    const backup = JSON.parse(raw) as BackupData;
    if (!backup?.days || typeof backup.days !== 'object') return false;

    const pairs: [string, string][] = Object.entries(backup.days).map(([day, pts]) => [
      KEY_PREFIX + day,
      JSON.stringify(pts),
    ]);
    await AsyncStorage.multiSet(pairs);
    return true;
  } catch {
    return false;
  }
}

// ── Manual export → share as JSON file ───────────────────────────────────────

export async function exportBackup(): Promise<void> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('Cache directory unavailable');

  const allKeys = await AsyncStorage.getAllKeys();
  const locKeys = allKeys.filter(k => k.startsWith(KEY_PREFIX));

  const pairs = await AsyncStorage.multiGet(locKeys);
  const days: BackupData['days'] = {};
  for (const [key, value] of pairs) {
    if (value) days[key.replace(KEY_PREFIX, '')] = JSON.parse(value);
  }

  const backup  = { version: 1 as const, exportedAt: new Date().toISOString(), days };
  const filename = `yoann2_gps_${new Date().toISOString().slice(0, 10)}.json`;
  const tmpPath  = `${cacheDir}${filename}`;

  await FileSystem.writeAsStringAsync(tmpPath, JSON.stringify(backup, null, 2));

  const ok = await Sharing.isAvailableAsync();
  if (ok) {
    await Sharing.shareAsync(tmpPath, {
      mimeType: 'application/json',
      dialogTitle: 'Sauvegarder les données GPS',
      UTI: 'public.json',
    });
  }
}

// ── Manual import from JSON file ──────────────────────────────────────────────

export async function importBackup(): Promise<{ restored: number; error?: string }> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) return { restored: 0 };

    const uri    = result.assets[0].uri;
    const raw    = await FileSystem.readAsStringAsync(uri);
    const backup = JSON.parse(raw) as BackupData;

    if (!backup?.days || typeof backup.days !== 'object') {
      return { restored: 0, error: 'Fichier invalide ou incompatible.' };
    }

    const pairs: [string, string][] = Object.entries(backup.days).map(([day, pts]) => [
      KEY_PREFIX + day,
      JSON.stringify(pts),
    ]);
    await AsyncStorage.multiSet(pairs);
    await autoBackup();

    return { restored: Object.keys(backup.days).length };
  } catch (e: unknown) {
    return { restored: 0, error: (e as Error)?.message ?? 'Erreur inconnue' };
  }
}
