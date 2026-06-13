import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
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
import { ProgressBar } from '@/components/ProgressBar';
import { TaskCard } from '@/components/TaskCard';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { Expense, ProjectStatus, Task } from '@/types';

const { width } = Dimensions.get('window');

const STATUS_LABELS: Record<ProjectStatus, string> = {
  idea: 'Idée', todo: 'À faire', inprogress: 'En cours',
  waiting: 'En attente', done: 'Terminé', abandoned: 'Abandonné',
};
const STATUS_LIST: ProjectStatus[] = ['idea', 'todo', 'inprogress', 'waiting', 'done', 'abandoned'];

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { projects, getProjectTasks, getProjectExpenses, updateProject, deleteProject, addExpense, deleteExpense, deleteTask } = useApp();

  const project = projects.find(p => p.id === id);
  const tasks = useMemo(() => getProjectTasks(id ?? ''), [getProjectTasks, id]);
  const expenses = useMemo(() => getProjectExpenses(id ?? ''), [getProjectExpenses, id]);

  const [tab, setTab] = useState<'tasks' | 'expenses' | 'photos'>('tasks');
  const [addExpenseVisible, setAddExpenseVisible] = useState(false);
  const [expName, setExpName] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCat, setExpCat] = useState('');
  const [photoViewIdx, setPhotoViewIdx] = useState<number | null>(null);

  if (!project) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground, padding: 20 }}>Projet introuvable.</Text>
      </View>
    );
  }

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const progress = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const budgetPct = project.budget > 0 ? (totalSpent / project.budget) * 100 : 0;
  const dueDate = new Date(project.dueDate);
  const isOverdue = dueDate < new Date() && project.status !== 'done';

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (!cam.granted) { Alert.alert('Permission refusée'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled && result.assets[0]) {
        updateProject(project.id, { photos: [...project.photos, result.assets[0].uri] });
      }
      return;
    }
    Alert.alert('Ajouter une photo', '', [
      {
        text: 'Appareil photo',
        onPress: async () => {
          const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
          if (!r.canceled && r.assets[0]) updateProject(project.id, { photos: [...project.photos, r.assets[0].uri] });
        },
      },
      {
        text: 'Galerie',
        onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true });
          if (!r.canceled) updateProject(project.id, { photos: [...project.photos, ...r.assets.map(a => a.uri)] });
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  function removePhoto(idx: number) {
    const updated = project.photos.filter((_, i) => i !== idx);
    updateProject(project.id, { photos: updated });
    setPhotoViewIdx(null);
  }

  function handleDelete() {
    Alert.alert('Supprimer le projet', 'Toutes les tâches et dépenses seront supprimées.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => { deleteProject(project.id); router.back(); },
      },
    ]);
  }

  function handleAddExpense() {
    if (!expName.trim() || !expAmount.trim()) return;
    addExpense({
      projectId: project.id,
      name: expName.trim(),
      amount: parseFloat(expAmount),
      date: new Date().toISOString(),
      category: expCat.trim() || 'Général',
    });
    updateProject(project.id, { spent: totalSpent + parseFloat(expAmount) });
    setExpName(''); setExpAmount(''); setExpCat('');
    setAddExpenseVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const TABS = [
    { key: 'tasks', label: `Tâches (${totalTasks})`, icon: 'format-list-checks' },
    { key: 'expenses', label: `Dépenses (${expenses.length})`, icon: 'receipt' },
    { key: 'photos', label: `Photos (${project.photos.length})`, icon: 'image-multiple-outline' },
  ] as const;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{project.name}</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push(`/project/new?id=${project.id}`)} hitSlop={8}>
            <MaterialCommunityIcons name="pencil-outline" size={22} color={colors.primary} />
          </Pressable>
          <Pressable onPress={handleDelete} hitSlop={8}>
            <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.destructive} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <PriorityBadge priority={project.priority} />
              {isOverdue && (
                <View style={[styles.overdueBadge, { backgroundColor: colors.destructive + '20' }]}>
                  <MaterialCommunityIcons name="clock-alert-outline" size={12} color={colors.destructive} />
                  <Text style={[styles.overdueTxt, { color: colors.destructive }]}>En retard</Text>
                </View>
              )}
            </View>
            <View style={[styles.statusPicker]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {STATUS_LIST.map(s => (
                  <Pressable
                    key={s}
                    onPress={() => updateProject(project.id, { status: s })}
                    style={[
                      styles.statusChip,
                      project.status === s
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                    ]}
                  >
                    <Text style={[styles.statusChipTxt, { color: project.status === s ? colors.primaryForeground : colors.mutedForeground }]}>
                      {STATUS_LABELS[s]}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>

          <Text style={[styles.projectName, { color: colors.foreground }]}>{project.name}</Text>
          {project.description.length > 0 && (
            <Text style={[styles.desc, { color: colors.mutedForeground }]}>{project.description}</Text>
          )}

          <View style={styles.metaGrid}>
            <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="tag-outline" size={16} color={colors.primary} />
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Catégorie</Text>
              <Text style={[styles.metaValue, { color: colors.foreground }]}>{project.category}</Text>
            </View>
            <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="calendar-start" size={16} color={colors.primary} />
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Début</Text>
              <Text style={[styles.metaValue, { color: colors.foreground }]}>
                {new Date(project.startDate).toLocaleDateString('fr-FR')}
              </Text>
            </View>
            <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="calendar-end" size={16} color={isOverdue ? colors.destructive : colors.primary} />
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Échéance</Text>
              <Text style={[styles.metaValue, { color: isOverdue ? colors.destructive : colors.foreground }]}>
                {dueDate.toLocaleDateString('fr-FR')}
              </Text>
            </View>
            <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="currency-eur" size={16} color={colors.primary} />
              <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Budget</Text>
              <Text style={[styles.metaValue, { color: colors.foreground }]}>{project.budget}€</Text>
            </View>
          </View>

          <View style={[styles.progressSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.progressRow}>
              <Text style={[styles.progressLabel, { color: colors.foreground }]}>Avancement</Text>
              <Text style={[styles.progressPct, { color: colors.primary }]}>{Math.round(progress)}%</Text>
            </View>
            <ProgressBar progress={progress} height={8} />
            <Text style={[styles.progressSub, { color: colors.mutedForeground }]}>
              {doneTasks}/{totalTasks} tâches terminées
            </Text>
          </View>

          {project.budget > 0 && (
            <View style={[styles.progressSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.progressRow}>
                <Text style={[styles.progressLabel, { color: colors.foreground }]}>Budget consommé</Text>
                <Text style={[styles.progressPct, { color: budgetPct > 90 ? colors.destructive : colors.primary }]}>
                  {Math.round(budgetPct)}%
                </Text>
              </View>
              <ProgressBar
                progress={budgetPct}
                height={8}
                color={budgetPct > 90 ? colors.destructive : colors.priorityMedium}
              />
              <Text style={[styles.progressSub, { color: colors.mutedForeground }]}>
                {totalSpent}€ / {project.budget}€ · Reste: {project.budget - totalSpent}€
              </Text>
            </View>
          )}
        </View>

        <View style={styles.tabs}>
          {TABS.map(t => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[
                styles.tab,
                tab === t.key ? { borderBottomColor: colors.primary, borderBottomWidth: 2 } : {},
              ]}
            >
              <Text style={[styles.tabLabel, { color: tab === t.key ? colors.primary : colors.mutedForeground }]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.tabContent}>
          {tab === 'tasks' && (
            <>
              <Pressable
                onPress={() => router.push(`/task/new?projectId=${project.id}`)}
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="plus" size={18} color={colors.primaryForeground} />
                <Text style={[styles.addBtnLabel, { color: colors.primaryForeground }]}>Ajouter une tâche</Text>
              </Pressable>
              {tasks.length === 0 ? (
                <View style={styles.empty}>
                  <MaterialCommunityIcons name="format-list-checks" size={40} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Aucune tâche</Text>
                </View>
              ) : (
                tasks.map(t => (
                  <TaskCard key={t.id} task={t} />
                ))
              )}
            </>
          )}

          {tab === 'expenses' && (
            <>
              <Pressable
                onPress={() => setAddExpenseVisible(true)}
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="plus" size={18} color={colors.primaryForeground} />
                <Text style={[styles.addBtnLabel, { color: colors.primaryForeground }]}>Ajouter une dépense</Text>
              </Pressable>
              {expenses.length === 0 ? (
                <View style={styles.empty}>
                  <MaterialCommunityIcons name="receipt" size={40} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Aucune dépense</Text>
                </View>
              ) : (
                <>
                  {expenses.map(e => (
                    <View key={e.id} style={[styles.expRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.expName, { color: colors.foreground }]}>{e.name}</Text>
                        <Text style={[styles.expMeta, { color: colors.mutedForeground }]}>
                          {e.category} · {new Date(e.date).toLocaleDateString('fr-FR')}
                        </Text>
                      </View>
                      <Text style={[styles.expAmount, { color: colors.primary }]}>{e.amount}€</Text>
                      <Pressable onPress={() => deleteExpense(e.id)} hitSlop={8}>
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  ))}
                  <View style={[styles.expTotal, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.expTotalLabel, { color: colors.mutedForeground }]}>Total dépensé</Text>
                    <Text style={[styles.expTotalValue, { color: colors.primary }]}>{totalSpent}€</Text>
                  </View>
                </>
              )}
            </>
          )}

          {tab === 'photos' && (
            <>
              <Pressable
                onPress={pickPhoto}
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="camera-plus-outline" size={18} color={colors.primaryForeground} />
                <Text style={[styles.addBtnLabel, { color: colors.primaryForeground }]}>Ajouter une photo</Text>
              </Pressable>
              {project.photos.length === 0 ? (
                <View style={styles.empty}>
                  <MaterialCommunityIcons name="image-outline" size={40} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Aucune photo</Text>
                </View>
              ) : (
                <View style={styles.photoGrid}>
                  {project.photos.map((uri, idx) => (
                    <Pressable key={idx} onPress={() => setPhotoViewIdx(idx)} style={styles.photoThumb}>
                      <Image source={{ uri }} style={styles.photoImg} contentFit="cover" />
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <Modal visible={addExpenseVisible} animationType="slide" transparent>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setAddExpenseVisible(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Nouvelle dépense</Text>
            {[
              { label: 'Nom', value: expName, setter: setExpName, placeholder: 'Ex: Visserie', keyboardType: 'default' as const },
              { label: 'Montant (€)', value: expAmount, setter: setExpAmount, placeholder: '0.00', keyboardType: 'numeric' as const },
              { label: 'Catégorie', value: expCat, setter: setExpCat, placeholder: 'Ex: Matériaux', keyboardType: 'default' as const },
            ].map(f => (
              <View key={f.label}>
                <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                <TextInput
                  value={f.value}
                  onChangeText={f.setter}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType={f.keyboardType}
                  style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
                />
              </View>
            ))}
            <View style={styles.sheetBtns}>
              <Pressable onPress={() => setAddExpenseVisible(false)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={[styles.cancelLabel, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
              <Pressable onPress={handleAddExpense} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
                <Text style={[styles.saveBtnLabel, { color: colors.primaryForeground }]}>Ajouter</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={photoViewIdx !== null} animationType="fade" transparent>
        <View style={[styles.photoModal, { backgroundColor: 'rgba(0,0,0,0.95)' }]}>
          <Pressable onPress={() => setPhotoViewIdx(null)} style={styles.photoClose}>
            <MaterialCommunityIcons name="close" size={26} color="#fff" />
          </Pressable>
          {photoViewIdx !== null && project.photos[photoViewIdx] && (
            <Image
              source={{ uri: project.photos[photoViewIdx] }}
              style={styles.photoFull}
              contentFit="contain"
            />
          )}
          {photoViewIdx !== null && (
            <Pressable onPress={() => removePhoto(photoViewIdx)} style={styles.photoDeleteBtn}>
              <MaterialCommunityIcons name="trash-can-outline" size={22} color="#fff" />
              <Text style={styles.photoDeleteTxt}>Supprimer</Text>
            </Pressable>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  headerActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  hero: { padding: 16, gap: 14 },
  heroTop: { gap: 10 },
  overdueBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginTop: 6, alignSelf: 'flex-start' },
  overdueTxt: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  statusPicker: {},
  statusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusChipTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  projectName: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  desc: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaCard: { flex: 1, minWidth: '45%', padding: 12, borderRadius: 12, borderWidth: 1, gap: 4 },
  metaLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  metaValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  progressSection: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 8 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  progressPct: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  progressSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  tabContent: { paddingHorizontal: 16, gap: 10 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 12, justifyContent: 'center' },
  addBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTxt: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  expRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  expName: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  expMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  expAmount: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  expTotal: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderRadius: 12, borderWidth: 1 },
  expTotalLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  expTotalValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumb: { width: (width - 48) / 3, height: (width - 48) / 3, borderRadius: 10, overflow: 'hidden' },
  photoImg: { width: '100%', height: '100%' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 24, gap: 12 },
  sheetTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  inputLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular' },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  cancelLabel: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  saveBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  photoModal: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photoClose: { position: 'absolute', top: 60, right: 20, zIndex: 10 },
  photoFull: { width: width, height: width * 1.2 },
  photoDeleteBtn: { position: 'absolute', bottom: 60, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.8)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30 },
  photoDeleteTxt: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
