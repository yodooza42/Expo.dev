import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/contexts/ThemeContext';
import {
  cancelAppointmentReminders,
  cancelMonthlyReport,
  cancelWeeklyReport,
  getApptReminderPref,
  getNotifPrefs,
  scheduleAppointmentReminders,
  scheduleMonthlyReport,
  scheduleWeeklyReport,
  setApptReminderPref,
} from '@/utils/notificationScheduler';
import { importBackupFromFile, listBackups, rebuildBackupListFromSAF, restoreBackup, saveBackup } from '@/utils/backup';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { reconfigureStorage, recoverAllPhotosFromExternal, SAF_ROOT_KEY } from '@/utils/photoStorage';
import { mergeRecoveredPhotoUris } from '@/utils/photoReferences';
import { photoProtectionEvents, photoProtectionStatus } from '@/utils/photoProtection';
import { CategoryConfig, DEFAULT_EXPENSE_CATEGORY_CONFIGS, getCategoryConfigs, saveCategoryConfigs } from '@/utils/bankStorage';
import { genId } from '@/utils/ids';

function SettingRow({
  icon,
  label,
  sublabel,
  onPress,
  accent,
  colors,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  accent?: string;
  colors: ReturnType<typeof useColors>;
}) {
  const iconColor = accent ?? colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconColor + '20' }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {sublabel && <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sublabel}</Text>}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const { baseTheme, setBaseTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { resetData, projects, tasks, categories, addCategory, deleteCategory, updateProject, updateTask } = useApp();
  const router = useRouter();

  const [showBackupList,    setShowBackupList]    = useState(false);
  const [backupList,        setBackupList]        = useState<Awaited<ReturnType<typeof listBackups>>>([]);
  const [savingBackup,      setSavingBackup]      = useState(false);
  const [restoringUri,      setRestoringUri]      = useState<string | null>(null);
  const [importingFile,     setImportingFile]     = useState(false);
  const [catModalVisible,   setCatModalVisible]   = useState(false);
  const [expCatModalVisible,setExpCatModalVisible]= useState(false);
  const [newCatName,        setNewCatName]        = useState('');
  const [newExpCatName,     setNewExpCatName]     = useState('');
  const [weeklyNotif,       setWeeklyNotif]       = useState(false);
  const [monthlyNotif,      setMonthlyNotif]      = useState(false);
  const [apptReminder,      setApptReminder]      = useState(false);
  const [folderConfigured,  setFolderConfigured]  = useState(false);
  const [lastBackupDate,    setLastBackupDate]    = useState<Date | null>(null);
  const [backupCount,       setBackupCount]       = useState(0);
  const [configuringFolder, setConfiguringFolder] = useState(false);
  const [rebuildingList,    setRebuildingList]    = useState(false);
  const [recoveringAll,     setRecoveringAll]     = useState(false);
  const [protectingPhotos, setProtectingPhotos] = useState(false);
  const [photoStatus, setPhotoStatus] = useState({ local: 0, backedUp: 0, pending: 0, missing: 0 });
  const [expCatConfigs, setExpCatConfigs] = useState<CategoryConfig[]>(DEFAULT_EXPENSE_CATEGORY_CONFIGS);
  const [widgetLogVisible, setWidgetLogVisible] = useState(false);
  const [widgetLogEntries, setWidgetLogEntries] = useState<{ t: string; tag: string; data: string }[]>([]);

  async function handleAddExpCat(name: string) {
    const allConfigs = await getCategoryConfigs();
    const bankConfigs = allConfigs.filter(c => c.type !== 'expense');
    const maxOrder = Math.max(0, ...expCatConfigs.map(c => c.order ?? 0));
    const newCat: CategoryConfig = { id: genId(), name, type: 'expense', keywords: [], order: maxOrder + 1 };
    const newExpConfigs = [...expCatConfigs, newCat];
    setExpCatConfigs(newExpConfigs);
    await saveCategoryConfigs([...bankConfigs, ...newExpConfigs]);
  }

  async function handleDeleteExpCat(id: string) {
    const allConfigs = await getCategoryConfigs();
    const bankConfigs = allConfigs.filter(c => c.type !== 'expense');
    const newExpConfigs = expCatConfigs.filter(c => c.id !== id);
    setExpCatConfigs(newExpConfigs);
    await saveCategoryConfigs([...bankConfigs, ...newExpConfigs]);
  }

  useEffect(() => {
    getCategoryConfigs().then(cs => setExpCatConfigs(cs.filter(c => c.type === 'expense')));
  }, []);

  useEffect(() => {
    getNotifPrefs().then(prefs => {
      setWeeklyNotif(prefs.weekly);
      setMonthlyNotif(prefs.monthly);
    });
    getApptReminderPref().then(setApptReminder);
    loadStorageStatus();
    photoProtectionStatus().then(setPhotoStatus).catch(console.warn);
  }, []);

  async function loadStorageStatus() {
    const [root, backups] = await Promise.all([
      AsyncStorage.getItem(SAF_ROOT_KEY),
      listBackups(),
    ]);
    setFolderConfigured(!!root);
    setBackupCount(backups.length);
    setLastBackupDate(backups.length > 0 ? new Date(backups[0].ts) : null);
  }

  async function handleConfigureFolder() {
    setConfiguringFolder(true);
    const ok = await reconfigureStorage();
    setConfiguringFolder(false);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Dossier configuré', 'Les dossiers Photos et Sauvegarde sont prêts.');
      loadStorageStatus();
      void photoProtectionEvents.retry().then(() => photoProtectionStatus()).then(setPhotoStatus).catch(console.warn);
    }
  }

  async function handleProtectPhotos() {
    if (protectingPhotos) return;
    setProtectingPhotos(true);
    try {
      if (Platform.OS === 'web') throw new Error('La protection des fichiers est disponible sur le téléphone.');
      // Explicit user action may re-authorize gallery originals after an app restore.
      await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      await photoProtectionEvents.retry();
      const status = await photoProtectionStatus();
      setPhotoStatus(status);
      Alert.alert('Protection des photos',
        `${status.local} copie(s) permanente(s) dans l’application.\n${status.backedUp} copie(s) externe(s) vérifiée(s).\n${status.pending} copie(s) externe(s) en attente.\n${status.missing} source(s) inaccessible(s).`
        + (status.pending ? '\n\nConfigure ou réautorise le dossier Yoann2.0 puis relance la protection.' : '')
        + '\n\nLe vidage du cache ne supprime pas ces copies. Les deux copies restent sur le téléphone : elles ne couvrent pas sa perte ou sa panne.');
    } catch (error) {
      Alert.alert('Protection incomplète', error instanceof Error ? error.message : 'Impossible de protéger les photos.');
    } finally { setProtectingPhotos(false); }
  }

  async function handleWeeklyToggle(value: boolean) {
    setWeeklyNotif(value);
    if (value) await scheduleWeeklyReport(); else await cancelWeeklyReport();
    Haptics.selectionAsync();
  }

  async function handleMonthlyToggle(value: boolean) {
    setMonthlyNotif(value);
    if (value) await scheduleMonthlyReport(); else await cancelMonthlyReport();
    Haptics.selectionAsync();
  }

  async function handleApptReminderToggle(value: boolean) {
    setApptReminder(value);
    await setApptReminderPref(value);
    if (value) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      await cancelAppointmentReminders();
      Haptics.selectionAsync();
    }
  }

  async function handleManualBackup() {
    if (!folderConfigured) {
      Alert.alert('Dossier non configuré', 'Configurez d\'abord le dossier Yoann2.0 ci-dessous.');
      return;
    }
    setSavingBackup(true);
    const ok = await saveBackup();
    setSavingBackup(false);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadStorageStatus();
      Alert.alert('Sauvegarde créée', 'Vos données ont été sauvegardées dans le dossier Sauvegarde.');
    } else {
      Alert.alert('Erreur', 'Impossible de créer la sauvegarde. Vérifiez le dossier Yoann2.0.');
    }
  }

  async function handleOpenRestoreList() {
    const list = await listBackups();
    setBackupList(list);
    setShowBackupList(true);
  }

  async function handleImportFromFile() {
    setImportingFile(true);
    const result = await importBackupFromFile();
    setImportingFile(false);
    if (result.canceled) return;
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Restauration réussie',
        'Les données ont été restaurées. L\'app va redémarrer.',
        [{ text: 'OK', onPress: () => router.replace('/') }],
      );
    } else {
      Alert.alert('Erreur', result.error ?? 'Impossible d\'importer ce fichier.');
    }
  }

  async function handleRebuildList() {
    if (!folderConfigured) {
      Alert.alert('Dossier non configuré', 'Configurez d\'abord le dossier Yoann2.0 ci-dessous.');
      return;
    }
    setRebuildingList(true);
    const found = await rebuildBackupListFromSAF(true);
    setRebuildingList(false);
    if (found) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadStorageStatus();
      Alert.alert('Liste reconstruite', 'Les sauvegardes ont été retrouvées dans le dossier et la liste a été mise à jour.');
    } else {
      Alert.alert('Aucune sauvegarde trouvée', 'Aucun fichier backup_*.json n\'a été trouvé dans le dossier Sauvegarde.');
    }
  }

  async function handleRecoverAllPhotos() {
    if (!folderConfigured) {
      Alert.alert('Dossier non configur\u00e9', 'Configurez d\u2019abord le dossier Yoann2.0 ci-dessus.');
      return;
    }
    setRecoveringAll(true);
    try {
    const names = projects.map(p => p.name);
    const report = await recoverAllPhotosFromExternal(names);
    const recovered = report.projects;
    const projectUpdates = new Map<string, string[]>();
    const taskUpdates = new Map<string, string[]>();

    let totalProject = 0;
    let totalTask = 0;
    for (const r of recovered) {
      const proj = projects.find(p => p.name === r.projectName);
      if (!proj) continue;

      // Project photos (root folder)
      if (r.projectUris.length > 0) {
        const merged = await mergeRecoveredPhotoUris(projectUpdates.get(proj.id) ?? proj.photos, r.projectUris);
        projectUpdates.set(proj.id, merged.uris);
        totalProject += merged.added + merged.repaired;
      }

      // Task photos — match by embedded ID (_tache_<id>), fallback to sanitized name
      if (r.taskFolders.length > 0) {
        const projTasks = tasks.filter(t => t.projectId === proj.id);
        for (const folder of r.taskFolders) {
          const matched =
            // 1) ID direct (nouveau schéma de nommage)
            (folder.taskId ? projTasks.find(t => t.id === folder.taskId) : undefined) ??
            // 2) Fallback : correspondance par titre sanitisé (anciens dossiers)
            projTasks.find(
              t => t.title.replace(/[/\\:*?"<>|]/g, '_').trim().toLowerCase()
                === folder.folderName.toLowerCase(),
            );
          if (matched) {
            const merged = await mergeRecoveredPhotoUris(taskUpdates.get(matched.id) ?? matched.photos, folder.uris);
            taskUpdates.set(matched.id, merged.uris);
            totalTask += merged.added + merged.repaired;
          } else {
            // Aucune tâche trouvée → photos du projet en fallback
            const merged = await mergeRecoveredPhotoUris(projectUpdates.get(proj.id) ?? proj.photos, folder.uris);
            projectUpdates.set(proj.id, merged.uris);
            totalProject += merged.added + merged.repaired;
          }
        }
      }
    }
    for (const [id, photos] of projectUpdates) updateProject(id, { photos });
    for (const [id, photos] of taskUpdates) updateTask(id, { photos });

    const total = totalProject + totalTask;
    const issues = report.errors.length
      ? `\n\nRécupération partielle : ${report.errors.length} erreur(s).\n${report.errors.slice(0, 2).join('\n')}`
      : '';
    if (total > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Photos récupérées',
        `${total} photo${total > 1 ? 's' : ''} ajoutée${total > 1 ? 's' : ''} ou réparée${total > 1 ? 's' : ''} (${totalProject} projet / ${totalTask} tâches).${issues}`
      );
    } else {
      Alert.alert(report.errors.length ? 'Accès incomplet' : report.scannedImages ? 'Photos déjà liées' : 'Aucune image trouvée',
        report.scannedImages
          ? `${report.scannedImages} image(s) trouvée(s). Aucun nouveau lien à ajouter.${issues}`
          : `Aucune image lisible dans les dossiers parcourus. Vérifie que le dossier Yoann2.0 sélectionné contient bien Photos et ses images. La sauvegarde JSON contient les liens, pas les fichiers.${issues}`);
    }
    } catch (error) {
      Alert.alert('Récupération impossible', error instanceof Error ? error.message : 'Impossible de lire les photos.');
    } finally { setRecoveringAll(false); }
  }

  async function handleRestore(uri: string, filename: string) {
    Alert.alert(
      'Restaurer cette sauvegarde ?',
      `${filename}\n\nL'app redémarrera après la restauration pour appliquer les changements.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Restaurer',
          style: 'destructive',
          onPress: async () => {
            setRestoringUri(uri);
            setShowBackupList(false);
            const ok = await restoreBackup(uri);
            setRestoringUri(null);
            if (ok) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Restauration réussie', 'Fermez et relancez l\'app pour voir vos données restaurées.');
            } else {
              Alert.alert('Erreur', 'Impossible de lire ce fichier de sauvegarde.');
            }
          },
        },
      ],
    );
  }

  function handleReset() {
    Alert.alert(
      'Réinitialiser',
      "Toutes les données seront supprimées et les données d'exemple seront restaurées. Continuer ?",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: () => { resetData(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
        },
      ]
    );
  }

  function handleAddCategory() {
    if (newCatName.trim()) { addCategory(newCatName.trim()); setNewCatName(''); }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Paramètres</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>

        {/* ── DONNÉES ── */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Données</Text>
        <View style={[styles.statsBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { label: 'Projets',    value: projects.length,   icon: 'folder-multiple-outline' },
            { label: 'Tâches',     value: tasks.length,      icon: 'format-list-checks' },
            { label: 'Catégories', value: categories.length, icon: 'tag-multiple-outline' },
          ].map((s, i) => (
            <View key={i} style={[styles.statRow, i < 2 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <MaterialCommunityIcons name={s.icon as any} size={18} color={colors.primary} />
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
            </View>
          ))}
        </View>
        <SettingRow
          icon="tag-multiple-outline"
          label="Catégories de projets"
          sublabel={`${categories.length} catégorie${categories.length !== 1 ? 's' : ''}`}
          onPress={() => setCatModalVisible(true)}
          colors={colors}
        />
        <SettingRow
          icon="cash-multiple"
          label="Catégories de dépenses"
          sublabel={`${expCatConfigs.length} catégorie${expCatConfigs.length !== 1 ? 's' : ''}`}
          onPress={() => setExpCatModalVisible(true)}
          colors={colors}
        />

        {/* ── APPARENCE ── */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Apparence</Text>
        <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: '#9C27B020' }]}>
            <MaterialCommunityIcons name="theme-light-dark" size={20} color="#9C27B0" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Thème d'affichage</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
              {baseTheme === 'amoled' ? 'AMOLED — noir pur, économise la batterie OLED' : 'Dark — gris anthracite standard'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['dark', 'amoled'] as const).map(t => (
              <Pressable
                key={t}
                onPress={() => { void Haptics.selectionAsync(); setBaseTheme(t); }}
                style={{
                  paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                  backgroundColor: baseTheme === t ? '#9C27B0' : colors.secondary,
                  borderWidth: 1,
                  borderColor: baseTheme === t ? '#9C27B0' : colors.border,
                }}
              >
                <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: baseTheme === t ? '#fff' : colors.mutedForeground }}>
                  {t === 'dark' ? 'Dark' : 'AMOLED'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── NOTIFICATIONS ── */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Notifications</Text>
        <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.primary + '20' }]}>
            <MaterialCommunityIcons name="calendar-alert" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Rappels de rendez-vous</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>24h avant + jour J à 8h00</Text>
          </View>
          <Switch
            value={apptReminder}
            onValueChange={handleApptReminderToggle}
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={apptReminder ? colors.primary : colors.mutedForeground}
          />
        </View>
        <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.primary + '20' }]}>
            <MaterialCommunityIcons name="bell-ring-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Rapport hebdomadaire</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Dimanche à 16h00</Text>
          </View>
          <Switch
            value={weeklyNotif}
            onValueChange={handleWeeklyToggle}
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={weeklyNotif ? colors.primary : colors.mutedForeground}
          />
        </View>
        <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.primary + '20' }]}>
            <MaterialCommunityIcons name="bell-badge-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Rapport mensuel</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Dernier jour du mois à 16h00</Text>
          </View>
          <Switch
            value={monthlyNotif}
            onValueChange={handleMonthlyToggle}
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={monthlyNotif ? colors.primary : colors.mutedForeground}
          />
        </View>

        {/* ── RAPPORTS ── */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Rapports</Text>
        <SettingRow
          icon="chart-bar"
          label="Consulter les rapports"
          sublabel="Résumé hebdomadaire et mensuel"
          onPress={() => router.push('/rapport' as any)}
          colors={colors}
        />

        {/* ── SAUVEGARDE ── */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Sauvegarde</Text>
        <Pressable
          onPress={handleConfigureFolder}
          disabled={configuringFolder}
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && { opacity: 0.75 },
          ]}
        >
          <View style={[styles.rowIcon, { backgroundColor: '#2196F320' }]}>
            <MaterialCommunityIcons name="folder-cog-outline" size={20} color="#2196F3" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Dossier Yoann2.0</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
              {configuringFolder
                ? 'Sélection en cours…'
                : folderConfigured
                  ? 'Configuré · toucher pour reconfigurer'
                  : 'Non configuré — toucher pour choisir le dossier'}
            </Text>
          </View>
          <View style={[styles.folderBadge, { backgroundColor: folderConfigured ? '#4CAF5020' : '#FF980020' }]}>
            <MaterialCommunityIcons
              name={folderConfigured ? 'check-circle-outline' : 'alert-outline'}
              size={16}
              color={folderConfigured ? '#4CAF50' : '#FF9800'}
            />
          </View>
        </Pressable>
        <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: '#4CAF5020' }]}>
            <MaterialCommunityIcons name="shield-check-outline" size={20} color="#4CAF50" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Sauvegarde automatique</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
              {lastBackupDate
                ? `Dernière : ${lastBackupDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })} à ${lastBackupDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${backupCount}/5 archives`
                : 'Aucune archive encore · se déclenche à 10h chaque jour'}
            </Text>
          </View>
        </View>
        <SettingRow
          icon="content-save-outline"
          label={savingBackup ? 'Sauvegarde en cours…' : 'Sauvegarde manuelle'}
          sublabel="Crée immédiatement une archive dans le dossier Sauvegarde"
          onPress={handleManualBackup}
          colors={colors}
        />
        <SettingRow
          icon="restore"
          label={restoringUri ? 'Restauration en cours…' : 'Restaurer une sauvegarde'}
          sublabel="Choisir parmi les 5 dernières archives"
          onPress={handleOpenRestoreList}
          colors={colors}
        />
        <SettingRow
          icon="file-import-outline"
          label={importingFile ? 'Sélection en cours…' : 'Importer depuis un fichier'}
          sublabel="Pointer manuellement un fichier backup_*.json existant"
          onPress={handleImportFromFile}
          colors={colors}
        />
        <SettingRow
          icon="folder-search-outline"
          label={rebuildingList ? 'Scan en cours…' : 'Scanner le dossier Sauvegarde'}
          sublabel="Reconstruire la liste depuis les fichiers présents sur le disque"
          onPress={handleRebuildList}
          colors={colors}
        />
        <SettingRow
          icon="image-multiple"
          label={recoveringAll ? 'Récupération en cours…' : 'Récupérer toutes les photos'}
          sublabel="Copier les images du dossier Yoann2.0/Photos vers tous les projets"
          onPress={handleRecoverAllPhotos}
          colors={colors}
        />
        <SettingRow
          icon="shield-check-outline"
          label={protectingPhotos ? 'Protection en cours…' : 'Sécuriser toutes les photos'}
          sublabel={`${photoStatus.local} copies permanentes · ${photoStatus.pending} copies externes en attente · ${photoStatus.missing} sources inaccessibles`}
          onPress={handleProtectPhotos}
          colors={colors}
        />

        {/* ── WIDGET ANDROID ── */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Widget Android</Text>
        <SettingRow
          icon="widgets-outline"
          label="Personnaliser le widget"
          sublabel="Taille du texte, couleurs"
          onPress={() => router.push('/widget-settings')}
          colors={colors}
        />
        <SettingRow
          icon="bug-outline"
          label="Logs debug widget"
          sublabel="Diagnostic HeadlessJS"
          onPress={async () => {
            try {
              const raw = await AsyncStorage.getItem('@yoann2_widget_debug_log');
              const entries = raw ? JSON.parse(raw) : [];
              setWidgetLogEntries(entries.reverse());
            } catch {
              setWidgetLogEntries([]);
            }
            setWidgetLogVisible(true);
          }}
          colors={colors}
        />

        {/* ── À PROPOS ── */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>À propos</Text>
        <SettingRow
          icon="update"
          label="Recap MàJ"
          sublabel="Historique des versions et nouveautés"
          onPress={() => router.push('/changelog')}
          colors={colors}
        />
        <View style={[styles.about, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <MaterialCommunityIcons name="brain" size={24} color={colors.primary} />
          <Text style={[styles.aboutTitle, { color: colors.foreground }]}>Yoann2.0</Text>
          <Text style={[styles.aboutSub, { color: colors.mutedForeground }]}>par et pour Gorge Yoann</Text>
          <Text style={[styles.aboutVersion, { color: colors.primary }]}>v2.10.0</Text>
        </View>

        {/* ── DANGER ── */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Danger</Text>
        <SettingRow
          icon="delete-alert-outline"
          label="Réinitialiser les données"
          sublabel="Restaure les données de la dernière sauvegarde seed"
          onPress={handleReset}
          accent={colors.destructive}
          colors={colors}
        />

      </ScrollView>

      {/* ── MODAL : Restaurer une sauvegarde ── */}
      <Modal visible={showBackupList} animationType="slide" transparent>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowBackupList(false)} />
          <View style={[styles.modal, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: 24 + insets.bottom }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Restaurer une sauvegarde</Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              Choisissez une archive. Toutes les données actuelles seront remplacées.
            </Text>
            {backupList.length === 0 ? (
              <Text style={[styles.modalSub, { color: colors.mutedForeground, textAlign: 'center', marginVertical: 16 }]}>
                Aucune sauvegarde disponible.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 280 }}>
                {backupList.map(entry => (
                  <Pressable
                    key={entry.uri}
                    onPress={() => handleRestore(entry.uri, entry.filename)}
                    style={({ pressed }) => [
                      styles.backupRow,
                      { backgroundColor: colors.background, borderColor: colors.border },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <MaterialCommunityIcons name="file-restore-outline" size={20} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.backupRowDate, { color: colors.foreground }]}>
                        {new Date(entry.ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        {' à '}
                        {new Date(entry.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={[styles.backupRowFile, { color: colors.mutedForeground }]}>{entry.filename}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={colors.mutedForeground} />
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Pressable onPress={() => setShowBackupList(false)} style={[styles.cancelBtn, { borderColor: colors.border, marginTop: 8 }]}>
              <Text style={[styles.cancelLabel, { color: colors.mutedForeground }]}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── MODAL : Catégories projets ── */}
      <Modal visible={catModalVisible} animationType="slide" transparent>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setCatModalVisible(false)} />
          <View style={[styles.modal, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Catégories</Text>
            <View style={[styles.catInput, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <TextInput
                value={newCatName}
                onChangeText={setNewCatName}
                placeholder="Nouvelle catégorie…"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.catInputField, { color: colors.foreground }]}
              />
              <Pressable onPress={handleAddCategory} style={[styles.catAddBtn, { backgroundColor: colors.primary }]}>
                <MaterialCommunityIcons name="plus" size={18} color={colors.primaryForeground} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 240 }}>
              {categories.map(c => (
                <View key={c.id} style={[styles.catRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.catName, { color: colors.foreground }]}>{c.name}</Text>
                  <Pressable onPress={() => deleteCategory(c.id)} hitSlop={8}>
                    <MaterialCommunityIcons name="close" size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => setCatModalVisible(false)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={[styles.cancelLabel, { color: colors.mutedForeground }]}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── MODAL : Catégories dépenses ── */}
      <Modal visible={expCatModalVisible} animationType="slide" transparent>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setExpCatModalVisible(false)} />
          <View style={[styles.modal, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Catégories de dépenses</Text>
            <View style={[styles.catInput, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <TextInput
                value={newExpCatName}
                onChangeText={setNewExpCatName}
                placeholder="Nouvelle catégorie…"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.catInputField, { color: colors.foreground }]}
                onSubmitEditing={() => { if (newExpCatName.trim()) { handleAddExpCat(newExpCatName.trim()); setNewExpCatName(''); } }}
                returnKeyType="done"
              />
              <Pressable
                onPress={() => { if (newExpCatName.trim()) { handleAddExpCat(newExpCatName.trim()); setNewExpCatName(''); } }}
                style={[styles.catAddBtn, { backgroundColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="plus" size={18} color={colors.primaryForeground} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 240 }}>
              {expCatConfigs.map(c => (
                <View key={c.id} style={[styles.catRow, { borderBottomColor: colors.border }]}>
                  <MaterialCommunityIcons name="cash-multiple" size={14} color={colors.primary} />
                  <Text style={[styles.catName, { color: colors.foreground, flex: 1 }]}>{c.name}</Text>
                  <Pressable onPress={() => handleDeleteExpCat(c.id)} hitSlop={8}>
                    <MaterialCommunityIcons name="close" size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => setExpCatModalVisible(false)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={[styles.cancelLabel, { color: colors.mutedForeground }]}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── MODAL : Logs debug widget ── */}
      <Modal visible={widgetLogVisible} animationType="slide" transparent>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setWidgetLogVisible(false)} />
          <View style={[styles.modal, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: 24 + insets.bottom }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Logs widget</Text>
            {widgetLogEntries.length === 0 ? (
              <Text style={[styles.modalSub, { color: colors.mutedForeground, textAlign: 'center', marginVertical: 16 }]}>
                Aucun log. Ajoutez le widget puis revenez ici.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {widgetLogEntries.map((e, i) => (
                  <View key={i} style={{ marginBottom: 8 }}>
                    <Text style={{ color: colors.primary, fontSize: 10 }}>{e.t} [{e.tag}]</Text>
                    <Text style={{ color: colors.foreground, fontSize: 11 }}>{e.data}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <Pressable
              onPress={async () => {
                await AsyncStorage.removeItem('@yoann2_widget_debug_log').catch(() => {});
                setWidgetLogEntries([]);
                setWidgetLogVisible(false);
              }}
              style={[styles.cancelBtn, { borderColor: colors.destructive, marginTop: 8 }]}
            >
              <Text style={[styles.cancelLabel, { color: colors.destructive }]}>Effacer les logs</Text>
            </Pressable>
            <Pressable onPress={() => setWidgetLogVisible(false)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={[styles.cancelLabel, { color: colors.mutedForeground }]}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  content: {
    paddingHorizontal: 16,
    gap: 8,
  },
  section: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 4,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  rowSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  statsBox: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  statValue: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  about: {
    alignItems: 'center',
    marginTop: 8,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  aboutTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  aboutSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  aboutVersion: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    marginTop: 4,
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 24,
    gap: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  modalSub: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelLabel: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  backupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  backupRowDate: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  backupRowFile: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  catInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  catInputField: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  catAddBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  catName: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
});
