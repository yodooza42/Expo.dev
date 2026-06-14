import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { Task } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────

const PROJECT_PALETTE = [
  '#2196F3', '#4CAF50', '#FF9800', '#9C27B0',
  '#00BCD4', '#FF5722', '#E91E63', '#607D8B',
];

function projectColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return PROJECT_PALETTE[h % PROJECT_PALETTE.length];
}

function parseFrDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const parts = s.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts.map(Number);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMondayOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  return r;
}

function isoWeekNumber(d: Date): number {
  const thu = new Date(d);
  thu.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const y1 = new Date(thu.getFullYear(), 0, 1);
  return 1 + Math.round(((thu.getTime() - y1.getTime()) / 86400000 - 3 + ((y1.getDay() + 6) % 7)) / 7);
}

function buildWeekLabel(monday: Date): string {
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const start = monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const end = sunday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `Semaine ${isoWeekNumber(monday)}  ·  ${start} – ${end}`;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#F44336', high: '#FF9800', medium: '#2196F3', low: '#9E9E9E',
};
const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Critique', high: 'Haute', medium: 'Moy.', low: 'Basse',
};

type DayGroup  = { dateKey: string; date: Date; label: string; tasks: Task[] };
type WeekGroup = { weekKey: string; label: string; days: DayGroup[] };

