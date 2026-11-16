import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';

import { latestValidBackup } from '@/utils/backup';
import { confirmAndRestore } from '@/utils/library/restoreFlow';
import { chooseLibraryFolder, libraryAccessible } from '@/utils/library/saf';

const ONBOARDING_KEY = '@yoann2_library_onboarding_v2';

function ask(title: string, message: string, cancel: string, confirm: string): Promise<boolean> {
  return new Promise(resolve => Alert.alert(title, message, [
    { text: cancel, style: 'cancel', onPress: () => resolve(false) },
    { text: confirm, onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

/**
 * Once per installation: ask for the Yoann2.0 folder (a reinstall or a new
 * phone loses Android's access) and offer to restore its newest backup.
 */
export async function runLibraryOnboarding(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (await AsyncStorage.getItem(ONBOARDING_KEY)) return;
  if (await libraryAccessible()) { await AsyncStorage.setItem(ONBOARDING_KEY, '1'); return; }
  const choose = await ask(
    'Dossier Yoann2.0',
    'Tes photos et sauvegardes sont rangées dans un dossier Yoann2.0 sur le téléphone. Choisis-le (ou l’endroit où le créer). Si tu viens de réinstaller l’app ou de changer de téléphone, choisis le dossier que tu as copié.',
    'Plus tard', 'Choisir le dossier',
  );
  await AsyncStorage.setItem(ONBOARDING_KEY, '1');
  if (!choose) return;
  try {
    if (!await chooseLibraryFolder()) return;
  } catch (error) {
    Alert.alert('Dossier non configuré', `${error instanceof Error ? error.message : 'Choix impossible.'}\nTu peux le choisir plus tard dans Paramètres.`);
    return;
  }
  const latest = await latestValidBackup();
  if (latest) await confirmAndRestore(latest.file);
}
