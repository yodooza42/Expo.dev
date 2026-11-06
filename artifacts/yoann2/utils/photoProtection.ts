import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { photoCandidates, photoExists, photoFilename } from '@/utils/photoReferences';
import { savePhotoToProject } from '@/utils/photoStorage';

const KEY = '@yoann2_photo_protection_v1';
export type PhotoOwner = { project: string; folder?: string };
type Record = PhotoOwner & {
  source: string; local: string; external: string | null; error?: string;
};
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => Promise<void>>();
export const photoProtectionEvents = {
  subscribe(fn: () => Promise<void>) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  async retry() { await Promise.all([...listeners].map(fn => fn())); },
};

async function records(): Promise<Record[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Le registre de protection des photos est illisible.');
  return parsed;
}

/** Serialized to keep the durable registry intact during multiple photo imports. */
export function protectPhoto(source: string, owner: PhotoOwner): Promise<string> {
  if (Platform.OS === 'web') return Promise.resolve(source);
  const operation = queue.then(async () => {
    const all = await records();
    let record = all.find(item => (item.source === source || item.local === source)
      && item.project === owner.project && item.folder === owner.folder);
    const candidates = [...new Set([
      record?.local, ...(await photoCandidates(source)), record?.external,
    ].filter((value): value is string => !!value))];
    let local = record?.local ?? '';
    if (!local || !await photoExists(local)) {
      if (!FileSystem.documentDirectory) throw new Error('Stockage permanent indisponible.');
      const directory = FileSystem.documentDirectory + 'photo_vault/';
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      let found = false;
      for (const candidate of candidates) {
        if (candidate.startsWith(FileSystem.documentDirectory) && await photoExists(candidate)) {
          local = candidate;
          found = true;
          break;
        }
        const extension = photoFilename(candidate).match(/\.(jpe?g|png|webp|heic|heif|gif)$/i)?.[0] ?? '.jpg';
        const target = `${directory}${Date.now()}_${Math.random().toString(36).slice(2)}${extension}`;
        try {
          await FileSystem.copyAsync({ from: candidate, to: target });
          const info = await FileSystem.getInfoAsync(target);
          if (!info.exists || ('size' in info && info.size === 0)) continue;
          local = target;
          found = true;
          break;
        } catch { /* Try the exact alternate path or external copy, never another photo. */ }
      }
      if (!found) throw new Error('Photo source inaccessible : aucune copie ne peut être créée.');
    }
    if (!record) {
      record = { ...owner, source, local, external: null };
      all.push(record);
    }
    record.local = local;
    // Persist the successful local copy BEFORE attempting the second copy.
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
    if (!record.external || !await photoExists(record.external)) {
      const configured = await AsyncStorage.getItem('@yoann2_saf_photos_uri');
      record.external = configured
        ? await savePhotoToProject(local, owner.project, photoFilename(local), undefined, owner.folder)
        : null;
      record.error = record.external ? undefined : 'Copie externe en attente : configure ou réautorise le dossier Yoann2.0.';
      await AsyncStorage.setItem(KEY, JSON.stringify(all));
    }
    return local;
  });
  queue = operation.catch(() => {});
  return operation;
}

export async function photoProtectionStatus() {
  await queue;
  const all = await records();
  const checked = await Promise.all(all.map(async item => ({
    local: await photoExists(item.local),
    external: !!item.external && await photoExists(item.external),
  })));
  return {
    local: checked.filter(item => item.local).length,
    backedUp: checked.filter(item => item.local && item.external).length,
    pending: checked.filter(item => item.local && !item.external).length,
    missing: Number(await AsyncStorage.getItem('@yoann2_photo_protection_missing') ?? 0),
  };
}
