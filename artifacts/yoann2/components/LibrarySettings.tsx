import { MaterialCommunityIcons } from '@expo/vector-icons';
import { reloadAppAsync } from 'expo';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCatalogueVersion } from '@/hooks/useCatalogueVersion';
import { useColors } from '@/hooks/useColors';
import { lastBackupTime, listBackups, pickBackupFile, readBackupFile, saveBackup, type BackupEntry } from '@/utils/backup';
import { allEntries } from '@/utils/library/catalogue';
import {
  arrangePhotos, checkFolder, detachLegacyPhotos, lastFolderReport, reportNeedsAttention, trashOrphans, type FolderReport,
} from '@/utils/library/maintenance';
import { confirmAndRestore } from '@/utils/library/restoreFlow';
import { chooseLibraryFolder, libraryAccessible } from '@/utils/library/saf';

type Colors = ReturnType<typeof useColors>;

function Row({ icon, label, sublabel, onPress, colors, accent, busy, badge }: {
  icon: string; label: string; sublabel?: string; onPress: () => void; colors: Colors;
  accent?: string; busy?: boolean; badge?: 'ok' | 'warn';
}) {
  const tint = accent ?? colors.primary;
  return (
    <Pressable onPress={onPress} disabled={busy}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.card, borderColor: colors.border }, (pressed || busy) && { opacity: 0.7 }]}>
      <View style={[styles.rowIcon, { backgroundColor: tint + '20' }]}>
        {busy ? <ActivityIndicator size="small" color={tint} />
          : <MaterialCommunityIcons name={icon as never} size={20} color={tint} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {!!sublabel && <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sublabel}</Text>}
      </View>
      {badge ? (
        <MaterialCommunityIcons name={badge === 'ok' ? 'check-circle-outline' : 'alert-circle-outline'} size={18}
          color={badge === 'ok' ? '#4CAF50' : '#FF9800'} />
      ) : <MaterialCommunityIcons name="chevron-right" size={20} color={colors.mutedForeground} />}
    </Pressable>
  );
}

