import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

import { BottomSheet } from '@/components/BottomSheet';
import { PriorityBadge } from '@/components/PriorityBadge';
import { ProgressBar } from '@/components/ProgressBar';
import { TaskCard } from '@/components/TaskCard';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { ProjectStatus, Task } from '@/types';
import { BankTransaction, CategoryConfig, getCategoryConfigs } from '@/utils/bankStorage';
import { hasExternalPhotos, recoverPhotosFromExternal, savePhotoToProject } from '@/utils/photoStorage';

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
  const { projects, getProjectTasks, getProjectExpenses, updateProject, deleteProject, archiveProject, unarchiveProject, addTransactionCtx, updateTransactionCtx, deleteTransactionCtx, deleteTask } = useApp();

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
  const [expCatConfigs, setExpCatConfigs] = useState<CategoryConfig[]>([]);

  useEffect(() => {
    getCategoryConfigs().then(cs => setExpCatConfigs(cs.filter(c => c.type === 'expense')));
  }, []);

  const [addExpenseVisible, setAddExpenseVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<BankTransaction | null>(null);
  const [expName, setExpName] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCat, setExpCat] = useState('');
  const [expDate, setExpDate] = useState(() => new Date().toLocaleDateString('fr-FR'));
  const [expDescription, setExpDescription] = useState('');
  const [photoViewIdx, setPhotoViewIdx] = useState<number | null>(null);
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(0);
  const photoListRef = useRef<FlatList<AllPhoto>>(null);
  const [exporting, setExporting] = useState(false);
  const [canRecover, setCanRecover] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (tab !== 'photos' || !projectMaybe) { setCanRecover(false); return; }
    let mounted = true;
    const currentProject = projectMaybe;
    hasExternalPhotos(currentProject.name).then(v => {
      if (mounted) setCanRecover(v && currentProject.photos.length === 0);
    });
    return () => { mounted = false; };
  }, [tab, projectMaybe]);

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

  async function persistPhoto(tempUri: string): Promise<string> {
    const dir = FileSystem.documentDirectory + 'project_photos/';
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const ext  = tempUri.split('.').pop()?.split('?')[0] ?? 'jpg';
    const dest = dir + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;
    await FileSystem.copyAsync({ from: tempUri, to: dest });
    return dest;
  }

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (!cam.granted) { Alert.alert('Permission refusée'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const local = await persistPhoto(asset.uri);
        updateProject(project.id, { photos: [...project.photos, local] });
        savePhotoToProject(asset.uri, project.name, asset.fileName);
      }
      return;
    }
    Alert.alert('Ajouter une photo au projet', '', [
      {
        text: 'Appareil photo',
        onPress: async () => {
          const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
          if (!r.canceled && r.assets[0]) {
            const asset = r.assets[0];
            const local = await persistPhoto(asset.uri);
            updateProject(project.id, { photos: [...project.photos, local] });
            savePhotoToProject(asset.uri, project.name, asset.fileName);
          }
        },
      },
      {
        text: 'Galerie (associer sans copier)',
        onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 1,
          });
          if (!r.canceled) {
            const newUris = r.assets
              .map(asset => asset.uri)
              .filter(uri => !project.photos.includes(uri));
            if (newUris.length > 0) {
              updateProject(project.id, { photos: [...project.photos, ...newUris] });
            }
          }
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

  function handleArchive() {
    if (project.archived) {
      Alert.alert('Désarchiver', `Remettre "${project.name}" dans les projets actifs ?`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Désarchiver', onPress: () => { unarchiveProject(project.id); router.back(); } },
      ]);
    } else {
      Alert.alert('Archiver', `Archiver "${project.name}" ? Il sera masqué de la liste principale.`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Archiver', onPress: () => { archiveProject(project.id); router.back(); } },
      ]);
    }
  }

  function resetExpenseForm() {
    setExpName(''); setExpAmount(''); setExpCat(''); setExpDescription('');
    setExpDate(new Date().toLocaleDateString('fr-FR'));
    setEditingExpense(null);
  }

  async function handleRecover() {
    if (!project) return;
    setRecovering(true);
    const recovered = await recoverPhotosFromExternal(project.name);
    setRecovering(false);
    if (recovered.length > 0) {
      updateProject(project.id, { photos: [...project.photos, ...recovered] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Photos récupérées',
        `${recovered.length} photo${recovered.length > 1 ? 's' : ''} restaurée${recovered.length > 1 ? 's' : ''} depuis le dossier Yoann2.0/Photos.`
      );
    } else {
      Alert.alert('Aucune photo', 'Aucune image trouvée dans le dossier externe du projet.');
    }
  }

  function openEditExpense(e: BankTransaction) {
    setEditingExpense(e);
    setExpName(e.label);
    setExpAmount(String(e.amount));
    setExpCat(e.category);
    setExpDate(new Date(e.date).toLocaleDateString('fr-FR'));
    setExpDescription(e.userNote ?? '');
    setAddExpenseVisible(true);
  }

  async function handleAddExpense() {
    if (!expName.trim() || !expAmount.trim()) return;
    const amount = parseFloat(expAmount);
    if (isNaN(amount) || amount <= 0) return;
    if (editingExpense) {
      await updateTransactionCtx(editingExpense.id, {
        label: expName.trim(),
        amount,
        date: parseFrDate(expDate),
        category: expCat.trim() || 'Autre',
        userNote: expDescription.trim() || undefined,
      });
    } else {
      await addTransactionCtx({
        type: 'expense',
        label: expName.trim(),
        amount,
        date: parseFrDate(expDate),
        category: expCat.trim() || 'Autre',
        userNote: expDescription.trim() || undefined,
        projectId: project.id,
      });
    }
    resetExpenseForm();
    setAddExpenseVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleExportPDF() {
    setExporting(true);
    try {
      const STATUS_COLORS: Record<string, string> = {
        idea: '#9C27B0', todo: '#607D8B', inprogress: '#2196F3',
        waiting: '#FF9800', done: '#4CAF50', abandoned: '#9E9E9E',
      };
      const PRIORITY_COLORS_MAP: Record<string, string> = {
        low: '#4CAF50', medium: '#FF9800', high: '#F44336', critical: '#9C27B0',
      };
      const PRIORITY_LABELS_FR: Record<string, string> = {
        low: 'Faible', medium: 'Moyenne', high: 'Haute', critical: 'Critique',
      };
      const statusColor = STATUS_COLORS[project.status] ?? '#9E9E9E';
      const priorityColor = PRIORITY_COLORS_MAP[project.priority] ?? '#9E9E9E';
      const budgetOver = project.budget > 0 && totalSpent > project.budget;
      const budgetColor = budgetOver ? '#F44336' : '#4CAF50';

      const taskItems = tasks.map(t => {
        const sc = STATUS_COLORS[t.status] ?? '#9E9E9E';
        const pc = PRIORITY_COLORS_MAP[t.priority] ?? '#9E9E9E';
        const isDone = t.status === 'done';
        return `
        <div class="task-item${isDone ? ' task-done' : ''}">
          <div class="task-dot" style="background:${sc}"></div>
          <div class="task-body">
            <div class="task-title">${t.title}</div>
            ${t.description ? `<div class="task-desc">${t.description}</div>` : ''}
          </div>
          <div class="task-badges">
            <span class="mini-badge" style="background:${sc}22;color:${sc}">${TASK_STATUS_LABELS[t.status] ?? t.status}</span>
            <span class="mini-badge" style="background:${pc}22;color:${pc}">${PRIORITY_LABELS_FR[t.priority] ?? t.priority}</span>
            <span class="task-date">${new Date(t.dueDate).toLocaleDateString('fr-FR')}</span>
          </div>
        </div>`;
      }).join('');

      const expenseRows = expenses.map((e, i) => `
        <tr class="${i % 2 === 1 ? 'row-alt' : ''}">
          <td class="exp-name">${e.label}</td>
          <td class="exp-cat">${e.category || '—'}</td>
          <td class="exp-date">${new Date(e.date).toLocaleDateString('fr-FR')}</td>
          <td class="exp-amount">${e.amount.toFixed(2)} €</td>
        </tr>`).join('');

      const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; background: #F4F4F6; color: #111; }

  /* ── HEADER ── */
  .header {
    background: #111111;
    border-left: 6px solid #FFC107;
    padding: 32px 40px 24px 34px;
  }
  .project-name {
    font-size: 30px; font-weight: 800; color: #fff;
    letter-spacing: -0.5px; margin-bottom: 12px; line-height: 1.15;
  }
  .badge-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .badge {
    display: inline-block; border-radius: 20px;
    padding: 4px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.3px;
  }
  .badge-gold { background: #FFC107; color: #000; }
  .header-dates { color: #777; font-size: 12px; margin-top: 10px; }

  /* ── BODY ── */
  .body { padding: 28px 40px 40px; }

  /* Description */
  .description {
    background: #fff; border-left: 4px solid #FFC107;
    padding: 14px 18px; border-radius: 0 10px 10px 0;
    font-size: 13px; color: #555; line-height: 1.65;
    margin-bottom: 24px;
  }

  /* Stats */
  .stats-grid { display: flex; gap: 12px; margin-bottom: 20px; }
  .stat-card {
    flex: 1; background: #fff; border-radius: 12px;
    padding: 16px 14px 14px;
    border-top: 4px solid #FFC107;
  }
  .stat-value { font-size: 24px; font-weight: 800; color: #111; line-height: 1; margin-bottom: 5px; }
  .stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #AAA; }

  /* Progress card */
  .prog-card {
    background: #fff; border-radius: 12px;
    padding: 18px 20px; margin-bottom: 12px;
  }
  .prog-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .prog-title { font-size: 13px; font-weight: 700; color: #333; }
  .prog-pct { font-size: 18px; font-weight: 800; }
  .prog-track { height: 9px; background: #EBEBEB; border-radius: 5px; overflow: hidden; margin-bottom: 7px; }
  .prog-fill { height: 9px; border-radius: 5px; }
  .prog-sub { font-size: 11px; color: #AAA; }

  /* Section header */
  .section-hdr {
    font-size: 11px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 1.2px; color: #AAA;
    margin: 28px 0 12px;
    padding-bottom: 8px; border-bottom: 1px solid #E0E0E0;
    display: flex; justify-content: space-between; align-items: center;
  }
  .section-count {
    background: #F0F0F0; color: #888; border-radius: 10px;
    padding: 2px 8px; font-size: 11px; font-weight: 700;
  }

  /* Tasks */
  .task-item {
    background: #fff; border-radius: 10px;
    padding: 12px 14px; margin-bottom: 7px;
    display: flex; align-items: flex-start; gap: 12px;
  }
  .task-done .task-title { text-decoration: line-through; color: #bbb; }
  .task-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }
  .task-body { flex: 1; min-width: 0; }
  .task-title { font-size: 13px; font-weight: 700; color: #222; margin-bottom: 2px; }
  .task-desc { font-size: 11px; color: #999; margin-top: 2px; }
  .task-badges { display: flex; gap: 5px; align-items: center; flex-shrink: 0; }
  .mini-badge { border-radius: 8px; padding: 2px 8px; font-size: 10px; font-weight: 700; }
  .task-date { font-size: 10px; color: #bbb; }

  /* Expenses */
  .exp-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; }
  .exp-table th {
    background: #F8F8F8; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.5px; color: #AAA;
    padding: 10px 14px; text-align: left;
  }
  .exp-table td { padding: 11px 14px; font-size: 13px; border-bottom: 1px solid #F5F5F5; }
  .row-alt td { background: #FAFAFA; }
  .exp-name { font-weight: 600; color: #222; }
  .exp-cat { color: #AAA; font-size: 12px; }
  .exp-date { color: #BBB; font-size: 12px; }
  .exp-amount { text-align: right; font-weight: 700; color: #111; }
  .exp-total td {
    border-top: 2px solid #FFC107; border-bottom: none;
    background: #FFFBEA !important; font-weight: 800; font-size: 14px;
  }
  .exp-total .exp-amount { color: #B8860B; font-size: 15px; }

  /* Footer */
  .footer { margin-top: 48px; text-align: center; font-size: 11px; color: #CCC; padding-top: 14px; border-top: 1px solid #E8E8E8; }
  .footer b { color: #FFC107; }
</style>
</head>
<body>

<div class="header">
  <div class="project-name">${project.name}</div>
  <div class="badge-row">
    <span class="badge badge-gold">${project.category}</span>
    <span class="badge" style="background:${statusColor}22;color:${statusColor}">${STATUS_LABELS[project.status]}</span>
    <span class="badge" style="background:${priorityColor}22;color:${priorityColor}">${PRIORITY_LABELS_FR[project.priority] ?? ''}</span>
  </div>
  <div class="header-dates">
    Créé le ${new Date(project.createdAt).toLocaleDateString('fr-FR')}
    &nbsp;·&nbsp;
    Échéance ${new Date(project.dueDate).toLocaleDateString('fr-FR')}
    ${isOverdue ? '&nbsp;·&nbsp;<span style="color:#F44336;font-weight:700">&#9888; En retard</span>' : ''}
  </div>
</div>

<div class="body">

  ${project.description ? `<div class="description">${project.description}</div>` : ''}

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value">${doneTasks}<span style="font-size:14px;color:#CCC">/${totalTasks}</span></div>
      <div class="stat-label">Tâches faites</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${Math.round(progress)}<span style="font-size:14px;color:#CCC">%</span></div>
      <div class="stat-label">Progression</div>
    </div>
    <div class="stat-card" style="border-top-color:${project.budget > 0 ? budgetColor : '#FFC107'}">
      <div class="stat-value" style="color:${project.budget > 0 && budgetOver ? '#F44336' : '#111'}">${totalSpent.toFixed(0)}<span style="font-size:14px;color:#CCC"> €</span></div>
      <div class="stat-label">${project.budget > 0 ? `Budget / ${project.budget} €` : 'Total dépenses'}</div>
    </div>
  </div>

  <div class="prog-card">
    <div class="prog-header">
      <span class="prog-title">Progression des tâches</span>
      <span class="prog-pct" style="color:#FFC107">${Math.round(progress)} %</span>
    </div>
    <div class="prog-track">
      <div class="prog-fill" style="width:${Math.max(Math.min(progress, 100), 1)}%;background:${progress >= 100 ? '#4CAF50' : '#FFC107'}"></div>
    </div>
    <div class="prog-sub">${doneTasks} terminée${doneTasks !== 1 ? 's' : ''} &nbsp;·&nbsp; ${totalTasks - doneTasks} restante${totalTasks - doneTasks !== 1 ? 's' : ''}</div>
  </div>

  ${project.budget > 0 ? `
  <div class="prog-card">
    <div class="prog-header">
      <span class="prog-title">Budget consommé</span>
      <span class="prog-pct" style="color:${budgetColor}">${Math.round(budgetPct)} %</span>
    </div>
    <div class="prog-track">
      <div class="prog-fill" style="width:${Math.min(budgetPct, 100)}%;background:${budgetColor}"></div>
    </div>
    <div class="prog-sub">${totalSpent.toFixed(2)} € &nbsp;/&nbsp; ${project.budget} € &nbsp;·&nbsp; Reste ${(project.budget - totalSpent).toFixed(2)} €</div>
  </div>` : ''}

  ${tasks.length > 0 ? `
  <div class="section-hdr">
    Tâches <span class="section-count">${tasks.length}</span>
  </div>
  ${taskItems}` : ''}

  ${expenses.length > 0 ? `
  <div class="section-hdr">
    Dépenses <span class="section-count">${expenses.length}</span>
  </div>
  <table class="exp-table">
    <tr>
      <th>Nom</th><th>Catégorie</th><th>Date</th><th style="text-align:right">Montant</th>
    </tr>
    ${expenseRows}
    <tr class="exp-total">
      <td colspan="3" style="font-weight:800">Total</td>
      <td class="exp-amount">${totalSpent.toFixed(2)} €</td>
    </tr>
  </table>` : ''}

  <div class="footer">
    Généré par <b>Yoann2.0</b> &nbsp;·&nbsp;
    ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
  </div>

</div>
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
          <Pressable onPress={handleArchive} hitSlop={8}>
            <MaterialCommunityIcons
              name={project.archived ? 'archive-arrow-up-outline' : 'archive-arrow-down-outline'}
              size={22}
              color="#FF9800"
            />
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
                          <Text style={[styles.expName, { color: colors.foreground }]}>{e.label}</Text>
                          {e.category.length > 0 && (
                            <Text style={[styles.expMeta, { color: colors.mutedForeground }]}>{e.category}</Text>
                          )}
                          {e.userNote ? (
                            <Text style={[styles.expMeta, { color: colors.mutedForeground }]} numberOfLines={2}>{e.userNote}</Text>
                          ) : null}
                          <Text style={[styles.expMeta, { color: colors.mutedForeground }]}>
                            {new Date(e.date).toLocaleDateString('fr-FR')}
                          </Text>
                        </View>
                        <Text style={[styles.expAmount, { color: colors.primary }]}>{e.amount}€</Text>
                        <Pressable onPress={() => openEditExpense(e)} hitSlop={8}>
                          <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.mutedForeground} />
                        </Pressable>
                        {!linkedTask && (
                          <Pressable onPress={() => deleteTransactionCtx(e.id)} hitSlop={8}>
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

              {canRecover && (
                <Pressable
                  onPress={handleRecover}
                  disabled={recovering}
                  style={[styles.addBtn, { backgroundColor: '#2196F3', opacity: recovering ? 0.6 : 1 }]}
                >
                  <MaterialCommunityIcons name="folder-download-outline" size={18} color="#FFFFFF" />
                  <Text style={[styles.addBtnLabel, { color: '#FFFFFF' }]}>
                    {recovering ? 'Récupération…' : 'Récupérer les photos'}
                  </Text>
                </Pressable>
              )}

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
      <BottomSheet
        visible={addExpenseVisible}
        onClose={() => { setAddExpenseVisible(false); resetExpenseForm(); }}
        title={editingExpense ? 'Modifier la dépense' : 'Nouvelle dépense'}
        avoidKeyboard
      >
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

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Catégorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {expCatConfigs.map(cat => {
                const active = expCat === cat.name;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setExpCat(active ? '' : cat.name)}
                    style={[
                      styles.expCatChip,
                      active
                        ? { backgroundColor: colors.primary, borderColor: colors.primary }
                        : { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.expCatChipTxt, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Description (optionnel)</Text>
            <TextInput
              value={expDescription}
              onChangeText={setExpDescription}
              placeholder="Notes, détails supplémentaires…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              style={[styles.input, styles.inputMultiline, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
            />

            <View style={styles.sheetBtns}>
              <Pressable onPress={() => { setAddExpenseVisible(false); resetExpenseForm(); }} style={[styles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={[styles.cancelLabel, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
              <Pressable onPress={handleAddExpense} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
                <Text style={[styles.saveBtnLabel, { color: colors.primaryForeground }]}>
                  {editingExpense ? 'Enregistrer' : 'Ajouter'}
                </Text>
              </Pressable>
            </View>
      </BottomSheet>

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
  inputLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular' },
  inputMultiline: { height: 72, textAlignVertical: 'top' },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  cancelLabel: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  expCatChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  expCatChipTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
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
