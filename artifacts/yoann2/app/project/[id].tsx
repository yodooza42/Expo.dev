import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
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

const TASK_STATUS_LABELS: Record<string, string> = {
  idea: 'Idée', todo: 'À faire', inprogress: 'En cours', waiting: 'En attente', done: 'Terminé',
};
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Faible', medium: 'Moyenne', high: 'Haute', critical: 'Critique',
};

interface AllPhoto {
  uri: string;
  deletable: boolean;
  source: string;
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

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { projects, getProjectTasks, getProjectExpenses, updateProject, deleteProject, addExpense, deleteExpense, deleteTask } = useApp();

  const projectMaybe = projects.find(p => p.id === id);
  const tasks = useMemo(() => getProjectTasks(id ?? ''), [getProjectTasks, id]);
  const expenses = useMemo(() => getProjectExpenses(id ?? ''), [getProjectExpenses, id]);

  const allPhotos = useMemo<AllPhoto[]>(() => {
    if (!projectMaybe) return [];
    return [
      ...projectMaybe.photos.map(uri => ({ uri, deletable: true, source: 'Projet' })),
      ...tasks.flatMap(t => (t.photos ?? []).map(uri => ({ uri, deletable: false, source: t.title }))),
    ];
  }, [projectMaybe, tasks]);

