import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';

const SAF     = FileSystem.StorageAccessFramework;
const SAF_KEY = '@yoann2_saf_photos_uri';

// ── Verrou singleton : un seul dialog de permission à la fois ─────────────────
let _pendingPermission: Promise<string | null> | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitize(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'Sans_nom';
}

/**
 * Cherche d'abord si le dossier existe déjà, puis le crée si absent.
 * Sans ce "look before create", SAF.makeDirectoryAsync crée Cuisine (1),
 * Cuisine (2)… à chaque appel au lieu de réutiliser le dossier existant.
 */
async function getOrCreateDir(parentUri: string, dirName: string): Promise<string> {
  // 1) Lecture du dossier parent — si un enfant porte déjà ce nom, on le réutilise
  try {
    const children = await SAF.readDirectoryAsync(parentUri);
    const match = children.find(uri => {
      const decoded = decodeURIComponent(uri);
      return decoded.substring(decoded.lastIndexOf('/') + 1) === dirName;
    });
    if (match) return match;
  } catch { /* parent pas encore lisible (1er appel) */ }

  // 2) Création effective
  return await SAF.makeDirectoryAsync(parentUri, dirName);
}

// ── Permission — demandée une seule fois, dédupliquée ────────────────────────

export async function getOrRequestPhotosDir(): Promise<string | null> {
  // Déjà enregistré → retour immédiat
  try {
    const stored = await AsyncStorage.getItem(SAF_KEY);
    if (stored) return stored;
  } catch {
    return null;
  }

  // Un dialog est déjà ouvert → on attend le même résultat
  if (_pendingPermission) return _pendingPermission;

  _pendingPermission = new Promise(resolve => {
    Alert.alert(
      'Dossier Yoann2.0',
      'Première utilisation : choisissez où créer le dossier "Yoann2.0" pour sauvegarder vos photos de projets.',
      [
        {
          text: 'Plus tard',
          style: 'cancel',
          onPress: () => { _pendingPermission = null; resolve(null); },
        },
        {
          text: "Choisir l'emplacement",
          onPress: async () => {
            try {
              const perm = await SAF.requestDirectoryPermissionsAsync();
              if (!perm.granted) { _pendingPermission = null; resolve(null); return; }

              const yoann2    = await getOrCreateDir(perm.directoryUri, 'Yoann2.0');
              await getOrCreateDir(yoann2, 'Sauvegarde');
              const photosDir = await getOrCreateDir(yoann2, 'Photos');

              await AsyncStorage.setItem(SAF_KEY, photosDir);
              _pendingPermission = null;
              resolve(photosDir);
            } catch {
              _pendingPermission = null;
              resolve(null);
            }
          },
        },
      ],
    );
  });

  return _pendingPermission;
}

export async function resetPhotosDir(): Promise<void> {
  await AsyncStorage.removeItem(SAF_KEY);
  _pendingPermission = null;
}

// ── Copie bit-pour-bit ────────────────────────────────────────────────────────

export async function savePhotoToProject(
  sourceUri: string,
  projectName: string,
  originalFilename?: string | null,
): Promise<void> {
  try {
    const photosDir = await getOrRequestPhotosDir();
    if (!photosDir) return;

    // Réutilise le dossier du projet s'il existe déjà
    const projectDir = await getOrCreateDir(photosDir, sanitize(projectName));

    const ext      = (sourceUri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
    const base     = originalFilename
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
    // La copie interne reste toujours disponible
  }
}
