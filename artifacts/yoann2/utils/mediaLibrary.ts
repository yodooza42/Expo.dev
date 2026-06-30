import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

const ASSET_MAP_KEY = '@yoann2_photo_assets';

async function getAssetMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(ASSET_MAP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function storeAssetId(localUri: string, assetId: string): Promise<void> {
  try {
    const map = await getAssetMap();
    map[localUri] = assetId;
    await AsyncStorage.setItem(ASSET_MAP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function getAssetId(localUri: string): Promise<string | null> {
  try {
    const map = await getAssetMap();
    return map[localUri] ?? null;
  } catch {
    return null;
  }
}

/**
 * Saves a local photo to the phone's public media library under the album
 * "Yoann 2.0 – <projectName>". Returns the media library assetId, or null if
 * the permission was denied or an error occurred.
 *
 * On Android this creates a real folder in Pictures/.
 * On iOS this creates a named album in the Camera Roll.
 * Both survive app uninstallation.
 */
export async function savePhotoToPublicAlbum(
  localUri: string,
  projectName: string
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') return null;

    const albumName = `Yoann 2.0 – ${projectName}`;
    const asset = await MediaLibrary.createAssetAsync(localUri);

    let album = await MediaLibrary.getAlbumAsync(albumName);
    if (!album) {
      await MediaLibrary.createAlbumAsync(albumName, asset, false);
    } else {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    }

    await storeAssetId(localUri, asset.id);
    return asset.id;
  } catch {
    return null;
  }
}

/**
 * Attempts to recover a missing local photo from the media library asset that
 * was stored when the photo was first saved.
 *
 * Returns the new local URI if recovery succeeded, or null if not possible
 * (e.g. asset was deleted from the gallery).
 */
export async function recoverPhotoFromAsset(localUri: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const assetId = await getAssetId(localUri);
    if (!assetId) return null;

    const { status } = await MediaLibrary.getPermissionsAsync();
    if (status !== 'granted') return null;

    const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
    if (!assetInfo?.localUri) return null;

    const dir = FileSystem.documentDirectory + 'task_photos/';
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

    const ext = localUri.split('.').pop()?.split('?')[0] ?? 'jpg';
    const dest = dir + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;
    await FileSystem.copyAsync({ from: assetInfo.localUri, to: dest });

    await storeAssetId(dest, assetId);
    return dest;
  } catch {
    return null;
  }
}