// ── Component ──────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { projects, tasks, appointments, getStats, updateTask } = useApp();

  const [showPhotos,   setShowPhotos]   = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const stats    = getStats();
  const now      = new Date();
  const topPad   = Platform.OS === 'web' ? 67 : insets.top;
  const todayStart = startOfDay(now);
  const todayKey   = isoDate(todayStart);

  // Next appointment
  const nextAppointment = useMemo(() => appointments
    .filter(a => new Date(a.date + 'T' + (a.time ?? '00:00')) >= now)
    .sort((a, b) =>
      new Date(a.date + 'T' + (a.time ?? '00:00')).getTime() -
      new Date(b.date + 'T' + (b.time ?? '00:00')).getTime()
    )[0] ?? null,
  [appointments]);

  // Overdue tasks
  const overdueTasks = useMemo(() =>
    tasks
      .filter(t => {
        if (t.status === 'done') return false;
        const d = parseFrDate(t.dueDate);
        return d && startOfDay(d) < todayStart;
      })
      .sort((a, b) => parseFrDate(a.dueDate)!.getTime() - parseFrDate(b.dueDate)!.getTime()),
  [tasks]);

  // Future tasks grouped week → day
  const weekGroups = useMemo((): WeekGroup[] => {
    const future = tasks
      .filter(t => {
        if (t.status === 'done') return false;
        const d = parseFrDate(t.dueDate);
        return d && startOfDay(d) >= todayStart;
      })
      .sort((a, b) => parseFrDate(a.dueDate)!.getTime() - parseFrDate(b.dueDate)!.getTime());

    const weekMap = new Map<string, WeekGroup>();
    for (const task of future) {
      const date   = parseFrDate(task.dueDate)!;
      const monday = getMondayOfWeek(date);
      const wKey   = isoDate(monday);
      const dKey   = isoDate(startOfDay(date));

      if (!weekMap.has(wKey))
        weekMap.set(wKey, { weekKey: wKey, label: buildWeekLabel(monday), days: [] });

      const week = weekMap.get(wKey)!;
      let day = week.days.find(d => d.dateKey === dKey);
      if (!day) {
        day = {
          dateKey: dKey,
          date: startOfDay(date),
          label: startOfDay(date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' }),
          tasks: [],
        };
        week.days.push(day);
      }
      day.tasks.push(task);
    }
    return Array.from(weekMap.values());
  }, [tasks]);

  // Tasks without due date
  const noDateTasks = useMemo(() =>
    tasks.filter(t => t.status !== 'done' && !t.dueDate),
  [tasks]);

  // ── Interactions ──────────────────────────────────────────────────────

  function handleTaskPress(task: Task) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTask(task);
  }

  function handleMarkDone() {
    if (!selectedTask) return;
    updateTask(selectedTask.id, { status: 'done' });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedTask(null);
  }

  const selectedProject = selectedTask
    ? projects.find(p => p.id === selectedTask.projectId)
    : null;

  // ── Sub-component ─────────────────────────────────────────────────────

  function TaskEntry({ task, isOverdue = false }: { task: Task; isOverdue?: boolean }) {
    const proj      = projects.find(p => p.id === task.projectId);
    const pColor    = proj ? projectColor(proj.id) : colors.primary;
    const prioColor = PRIORITY_COLORS[task.priority] ?? colors.primary;
    const hasPhotos = task.photos.length > 0;

    return (
      <Pressable
        onPress={() => handleTaskPress(task)}
        style={({ pressed }) => [
          styles.taskEntry,
          { backgroundColor: colors.card, borderColor: isOverdue ? '#F4433640' : colors.border },
          pressed && { opacity: 0.75 },
        ]}
      >
        <View style={[styles.taskColorBar, { backgroundColor: isOverdue ? '#F44336' : pColor }]} />
        <View style={styles.taskContent}>
          <View style={styles.taskTop}>
            <Text
              style={[styles.taskTitle, { color: isOverdue ? '#FF5722' : colors.foreground }]}
              numberOfLines={1}
            >
              {task.title}
            </Text>
            <View style={[styles.prioBadge, { backgroundColor: prioColor + '22' }]}>
              <View style={[styles.prioDot, { backgroundColor: prioColor }]} />
              <Text style={[styles.prioTxt, { color: prioColor }]}>{PRIORITY_LABELS[task.priority]}</Text>
            </View>
          </View>
          {proj && (
            <Text style={[styles.taskProj, { color: isOverdue ? '#F4433399' : pColor + 'cc' }]} numberOfLines={1}>
              {proj.name}
            </Text>
          )}
          {showPhotos && hasPhotos && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
              {task.photos.map((uri, i) => (
                <Image key={i} source={{ uri }} style={styles.photoThumb} contentFit="cover" />
              ))}
            </ScrollView>
          )}
        </View>
      </Pressable>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* HEADER */}
      <LinearGradient
        colors={['#1A1500', colors.background]}
        style={[styles.header, { paddingTop: topPad + 16 }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.appName, { color: colors.foreground }]}>Yoann2.0</Text>
            <Text style={[styles.dateStr, { color: colors.mutedForeground }]}>
              {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {/* Photo toggle */}
            <Pressable
              onPress={() => { setShowPhotos(v => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              hitSlop={6}
              style={[
                styles.iconBtn,
                {
                  backgroundColor: showPhotos ? colors.primary + '28' : colors.card,
                  borderColor: showPhotos ? colors.primary : colors.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={showPhotos ? 'camera' : 'camera-outline'}
                size={18}
                color={showPhotos ? colors.primary : colors.mutedForeground}
              />
            </Pressable>
            {/* New project */}
            <Pressable
              onPress={() => router.push('/project/new')}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
            >
              <MaterialCommunityIcons name="plus" size={22} color={colors.primaryForeground} />
            </Pressable>
          </View>
        </View>

        {/* Compact stats */}
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <MaterialCommunityIcons name="folder-multiple-outline" size={13} color={colors.primary} />
            <Text style={[styles.statPillTxt, { color: colors.mutedForeground }]}>{stats.totalProjects} projets</Text>
          </View>
          <View style={styles.statPill}>
            <MaterialCommunityIcons name="format-list-checks" size={13} color="#2196F3" />
            <Text style={[styles.statPillTxt, { color: colors.mutedForeground }]}>{stats.totalTasks} tâches</Text>
          </View>
          {stats.overdueTasks > 0 && (
            <View style={[styles.statPill, { backgroundColor: '#F4433318' }]}>
              <MaterialCommunityIcons name="clock-alert-outline" size={13} color="#F44336" />
              <Text style={[styles.statPillTxt, { color: '#F44336' }]}>{stats.overdueTasks} en retard</Text>
            </View>
          )}
          <View style={styles.statPill}>
            <MaterialCommunityIcons name="check-circle-outline" size={13} color="#4CAF50" />
            <Text style={[styles.statPillTxt, { color: colors.mutedForeground }]}>{stats.completedTasks} terminées</Text>
          </View>
        </View>
      </LinearGradient>

      {/* SCROLL BODY */}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Next appointment banner */}
        {nextAppointment && (
          <Pressable
            onPress={() => router.push('/calendar' as any)}
            style={[styles.apptBanner, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
          >
            <MaterialCommunityIcons name="calendar-clock" size={15} color={colors.primary} />
            <Text style={[styles.apptTxt, { color: colors.primary }]} numberOfLines={1}>
              {nextAppointment.title}
              {nextAppointment.date
                ? `  ·  ${new Date(nextAppointment.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                : ''}
              {nextAppointment.time ? `  ·  ${nextAppointment.time}` : ''}
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={14} color={colors.primary} />
          </Pressable>
        )}

        {/* ── EN RETARD ── */}
        {overdueTasks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeadRow}>
              <MaterialCommunityIcons name="alert-circle" size={13} color="#F44336" />
              <Text style={[styles.sectionHead, { color: '#F44336' }]}>
                En retard  ·  {overdueTasks.length}
              </Text>
            </View>
            <View style={[styles.branch, { borderLeftColor: '#F4433650' }]}>
              {overdueTasks.map(t => <TaskEntry key={t.id} task={t} isOverdue />)}
            </View>
          </View>
        )}

        {/* ── AUJOURD'HUI marker ── */}
        <View style={styles.todayRow}>
          <View style={[styles.todayLine, { backgroundColor: colors.primary }]} />
          <View style={[styles.todayPill, { backgroundColor: colors.primary }]}>
            <Text style={[styles.todayTxt, { color: colors.primaryForeground }]}>
              Aujourd'hui  ·  {now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
          </View>
          <View style={[styles.todayLine, { backgroundColor: colors.primary }]} />
        </View>

        {/* Empty state */}
        {weekGroups.length === 0 && noDateTasks.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="calendar-check-outline" size={44} color={colors.mutedForeground} />
            <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Aucune tâche planifiée</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Ajoute un projet et des tâches pour voir ta timeline
            </Text>
          </View>
        )}

        {/* ── WEEK GROUPS ── */}
        {weekGroups.map(week => (
          <View key={week.weekKey} style={styles.section}>
            {/* Week header */}
            <View style={styles.weekRow}>
              <View style={[styles.weekLineFrag, { backgroundColor: colors.border }]} />
              <Text style={[styles.weekHead, { color: colors.mutedForeground }]}>{week.label}</Text>
              <View style={[styles.weekLineFrag, { backgroundColor: colors.border }]} />
            </View>

            {week.days.map(day => {
              const isToday = day.dateKey === todayKey;
              return (
                <View key={day.dateKey} style={styles.dayGroup}>
                  {/* Day header with dot */}
                  <View style={styles.dayHeadRow}>
                    <View style={[
                      styles.dayDot,
                      {
                        backgroundColor: isToday ? colors.primary : colors.background,
                        borderColor: isToday ? colors.primary : colors.mutedForeground,
                      },
                    ]} />
                    <Text style={[
                      styles.dayHead,
                      {
                        color: isToday ? colors.primary : colors.foreground,
                        fontFamily: isToday ? 'Inter_700Bold' : 'Inter_500Medium',
                      },
                    ]}>
                      {day.label}
                      {day.tasks.length > 1 && (
                        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                          {`  ×${day.tasks.length}`}
                        </Text>
                      )}
                    </Text>
                  </View>

                  {/* Tasks branching from the axis */}
                  <View style={[styles.branch, { borderLeftColor: isToday ? colors.primary + '60' : colors.border }]}>
                    {day.tasks.map(t => <TaskEntry key={t.id} task={t} />)}
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {/* ── SANS DATE ── */}
        {noDateTasks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.weekRow}>
              <View style={[styles.weekLineFrag, { backgroundColor: colors.border }]} />
              <Text style={[styles.weekHead, { color: colors.mutedForeground }]}>
                Sans date  ·  {noDateTasks.length}
              </Text>
              <View style={[styles.weekLineFrag, { backgroundColor: colors.border }]} />
            </View>
            <View style={[styles.branch, { borderLeftColor: colors.border }]}>
              {noDateTasks.map(t => <TaskEntry key={t.id} task={t} />)}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── BOTTOM SHEET ── */}
      <Modal
        visible={selectedTask !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedTask(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setSelectedTask(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => { /* prevent close */ }}
          >
            {selectedTask && (() => {
              const pColor    = selectedProject ? projectColor(selectedProject.id) : colors.primary;
              const prioColor = PRIORITY_COLORS[selectedTask.priority] ?? colors.primary;
              const dueParsed = parseFrDate(selectedTask.dueDate);
              return (
                <>
                  <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

                  {/* Title + project */}
                  <View style={styles.sheetTitleRow}>
                    <View style={[styles.sheetAccent, { backgroundColor: pColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                        {selectedTask.title}
                      </Text>
                      {selectedProject && (
                        <Text style={[styles.sheetProj, { color: pColor }]}>{selectedProject.name}</Text>
                      )}
                    </View>
                  </View>

                  {/* Meta badges */}
                  <View style={styles.sheetMeta}>
                    <View style={[styles.prioBadge, { backgroundColor: prioColor + '22' }]}>
                      <View style={[styles.prioDot, { backgroundColor: prioColor }]} />
                      <Text style={[styles.prioTxt, { color: prioColor }]}>{PRIORITY_LABELS[selectedTask.priority]}</Text>
                    </View>
                    {dueParsed && (
                      <View style={[styles.prioBadge, { backgroundColor: colors.border }]}>
                        <MaterialCommunityIcons name="calendar-outline" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.prioTxt, { color: colors.mutedForeground }]}>
                          {dueParsed.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Actions */}
                  <View style={styles.sheetBtns}>
                    <Pressable
                      onPress={handleMarkDone}
                      style={[styles.sheetBtn, { backgroundColor: '#4CAF5018', borderColor: '#4CAF5040' }]}
                    >
                      <MaterialCommunityIcons name="check-circle-outline" size={18} color="#4CAF50" />
                      <Text style={[styles.sheetBtnTxt, { color: '#4CAF50' }]}>Terminée</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { setSelectedTask(null); router.push(`/task/${selectedTask.id}`); }}
                      style={[styles.sheetBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
                    >
                      <MaterialCommunityIcons name="arrow-right-circle-outline" size={18} color={colors.primary} />
                      <Text style={[styles.sheetBtnTxt, { color: colors.primary }]}>Voir le détail</Text>
                    </Pressable>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const PHOTO_H = 72;

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header:      { paddingHorizontal: 20, paddingBottom: 16 },
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  appName:     { fontSize: 32, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  dateStr:     { fontSize: 13, fontFamily: 'Inter_400Regular', textTransform: 'capitalize', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  iconBtn:     { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  addBtn:      { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  statsRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  statPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: '#ffffff0c' },
  statPillTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  // Scroll
  scroll: { paddingHorizontal: 16, paddingTop: 10 },

  // Appointment banner
  apptBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  apptTxt:    { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },

  // Section
  section:       { marginBottom: 2 },
  sectionHeadRow:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionHead:   { fontSize: 11, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.6 },

  // TODAY line
  todayRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 14 },
  todayLine: { flex: 1, height: 1 },
  todayPill: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  todayTxt:  { fontSize: 12, fontFamily: 'Inter_700Bold' },

  // Week header
  weekRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 8 },
  weekLineFrag:{ flex: 1, height: StyleSheet.hairlineWidth },
  weekHead:    { fontSize: 11, fontFamily: 'Inter_500Medium' },

  // Day
  dayGroup:   { marginBottom: 6 },
  dayHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dayDot:     { width: 11, height: 11, borderRadius: 5.5, borderWidth: 2 },
  dayHead:    { fontSize: 13 },

  // Branch (axis line)
  branch: { paddingLeft: 18, borderLeftWidth: 1.5, marginLeft: 5, gap: 6 },

  // Task entry
  taskEntry:    { borderRadius: 12, borderWidth: 1, overflow: 'hidden', flexDirection: 'row' },
  taskColorBar: { width: 4 },
  taskContent:  { flex: 1, padding: 11, gap: 4 },
  taskTop:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taskTitle:    { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  taskProj:     { fontSize: 12, fontFamily: 'Inter_400Regular' },

  // Priority badge
  prioBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  prioDot:   { width: 6, height: 6, borderRadius: 3 },
  prioTxt:   { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  // Photo strip
  photoStrip: { marginTop: 8 },
  photoThumb: { width: PHOTO_H, height: PHOTO_H, borderRadius: 8, marginRight: 6 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 56, gap: 10 },
  emptyTxt:   { fontSize: 15, fontFamily: 'Inter_500Medium' },
  emptySub:   { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  // Bottom sheet
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, gap: 14 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  sheetTitleRow:{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  sheetAccent: { width: 4, borderRadius: 2, alignSelf: 'stretch', minHeight: 42 },
  sheetTitle:  { fontSize: 18, fontFamily: 'Inter_700Bold', lineHeight: 24 },
  sheetProj:   { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 3 },
  sheetMeta:   { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sheetBtns:   { flexDirection: 'row', gap: 10 },
  sheetBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  sheetBtnTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