const when = (ts: number) => `${new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à ${new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
const REASONS: Record<string, string> = {
  auto: 'automatique', manuel: 'manuelle', 'avant-restauration': 'avant restauration', 'avant-detachement': 'avant nettoyage',
};

/** "Dossier Yoann2.0" section: folder, backups, restore and the folder check. */
export function LibrarySettings() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const catalogueVersion = useCatalogueVersion();
  const [accessible, setAccessible] = useState<boolean | null>(null);
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const [report, setReport] = useState<FolderReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [backupList, setBackupList] = useState<BackupEntry[] | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const refresh = useCallback(async () => {
    const ok = await libraryAccessible();
    setAccessible(ok);
    setLastBackup(ok ? await lastBackupTime() : null);
    setReport(await lastFolderReport());
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (key: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try { await work(); }
    catch (error) { Alert.alert('Action impossible', error instanceof Error ? error.message : 'Une erreur est survenue.'); }
    finally { setBusy(null); void refresh(); }
  };

  const chooseFolder = () => run('folder', async () => {
    const root = await chooseLibraryFolder();
    if (!root) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Dossier Yoann2.0 prêt', 'Les photos, sauvegardes et le journal sont rangés dans ce dossier. Pour changer de téléphone, copie ce dossier entier puis choisis-le à nouveau ici.');
  });

  const backupNow = () => run('backup', async () => {
    if (!await saveBackup('manuel')) throw new Error('La sauvegarde n’a pas pu être écrite. Vérifie l’accès au dossier Yoann2.0.');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Sauvegarde créée', 'Elle se trouve dans Yoann2.0/Sauvegardes et a été relue pour vérification.');
  });

  const openBackups = () => run('list', async () => { setBackupList(await listBackups()); });

  const restoreEntry = (entry: BackupEntry) => run('restore', async () => {
    setBackupList(null);
    await confirmAndRestore(await readBackupFile(entry.uri));
  });

  const restoreFromFile = () => run('file', async () => {
    const file = await pickBackupFile();
    if (file) await confirmAndRestore(file);
  });

  const check = () => run('check', async () => {
    setReport(await checkFolder());
    setReportOpen(true);
  });

  const arrange = () => {
    if (!report?.misplaced.length) return;
    Alert.alert('Ranger les photos ?',
      `${report.misplaced.length} photo(s) seront déplacées dans le dossier de leur projet, tâche ou trajet. Chaque copie est vérifiée avant de retirer l’ancien emplacement.`,
      [{ text: 'Annuler', style: 'cancel' }, { text: 'Ranger', onPress: () => run('arrange', async () => {
        const result = await arrangePhotos(report);
        setReport(await checkFolder());
        Alert.alert('Rangement terminé', `${result.done} photo(s) rangée(s).${result.failed.length ? `\n${result.failed.length} échec(s) : ${result.failed[0]}` : ''}`);
      }) }]);
  };

  const trash = () => {
    if (!report?.orphans.length) return;
    Alert.alert('Mettre à la corbeille ?',
      `${report.orphans.length} photo(s) ne sont plus utilisées par aucun projet, tâche ou trajet. Elles seront déplacées dans Yoann2.0/Corbeille et supprimées après 30 jours. Tu peux les récupérer d’ici là depuis ce dossier.`,
      [{ text: 'Annuler', style: 'cancel' }, { text: 'Corbeille', style: 'destructive', onPress: () => run('trash', async () => {
        const result = await trashOrphans(report);
        setReport(await checkFolder());
        Alert.alert('Corbeille', `${result.done} photo(s) déplacée(s).${result.failed.length ? `\n${result.failed.length} échec(s).` : ''}`);
      }) }]);
  };

  const detach = () => {
    if (!report?.legacyLinks) return;
    Alert.alert('Retirer les anciens liens photo ?',
      `${report.legacyLinks} lien(s) de l’ancien système pointent vers des photos que l’app ne peut plus retrouver. Ils seront retirés des projets, tâches et trajets (légendes et souvenirs conservés). Une sauvegarde est faite avant. Aucun fichier n’est supprimé.`,
      [{ text: 'Annuler', style: 'cancel' }, { text: 'Retirer', style: 'destructive', onPress: () => run('detach', async () => {
        const { removed } = await detachLegacyPhotos();
        Alert.alert('Anciens liens retirés', `${removed} lien(s) retiré(s). L’app va redémarrer.`, [
          { text: 'OK', onPress: () => { void reloadAppAsync('Anciens liens photo retirés'); } },
        ]);
      }) }]);
  };

  const photoCount = allEntries().filter(entry => !entry.trashedAt).length;
  void catalogueVersion;
  const attention = reportNeedsAttention(report);

  return (
    <>
      <Row icon="folder-cog-outline" accent="#2196F3" colors={colors} busy={busy === 'folder'} onPress={chooseFolder}
        label="Dossier Yoann2.0"
        badge={accessible ? 'ok' : 'warn'}
        sublabel={accessible == null ? 'Vérification…' : accessible
          ? `Accessible · ${photoCount} photo(s) rangée(s) · toucher pour changer`
          : 'Accès à donner — toucher pour choisir le dossier (nécessaire après réinstallation ou changement de téléphone)'} />
      <Row icon="content-save-outline" accent="#4CAF50" colors={colors} busy={busy === 'backup'} onPress={backupNow}
        label="Sauvegarder maintenant"
        sublabel={lastBackup ? `Dernière : ${when(lastBackup)} · auto chaque jour dès 10 h` : 'Aucune sauvegarde dans Yoann2.0/Sauvegardes'} />
      <Row icon="restore" colors={colors} busy={busy === 'list' || busy === 'restore'} onPress={openBackups}
        label="Restaurer une sauvegarde" sublabel="7 jours · 4 semaines · 12 mois conservés" />
      <Row icon="file-import-outline" colors={colors} busy={busy === 'file'} onPress={restoreFromFile}
        label="Restaurer depuis un fichier" sublabel="Une sauvegarde copiée ailleurs, ou de l’ancien dossier Sauvegarde" />
      <Row icon="clipboard-check-outline" accent={attention ? '#FF9800' : '#4CAF50'} colors={colors} busy={busy === 'check'}
        onPress={report && busy !== 'check' ? () => setReportOpen(true) : check}
        label="Bilan du dossier"
        badge={report ? (attention ? 'warn' : 'ok') : undefined}
        sublabel={report
          ? `${when(report.checkedAt)} · ${report.ok} ok · ${report.misplaced.length} à ranger · ${report.missing.length} manquante(s) · ${report.orphans.length} inutilisée(s)`
          : 'Vérifie chaque semaine que les photos et sauvegardes sont en place'} />

      <Modal visible={!!backupList} animationType="slide" transparent onRequestClose={() => setBackupList(null)}>
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => setBackupList(null)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: 24 + insets.bottom }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Sauvegardes</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground, marginBottom: 10 }]}>Le contenu est affiché avant toute restauration.</Text>
            {backupList?.length === 0 && <Text style={[styles.rowSub, { color: colors.mutedForeground, textAlign: 'center', marginVertical: 16 }]}>Aucune sauvegarde dans Yoann2.0/Sauvegardes.</Text>}
            <ScrollView style={{ maxHeight: 340 }}>
              {backupList?.map(entry => (
                <Pressable key={entry.uri} onPress={() => restoreEntry(entry)}
                  style={({ pressed }) => [styles.listRow, { borderColor: colors.border, backgroundColor: colors.background }, pressed && { opacity: 0.7 }]}>
                  <MaterialCommunityIcons name="file-restore-outline" size={20} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: colors.foreground }]}>{when(entry.ts)}</Text>
                    <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Sauvegarde {REASONS[entry.reason] ?? entry.reason}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setBackupList(null)} style={[styles.closeBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.mutedForeground, fontWeight: '600' }}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={reportOpen && !!report} animationType="slide" transparent onRequestClose={() => setReportOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => setReportOpen(false)} />
          {report && (
            <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: 24 + insets.bottom }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Bilan du dossier</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground, marginBottom: 12 }]}>
                {when(report.checkedAt)} · rien n’est déplacé ni supprimé sans ton accord.
              </Text>
              <Line colors={colors} icon="check-circle-outline" tint="#4CAF50" text={`${report.ok} photo(s) en place`} />
              {report.relocated > 0 && <Line colors={colors} icon="folder-move-outline" tint="#2196F3" text={`${report.relocated} photo(s) déplacée(s) à la main, retrouvée(s) et prise(s) en compte`} />}
              <Line colors={colors} icon="folder-alert-outline" tint={report.misplaced.length ? '#FF9800' : colors.mutedForeground}
                text={`${report.misplaced.length} photo(s) pas dans le dossier de leur projet, tâche ou trajet`} />
              <Line colors={colors} icon="image-off-outline" tint={report.missing.length ? '#E53935' : colors.mutedForeground}
                text={`${report.missing.length} photo(s) introuvable(s) dans Yoann2.0/Photos`} />
              <Line colors={colors} icon="image-remove-outline" tint={report.orphans.length ? '#FF9800' : colors.mutedForeground}
                text={`${report.orphans.length} photo(s) plus utilisée(s) · ${report.inTrash} dans la corbeille${report.purged ? ` · ${report.purged} supprimée(s) après 30 jours` : ''}`} />
              <Line colors={colors} icon="link-variant-off" tint={report.legacyLinks ? '#FF9800' : colors.mutedForeground}
                text={`${report.legacyLinks} lien(s) de l’ancien système photo`} />
              <Line colors={colors} icon="content-save-outline" tint={report.lastBackupAt && Date.now() - report.lastBackupAt < 3 * 86_400_000 ? '#4CAF50' : '#FF9800'}
                text={report.lastBackupAt ? `Dernière sauvegarde : ${when(report.lastBackupAt)}` : 'Aucune sauvegarde'} />
              <View style={{ gap: 8, marginTop: 14 }}>
                {report.misplaced.length > 0 && <Action colors={colors} label="Ranger les photos" busy={busy === 'arrange'} onPress={arrange} />}
                {report.orphans.length > 0 && <Action colors={colors} label="Mettre les inutilisées à la corbeille" busy={busy === 'trash'} onPress={trash} />}
                {report.legacyLinks > 0 && <Action colors={colors} label="Retirer les anciens liens photo" busy={busy === 'detach'} onPress={detach} />}
                <Action colors={colors} label="Refaire le bilan" busy={busy === 'check'} onPress={check} secondary />
              </View>
              <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 12 }]}>
                Tout reste sur ce téléphone. Copie de temps en temps le dossier Yoann2.0 sur un PC ou une clé USB.
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

function Line({ icon, tint, text, colors }: { icon: string; tint: string; text: string; colors: Colors }) {
  return (
    <View style={styles.line}>
      <MaterialCommunityIcons name={icon as never} size={18} color={tint} />
      <Text style={[styles.lineText, { color: colors.foreground }]}>{text}</Text>
    </View>
  );
}

function Action({ label, onPress, busy, colors, secondary }: { label: string; onPress: () => void; busy?: boolean; colors: Colors; secondary?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy}
      style={({ pressed }) => [styles.action, secondary
        ? { borderColor: colors.border, borderWidth: 1 }
        : { backgroundColor: colors.primary }, (pressed || busy) && { opacity: 0.7 }]}>
      {busy ? <ActivityIndicator size="small" color={secondary ? colors.primary : colors.primaryForeground} />
        : <Text style={{ color: secondary ? colors.foreground : colors.primaryForeground, fontWeight: '600' }}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 4 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  closeBtn: { borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 8 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 5 },
  lineText: { fontSize: 14, flex: 1, lineHeight: 19 },
  action: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
});
