import * as FileSystem from 'expo-file-system/legacy';

const TRIP_PHOTO_DIR = `${FileSystem.documentDirectory ?? ''}trip-photos/`;

/**
 * Keep a private app copy of a gallery photo. Android's shared-storage paths
 * can become unreadable later because of scoped-storage permissions.
 */
export async function persistTripPhotoUri(sourceUri: string, photoId: string): Promise<string> {
  if (!sourceUri) throw new Error('URI photo manquante.');
  if (sourceUri.startsWith(TRIP_PHOTO_DIR)) return sourceUri;
  if (!FileSystem.documentDirectory) throw new Error('Stockage local indisponible.');

  const directoryInfo = await FileSystem.getInfoAsync(TRIP_PHOTO_DIR);
  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(TRIP_PHOTO_DIR, { intermediates: true });
  }
  const destination = `${TRIP_PHOTO_DIR}${photoId}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  const info = await FileSystem.getInfoAsync(destination);
  if (!info.exists) throw new Error('La copie locale de la photo a échoué.');
  return destination;
}