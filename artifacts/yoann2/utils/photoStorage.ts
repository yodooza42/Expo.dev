import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';

const SAF   = FileSystem.StorageAccessFramework;
const SAF_KEY = '@yoann2_saf_photos_uri';

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitize(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'Sans_nom';
}

async function getOrCreateDir(parentUri: string, dirName: string): Promise<string> {
  try {
    return await SAF.makeDirectoryAsync(parentUri, dirName);
  } catch {
    try {
      const children = await SAF.readDirectoryAsync(parentUri);
      const match = children.find(uri => {
        const decoded = decodeURIComponent(uri);
        const last    = decoded.lastIndexOf('/');
        return decoded.substring(last + 1) === dirName;
      });
      if (match) return match;
    } catch { /* ignore */ }
    throw new Error(`Impossible de créer le dossier: ${dirName}`);
  }
}

// ── Permission — demandée une seule fois ─────────────────────────────────────

export async function getOrRequestPhotosDir(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(SAF_KEY);
    if (stored) return stored;

    return new Promise(resolve => {
      Alert.alert(
        'Dossier Yoann2.0',
        'Première utilisation : choisissez où créer le dossier "Yoann2.0" pour sauvegarder vos photos de projets.',
        [
          { text: 'Plus tard', style: 'cancel', onPress: () => resolve(null) },
          {
            text: 'Choisir l\'emplacement',
            onPress: async () => {
              try {
                const perm = await SAF.requestDirectoryPermissionsAsync();
                if (!perm.granted) { resolve(null); return; }

                const yoann2  = await getOrCreateDir(perm.directoryUri, 'Yoann2.0');
                await getOrCreateDir(yoann2, 'Sauvegarde');
                const photosDir = await getOrCreateDir(yoann2, 'Photos');

                await AsyncStorage.setItem(SAF_KEY, photosDir);
                resolve(photosDir);
              } catch {
                resolve(null);
              }
            },
          },
        ],
      );
    });
  } catch {
    return null;
  }
}

export async function resetPhotosDir(): Promise<void> {
  await AsyncStorage.removeItem(SAF_KEY);
}

// ── Copie bit-pour-bit → qualité et métadonnées 100% préservées ──────────────

export async function savePhotoToProject(
  sourceUri: string,
  projectName: string,
  originalFilename?: string | null,
): Promise<void> {
  try {
    const photosDir = await getOrRequestPhotosDir();
    if (!photosDir) return;

    const projectDir = await getOrCreateDir(photosDir, sanitize(projectName));

    const ext  = (sourceUri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
    const base = originalFilename
      ? sanitize(originalFilename.replace(/\.[^.]+$/, ''))
      : `photo_${Date.now()}`;
    const filename = `${base}.${ext}`;
    const mime     = ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg';

    const base64  = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const destUri = await SAF.createFileAsync(projectDir, filename, mime);
    await SAF.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    // La copie interne reste toujours disponible — on ne bloque pas l'utilisateur
  }
}