  const [tab, setTab] = useState<'tasks' | 'expenses' | 'photos'>('tasks');
  const [addExpenseVisible, setAddExpenseVisible] = useState(false);
  const [expName, setExpName] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCat, setExpCat] = useState('');
  const [expDate, setExpDate] = useState(() => new Date().toLocaleDateString('fr-FR'));
  const [photoViewIdx, setPhotoViewIdx] = useState<number | null>(null);
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(0);
  const photoListRef = useRef<FlatList<AllPhoto>>(null);
  const [exporting, setExporting] = useState(false);

  if (!projectMaybe) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground, padding: 20 }}>Projet introuvable.</Text>
      </View>
    );
  }
  const project = projectMaybe;

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const progress = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const directExpenses = expenses.filter(e => !e.taskId);
  const taskExpenses = expenses.filter(e => !!e.taskId);
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
    Alert.alert('Ajouter une photo au projet', '', [
      {
        text: 'Appareil photo',
        onPress: async () => {
          const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
          if (!r.canceled && r.assets[0]) updateProject(project.id, { photos: [...project.photos, r.assets[0].uri] });
        },
      },
      {
        text: 'Galerie (multi-sélection)',
        onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true });
          if (!r.canceled) updateProject(project.id, { photos: [...project.photos, ...r.assets.map(a => a.uri)] });
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  function openPhoto(idx: number) {
    setCurrentPhotoIdx(idx);
    setPhotoViewIdx(idx);
  }

  function removePhoto(allIdx: number) {
    const photo = allPhotos[allIdx];
    if (!photo?.deletable) { setPhotoViewIdx(null); return; }
    const updated = project.photos.filter(u => u !== photo.uri);
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
    const amount = parseFloat(expAmount);
    if (isNaN(amount) || amount <= 0) return;
    addExpense({
      projectId: project.id,
      name: expName.trim(),
      amount,
      date: parseFrDate(expDate),
      category: expCat.trim() || 'Général',
    });
    updateProject(project.id, { spent: totalSpent + amount });
    setExpName(''); setExpAmount(''); setExpCat('');
    setExpDate(new Date().toLocaleDateString('fr-FR'));
    setAddExpenseVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleExportPDF() {
    setExporting(true);
    try {
      const taskRows = tasks.map(t => `
        <tr>
          <td>${t.title}</td>
          <td>${TASK_STATUS_LABELS[t.status] ?? t.status}</td>
          <td>${PRIORITY_LABELS[t.priority] ?? t.priority}</td>
          <td>${new Date(t.dueDate).toLocaleDateString('fr-FR')}</td>
        </tr>
      `).join('');

      const expRows = expenses.map(e => `
        <tr>
          <td>${e.name}</td>
          <td>${e.category || '—'}</td>
          <td>${new Date(e.date).toLocaleDateString('fr-FR')}</td>
          <td style="text-align:right;font-weight:bold">${e.amount.toFixed(2)} €</td>
        </tr>
      `).join('');

      const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; margin: 32px; color: #111; }
  h1 { font-size: 26px; margin: 0 0 4px; color: #111; }
  .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
  .badge { display: inline-block; background: #FFC107; color: #000; border-radius: 12px; padding: 2px 10px; font-size: 11px; font-weight: bold; margin-right: 6px; }
  .section { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  p { font-size: 14px; color: #444; line-height: 1.6; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f5f5f5; text-align: left; padding: 8px 10px; font-size: 12px; color: #555; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; }
  .stat-row { display: flex; gap: 20px; margin: 10px 0; }
  .stat { flex: 1; background: #f9f9f9; border-radius: 10px; padding: 12px 16px; }
  .stat-label { font-size: 11px; color: #888; }
  .stat-value { font-size: 20px; font-weight: bold; color: #111; }
  .total-row { font-weight: bold; background: #fffbea; }
  .total-row td { color: #b8860b; }
</style>
</head>
<body>
<h1>${project.name}</h1>
<div class="meta">
  <span class="badge">${project.category}</span>
  <span class="badge">${STATUS_LABELS[project.status]}</span>
  Créé le ${new Date(project.createdAt).toLocaleDateString('fr-FR')} · Échéance ${new Date(project.dueDate).toLocaleDateString('fr-FR')}
</div>
${project.description ? `<p>${project.description}</p>` : ''}

<div class="section">Avancement</div>
<div class="stat-row">
  <div class="stat"><div class="stat-label">Tâches terminées</div><div class="stat-value">${doneTasks} / ${totalTasks}</div></div>
  <div class="stat"><div class="stat-label">Progression</div><div class="stat-value">${Math.round(progress)} %</div></div>
  ${project.budget > 0 ? `<div class="stat"><div class="stat-label">Budget</div><div class="stat-value">${totalSpent.toFixed(2)} / ${project.budget} €</div></div>` : ''}
</div>

${tasks.length > 0 ? `
<div class="section">Tâches (${tasks.length})</div>
<table>
  <tr><th>Titre</th><th>Statut</th><th>Priorité</th><th>Échéance</th></tr>
  ${taskRows}
</table>` : ''}

${expenses.length > 0 ? `
<div class="section">Dépenses (${expenses.length})</div>
<table>
  <tr><th>Nom</th><th>Catégorie</th><th>Date</th><th style="text-align:right">Montant</th></tr>
  ${expRows}
  <tr class="total-row"><td colspan="3">Total</td><td style="text-align:right">${totalSpent.toFixed(2)} €</td></tr>
</table>` : ''}

<div style="margin-top:40px;color:#aaa;font-size:11px;text-align:center">Généré par Yoann2.0 · ${new Date().toLocaleDateString('fr-FR')}</div>
</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Fiche — ${project.name}` });
      } else {
        Alert.alert('PDF généré', `Fichier : ${uri}`);
      }
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de générer le PDF.');
    } finally {
      setExporting(false);
    }
  }

  const TABS = [
    { key: 'tasks', label: `Tâches (${totalTasks})`, icon: 'format-list-checks' },
    { key: 'expenses', label: `Dépenses (${expenses.length})`, icon: 'receipt' },
    { key: 'photos', label: `Photos (${allPhotos.length})`, icon: 'image-multiple-outline' },
  ] as const;

  const visiblePhoto = photoViewIdx !== null ? allPhotos[currentPhotoIdx] : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{project.name}</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={handleExportPDF} hitSlop={8} disabled={exporting}>
            <MaterialCommunityIcons name="file-pdf-box" size={22} color={exporting ? colors.mutedForeground : colors.primary} />
          </Pressable>
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
              <View style={styles.budgetBreakdown}>
                {directExpenses.length > 0 && (
                  <Text style={[styles.progressSub, { color: colors.mutedForeground }]}>
                    Dépenses directes : {directExpenses.reduce((s, e) => s + e.amount, 0)}€
                  </Text>
                )}
                {taskExpenses.length > 0 && (
                  <Text style={[styles.progressSub, { color: colors.mutedForeground }]}>
                    Dépenses des tâches : {taskExpenses.reduce((s, e) => s + e.amount, 0)}€
                  </Text>
                )}
                <Text style={[styles.progressSub, { color: budgetPct > 90 ? colors.destructive : colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                  Total : {totalSpent}€ / {project.budget}€  ·  Reste : {project.budget - totalSpent}€
                </Text>
              </View>
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
                <Text style={[styles.addBtnLabel, { color: colors.primaryForeground }]}>Dépense directe du projet</Text>
              </Pressable>
              {expenses.length === 0 ? (
                <View style={styles.empty}>
                  <MaterialCommunityIcons name="receipt" size={40} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Aucune dépense</Text>
                  <Text style={[styles.emptySubTxt, { color: colors.mutedForeground }]}>
                    Ajoutez des dépenses ici ou depuis chaque tâche
                  </Text>
                </View>
              ) : (
                <>
                  {expenses.map(e => {
                    const linkedTask = e.taskId ? tasks.find(t => t.id === e.taskId) : null;
                    return (
                      <View key={e.id} style={[styles.expRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          {linkedTask && (
                            <View style={[styles.taskBadge, { backgroundColor: colors.primary + '18' }]}>
                              <MaterialCommunityIcons name="format-list-checks" size={11} color={colors.primary} />
                              <Text style={[styles.taskBadgeTxt, { color: colors.primary }]} numberOfLines={1}>
                                {linkedTask.title}
                              </Text>
                            </View>
                          )}
                          <Text style={[styles.expName, { color: colors.foreground }]}>{e.name}</Text>
                          {e.category.length > 0 && (
                            <Text style={[styles.expMeta, { color: colors.mutedForeground }]}>{e.category}</Text>
                          )}
                          <Text style={[styles.expMeta, { color: colors.mutedForeground }]}>
                            {new Date(e.date).toLocaleDateString('fr-FR')}
                          </Text>
                        </View>
                        <Text style={[styles.expAmount, { color: colors.primary }]}>{e.amount}€</Text>
                        {!linkedTask && (
                          <Pressable onPress={() => deleteExpense(e.id)} hitSlop={8}>
                            <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.mutedForeground} />
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                  <View style={[styles.expTotal, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.expTotalLabel, { color: colors.mutedForeground }]}>Total toutes dépenses</Text>
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
                <Text style={[styles.addBtnLabel, { color: colors.primaryForeground }]}>Ajouter au projet</Text>
              </Pressable>

              {allPhotos.length === 0 ? (
                <View style={styles.empty}>
                  <MaterialCommunityIcons name="image-outline" size={40} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Aucune photo</Text>
                </View>
              ) : (
                <>
                  {project.photos.length > 0 && (
                    <Text style={[styles.photoSectionLabel, { color: colors.mutedForeground }]}>
                      Photos du projet ({project.photos.length})
                    </Text>
                  )}
                  <View style={styles.photoGrid}>
                    {allPhotos.map((photo, idx) => (
                      <Pressable key={idx} onPress={() => openPhoto(idx)} style={styles.photoThumb}>
                        <Image source={{ uri: photo.uri }} style={styles.photoImg} contentFit="cover" />
                        {!photo.deletable && (
                          <View style={[styles.taskPhotoBadge, { backgroundColor: colors.card + 'CC' }]}>
                            <MaterialCommunityIcons name="format-list-checks" size={10} color={colors.primary} />
                          </View>
                        )}
                      </Pressable>
                    ))}
                  </View>
                  {tasks.some(t => (t.photos ?? []).length > 0) && (
                    <Text style={[styles.photoSectionLabel, { color: colors.mutedForeground, marginTop: 4 }]}>
                      ■ tâche (badge)   Photos des tâches incluses dans la galerie
                    </Text>
                  )}
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Expense modal */}
      <Modal visible={addExpenseVisible} animationType="slide" transparent>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setAddExpenseVisible(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Nouvelle dépense</Text>

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Nom</Text>
            <TextInput
              value={expName}
              onChangeText={setExpName}
              placeholder="Ex: Visserie"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
            />

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Montant (€)</Text>
            <TextInput
              value={expAmount}
              onChangeText={setExpAmount}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
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

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Détails (optionnel)</Text>
            <TextInput
              value={expCat}
              onChangeText={setExpCat}
              placeholder="Ex: Matériaux, quincaillerie…"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
            />

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

      {/* Photo swipe modal */}
      <Modal visible={photoViewIdx !== null} animationType="fade" transparent onRequestClose={() => setPhotoViewIdx(null)}>
        <View style={styles.photoModal}>
          {/* Close */}
          <Pressable onPress={() => setPhotoViewIdx(null)} style={styles.photoClose}>
            <MaterialCommunityIcons name="close" size={26} color="#fff" />
          </Pressable>

          {/* Counter */}
          <View style={styles.photoCounter}>
            <Text style={styles.photoCounterTxt}>{currentPhotoIdx + 1} / {allPhotos.length}</Text>
          </View>

          {/* Source badge */}
          {visiblePhoto && (
            <View style={styles.photoSourceBadge}>
              <MaterialCommunityIcons
                name={visiblePhoto.deletable ? 'folder-outline' : 'format-list-checks'}
                size={13}
                color="rgba(255,255,255,0.7)"
              />
              <Text style={styles.photoSourceTxt}>{visiblePhoto.source}</Text>
            </View>
          )}

          {/* Swipeable FlatList */}
          {allPhotos.length > 0 && (
            <FlatList
              ref={photoListRef}
              data={allPhotos}
              keyExtractor={(_, i) => String(i)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={currentPhotoIdx}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              onMomentumScrollEnd={e => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / width);
                setCurrentPhotoIdx(idx);
              }}
              renderItem={({ item }) => (
                <View style={{ width, justifyContent: 'center', alignItems: 'center' }}>
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.photoFull}
                    contentFit="contain"
                  />
                </View>
              )}
            />
          )}

          {/* Left arrow */}
          {currentPhotoIdx > 0 && (
            <Pressable
              style={styles.photoArrowLeft}
              onPress={() => {
                const next = currentPhotoIdx - 1;
                setCurrentPhotoIdx(next);
                photoListRef.current?.scrollToIndex({ index: next, animated: true });
              }}
            >
              <MaterialCommunityIcons name="chevron-left" size={36} color="rgba(255,255,255,0.85)" />
            </Pressable>
          )}

          {/* Right arrow */}
          {currentPhotoIdx < allPhotos.length - 1 && (
            <Pressable
              style={styles.photoArrowRight}
              onPress={() => {
                const next = currentPhotoIdx + 1;
                setCurrentPhotoIdx(next);
                photoListRef.current?.scrollToIndex({ index: next, animated: true });
              }}
            >
              <MaterialCommunityIcons name="chevron-right" size={36} color="rgba(255,255,255,0.85)" />
            </Pressable>
          )}

          {/* Delete button */}
          {visiblePhoto?.deletable && (
            <Pressable onPress={() => removePhoto(currentPhotoIdx)} style={styles.photoDeleteBtn}>
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
  budgetBreakdown: { gap: 3 },
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
  emptySubTxt: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 4 },
  taskBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 4 },
  taskBadgeTxt: { fontSize: 11, fontFamily: 'Inter_500Medium', maxWidth: 200 },
  photoSectionLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 4 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumb: { width: (width - 48) / 3, height: (width - 48) / 3, borderRadius: 10, overflow: 'hidden' },
  photoImg: { width: '100%', height: '100%' },
  taskPhotoBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 24, gap: 12 },
  sheetTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  inputLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular' },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  cancelLabel: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  saveBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  photoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', justifyContent: 'center' },
  photoClose: { position: 'absolute', top: 60, right: 20, zIndex: 20 },
  photoCounter: {
    position: 'absolute', top: 62, alignSelf: 'center', zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
  },
  photoCounterTxt: { color: '#fff', fontSize: 13, fontFamily: 'Inter_500Medium' },
  photoSourceBadge: {
    position: 'absolute', top: 100, left: 20, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  photoSourceTxt: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontFamily: 'Inter_500Medium' },
  photoFull: { width: width, height: width * 1.3 },
  photoArrowLeft: {
    position: 'absolute', left: 8, top: '50%',
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 24,
    padding: 4, zIndex: 20,
  },
  photoArrowRight: {
    position: 'absolute', right: 8, top: '50%',
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 24,
    padding: 4, zIndex: 20,
  },
  photoDeleteBtn: {
    position: 'absolute', bottom: 60, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.8)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30,
  },
  photoDeleteTxt: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
