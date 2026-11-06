import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';
import { photoCandidates } from '@/utils/photoReferences';

async function readStoryPhoto(uri: string, isCurrent: () => boolean): Promise<string> {
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) =>
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
  if (!isCurrent()) throw new Error('Génération annulée.');
  if (!(size.width > 0 && size.height > 0)) throw new Error('Photo illisible.');
  const scale = Math.min(1, 1280 / size.width, 1280 / size.height);
  const image = await manipulateAsync(uri, scale < 1 ? [{ resize: {
    width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)),
  } }] : [], { format: SaveFormat.JPEG, compress: 0.82, base64: true });
  try {
    if (!image.base64) throw new Error('Photo illisible.');
    return `data:image/jpeg;base64,${image.base64}`;
  } finally {
    if (image.uri !== uri) void FileSystem.deleteAsync(image.uri, { idempotent: true }).catch(() => {});
  }
}
export async function prepareStoryPhoto(uri: string, isCurrent: () => boolean): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = (async () => {
    const alternatives = await photoCandidates(uri);
    for (const source of alternatives.length ? alternatives : [uri]) {
      if (!isCurrent()) throw new Error('Génération annulée.');
      try { return await readStoryPhoto(source, isCurrent); } catch {
        if (!isCurrent()) throw new Error('Génération annulée.');
      }
    }
    throw new Error('Photo inaccessible. Rétablis son accès ou décoche-la dans le carnet.');
  })();
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Une photo ne répond pas. Vérifie son accès ou décoche-la.')), 20_000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
