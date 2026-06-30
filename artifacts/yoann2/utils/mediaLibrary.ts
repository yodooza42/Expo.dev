import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

import type { TaskPhoto } from '@/types';

/** Extract the local file URI from a raw-string or TaskPhoto entry. */
export function getPhotoUri(photo: string | TaskPhoto): string {
  return typeof photo === 'string' ? photo : photo.uri;
}

/** Extract the media-library assetId from a TaskPhoto entry (undefined for raw strings). */
export function getPhotoAssetId(photo: string | TaskPhoto): string | undefined {
  return typeof photo === 'string' ? undefined : photo.assetId;
}

/**
 * Copies localUri into the phone's public media library under the album
 * "Yoann 2.0 – <projectName>", then returns a TaskPhoto object with the
 * assetId embedded so it can be stored directly in the task/project record.
 *
 * Falls back gracefully (returns { uri: localUri }) if the permission is
 * denied or any error occurs — the photo is still saved to internal storage.
 *
 * On Android this creates a real sub-folder under Pictures/.
 * On iOS this creates a named album in the Camera Roll.
 * Both survive app uninstallation.
 */
export async function savePhotoToPublicAlbum(
  localUri: string,
  projectName: string
): Promise<TaskPhoto> {
  const base: TaskPhoto = { uri: localUri };
  if (Platform.OS === 'web') return base;
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') return base;

    const albumName = `Yoann 2.0 – ${projectName}`;
    const asset = await MediaLibrary.createAssetAsync(localUri);
    const capturedAt =
      asset.creationTime && asset.creationTime > 0
        ? new Date(asset.creationTime * 1000).toISOString()
        : undefined;

    let album = await MediaLibrary.getAlbumAsync(albumName);
    if (!album) {
      await MediaLibrary.createAlbumAsync(albumName, asset, false);
    } else {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    }

    return { uri: localUri, assetId: asset.id, capturedAt };
  } catch {
    return base;
  }
}

/**
 * Attempts to recover a missing local file using the assetId stored in the
 * TaskPhoto object. Returns the new local URI if recovery succeeded, or null
 * if the asset was also deleted from the gallery.
 */
export async function recoverPhotoFromAsset(photo: TaskPhoto): Promise<string | null> {
  if (Platform.OS === 'web' || !photo.assetId) return null;
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') return null;

    const assetInfo = await MediaLibrary.getAssetInfoAsync(photo.assetId);
    if (!assetInfo?.localUri) return null;

    const dir = FileSystem.documentDirectory + 'task_photos/';
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

    const ext = photo.uri.split('.').pop()?.split('?')[0] ?? 'jpg';
    const dest = dir + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;
    await FileSystem.copyAsync({ from: assetInfo.localUri, to: dest });
    return dest;
  } catch {
    return null;
  }
}
