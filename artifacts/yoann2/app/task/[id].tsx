import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { GalleryPhotoPicker } from '@/components/GalleryPhotoPicker';
import { ProjectPhotosPicker } from '@/components/ProjectPhotosPicker';
import { ProjectPhoto } from '@/components/ProjectPhoto';
import { PriorityBadge } from '@/components/PriorityBadge';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { SubPageHeader } from '@/components/SubPageHeader';
import type { SubTask, TaskStatus } from '@/types';
import { syncGeofences } from '@/utils/geoReminderManager';
import { computeStreak, recurrenceLabel } from '@/utils/streakUtils';
import { protectPhoto } from '@/utils/photoProtection';
import { taskFolderName } from '@/utils/photoStorage';
import { completionDateError, formatCompletionDate } from '@/utils/completionDate';
import { photoTakenAt } from '@/utils/tripPhotoPlacement';
import { hasSubtaskPhotoDateSpread, scanTaskPhotoDates } from '@/utils/taskPhotoDates';
import { attachProjectPhotoReferences, getUnlinkedProjectPhotos, isSharedProjectPhoto } from '@/utils/projectPhotoLinks';

const { width } = Dimensions.get('window');

const STATUSES: TaskStatus[] = ['idea', 'todo', 'inprogress', 'waiting', 'done'];
const STATUS_LABELS: Record<TaskStatus, string> = {
  idea: 'Idée', todo: 'À faire', inprogress: 'En cours', waiting: 'En attente', done: 'Terminé',
};
const EISENHOWER_LABELS: Record<string, string> = {
  do_now: 'À faire maintenant', schedule: 'Planifier', delegate: 'Déléguer', eliminate: 'Supprimer',
};
const EISENHOWER_COLORS: Record<string, string> = {
  do_now: '#F44336', schedule: '#2196F3', delegate: '#FF9800', eliminate: '#9E9E9E',
};

