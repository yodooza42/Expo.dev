import { reloadAppAsync } from 'expo';
import { Alert } from 'react-native';

import { describeBackup, formatBackupReport, restoreBackupFile, type BackupFile } from '@/utils/backup';

/** Shows what the backup contains and restores it only after confirmation. */
export function confirmAndRestore(file: BackupFile): Promise<boolean> {
  const report = describeBackup(file);
  return new Promise(resolve => {
    Alert.alert(
      'Restaurer cette sauvegarde ?',
      `${formatBackupReport(report)}\n\nLes données enregistrées seront remplacées par celles de la sauvegarde. Une sauvegarde de sécurité de l’état actuel est faite avant. L’app redémarre ensuite.`,
      [
        { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Restaurer', style: 'destructive',
          onPress: async () => {
            try {
              await restoreBackupFile(file);
              resolve(true);
              await reloadAppAsync('Restauration Yoann2.0');
            } catch (error) {
              Alert.alert('Restauration impossible', error instanceof Error ? error.message : 'Lecture de la sauvegarde impossible.');
              resolve(false);
            }
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
