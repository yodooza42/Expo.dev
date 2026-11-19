import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

import { importPhotos } from '@/utils/library/importPhoto';
import { isLibraryRef, refId } from '@/utils/library/paths';
import { isLifeAlbum, type AlbumPhoto, emptyLifeAlbum, type LifeAlbum } from '@/utils/lifeAlbumCore';

export * from '@/utils/lifeAlbumCore';
export const LIFE_ALBUM_STORAGE_KEY = '@yoann2_life_album_v1';
const ALBUM_PHOTOS_FOLDER = 'Photos/Album de vie';

export async function loadLifeAlbum(): Promise<LifeAlbum> {
  const raw = await AsyncStorage.getItem(LIFE_ALBUM_STORAGE_KEY);
  if (raw === null) return emptyLifeAlbum();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('Les données de l’album sont illisibles. Elles n’ont pas été remplacées.'); }
  if (!isLifeAlbum(parsed)) {
    throw new Error('Le format de l’album est invalide. Les données n’ont pas été remplacées.');
  }
  return parsed;
}

export async function saveLifeAlbum(album: LifeAlbum): Promise<void> {
  if (!isLifeAlbum(album)) throw new Error('Les informations de l’album sont invalides.');
  await AsyncStorage.setItem(LIFE_ALBUM_STORAGE_KEY, JSON.stringify(album));
}

export async function importAlbumPhotos(): Promise<{ photos: AlbumPhoto[]; failed: string[] }> {
  const selection = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 1,
  });
  if (selection.canceled) return { photos: [], failed: [] };
  const imported = await importPhotos(selection.assets.map(asset => ({
    uri: asset.uri,
    takenAt: asset.exif?.DateTimeOriginal ? Date.parse(String(asset.exif.DateTimeOriginal)) || undefined : undefined,
    originalName: asset.fileName,
  })), ALBUM_PHOTOS_FOLDER);

  const unique = new Map<string, AlbumPhoto>();
  for (const item of imported.imported) {
    if (!isLibraryRef(item.ref)) continue;
    const id = refId(item.ref);
    if (!unique.has(id)) unique.set(id, { id, uri: item.ref, takenAt: item.takenAt, addedAt: Date.now() });
  }
  return { photos: [...unique.values()], failed: imported.failed };
}

