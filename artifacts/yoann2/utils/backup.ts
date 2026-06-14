import * as FileSystem from 'expo-file-system/legacy';

const BACKUP_DIR = FileSystem.documentDirectory + 'yoann2_backups/';
const MAX_BACKUPS = 5;

export async function ensureBackupDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(BACKUP_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
  }
}

export async function saveBackup(jsonData: string): Promise<string | null> {
  try {
    await ensureBackupDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup_${ts}.json`;
    const uri = BACKUP_DIR + filename;
    await FileSystem.writeAsStringAsync(uri, jsonData, { encoding: FileSystem.EncodingType.UTF8 });
    await pruneOldBackups();
    return uri;
  } catch {
    return null;
  }
}

export async function pruneOldBackups(): Promise<void> {
  try {
    const files = await FileSystem.readDirectoryAsync(BACKUP_DIR);
    const sorted = files
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .sort();
    if (sorted.length > MAX_BACKUPS) {
      const toDelete = sorted.slice(0, sorted.length - MAX_BACKUPS);
      for (const f of toDelete) {
        await FileSystem.deleteAsync(BACKUP_DIR + f, { idempotent: true });
      }
    }
  } catch {
  }
}

export async function listBackups(): Promise<{ name: string; uri: string; date: Date }[]> {
  try {
    await ensureBackupDir();
    const files = await FileSystem.readDirectoryAsync(BACKUP_DIR);
    return files
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .sort()
      .reverse()
      .map(f => {
        const datePart = f.replace('backup_', '').replace('.json', '').replace(/-/g, (m, i) => {
          if (i === 4 || i === 7) return '-';
          if (i === 10) return 'T';
          if (i === 13 || i === 16) return ':';
          return m;
        });
        return {
          name: f,
          uri: BACKUP_DIR + f,
          date: new Date(datePart),
        };
      });
  } catch {
    return [];
  }
}

export async function readBackup(uri: string): Promise<string | null> {
  try {
    return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  } catch {
    return null;
  }
}
