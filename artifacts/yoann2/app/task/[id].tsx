import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PriorityBadge } from '@/components/PriorityBadge';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { TaskStatus } from '@/types';

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

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tasks, projects, updateTask, deleteTask, addTransactionCtx, deleteTransactionCtx, getTaskExpenses } = useApp();

  const taskMaybe = tasks.find(t => t.id === id);
  const project = taskMaybe ? projects.find(p => p.id === taskMaybe.projectId) : null;

  const [photoViewIdx, setPhotoViewIdx] = useState<number | null>(null);

  async function handleDeletePhoto(uri: string, idx: number) {
    Alert.alert('Supprimer la photo', 'Cette photo sera définitivement supprimée.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          if (photoViewIdx === idx) setPhotoViewIdx(null);
          const newPhotos = task.photos.filter((_, i) => i !== idx);
          updateTask(task.id, { photos: newPhotos });
          try {
            const info = await FileSystem.getInfoAsync(uri);
            if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
          } catch { /* ignore cleanup errors */ }
        },
      },
    ]);
  }
  const [addExpVisible, setAddExpVisible] = useState(false);
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
      <View style={[styles.headerBar, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>Détail tâche</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push(`/task/new?id=${task.id}`)} hitSlop={8}>
            <MaterialCommunityIcons name="pencil-outline" size={22} color={colors.primary} />
          </Pressable>
          <Pressable onPress={handleDelete} hitSlop={8}>
            <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.destructive} />
          </Pressable>
        </View>
      </View>

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

          {task.photos.length > 0 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Photos</Text>
              <View style={styles.photoGrid}>
                {task.photos.map((uri, idx) => (
                  <View key={idx} style={styles.photoThumb}>
                    <Pressable onPress={() => setPhotoViewIdx(idx)} style={{ flex: 1 }}>
                      <Image source={{ uri }} style={styles.photoImg} contentFit="cover" />
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
            </View>
          )}

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
                <View key={e.id} style={[styles.expRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
                  <Pressable onPress={() => deleteTransactionCtx(e.id)} hitSlop={8}>
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.mutedForeground} />
                  </Pressable>
                </View>
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
            <Image source={{ uri: task.photos[photoViewIdx] }} style={styles.photoFull} contentFit="contain" />
          )}
        </View>
      </Modal>

      <Modal visible={addExpVisible} animationType="slide" transparent>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setAddExpVisible(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Nouvelle dépense</Text>
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
          </View>
        </View>
      </Modal>
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
  viewProjectLink: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 4 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 24, gap: 10 },
  sheetTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  sheetSub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: -4, marginBottom: 4 },
  inputLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular' },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  cancelLabel: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  saveBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