function parseFrenchDate(value: string): Date | null {
  const parts = value.split('/');
  if (parts.length === 3) {
    const parsed = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function SubTaskCompletionInput({ value, onSave, colors }: {
  value: string;
  onSave: (value: string) => void;
  colors: { background: string; foreground: string; border: string; destructive: string; mutedForeground: string };
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  function save() {
    const message = draft.trim() ? completionDateError(draft) : undefined;
    if (message) { setError(message); return; }
    setError('');
    onSave(draft.trim());
  }
  return <View style={{ marginLeft: 34, marginTop: 6, marginBottom: 6, gap: 4 }}>
    <TextInput
      value={draft}
      onChangeText={setDraft}
      onBlur={save}
      onSubmitEditing={save}
      placeholder="Date de fin · JJ/MM/AAAA"
      placeholderTextColor={colors.mutedForeground}
      keyboardType="numeric"
      maxLength={10}
      style={{
        borderWidth: 1, borderColor: error ? colors.destructive : colors.border,
        backgroundColor: colors.background, color: colors.foreground,
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13,
      }}
      accessibilityLabel="Date réelle de fin de la sous-tâche"
    />
    {!!error && <Text style={{ color: colors.destructive, fontSize: 11 }}>{error}</Text>}
  </View>;
}

export default function TaskDetailScreen() {
  const { id, subTaskId } = useLocalSearchParams<{ id: string; subTaskId?: string }>();
  const colors = useColors();
  const router = useRouter();
  const { tasks, projects, updateTask, deleteTask, addTransactionCtx, deleteTransactionCtx, getTaskExpenses } = useApp();
  const latestTasks = useRef(tasks);
  latestTasks.current = tasks;

  const taskMaybe = tasks.find(t => t.id === id);
  const project = taskMaybe ? projects.find(p => p.id === taskMaybe.projectId) : null;
  const availableProjectPhotos = useMemo(
    () => getUnlinkedProjectPhotos(project?.photos ?? [], taskMaybe?.photos ?? []),
    [project, taskMaybe],
  );

  const [photoViewIdx, setPhotoViewIdx] = useState<number | null>(null);
  const [galleryPickerVisible, setGalleryPickerVisible] = useState(false);
  const [projectPhotosPickerVisible, setProjectPhotosPickerVisible] = useState(false);
  const [subTaskPhotoModal, setSubTaskPhotoModal] = useState<'prompt' | 'assign' | null>(null);
  const [photoAssignments, setPhotoAssignments] = useState<Record<string, string>>({});
  const [selectedAssignmentPhoto, setSelectedAssignmentPhoto] = useState<string | null>(null);
  const [scanningPhotoDates, setScanningPhotoDates] = useState(false);
  const [photoScanProgress, setPhotoScanProgress] = useState('');
  const promptDismissed = useRef(false);

  useEffect(() => {
    if (!taskMaybe || taskMaybe.subTaskPhotosReviewed || promptDismissed.current
      || !taskMaybe.subTasks?.length || !hasSubtaskPhotoDateSpread(taskMaybe.photos, taskMaybe.photoTakenAt)) return;
    setSubTaskPhotoModal('prompt');
  }, [taskMaybe]);

  async function handleDeletePhoto(uri: string, idx: number) {
    Alert.alert('Supprimer la photo', 'Cette photo sera définitivement supprimée.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          if (photoViewIdx === idx) setPhotoViewIdx(null);
          const newPhotos = task.photos.filter((_, i) => i !== idx);
          const photoTakenAt = { ...(task.photoTakenAt ?? {}) }; delete photoTakenAt[uri];
          const isShared = isSharedProjectPhoto(uri, task.projectPhotoUris, project?.photos);
          const subTasks = (task.subTasks ?? []).map(st => ({
            ...st, photoUris: st.photoUris?.filter(photoUri => photoUri !== uri),
          }));
          updateTask(task.id, {
            photos: newPhotos,
            photoTakenAt,
            subTasks,
            projectPhotoUris: task.projectPhotoUris?.filter(photoUri => photoUri !== uri),
          });
          if (!isShared) {
            try {
              const info = await FileSystem.getInfoAsync(uri);
              if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
            } catch { /* ignore cleanup errors */ }
          }
        },
      },
    ]);
  }
  const [newSubTaskTitle, setNewSubTaskTitle] = useState('');
  const [addExpVisible, setAddExpVisible] = useState(false);
  const [settingGeo, setSettingGeo] = useState(false);
  const [expName, setExpName] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDetails, setExpDetails] = useState('');
  const [expDate, setExpDate] = useState(() => new Date().toLocaleDateString('fr-FR'));

  const taskExpenses = useMemo(
    () => (taskMaybe ? getTaskExpenses(taskMaybe.id) : []),
    [getTaskExpenses, taskMaybe]
  );

  if (!taskMaybe) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground, padding: 20 }}>Tâche introuvable.</Text>
      </View>
    );
  }
  const task = taskMaybe;
  const streak = computeStreak(task, tasks);
  const photoReferenceDate = task.status === 'done' && task.completedAt
    ? parseFrenchDate(task.completedAt)
    : parseFrenchDate(task.dueDate);

  async function addTaskPhotoUris(items: Array<{ uri: string; takenAt?: number }>) {
    try {
      const permanent = await Promise.all(items.map(async item => ({
        uri: await protectPhoto(item.uri, {
          project: project?.name ?? 'Sans projet', folder: taskFolderName(task.title, task.id),
        }),
        takenAt: item.takenAt,
      })));
      const current = latestTasks.current.find(item => item.id === task.id);
      if (!current) return;
      const newUris = permanent.map(item => item.uri).filter(uri => !current.photos.includes(uri));
      const photoTakenAt = { ...(current.photoTakenAt ?? {}) };
      let metadataChanged = false;
      permanent.forEach(item => {
        if (item.takenAt && photoTakenAt[item.uri] !== item.takenAt) {
          photoTakenAt[item.uri] = item.takenAt;
          metadataChanged = true;
        }
      });
      if (newUris.length > 0 || metadataChanged)
        updateTask(task.id, { photos: [...current.photos, ...newUris], photoTakenAt });
    } catch (error) {
      Alert.alert('Photo non conservée', error instanceof Error ? error.message : 'Copie permanente impossible.');
    }
  }

  function addProjectPhotos(uris: string[]) {
    const current = latestTasks.current.find(item => item.id === task.id);
    if (!current) return;
    const updated = attachProjectPhotoReferences(current.photos, current.projectPhotoUris, uris);
    if (updated.photos.length === current.photos.length) return;
    updateTask(task.id, updated);
  }

  async function browseAllTaskPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
      exif: true,
    });
    if (!result.canceled) addTaskPhotoUris(result.assets.map(asset => ({
      uri: asset.uri, takenAt: photoTakenAt(asset.exif as Record<string, unknown> | undefined),
    })));
  }

  async function addGalleryTaskPhotos(assets: MediaLibrary.Asset[]) {
    try {
      const photos = await Promise.all(assets.map(async asset => {
        const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: false });
        return { uri: info.localUri ?? asset.uri, takenAt: photoTakenAt(info.exif as Record<string, unknown> | undefined, info.creationTime) };
      }));
      await addTaskPhotoUris(photos);
    } catch { Alert.alert('Photo inaccessible', 'Autorise l’accès aux photos, puis réessaie.'); }
  }

  async function analyzeTaskPhotoDates() {
    setScanningPhotoDates(true); setPhotoScanProgress('Préparation de l’analyse…');
    try {
      const photosWithoutDate = task.photos.filter(uri => !task.photoTakenAt?.[uri]);
      const result = await scanTaskPhotoDates(photosWithoutDate, setPhotoScanProgress);
      const current = latestTasks.current.find(item => item.id === task.id);
      if (!current) return;
      const photoTakenAt = { ...(current.photoTakenAt ?? {}), ...result.dates };
      updateTask(task.id, { photoTakenAt });
      if (!hasSubtaskPhotoDateSpread(current.photos, photoTakenAt)) {
        const detail = result.unmatched
          ? `Après lecture des métadonnées des ${result.scanned} photos sans date de la tâche, les dates retrouvées sont à moins de 24 heures d’écart. ${result.unmatched} photo(s) n’ont pas de date lisible.`
          : `Après lecture des métadonnées des ${result.scanned} photos sans date de la tâche, les dates sont à moins de 24 heures d’écart.`;
        Alert.alert('Aucun écart important détecté', detail);
      } else if (result.unmatched) {
        Alert.alert('Analyse terminée', `${result.unmatched} photo(s) sans date lisible. Tu pourras quand même leur attribuer une sous-tâche.`);
      }
    } catch (error) {
      Alert.alert('Analyse impossible', error instanceof Error ? error.message : 'Impossible de lire les dates de la galerie.');
    } finally { setScanningPhotoDates(false); setPhotoScanProgress(''); }
  }

  function openSubTaskPhotoAssignment() {
    const assignments: Record<string, string> = {};
    (task.subTasks ?? []).forEach(st => st.photoUris?.forEach(uri => { assignments[uri] = st.id; }));
    setPhotoAssignments(assignments);
    setSelectedAssignmentPhoto(task.photos[0] ?? null);
    setSubTaskPhotoModal('assign');
  }

  function saveSubTaskPhotoAssignment() {
    const next = (task.subTasks ?? []).map(st => {
      const photoUris = task.photos.filter(uri => photoAssignments[uri] === st.id);
      const latestTakenAt = photoUris.map(uri => task.photoTakenAt?.[uri])
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .sort((a, b) => b - a)[0];
      const inferredDate = latestTakenAt ? formatCompletionDate(new Date(latestTakenAt)) : undefined;
      const usePhotoDate = st.done && inferredDate && (!st.completedAt || st.completedAtSource === 'photo');
      return {
        ...st, photoUris,
        ...(usePhotoDate ? { completedAt: inferredDate, completedAtSource: 'photo' as const } : {}),
      };
    });
    updateTask(task.id, { subTasks: next, subTaskPhotosReviewed: true });
    setSubTaskPhotoModal(null);
  }

  async function handleSetGeoReminder() {
    setSettingGeo(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'L\'accès à la localisation est requis pour les rappels de lieu.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let address: string | undefined;
      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (geo) address = [geo.street, geo.city].filter(Boolean).join(', ');
      } catch {}
      const patch = {
        reminderLat: loc.coords.latitude,
        reminderLng: loc.coords.longitude,
        reminderRadius: 100,
        reminderAddress: address,
      };
      updateTask(task.id, patch);
      await syncGeofences(tasks.map(t => (t.id === task.id ? { ...task, ...patch } : t)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Erreur', 'Impossible de récupérer la position actuelle.');
    } finally {
      setSettingGeo(false);
    }
  }

  function handleRemoveGeoReminder() {
    const patch = {
      reminderLat: undefined,
      reminderLng: undefined,
      reminderRadius: undefined,
      reminderAddress: undefined,
    };
    updateTask(task.id, patch);
    syncGeofences(tasks.map(t => (t.id === task.id ? { ...task, ...patch } : t))).catch(() => {});
    Haptics.selectionAsync();
  }

  async function handleSetGeoRadius(r: number) {
    updateTask(task.id, { reminderRadius: r });
    await syncGeofences(tasks.map(t => (t.id === task.id ? { ...task, reminderRadius: r } : t)));
  }

  const dueDate = new Date(task.dueDate);
  const isOverdue = dueDate < new Date() && task.status !== 'done';
  const eisColor = EISENHOWER_COLORS[task.eisenhower];
  const taskTotal = taskExpenses.reduce((s, e) => s + e.amount, 0);

  function handleDelete() {
    Alert.alert('Supprimer', 'Supprimer cette tâche et ses dépenses ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => { deleteTask(task.id); router.back(); },
      },
    ]);
  }

  function toggleDone() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
  }

  function handleAddSubTask() {
    const title = newSubTaskTitle.trim();
    if (!title) return;
    const subTask = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, done: false };
    updateTask(task.id, { subTasks: [...(task.subTasks ?? []), subTask] });
    setNewSubTaskTitle('');
    Haptics.selectionAsync();
  }

  function toggleSubTask(id: string) {
    Haptics.selectionAsync();
    const next = (task.subTasks ?? []).map(st => {
      if (st.id !== id) return st;
      const photoDate = (st.photoUris ?? []).filter(uri => task.photos.includes(uri))
        .map(uri => task.photoTakenAt?.[uri])
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .sort((a, b) => b - a)[0];
      const suggestedDate = photoDate ? formatCompletionDate(new Date(photoDate)) : undefined;
      return st.done
        ? { ...st, done: false, completedAt: undefined, completedAtSource: undefined }
        : {
          ...st, done: true, completedAt: st.completedAt ?? suggestedDate ?? formatCompletionDate(),
          completedAtSource: st.completedAtSource ?? (suggestedDate ? 'photo' as const : 'manual' as const),
        };
    });
    updateTask(task.id, { subTasks: next });
  }

  function updateSubTaskCompletionDate(id: string, date: string) {
    const subTasks = (task.subTasks ?? []).map(st => st.id === id
      ? { ...st, completedAt: date || undefined, completedAtSource: date ? 'manual' as const : undefined }
      : st);
    updateTask(task.id, { subTasks });
  }

  function handleDeleteSubTask(id: string) {
    Alert.alert('Supprimer', 'Supprimer cette sous-tâche ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          updateTask(task.id, { subTasks: (task.subTasks ?? []).filter(st => st.id !== id) });
        },
      },
    ]);
  }

  function parseFrDate(s: string): string {
    const parts = s.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      const parsed = new Date(Number(y), Number(m) - 1, Number(d));
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
  }

  async function handleAddExpense() {
    if (!expName.trim() || !expAmount.trim()) return;
    const amount = parseFloat(expAmount);
    if (isNaN(amount) || amount <= 0) return;
    await addTransactionCtx({
      type: 'expense',
      label: expName.trim(),
      amount,
      date: parseFrDate(expDate),
      category: expDetails.trim() || 'Autre',
      projectId: task.projectId,
      taskId: task.id,
    });
    setExpName('');
    setExpAmount('');
    setExpDetails('');
    setExpDate(new Date().toLocaleDateString('fr-FR'));
    setAddExpVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SubPageHeader
        title="Détail tâche"
        numberOfLines={1}
        right={
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push(`/task/new?id=${task.id}`)} hitSlop={8}>
              <MaterialCommunityIcons name="pencil-outline" size={22} color={colors.primary} />
            </Pressable>
            <Pressable onPress={handleDelete} hitSlop={8}>
              <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.destructive} />
            </Pressable>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Pressable onPress={toggleDone} hitSlop={8}>
              <MaterialCommunityIcons
                name={task.status === 'done' ? 'check-circle' : 'circle-outline'}
                size={28}
                color={task.status === 'done' ? '#4CAF50' : colors.mutedForeground}
              />
            </Pressable>
            <Text
              style={[
                styles.title,
                { color: colors.foreground },
                task.status === 'done' && { textDecorationLine: 'line-through', color: colors.mutedForeground },
              ]}
            >
              {task.title}
            </Text>
          </View>

          {project && (
            <Pressable onPress={() => router.push(`/project/${project.id}`)}>
              <View style={[styles.projLink, { backgroundColor: colors.primary + '20' }]}>
                <MaterialCommunityIcons name="folder-outline" size={16} color={colors.primary} />
                <Text style={[styles.projLinkTxt, { color: colors.primary }]}>{project.name}</Text>
                <MaterialCommunityIcons name="chevron-right" size={14} color={colors.primary} />
              </View>
            </Pressable>
          )}

          <View style={styles.badges}>
            <PriorityBadge priority={task.priority} />
            <View style={[styles.statusBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.statusTxt, { color: colors.foreground }]}>{STATUS_LABELS[task.status]}</Text>
            </View>
            {isOverdue && (
              <View style={[styles.statusBadge, { backgroundColor: colors.destructive + '20', borderColor: colors.destructive }]}>
                <MaterialCommunityIcons name="clock-alert-outline" size={12} color={colors.destructive} />
                <Text style={[styles.statusTxt, { color: colors.destructive }]}>En retard</Text>
              </View>
            )}
          </View>

          <View style={[styles.infoGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.infoItem, { borderBottomColor: colors.border }]}>
              <MaterialCommunityIcons name="calendar-clock" size={16} color={colors.primary} />
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Échéance</Text>
              <Text style={[styles.infoValue, { color: isOverdue ? colors.destructive : colors.foreground }]}>
                {dueDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
            <View style={[styles.infoItem, { borderBottomColor: colors.border }]}>
              <MaterialCommunityIcons name="calendar-plus" size={16} color={colors.primary} />
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Créée le</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {new Date(task.createdAt).toLocaleDateString('fr-FR')}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <MaterialCommunityIcons name="matrix" size={16} color={eisColor} />
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Eisenhower</Text>
              <Text style={[styles.infoValue, { color: eisColor }]}>{EISENHOWER_LABELS[task.eisenhower]}</Text>
            </View>
          </View>

          <View style={[styles.scoreRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.scoreItem}>
              <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>Importance</Text>
              <Text style={[styles.scoreValue, { color: colors.foreground }]}>{task.importance}/5</Text>
            </View>
            <View style={[styles.scoreDivider, { backgroundColor: colors.border }]} />
            <View style={styles.scoreItem}>
              <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>Urgence</Text>
              <Text style={[styles.scoreValue, { color: colors.foreground }]}>{task.urgency}/5</Text>
            </View>
          </View>

          {streak && streak.current > 0 && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: '#FF980015', borderRadius: 12,
              borderWidth: 1, borderColor: '#FF980040',
              paddingHorizontal: 14, paddingVertical: 10,
            }}>
              <Text style={{ fontSize: 22 }}>🔥</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FF9800', fontFamily: 'Inter_700Bold', fontSize: 15 }}>
                  {streak.current} {recurrenceLabel(streak.recurrence)}{streak.current > 1 ? 's' : ''} de suite
                </Text>
                {streak.record > streak.current && (
                  <Text style={{ color: '#FF980099', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 1 }}>
                    Record : {streak.record} {recurrenceLabel(streak.recurrence)}{streak.record > 1 ? 's' : ''}
                  </Text>
                )}
              </View>
              {streak.current >= streak.record && streak.record > 1 && (
                <Text style={{ fontSize: 18 }}>🏆</Text>
              )}
            </View>
          )}

          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Statut</Text>
            <View style={styles.statusRow}>
              {STATUSES.map(s => (
                <Pressable
                  key={s}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateTask(task.id, { status: s }); }}
                  style={[
                    styles.statusChip,
                    task.status === s ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                  ]}
                >
                  <Text style={[styles.statusChipTxt, { color: task.status === s ? colors.primaryForeground : colors.mutedForeground }]}>
                    {STATUS_LABELS[s]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* ── Récurrence ── */}
          {task.status === 'done' && (
            <Pressable
              testID="edit-task-completion-date"
              onPress={() => router.push({ pathname: '/task/new', params: { id: task.id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}
            >
              <MaterialCommunityIcons name="calendar-check" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 14 }}>
                {task.completedAt ? `Terminée le ${task.completedAt}` : 'Date de fin à préciser'}
              </Text>
              <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.primary} />
            </Pressable>
          )}

          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Récurrence</Text>
            <View style={styles.statusRow}>
              {([null, 'daily', 'weekly', 'monthly'] as const).map(r => {
                const label = r === null ? 'Aucune' : r === 'daily' ? 'Quotidien' : r === 'weekly' ? 'Hebdomadaire' : 'Mensuel';
                const active = (task.recurrence ?? null) === r;
                return (
                  <Pressable
                    key={String(r)}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      updateTask(task.id, { recurrence: r });
                    }}
                    style={[
                      styles.statusChip,
                      active
                        ? { backgroundColor: '#9C27B0' }
                        : { backgroundColor: '#9C27B020', borderColor: '#9C27B0', borderWidth: 1 },
                    ]}
                  >
                    <Text style={[styles.statusChipTxt, { color: active ? '#fff' : '#9C27B0' }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {task.description.length > 0 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Description</Text>
              <Text style={[styles.body2, { color: colors.mutedForeground }]}>{task.description}</Text>
            </View>
          )}

          {task.notes.length > 0 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Notes</Text>
              <View style={[styles.notesBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.body2, { color: colors.foreground }]}>{task.notes}</Text>
              </View>
            </View>
          )}

          {/* ── Sous-tâches ── */}
          <View>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>
                Sous-tâches {(task.subTasks?.length ?? 0) > 0 ? `(${task.subTasks!.filter(s => s.done).length}/${task.subTasks!.length})` : ''}
              </Text>
            </View>

            {(task.subTasks ?? []).map(st => (
              <View key={st.id} style={{ marginBottom: 8 }}>
                <Pressable
                  testID={`subtask-${st.id}`}
                  accessibilityLabel={subTaskId === st.id ? `Sous-tâche sélectionnée dans la chronologie : ${st.title}` : st.title}
                  onPress={() => toggleSubTask(st.id)}
                  onLongPress={() => handleDeleteSubTask(st.id)}
                  style={[
                    styles.subTaskRow,
                    {
                      backgroundColor: subTaskId === st.id ? colors.primary + '12' : colors.card,
                      borderColor: subTaskId === st.id ? colors.primary : colors.border,
                      marginBottom: 0,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={st.done ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                    size={22}
                    color={st.done ? colors.primary : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.subTaskLabel,
                      { color: st.done ? colors.mutedForeground : colors.foreground },
                      st.done && { textDecorationLine: 'line-through' },
                    ]}
                  >
                    {st.title}
                  </Text>
                </Pressable>
                {st.done && <SubTaskCompletionInput
                  key={`${st.id}:${st.completedAt ?? ''}`}
                  value={st.completedAt ?? ''}
                  colors={colors}
                  onSave={date => updateSubTaskCompletionDate(st.id, date)}
                />}
              </View>
            ))}

            {!!task.subTasks?.length && !!task.photos.length && <View style={{ gap: 8, marginTop: 4 }}>
              <Pressable onPress={openSubTaskPhotoAssignment} style={[styles.addExpBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
                <MaterialCommunityIcons name="image-multiple-outline" size={16} color={colors.primary} />
                <Text style={[styles.addExpLabel, { color: colors.primary }]}>
                  {task.subTasks.some(st => st.photoUris?.length) ? 'Modifier la répartition des photos' : 'Répartir les photos entre les sous-tâches'}
                </Text>
              </Pressable>
              {task.photos.some(uri => !task.photoTakenAt?.[uri]) && <Pressable
                onPress={() => { void analyzeTaskPhotoDates(); }}
                disabled={scanningPhotoDates}
                style={[styles.addExpBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: scanningPhotoDates ? 0.7 : 1 }]}
              >
                {scanningPhotoDates ? <ActivityIndicator size="small" color={colors.primary} />
                  : <MaterialCommunityIcons name="calendar-search" size={16} color={colors.primary} />}
                <Text style={[styles.addExpLabel, { color: colors.primary }]}>
                  {scanningPhotoDates ? photoScanProgress || 'Analyse en cours…' : 'Analyser les dates des photos existantes'}
                </Text>
              </Pressable>}
            </View>}

            <View style={styles.subTaskAddRow}>
              <TextInput
                value={newSubTaskTitle}
                onChangeText={setNewSubTaskTitle}
                placeholder="Ajouter une sous-tâche…"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { flex: 1, backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
                onSubmitEditing={handleAddSubTask}
                returnKeyType="done"
              />
              <Pressable
                onPress={handleAddSubTask}
                disabled={!newSubTaskTitle.trim()}
                style={[styles.subTaskAddBtn, { backgroundColor: colors.primary, opacity: newSubTaskTitle.trim() ? 1 : 0.4 }]}
              >
                <MaterialCommunityIcons name="plus" size={20} color={colors.primaryForeground} />
              </Pressable>
            </View>
          </View>

          <View>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>Photos</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {availableProjectPhotos.length > 0 && (
                  <Pressable
                    testID="add-project-photos"
                    accessibilityRole="button"
                    accessibilityLabel="Associer des photos du projet"
                    onPress={() => setProjectPhotosPickerVisible(true)}
                    hitSlop={8}
                    style={styles.addProjectPhotoInline}
                  >
                    <MaterialCommunityIcons name="folder-plus-outline" size={19} color={colors.primary} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setGalleryPickerVisible(true)}
                  style={[styles.addPhotoInline, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
                >
                  <MaterialCommunityIcons name="image-plus-outline" size={16} color={colors.primary} />
                  <Text style={[styles.addExpLabel, { color: colors.primary }]}>Ajouter</Text>
                </Pressable>
              </View>
            </View>
            {task.photos.length > 0 ? (
              <View style={styles.photoGrid}>
                {task.photos.map((uri, idx) => (
                  <View key={idx} style={styles.photoThumb}>
                    <Pressable onPress={() => setPhotoViewIdx(idx)} style={{ flex: 1 }}>
                      <ProjectPhoto uri={uri} style={styles.photoImg} contentFit="cover" />
                    </Pressable>
                    <Pressable
                      onPress={() => handleDeletePhoto(uri, idx)}
                      style={styles.photoRemove}
                      hitSlop={6}
                    >
                      <MaterialCommunityIcons name="close-circle" size={20} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyExp, { color: colors.mutedForeground }]}>
                Aucune photo liée à cette tâche
              </Text>
            )}
          </View>

          {/* ── Rappel de lieu ── */}
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Rappel de lieu</Text>
            {task.reminderLat != null ? (
              <View>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: '#4CAF5015', borderRadius: 12,
                  borderWidth: 1, borderColor: '#4CAF5040',
                  paddingHorizontal: 14, paddingVertical: 10,
                }}>
                  <MaterialCommunityIcons name="map-marker-check" size={20} color="#4CAF50" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_500Medium' }}>
                      {task.reminderAddress ?? `${task.reminderLat.toFixed(5)}, ${task.reminderLng!.toFixed(5)}`}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                      Rayon : {task.reminderRadius ?? 100} m
                    </Text>
                  </View>
                  <Pressable onPress={handleRemoveGeoReminder} hitSlop={8}>
                    <MaterialCommunityIcons name="close-circle-outline" size={22} color={colors.mutedForeground} />
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {[50, 100, 200, 500].map(r => {
                    const active = (task.reminderRadius ?? 100) === r;
                    return (
                      <Pressable
                        key={r}
                        onPress={() => { void handleSetGeoRadius(r); }}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
                          backgroundColor: active ? '#4CAF50' : colors.secondary,
                          borderWidth: 1,
                          borderColor: active ? '#4CAF50' : colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: active ? '#fff' : colors.mutedForeground }}>
                          {r} m
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => { void handleSetGeoReminder(); }}
                disabled={settingGeo}
                style={[styles.addExpBtn, { backgroundColor: '#4CAF5015', borderColor: '#4CAF5040' }]}
              >
                {settingGeo
                  ? <ActivityIndicator size="small" color="#4CAF50" />
                  : <MaterialCommunityIcons name="map-marker-plus-outline" size={16} color="#4CAF50" />
                }
                <Text style={[styles.addExpLabel, { color: '#4CAF50' }]}>
                  {settingGeo ? 'Localisation en cours…' : 'Ajouter un rappel de lieu'}
                </Text>
              </Pressable>
            )}
          </View>

          <View>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>
                Dépenses {taskExpenses.length > 0 ? `(${taskExpenses.length})` : ''}
              </Text>
              {taskTotal > 0 && (
                <Text style={[styles.expTotalInline, { color: colors.primary }]}>{taskTotal}€</Text>
              )}
            </View>

            {taskExpenses.length === 0 ? (
              <Text style={[styles.emptyExp, { color: colors.mutedForeground }]}>
                Aucune dépense liée à cette tâche
              </Text>
            ) : (
              taskExpenses.map(e => (
                <Pressable
                  key={e.id}
                  testID={`task-expense-${e.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Ouvrir ${e.label} dans Finance`}
                  onPress={() => router.push({
                    pathname: '/(tabs)/expenses',
                    params: { transactionId: e.id },
                  } as any)}
                  style={[styles.expRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.expName, { color: colors.foreground }]}>{e.label}</Text>
                    {e.category.length > 0 && (
                      <Text style={[styles.expMeta, { color: colors.mutedForeground }]}>{e.category}</Text>
                    )}
                    <Text style={[styles.expMeta, { color: colors.mutedForeground }]}>
                      {new Date(e.date).toLocaleDateString('fr-FR')}
                    </Text>
                  </View>
                  <Text style={[styles.expAmount, { color: colors.primary }]}>{e.amount}€</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Supprimer ${e.label}`}
                    onPress={event => {
                      event.stopPropagation();
                      deleteTransactionCtx(e.id);
                    }}
                    hitSlop={8}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.mutedForeground} />
                  </Pressable>
                </Pressable>
              ))
            )}

            <Pressable
              onPress={() => setAddExpVisible(true)}
              style={[styles.addExpBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
            >
              <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
              <Text style={[styles.addExpLabel, { color: colors.primary }]}>Ajouter une dépense</Text>
            </Pressable>

            {project && (
              <Pressable onPress={() => router.push(`/project/${project.id}`)}>
                <Text style={[styles.viewProjectLink, { color: colors.mutedForeground }]}>
                  Voir toutes les dépenses du projet →
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={photoViewIdx !== null} animationType="fade" transparent>
        <View style={[styles.photoModal, { backgroundColor: 'rgba(0,0,0,0.95)' }]}>
          <Pressable onPress={() => setPhotoViewIdx(null)} style={styles.photoClose}>
            <MaterialCommunityIcons name="close" size={26} color="#fff" />
          </Pressable>
          {photoViewIdx !== null && task.photos[photoViewIdx] && (
            <ProjectPhoto uri={task.photos[photoViewIdx]} style={styles.photoFull} contentFit="contain" />
          )}
        </View>
      </Modal>

      <Modal visible={subTaskPhotoModal === 'prompt'} transparent animationType="fade"
        onRequestClose={() => { promptDismissed.current = true; setSubTaskPhotoModal(null); }}>
        <View style={styles.subTaskModalBackdrop}>
          <View style={[styles.subTaskModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="calendar-multiple-check" size={30} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>Plusieurs jours de travaux détectés</Text>
            <Text style={[styles.body2, { color: colors.mutedForeground }]}>
              Les photos de cette tâche sont espacées de plus de 24 heures. Correspondent-elles à différentes sous-tâches ?
              Tu pourras associer chaque photo et proposer une date de fin à partir de sa date de prise.
            </Text>
            <Pressable onPress={openSubTaskPhotoAssignment} style={[styles.primaryModalButton, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }}>Oui, répartir les photos</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => { promptDismissed.current = true; setSubTaskPhotoModal(null); }}
                style={[styles.secondaryModalButton, { borderColor: colors.border }]}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_500Medium' }}>Plus tard</Text>
              </Pressable>
              <Pressable onPress={() => {
                updateTask(task.id, { subTaskPhotosReviewed: true });
                setSubTaskPhotoModal(null);
              }} style={[styles.secondaryModalButton, { borderColor: colors.border }]}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Non, même période</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={subTaskPhotoModal === 'assign'} transparent animationType="slide"
        onRequestClose={() => setSubTaskPhotoModal(null)}>
        <View style={styles.subTaskModalBackdrop}>
          <View style={[styles.subTaskAssignModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.subTaskModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 2 }]}>Répartir les photos</Text>
                <Text style={[styles.emptyExp, { color: colors.mutedForeground }]}>Choisis une photo, puis la sous-tâche correspondante.</Text>
              </View>
              <Pressable onPress={() => setSubTaskPhotoModal(null)} accessibilityLabel="Fermer">
                <MaterialCommunityIcons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={styles.assignmentPhotoGrid}>
              {task.photos.map((uri, index) => {
                const assignedId = photoAssignments[uri];
                const assignedName = task.subTasks?.find(st => st.id === assignedId)?.title;
                const takenAt = task.photoTakenAt?.[uri];
                const selected = uri === selectedAssignmentPhoto;
                return <Pressable key={uri} onPress={() => setSelectedAssignmentPhoto(uri)}
                  style={[styles.assignmentPhotoCard, { borderColor: selected ? colors.primary : colors.border }]}>
                  <ProjectPhoto uri={uri} style={styles.assignmentPhoto} contentFit="cover" />
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 11 }}>
                    {takenAt ? new Date(takenAt).toLocaleDateString('fr-FR') : `Photo ${index + 1} · date inconnue`}
                  </Text>
                  <Text numberOfLines={1} style={{ color: assignedName ? colors.primary : colors.mutedForeground, fontSize: 10 }}>
                    {assignedName ?? 'À associer'}
                  </Text>
                </Pressable>;
              })}
            </ScrollView>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>
              {selectedAssignmentPhoto
                ? `Associer cette photo à : ${task.photoTakenAt?.[selectedAssignmentPhoto]
                  ? new Date(task.photoTakenAt[selectedAssignmentPhoto]!).toLocaleDateString('fr-FR') : 'date inconnue'}`
                : 'Sélectionne une photo'}
            </Text>
            <ScrollView style={{ maxHeight: 190 }} contentContainerStyle={{ gap: 8 }}>
              {(task.subTasks ?? []).map(st => {
                const previewUris = task.photos.filter(uri => photoAssignments[uri] === st.id);
                const suggested = previewUris.map(uri => task.photoTakenAt?.[uri])
                  .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
                  .sort((a, b) => b - a)[0];
                return <Pressable key={st.id} disabled={!selectedAssignmentPhoto}
                  onPress={() => selectedAssignmentPhoto && setPhotoAssignments(previous => ({ ...previous, [selectedAssignmentPhoto]: st.id }))}
                  style={[styles.assignmentOption, {
                    borderColor: selectedAssignmentPhoto && photoAssignments[selectedAssignmentPhoto] === st.id ? colors.primary : colors.border,
                    backgroundColor: colors.background,
                  }]}>
                  <MaterialCommunityIcons name={photoAssignments[selectedAssignmentPhoto ?? ''] === st.id ? 'radiobox-marked' : 'radiobox-blank'}
                    size={20} color={photoAssignments[selectedAssignmentPhoto ?? ''] === st.id ? colors.primary : colors.mutedForeground} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_500Medium' }}>{st.title}</Text>
                    {suggested && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                      Date de fin proposée : {formatCompletionDate(new Date(suggested))}
                    </Text>}
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{previewUris.length} photo(s)</Text>
                </Pressable>;
              })}
              <Pressable disabled={!selectedAssignmentPhoto}
                onPress={() => {
                  if (!selectedAssignmentPhoto) return;
                  setPhotoAssignments(previous => { const next = { ...previous }; delete next[selectedAssignmentPhoto]; return next; });
                }} style={[styles.assignmentOption, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <MaterialCommunityIcons name={!photoAssignments[selectedAssignmentPhoto ?? ''] ? 'radiobox-marked' : 'radiobox-blank'}
                  size={20} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground }}>Ne pas associer</Text>
              </Pressable>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => setSubTaskPhotoModal(null)} style={[styles.secondaryModalButton, { borderColor: colors.border }]}>
                <Text style={{ color: colors.foreground }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={saveSubTaskPhotoAssignment} style={[styles.primaryModalButton, { backgroundColor: colors.primary, flex: 1 }]}>
                <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }}>Enregistrer les associations</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <GalleryPhotoPicker
        visible={galleryPickerVisible}
        title="Photos de la tâche"
        referenceDate={photoReferenceDate}
        onClose={() => setGalleryPickerVisible(false)}
        onAddAssets={addGalleryTaskPhotos}
        onBrowseAll={browseAllTaskPhotos}
      />
      <ProjectPhotosPicker
        visible={projectPhotosPickerVisible}
        projectName={project?.name ?? 'Projet'}
        photos={availableProjectPhotos}
        onClose={() => setProjectPhotosPickerVisible(false)}
        onConfirm={addProjectPhotos}
      />

      <BottomSheet visible={addExpVisible} onClose={() => setAddExpVisible(false)} title="Nouvelle dépense" avoidKeyboard>
            <Text style={[styles.sheetSub, { color: colors.mutedForeground }]}>
              Sera automatiquement ajoutée au projet « {project?.name ?? '...'} »
            </Text>

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Nom de la dépense *</Text>
            <TextInput
              value={expName}
              onChangeText={setExpName}
              placeholder="Ex: Visserie"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
            />

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Montant (€) *</Text>
            <TextInput
              value={expAmount}
              onChangeText={setExpAmount}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
            />

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Détails (optionnel)</Text>
            <TextInput
              value={expDetails}
              onChangeText={setExpDetails}
              placeholder="Ex: Boulons M6, quincaillerie"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
            />

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Date (JJ/MM/AAAA)</Text>
            <TextInput
              value={expDate}
              onChangeText={setExpDate}
              placeholder="JJ/MM/AAAA"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
            />

            <View style={styles.sheetBtns}>
              <Pressable
                onPress={() => setAddExpVisible(false)}
                style={[styles.cancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.cancelLabel, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={handleAddExpense}
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.saveBtnLabel, { color: colors.primaryForeground }]}>Ajouter</Text>
              </Pressable>
            </View>
      </BottomSheet>
    </View>
  );
}

const THUMB = (width - 48) / 3;
const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, gap: 10,
  },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  headerActions: { flexDirection: 'row', gap: 16 },
  body: { padding: 16, gap: 16 },
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  title: { flex: 1, fontSize: 20, fontFamily: 'Inter_600SemiBold', lineHeight: 28 },
  projLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, alignSelf: 'flex-start' },
  projLinkTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  infoGrid: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  infoLabel: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  infoValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'right', flexShrink: 1, flexWrap: 'wrap' },
  scoreRow: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  scoreItem: { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 4 },
  scoreDivider: { width: 1 },
  scoreLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  scoreValue: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  statusChipTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  body2: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 22 },
  notesBox: { padding: 14, borderRadius: 12, borderWidth: 1 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumb: { width: THUMB, height: THUMB, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  photoImg: { width: '100%', height: '100%' },
  photoRemove: { position: 'absolute', top: 4, right: 4, zIndex: 10 },
  addPhotoInline: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  addProjectPhotoInline: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center' },
  photoModal: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photoClose: { position: 'absolute', top: 60, right: 20, zIndex: 10 },
  photoFull: { width, height: width * 1.2 },
  emptyExp: { fontSize: 13, fontFamily: 'Inter_400Regular', fontStyle: 'italic', marginBottom: 10 },
  expTotalInline: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  expRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  expName: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  expMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  expAmount: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  addExpBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginBottom: 8 },
  addExpLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  subTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  subTaskLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  subTaskAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  subTaskAddBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  subTaskModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'center', padding: 20 },
  subTaskModal: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 14 },
  subTaskAssignModal: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 16, maxHeight: '90%', marginTop: 'auto' },
  subTaskModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  assignmentPhotoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 },
  assignmentPhotoCard: { width: '31.5%', borderWidth: 2, borderRadius: 10, padding: 4, gap: 2 },
  assignmentPhoto: { width: '100%', height: 82, borderRadius: 7 },
  assignmentOption: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10 },
  primaryModalButton: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryModalButton: { flex: 1, minHeight: 46, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  viewProjectLink: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 4 },
  sheetSub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: -4, marginBottom: 4 },
  inputLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular' },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  cancelLabel: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  saveBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
