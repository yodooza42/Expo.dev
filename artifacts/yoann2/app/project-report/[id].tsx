import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as Print from 'expo-print';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import type { Task } from '@/types';
import { generateProjectReportHtml } from '@/utils/reportGenerator';
import { fmtDateLong } from '@/utils/date';

const SUMMARY_KEY_PREFIX = '@yoann2_report_summary_';

const STATUS_META: Record<string, [string, string]> = {
  inprogress: ['En cours',   '#FF9800'],
  todo:       ['À faire',    '#2196F3'],
  idea:       ['Idée',       '#607D8B'],
  waiting:    ['En attente', '#9E9E9E'],
  done:       ['Terminée',   '#4CAF50'],
};

const STATUS_ORDER: Record<string, number> = {
  inprogress: 0, todo: 1, idea: 2, waiting: 3, done: 4,
};

function photoTimestamp(uri: string): number | null {
  const m = uri.match(/photo_(\d+)_/);
  return m ? parseInt(m[1]!, 10) : null;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ProjectReportScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const { projects, tasks } = useApp();

  const project = projects.find(p => p.id === id);
  const projectTasks = tasks
    .filter(t => t.projectId === id)
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  const [summary, setSummary]   = useState('');
  const [exporting, setExporting] = useState(false);
  const savePending = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load summary ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(SUMMARY_KEY_PREFIX + id).then(v => {
      if (v) setSummary(v);
    }).catch(() => {});
  }, [id]);

  const persistSummary = useCallback((text: string) => {
    if (!id) return;
    if (savePending.current) clearTimeout(savePending.current);
    savePending.current = setTimeout(() => {
      AsyncStorage.setItem(SUMMARY_KEY_PREFIX + id, text).catch(() => {});
    }, 600);
  }, [id]);

  function handleSummaryChange(text: string) {
    setSummary(text);
    persistSummary(text);
  }

  // ── PDF export ────────────────────────────────────────────────────────────

  async function exportPdf() {
    if (!project) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExporting(true);
    try {
      // Persist summary before export
      if (id) await AsyncStorage.setItem(SUMMARY_KEY_PREFIX + id, summary).catch(() => {});

      const html = await generateProjectReportHtml(project, projectTasks, summary);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Rapport — ${project.name}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Impossible de générer le PDF.');
    } finally {
      setExporting(false);
    }
  }

  // ── Not found ─────────────────────────────────────────────────────────────

  if (!project) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.mutedForeground }}>Projet introuvable</Text>
      </View>
    );
  }

  const start    = new Date(project.startDate);
  const due      = new Date(project.dueDate);
  const durDays  = !isNaN(start.getTime()) && !isNaN(due.getTime())
    ? Math.ceil((due.getTime() - start.getTime()) / 86_400_000) : null;
  const doneCount = projectTasks.filter(t => t.status === 'done').length;
  const photoCount = projectTasks.reduce((s, t) => s + t.photos.length, 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SubPageHeader
        title={project.name}
        numberOfLines={1}
        right={
          <Pressable
            onPress={exportPdf}
            disabled={exporting}
            style={[styles.exportBtn, { backgroundColor: colors.primary + '22', borderColor: colors.primary }]}
            hitSlop={8}
          >
            {exporting
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <>
                  <MaterialCommunityIcons name="file-pdf-box" size={16} color={colors.primary} />
                  <Text style={[styles.exportLabel, { color: colors.primary }]}>PDF</Text>
                </>}
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Cover ── */}
        <View style={[styles.cover, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.coverEyebrow, { color: colors.primary }]}>RAPPORT DE PROJET</Text>
          <Text style={[styles.coverTitle, { color: colors.foreground }]}>{project.name}</Text>
          {(project.startDate || project.dueDate) && (
            <Text style={[styles.coverDates, { color: colors.mutedForeground }]}>
              {project.startDate ? fmtDateLong(project.startDate) : ''}{project.startDate && project.dueDate ? ' → ' : ''}{project.dueDate ? fmtDateLong(project.dueDate) : ''}
            </Text>
          )}
          <View style={styles.statsRow}>
            {durDays != null && (
              <View style={[styles.statPill, { backgroundColor: colors.background }]}>
                <Text style={[styles.statVal, { color: colors.primary }]}>{durDays}</Text>
                <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>jours</Text>
              </View>
            )}
            {project.budget > 0 && (
              <View style={[styles.statPill, { backgroundColor: colors.background }]}>
                <Text style={[styles.statVal, { color: colors.primary }]}>{project.budget.toLocaleString('fr-FR')} €</Text>
                <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>budget</Text>
              </View>
            )}
            <View style={[styles.statPill, { backgroundColor: colors.background }]}>
              <Text style={[styles.statVal, { color: colors.primary }]}>{projectTasks.length}</Text>
              <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>tâches</Text>
            </View>
            <View style={[styles.statPill, { backgroundColor: colors.background }]}>
              <Text style={[styles.statVal, { color: '#4CAF50' }]}>{doneCount}</Text>
              <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>terminées</Text>
            </View>
            {photoCount > 0 && (
              <View style={[styles.statPill, { backgroundColor: colors.background }]}>
                <Text style={[styles.statVal, { color: colors.primary }]}>{photoCount}</Text>
                <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>photos</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Tasks ── */}
        {projectTasks.length === 0 ? (
          <View style={[styles.emptyTasks, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="clipboard-list-outline" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Aucune tâche dans ce projet
            </Text>
          </View>
        ) : (
          projectTasks.map((task, i) => (
            <TaskSlide key={task.id} task={task} index={i} colors={colors} />
          ))
        )}

        {/* ── Editable summary ── */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.primary + '40' }]}>
          <View style={styles.summaryHeader}>
            <MaterialCommunityIcons name="text-box-edit-outline" size={18} color={colors.primary} />
            <Text style={[styles.summaryTitle, { color: colors.primary }]}>
              Résumé &amp; Observations
            </Text>
          </View>
          <Text style={[styles.summaryHint, { color: colors.mutedForeground }]}>
            Ce texte apparaîtra à la fin du rapport PDF.
          </Text>
          <TextInput
            multiline
            value={summary}
            onChangeText={handleSummaryChange}
            placeholder="Décrivez le bilan du projet, les complications rencontrées, les solutions apportées…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.summaryInput, { color: colors.foreground, borderColor: colors.border }]}
            textAlignVertical="top"
          />
        </View>

        {/* ── Export button ── */}
        <Pressable
          onPress={exportPdf}
          disabled={exporting}
          style={({ pressed }) => [
            styles.exportFab,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.85 },
          ]}
        >
          {exporting
            ? <ActivityIndicator color="#000" />
            : <>
                <MaterialCommunityIcons name="file-pdf-box" size={22} color="#121212" />
                <Text style={styles.exportFabLabel}>Exporter en PDF</Text>
              </>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ── Task slide component ───────────────────────────────────────────────────────

function TaskSlide({
  task,
  index,
  colors,
}: {
  task: Task;
  index: number;
  colors: ReturnType<typeof useColors>;
}) {
  const [statusLabel, statusColor] = STATUS_META[task.status] ?? ['?', '#999'];

  return (
    <View style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Accent bar */}
      <View style={[styles.taskAccent, { backgroundColor: colors.primary }]} />

      <View style={styles.taskContent}>
        {/* Task header */}
        <View style={styles.taskHeaderRow}>
          <Text style={[styles.taskNum, { color: colors.primary }]}>Tâche {index + 1}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor + '66' }]}>
            <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <Text style={[styles.taskTitle, { color: colors.foreground }]}>{task.title}</Text>

        {!!task.description && (
          <Text style={[styles.taskDesc, { color: colors.mutedForeground }]}>{task.description}</Text>
        )}
        {!!task.notes && (
          <Text style={[styles.taskNotes, { color: colors.mutedForeground }]}>📝 {task.notes}</Text>
        )}
        {!!task.completedAt && (
          <Text style={[styles.taskDone, { color: '#4CAF50' }]}>✅ Terminée le {task.completedAt}</Text>
        )}

        {/* Photos */}
        {task.photos.length > 0 && (
          <>
            <Text style={[styles.photosLabel, { color: colors.mutedForeground }]}>
              {task.photos.length} photo{task.photos.length > 1 ? 's' : ''}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photosScroll}
            >
              {task.photos.map((uri, pi) => {
                const ts      = photoTimestamp(uri);
                const dateStr = ts ? fmtDateLong(ts) : '';
                return (
                  <View key={`${uri}-${pi}`} style={styles.photoWrap}>
                    <Image
                      source={{ uri }}
                      style={styles.photoImg}
                      contentFit="cover"
                    />
                    {!!dateStr && (
                      <Text style={[styles.photoDate, { color: colors.mutedForeground }]}>
                        {dateStr}
                      </Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:          { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerTitle:   { flex: 1, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6,
  },
  exportLabel:   { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  scroll:        { padding: 16, gap: 16 },

  /* Cover */
  cover: {
    borderRadius: 18, borderWidth: 1, padding: 24, gap: 8, alignItems: 'center',
  },
  coverEyebrow:  { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2.5 },
  coverTitle:    { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'center', lineHeight: 30 },
  coverDates:    { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  statsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 },
  statPill:      { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', gap: 2, minWidth: 72 },
  statVal:       { fontSize: 18, fontFamily: 'Inter_700Bold' },
  statLbl:       { fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 },

  /* Empty */
  emptyTasks:    { borderRadius: 14, borderWidth: 1, padding: 40, alignItems: 'center', gap: 12 },
  emptyText:     { fontSize: 14, fontFamily: 'Inter_400Regular' },

  /* Task card */
  taskCard: {
    borderRadius: 14, borderWidth: 1, flexDirection: 'row', overflow: 'hidden',
  },
  taskAccent:    { width: 4 },
  taskContent:   { flex: 1, padding: 16, gap: 8 },
  taskHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskNum:       { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, textTransform: 'uppercase' },
  statusBadge:   { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  statusLabel:   { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  taskTitle:     { fontSize: 17, fontFamily: 'Inter_700Bold' },
  taskDesc:      { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  taskNotes:     { fontSize: 12, fontFamily: 'Inter_400Regular', fontStyle: 'italic' },
  taskDone:      { fontSize: 12, fontFamily: 'Inter_500Medium' },
  photosLabel:   { fontSize: 11, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },

  /* Photos */
  photosScroll:  { gap: 10, paddingRight: 4 },
  photoWrap:     { gap: 5, alignItems: 'center' },
  photoImg:      { width: 200, height: 150, borderRadius: 10 },
  photoDate:     { fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'center', maxWidth: 200 },

  /* Summary */
  summaryCard: {
    borderRadius: 14, borderWidth: 1, padding: 18, gap: 10,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryTitle:  { fontSize: 14, fontFamily: 'Inter_700Bold' },
  summaryHint:   { fontSize: 11, fontFamily: 'Inter_400Regular' },
  summaryInput: {
    minHeight: 120, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 22,
    borderWidth: 1, borderRadius: 10, padding: 12,
  },

  /* Export FAB */
  exportFab: {
    borderRadius: 14, paddingVertical: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 8,
  },
  exportFabLabel: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#121212' },
});
