import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { resolveProjectDirForBatch, sanitize, savePhotoToProject, taskFolderName } from '@/utils/photoStorage';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { SubPageHeader } from '@/components/SubPageHeader';
import type { Priority, RecurrenceType, TaskStatus } from '@/types';

const { width } = Dimensions.get('window');

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];
const PRIORITY_LABELS: Record<Priority, string> = { low: 'Faible', medium: 'Moyenne', high: 'Haute', critical: 'Critique' };
const PRIORITY_COLORS: Record<Priority, string> = { low: '#4CAF50', medium: '#FF9800', high: '#F44336', critical: '#9C27B0' };

const STATUSES: TaskStatus[] = ['idea', 'todo', 'inprogress', 'waiting', 'done'];
const STATUS_LABELS: Record<TaskStatus, string> = {
  idea: 'Idée', todo: 'À faire', inprogress: 'En cours', waiting: 'En attente', done: 'Terminé',
};

const EISEN_LEVELS = [
  { value: 1, label: 'Faible' },
  { value: 2, label: 'Moyen' },
  { value: 3, label: 'Élevé' },
];

export default function NewTaskScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; projectId?: string; idea?: string; title?: string }>();
  const { tasks, projects, addTask, updateTask } = useApp();

  const existing = params.id ? tasks.find(t => t.id === params.id) : null;
  const isEditing = !!existing;
  const isIdea = params.idea === '1';

  const defaultProjectId = params.projectId ?? projects[0]?.id ?? '';

  const [title, setTitle] = useState(existing?.title ?? params.title ?? '');
  const [desc, setDesc] = useState(existing?.description ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [projectId, setProjectId] = useState(existing?.projectId ?? defaultProjectId);
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? (isIdea ? 'low' : 'medium'));
  const [status, setStatus] = useState<TaskStatus>(existing?.status ?? (isIdea ? 'idea' : 'todo'));
  const [importance, setImportance] = useState(() => {
    if (existing) return Math.min(3, Math.max(1, Math.round((existing.importance / 5) * 3)));
    return isIdea ? 1 : 2;
  });
  const [urgency, setUrgency] = useState(() => {
    if (existing) return Math.min(3, Math.max(1, Math.round((existing.urgency / 5) * 3)));
    return isIdea ? 1 : 2;
  });
  const [dueDate, setDueDate] = useState(() => {
    if (existing) return new Date(existing.dueDate).toLocaleDateString('fr-FR');
    if (isIdea) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toLocaleDateString('fr-FR');
    }
    return '';
  });
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? []);
  const [recurrence, setRecurrence] = useState<RecurrenceType>(existing?.recurrence ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const eisenhower = useMemo(() => {
    const isUrgent = urgency >= 2;
    const isImportant = importance >= 2;
    if (isUrgent && isImportant) return { label: 'À faire maintenant', color: '#F44336' };
    if (!isUrgent && isImportant) return { label: 'Planifier', color: '#2196F3' };
    if (isUrgent && !isImportant) return { label: 'Déléguer', color: '#FF9800' };
    return { label: 'Supprimer', color: '#9E9E9E' };
  }, [urgency, importance]);

  function parseFrDate(s: string): Date {
    const parts = s.split('/');
    if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    return new Date();
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Le titre est obligatoire';
    if (!dueDate.trim()) e.dueDate = "La date limite est obligatoire";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    const scaledImportance = Math.round((importance / 3) * 5);
    const scaledUrgency = Math.round((urgency / 3) * 5);
    const data = {
      projectId,
      title: title.trim(),
      description: desc.trim(),
      notes: notes.trim(),
      photos,
      dueDate: parseFrDate(dueDate).toISOString(),
      priority,
      importance: scaledImportance,
      urgency: scaledUrgency,
      status,
      recurrence,
    };
    if (isEditing && existing) {
      updateTask(existing.id, data);
    } else {
      addTask(data);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  async function persistPhoto(tempUri: string): Promise<string> {
    const dir = FileSystem.documentDirectory + 'task_photos/';
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const ext = tempUri.split('.').pop()?.split('?')[0] ?? 'jpg';
    const dest = dir + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;
    await FileSystem.copyAsync({ from: tempUri, to: dest });
    return dest;
  }

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && Platform.OS !== 'web') { Alert.alert('Permission refusée'); return; }
    const projectName = projects.find(p => p.id === projectId)?.name ?? 'Projet';
    // Nom du dossier : <titre>_tache_<id> si tâche existante, sinon juste <titre>
    const taskFolder = existing
      ? taskFolderName(title || 'Nouvelle tâche', existing.id)
      : sanitize(title || 'Nouvelle tâche');
    Alert.alert('Ajouter une photo', '', [
      {
        text: 'Appareil photo',
        onPress: async () => {
          const r = await ImagePicker.launchCameraAsync({ quality: 1 });
          if (!r.canceled && r.assets[0]) {
            const asset = r.assets[0];
            const permanent = await persistPhoto(asset.uri);
            setPhotos(prev => [...prev, permanent]);
            savePhotoToProject(asset.uri, projectName, asset.fileName, undefined, taskFolder);
          }
        },
      },
      {
        text: 'Galerie',
        onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({ quality: 1, allowsMultipleSelection: true });
          if (!r.canceled) {
            const permanents = await Promise.all(r.assets.map(a => persistPhoto(a.uri)));
            setPhotos(prev => [...prev, ...permanents]);
            // Resolve the project folder once for the whole batch — avoids
            // repeated SAF directory creation that produces duplicate folders.
            const batchDir = await resolveProjectDirForBatch(projectName, taskFolder);
            r.assets.forEach(a => savePhotoToProject(a.uri, projectName, a.fileName, batchDir, taskFolder));
          }
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  function ScoreSelector({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
      <View>
        <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 8 }]}>{label}</Text>
        <View style={styles.levelRow}>
          {EISEN_LEVELS.map(lvl => (
            <Pressable
              key={lvl.value}
              onPress={() => onChange(lvl.value)}
              style={[
                styles.levelBtn,
                value === lvl.value
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[
                styles.levelLabel,
                { color: value === lvl.value ? colors.primaryForeground : colors.mutedForeground },
              ]}>
                {lvl.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SubPageHeader
        title={isEditing ? 'Modifier la tâche' : isIdea ? 'Nouvelle idée' : 'Nouvelle tâche'}
        right={
          <Pressable onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.saveBtnTxt, { color: colors.primaryForeground }]}>Enregistrer</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={[styles.form, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Projet</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {projects.map(p => (
              <Pressable
                key={p.id}
                onPress={() => setProjectId(p.id)}
                style={[
                  styles.chip,
                  projectId === p.id
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={[styles.chipTxt, { color: projectId === p.id ? colors.primaryForeground : colors.mutedForeground }]}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Titre *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Une couronne n'est rien sans le titre de roi."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: errors.title ? colors.destructive : colors.border }]}
          />
          {errors.title && <Text style={[styles.error, { color: colors.destructive }]}>{errors.title}</Text>}
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Description</Text>
          <TextInput
            value={desc}
            onChangeText={setDesc}
            placeholder="Description de la tâche…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.textarea, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          />
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes supplémentaires…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={2}
            style={[styles.input, styles.textarea, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          />
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Date limite *</Text>
          <TextInput
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="JJ/MM/AAAA"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: errors.dueDate ? colors.destructive : colors.border }]}
          />
          {errors.dueDate && <Text style={[styles.error, { color: colors.destructive }]}>{errors.dueDate}</Text>}
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Priorité</Text>
          <View style={styles.row}>
            {PRIORITIES.map(p => (
              <Pressable
                key={p}
                onPress={() => setPriority(p)}
                style={[
                  styles.priorityChip,
                  priority === p ? { backgroundColor: PRIORITY_COLORS[p] } : { backgroundColor: PRIORITY_COLORS[p] + '20', borderColor: PRIORITY_COLORS[p], borderWidth: 1 },
                ]}
              >
                <Text style={[styles.chipTxt, { color: priority === p ? '#fff' : PRIORITY_COLORS[p] }]}>
                  {PRIORITY_LABELS[p]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Récurrence</Text>
          <View style={styles.row}>
            {([null, 'daily', 'weekly', 'monthly'] as RecurrenceType[]).map(r => {
              const label = r === null ? 'Aucune' : r === 'daily' ? 'Quotidien' : r === 'weekly' ? 'Hebdo' : 'Mensuel';
              const active = recurrence === r;
              return (
                <Pressable
                  key={String(r)}
                  onPress={() => { setRecurrence(r); }}
                  style={[
                    styles.priorityChip,
                    active
                      ? { backgroundColor: '#9C27B0' }
                      : { backgroundColor: '#9C27B020', borderColor: '#9C27B0', borderWidth: 1 },
                  ]}
                >
                  <Text style={[styles.chipTxt, { color: active ? '#fff' : '#9C27B0' }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Statut</Text>
          <View style={styles.statusGrid}>
            {STATUSES.map(s => (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[
                  styles.statusChip,
                  status === s ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={[styles.chipTxt, { color: status === s ? colors.primaryForeground : colors.mutedForeground }]}>
                  {STATUS_LABELS[s]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.eisenBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.eisenTitle, { color: colors.foreground }]}>Matrice d'Eisenhower</Text>
          <ScoreSelector label="Importance" value={importance} onChange={setImportance} />
          <ScoreSelector label="Urgence" value={urgency} onChange={setUrgency} />
          <View style={[styles.eisenResult, { backgroundColor: eisenhower.color + '20', borderColor: eisenhower.color }]}>
            <MaterialCommunityIcons name="matrix" size={16} color={eisenhower.color} />
            <Text style={[styles.eisenLabel, { color: eisenhower.color }]}>{eisenhower.label}</Text>
          </View>
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Photos</Text>
          <View style={styles.photoGrid}>
            {photos.map((uri, idx) => (
              <View key={idx} style={styles.photoThumb}>
                <Image source={{ uri }} style={styles.photoImg} contentFit="cover" />
                <Pressable
                  onPress={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                  style={styles.photoRemove}
                >
                  <MaterialCommunityIcons name="close-circle" size={20} color="#fff" />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={pickPhoto} style={[styles.addPhotoBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="camera-plus-outline" size={24} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const THUMB = (width - 48) / 4;
const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveBtnTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  form: { paddingHorizontal: 16, paddingTop: 20, gap: 18 },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  textarea: { minHeight: 72, textAlignVertical: 'top' },
  error: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
  row: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  chipTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  priorityChip: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  eisenBox: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 14 },
  eisenTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  levelRow: { flexDirection: 'row', gap: 8 },
  levelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  levelLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  eisenResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  eisenLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumb: { width: THUMB, height: THUMB, borderRadius: 10, overflow: 'hidden' },
  photoImg: { width: '100%', height: '100%' },
  photoRemove: { position: 'absolute', top: 4, right: 4 },
  addPhotoBtn: {
    width: THUMB, height: THUMB, borderRadius: 10,
    borderWidth: 1, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
});
