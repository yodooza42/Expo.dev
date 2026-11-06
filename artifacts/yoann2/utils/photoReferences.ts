import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export function photoFilename(uri: string): string {
  try { return decodeURIComponent(uri).split('/').pop() ?? ''; }
  catch { return uri.split('/').pop() ?? ''; }
}

/** Convert a shared-storage path only within an already granted SAF tree. */
export function grantedPhotoUri(uri: string, treeUri: string): string | null {
  if (!uri.startsWith('file://')) return null;
  const path = decodeURIComponent(uri.slice(7));
  const relative = path.replace(/^\/(?:storage\/emulated\/0|sdcard)\//, '');
  if (relative === path || relative.split('/').some(part => part === '..')) return null;
  const tree = treeUri.match(/^(content:\/\/[^/]+\/tree\/([^/]+))/);
  if (!tree) return null;
  const grant = decodeURIComponent(tree[2]!);
  const document = `primary:${relative}`;
  if (document !== grant && !document.startsWith(grant.endsWith(':') ? grant : grant + '/')) return null;
  return `${tree[1]}/document/${encodeURIComponent(document)}`;
}

export async function photoExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory && (!('size' in info) || info.size > 0);
  }
  catch { return false; }
}

/** No dialogs, no writes, no filename guessing in the gallery. */
export async function photoCandidates(uri: string): Promise<string[]> {
  if (Platform.OS === 'web') return [uri];
  const candidates = [uri];
  if (/\/(?:task_photos|project_photos)\//.test(uri) && FileSystem.documentDirectory) {
    const name = photoFilename(uri);
    for (const folder of ['task_photos', 'project_photos']) {
      const local = `${FileSystem.documentDirectory}${folder}/${name}`;
      if (local !== uri && await photoExists(local)) candidates.unshift(local);
    }
  }
  const roots = await AsyncStorage.multiGet(['@yoann2_saf_root_uri', '@yoann2_saf_photos_uri', '@yoann2_photo_protection_v1']);
  const registry = roots.find(([key]) => key === '@yoann2_photo_protection_v1')?.[1];
  if (registry) {
    try {
      const records = JSON.parse(registry) as Array<{ source: string; local: string; external: string | null }>;
      for (const record of records.filter(item => item.source === uri || item.local === uri)) {
        if (record.local && await photoExists(record.local)) candidates.unshift(record.local);
        if (record.external) candidates.push(record.external);
      }
    } catch { /* A broken protection index must not hide an otherwise readable original. */ }
  }
  for (const [key, root] of roots) {
    if (key === '@yoann2_photo_protection_v1') continue;
    if (!root) continue;
    try {
      const saf = grantedPhotoUri(uri, root);
      if (saf) candidates.push(saf);
    } catch { /* Malformed legacy URI: let the image show its unavailable state. */ }
  }
  return [...new Set(candidates)];
}

/** Replace a dead link, not the user's still-readable original. Never remove photos. */
export async function mergeRecoveredPhotoUris(existing: string[], incoming: string[]) {
  const uris = [...existing];
  let added = 0;
  let repaired = 0;
  for (const uri of [...new Set(incoming)]) {
    if (!await photoExists(uri)) continue;
    const index = uris.findIndex(old => photoFilename(old) === photoFilename(uri));
    if (index === -1) {
      uris.push(uri);
      added++;
    } else if (uris[index] !== uri && !await photoExists(uris[index]!)) {
      uris[index] = uri;
      repaired++;
    }
  }
  return { uris, added, repaired };
}

