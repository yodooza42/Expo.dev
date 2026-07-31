import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { useApp } from '@/contexts/AppContext';
import { useSplash } from '@/contexts/SplashContext';
import { useColors } from '@/hooks/useColors';
import type { Appointment, Task } from '@/types';
import { pH } from '@/styles/header';

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
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
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
  useSplash();

  const [showPhotos,    setShowPhotos]    = useState(false);
  const [showAppts,     setShowAppts]     = useState(false);
  const [showHistory,   setShowHistory]   = useState(false);
  const [selectedTask,  setSelectedTask]  = useState<Task | null>(null);
  const [photoViewer,   setPhotoViewer]   = useState<string[]>([]);
  const [photoIndex,    setPhotoIndex]     = useState(0);

  const stats    = getStats();
  const now      = new Date();
  const todayStart = startOfDay(now);
  const todayKey   = isoDate(todayStart);
  const upcomingAppts = appointments.filter(a => {
    if (!a.date) return false;
    const d = new Date(a.date);
    return !isNaN(d.getTime()) && d >= todayStart;
  }).length;

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

  // Appointments indexed by local day key (YYYY-MM-DD) — must come before weekGroups
  const apptsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      if (!a.date) continue;
      const key = isoDate(startOfDay(new Date(a.date)));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    for (const list of map.values())
      list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
    return map;
  }, [appointments]);

  // Future tasks (+ optional appointment days) grouped week → day
  const weekGroups = useMemo((): WeekGroup[] => {
    const future = tasks
      .filter(t => {
        if (t.status === 'done') return false;
        const d = parseFrDate(t.dueDate);
        return d && startOfDay(d) >= todayStart;
      })
      .sort((a, b) => parseFrDate(a.dueDate)!.getTime() - parseFrDate(b.dueDate)!.getTime());

    const weekMap = new Map<string, WeekGroup>();

    function ensureDay(date: Date): DayGroup {
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
      return day;
    }

    for (const task of future) {
      ensureDay(parseFrDate(task.dueDate)!).tasks.push(task);
    }

    // When appointments toggle is ON, also create day slots for appointment-only days
    if (showAppts) {
      for (const [dKey, _] of apptsByDay) {
        if (dKey < todayKey) continue;          // skip past days
        const date = new Date(dKey + 'T00:00:00');
        ensureDay(date);                         // creates the slot if missing
      }
    }

    // Sort days within each week chronologically
    for (const week of weekMap.values())
      week.days.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    return Array.from(weekMap.values()).sort((a, b) => a.weekKey.localeCompare(b.weekKey));
  }, [tasks, showAppts, apptsByDay, todayStart, todayKey]);

  // Tasks without due date
  const noDateTasks = useMemo(() =>
    tasks.filter(t => t.status !== 'done' && !t.dueDate),
  [tasks]);

  // Project-level alerts (overdue + over budget)
  const projectAlerts = useMemo(() => {
    const out: { project: import('@/types').Project; type: 'overdue' | 'budget' }[] = [];
    for (const p of projects) {
      if (p.archived || p.status === 'done' || p.status === 'abandoned') continue;
      if (new Date(p.dueDate) < todayStart) out.push({ project: p, type: 'overdue' });
      if (p.budget > 0 && p.spent > p.budget) out.push({ project: p, type: 'budget' });
    }
    return out;
  }, [projects, todayStart]);

  // Critical tasks not done
  const criticalTasks = useMemo(() =>
    tasks.filter(t => t.priority === 'critical' && t.status !== 'done'),
  [tasks]);

  // All done tasks grouped by week (completedAt or dueDate); no-date ones get their own bucket
  const pastWeekGroups = useMemo((): WeekGroup[] => {
    const allDone = tasks.filter(t => t.status === 'done');

    const weekMap = new Map<string, WeekGroup>();
    const noDateDone: Task[] = [];

    for (const task of allDone) {
      const d = parseFrDate(task.completedAt ?? task.dueDate);
      if (!d) {
        noDateDone.push(task);
        continue;
      }

      const date   = d;
      const monday = getMondayOfWeek(date);
      const wKey   = isoDate(monday);
      const dKey   = isoDate(startOfDay(date));

      if (!weekMap.has(wKey))
        weekMap.set(wKey, { weekKey: wKey, label: buildWeekLabel(monday), days: [] });

      const week = weekMap.get(wKey)!;
      let day = week.days.find(dg => dg.dateKey === dKey);
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

    for (const week of weekMap.values())
      week.days.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    const result = Array.from(weekMap.values()).sort((a, b) => a.weekKey.localeCompare(b.weekKey));

    if (noDateDone.length > 0) {
      result.push({
        weekKey: 'no-date',
        label: 'Sans date',
        days: [{
          dateKey: 'no-date',
          date: todayStart,
          label: 'Terminées sans date',
          tasks: noDateDone,
        }],
      });
    }

    return result;
  }, [tasks, todayStart]);

  // ── Sub-component: ApptEntry ──────────────────────────────────────────

  function ApptEntry({ appt }: { appt: Appointment }) {
    const APPT_COLOR = '#7C4DFF';
    return (
      <Pressable
        onPress={() => router.push('/(tabs)/calendar' as any)}
        style={({ pressed }) => [
          styles.apptEntry,
          { backgroundColor: colors.card, borderColor: APPT_COLOR + '40', opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <View style={[styles.apptColorBar, { backgroundColor: APPT_COLOR }]} />
        <View style={styles.apptContent}>
          <View style={styles.apptTitleRow}>
            <MaterialCommunityIcons name="calendar-clock" size={13} color={APPT_COLOR} />
            <Text style={[styles.apptTitle, { color: colors.foreground }]} numberOfLines={1}>
              {appt.title}
            </Text>
          </View>
          <View style={styles.apptMeta}>
            {appt.time ? (
              <View style={styles.apptMetaItem}>
                <MaterialCommunityIcons name="clock-outline" size={11} color={colors.mutedForeground} />
                <Text style={[styles.apptMetaTxt, { color: colors.mutedForeground }]}>{appt.time}</Text>
              </View>
            ) : null}
            {appt.location ? (
              <View style={styles.apptMetaItem}>
                <MaterialCommunityIcons name="map-marker-outline" size={11} color={colors.mutedForeground} />
                <Text style={[styles.apptMetaTxt, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {appt.location}
                </Text>
              </View>
            ) : null}
            {appt.category ? (
              <View style={[styles.apptCatBadge, { backgroundColor: APPT_COLOR + '22' }]}>
                <Text style={[styles.apptCatTxt, { color: APPT_COLOR }]}>{appt.category}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

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

  function TaskEntry({ task, isOverdue = false, isDone = false }: { task: Task; isOverdue?: boolean; isDone?: boolean }) {
    const proj      = projects.find(p => p.id === task.projectId);
    const pColor    = proj ? projectColor(proj.id) : colors.primary;
    const prioColor = PRIORITY_COLORS[task.priority] ?? colors.primary;
    const hasPhotos = task.photos.length > 0;
    const dimmed    = isDone || isOverdue;

    return (
      <Pressable
        onPress={() => handleTaskPress(task)}
        style={({ pressed }) => [
          styles.taskEntry,
          {
            backgroundColor: isDone ? colors.card + '80' : colors.card,
            borderColor: isOverdue ? '#F4433640' : colors.border,
            opacity: pressed ? 0.75 : isDone ? 0.55 : 1,
          },
        ]}
      >
        <View style={[styles.taskColorBar, { backgroundColor: isOverdue ? '#F44336' : isDone ? colors.mutedForeground : pColor }]} />
        <View style={styles.taskContent}>
          <View style={styles.taskTop}>
            {isDone && (
              <MaterialCommunityIcons name="check-circle" size={14} color="#4CAF50" style={{ marginRight: -2 }} />
            )}
            <Text
              style={[
                styles.taskTitle,
                { color: isOverdue ? '#FF5722' : isDone ? colors.mutedForeground : colors.foreground },
                isDone && { textDecorationLine: 'line-through' },
              ]}
              numberOfLines={1}
            >
              {task.title}
            </Text>
            {!isDone && (
              <View style={[styles.prioBadge, { backgroundColor: prioColor + '22' }]}>
                <View style={[styles.prioDot, { backgroundColor: prioColor }]} />
                <Text style={[styles.prioTxt, { color: prioColor }]}>{PRIORITY_LABELS[task.priority]}</Text>
              </View>
            )}
          </View>
          {proj && (
            <Text
              style={[styles.taskProj, { color: isOverdue ? '#F4433399' : isDone ? colors.mutedForeground : pColor + 'cc' }]}
              numberOfLines={1}
            >
              {proj.name}
            </Text>
          )}
          {showPhotos && hasPhotos && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
              {task.photos.map((uri, i) => (
                <Pressable
                  key={i}
                  onPress={() => {
                    setPhotoViewer(task.photos);
                    setPhotoIndex(i);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Image source={{ uri }} style={styles.photoThumb} contentFit="cover" />
                </Pressable>
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
        style={[styles.header, { paddingTop: insets.top + 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          {/* GAUCHE — paramètres */}
          <View style={pH.btnGroup}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/settings' as any); }}
              hitSlop={6}
              style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="cog-outline" size={18} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/widget-settings' as any); }}
              hitSlop={6}
              style={[pH.btn, { backgroundColor: '#E91E6328', borderColor: '#E91E63' }]}
            >
              <MaterialCommunityIcons name="tune" size={18} color="#E91E63" />
            </Pressable>
          </View>

          {/* DROITE — fonctionnalités */}
          <View style={pH.btnGroup}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/kanban' as any); }}
              hitSlop={6}
              style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="view-column-outline" size={18} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/projects' as any); }}
              hitSlop={6}
              style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="folder-multiple-outline" size={18} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              onPress={() => { setShowAppts(v => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              hitSlop={6}
              style={[pH.btn, { backgroundColor: showAppts ? '#7C4DFF28' : colors.card, borderColor: showAppts ? '#7C4DFF' : colors.border }]}
            >
              <MaterialCommunityIcons
                name={showAppts ? 'calendar-clock' : 'calendar-clock-outline' as any}
                size={18}
                color={showAppts ? '#7C4DFF' : colors.mutedForeground}
              />
            </Pressable>
            <Pressable
              onPress={() => { setShowPhotos(v => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              hitSlop={6}
              style={[pH.btn, { backgroundColor: showPhotos ? colors.primary + '28' : colors.card, borderColor: showPhotos ? colors.primary : colors.border }]}
            >
              <MaterialCommunityIcons
                name={showPhotos ? 'camera' : 'camera-outline'}
                size={18}
                color={showPhotos ? colors.primary : colors.mutedForeground}
              />
            </Pressable>
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

        {/* ── ALERTES ── */}
        {(projectAlerts.length > 0 || criticalTasks.length > 0) && (
          <View style={[styles.alertsCard, { backgroundColor: colors.card, borderColor: '#F4433630' }]}>
            <View style={styles.alertsHeader}>
              <MaterialCommunityIcons name="alert-circle" size={13} color="#F44336" />
              <Text style={[styles.alertsTitle, { color: '#F44336' }]}>
                Alertes · {projectAlerts.length + (criticalTasks.length > 0 ? 1 : 0)}
              </Text>
            </View>
            {projectAlerts.map((a, i) => {
              const isOverdue = a.type === 'overdue';
              const color = isOverdue ? '#F44336' : '#FF9800';
              const label = isOverdue ? 'En retard' : 'Budget dépassé';
              return (
                <Pressable
                  key={`${a.project.id}_${a.type}`}
                  onPress={() => router.push(`/project/${a.project.id}` as any)}
                  style={[
                    styles.alertRow,
                    { borderTopColor: colors.border },
                    i === 0 && { borderTopWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <View style={[styles.alertDot, { backgroundColor: color }]} />
                  <Text style={[styles.alertName, { color: colors.foreground }]} numberOfLines={1}>
                    {a.project.name}
                  </Text>
                  <View style={[styles.alertTag, { backgroundColor: color + '20' }]}>
                    <Text style={[styles.alertTagTxt, { color }]}>{label}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={14} color={colors.mutedForeground} />
                </Pressable>
              );
            })}
            {criticalTasks.length > 0 && (
              <View style={[styles.alertRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <View style={[styles.alertDot, { backgroundColor: '#E91E63' }]} />
                <Text style={[styles.alertName, { color: colors.foreground }]}>
                  {criticalTasks.length} tâche{criticalTasks.length > 1 ? 's' : ''} critique{criticalTasks.length > 1 ? 's' : ''} en attente
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── HISTORIQUE toggle ── */}
        <Pressable
          onPress={() => setShowHistory(v => !v)}
          style={[styles.historyToggle, { borderColor: colors.border }]}
        >
          <MaterialCommunityIcons
            name={showHistory ? 'chevron-up' : 'history'}
            size={14}
            color={colors.mutedForeground}
          />
          <Text style={[styles.historyTxt, { color: colors.mutedForeground }]}>
            {showHistory ? 'Masquer l\'historique' : 'Voir les tâches terminées'}
          </Text>
          {!showHistory && pastWeekGroups.length > 0 && (
            <View style={[styles.historyBadge, { backgroundColor: colors.border }]}>
              <Text style={[styles.historyBadgeTxt, { color: colors.mutedForeground }]}>
                {pastWeekGroups.reduce((s, w) => s + w.days.reduce((ds, d) => ds + d.tasks.length, 0), 0)}
              </Text>
            </View>
          )}
        </Pressable>

        {/* ── SEMAINES PASSÉES ── */}
        {showHistory && (
          pastWeekGroups.length === 0 ? (
            <Text style={[styles.historyEmpty, { color: colors.mutedForeground }]}>
              Aucune tâche terminée
            </Text>
          ) : (
            pastWeekGroups.map(week => (
              <View key={week.weekKey} style={styles.section}>
                <View style={styles.weekRow}>
                  <View style={[styles.weekLineFrag, { backgroundColor: colors.border }]} />
                  <Text style={[styles.weekHead, { color: colors.mutedForeground }]}>{week.label}</Text>
                  <View style={[styles.weekLineFrag, { backgroundColor: colors.border }]} />
                </View>
                {week.days.map(day => (
                  <View key={day.dateKey} style={styles.dayGroup}>
                    <View style={styles.dayHeadRow}>
                      <View style={[styles.dayDot, { backgroundColor: colors.background, borderColor: colors.border }]} />
                      <Text style={[styles.dayHead, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        {day.label}
                      </Text>
                    </View>
                    <View style={[styles.branch, { borderLeftColor: colors.border }]}>
                      {day.tasks.map(t => <TaskEntry key={t.id} task={t} isDone />)}
                      {showAppts && (apptsByDay.get(day.dateKey) ?? []).map(a => (
                        <ApptEntry key={a.id} appt={a} />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ))
          )
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
        <View style={[styles.statsRow, { justifyContent: 'center', marginTop: -6, marginBottom: 10 }]}>
          <View style={[styles.statPill, { backgroundColor: '#7C4DFF18' }]}>
            <MaterialCommunityIcons name="calendar-clock-outline" size={12} color="#7C4DFF" />
            <Text style={[styles.statPillTxt, { color: '#7C4DFF' }]}>{upcomingAppts}</Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: colors.primary + '18' }]}>
            <MaterialCommunityIcons name="folder-multiple-outline" size={12} color={colors.primary} />
            <Text style={[styles.statPillTxt, { color: colors.primary }]}>{stats.totalProjects}</Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: '#2196F318' }]}>
            <MaterialCommunityIcons name="format-list-checks" size={12} color="#2196F3" />
            <Text style={[styles.statPillTxt, { color: '#2196F3' }]}>{stats.totalTasks}</Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: '#4CAF5018' }]}>
            <MaterialCommunityIcons name="check-circle-outline" size={12} color="#4CAF50" />
            <Text style={[styles.statPillTxt, { color: '#4CAF50' }]}>{stats.completedTasks}</Text>
          </View>
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

                  {/* Tasks + appointments branching from the axis */}
                  <View style={[styles.branch, { borderLeftColor: isToday ? colors.primary + '60' : colors.border }]}>
                    {day.tasks.map(t => <TaskEntry key={t.id} task={t} />)}
                    {showAppts && (apptsByDay.get(day.dateKey) ?? []).map(a => (
                      <ApptEntry key={a.id} appt={a} />
                    ))}
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
      <BottomSheet visible={selectedTask !== null} onClose={() => setSelectedTask(null)}>
            {selectedTask && (() => {
              const pColor    = selectedProject ? projectColor(selectedProject.id) : colors.primary;
              const prioColor = PRIORITY_COLORS[selectedTask.priority] ?? colors.primary;
              const dueParsed = parseFrDate(selectedTask.dueDate);
              return (
                <>
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
                    {selectedTask.completedAt && (() => {
                      const cp = parseFrDate(selectedTask.completedAt!);
                      return cp ? (
                        <View style={[styles.prioBadge, { backgroundColor: '#4CAF5018', borderWidth: 1, borderColor: '#4CAF5040' }]}>
                          <MaterialCommunityIcons name="check-circle-outline" size={12} color="#4CAF50" />
                          <Text style={[styles.prioTxt, { color: '#4CAF50' }]}>
                            {'Fait le ' + cp.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </Text>
                        </View>
                      ) : null;
                    })()}
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
      </BottomSheet>

      {/* ── PHOTO VIEWER ── */}
      <Modal
        visible={photoViewer.length > 0}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoViewer([])}
      >
        <View style={styles.photoOverlay}>
          <Pressable style={styles.photoCloseArea} onPress={() => setPhotoViewer([])} />
          <FlatList
            data={photoViewer}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={photoIndex}
            getItemLayout={(_, index) => ({
              length: Dimensions.get('window').width,
              offset: Dimensions.get('window').width * index,
              index,
            })}
            renderItem={({ item }) => (
              <View style={styles.photoSlide}>
                <Image source={{ uri: item }} style={styles.photoFull} contentFit="contain" />
              </View>
            )}
            keyExtractor={(_, i) => String(i)}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / Dimensions.get('window').width);
              setPhotoIndex(idx);
            }}
          />
          <View style={styles.photoBar}>
            <Text style={styles.photoCount}>
              {photoIndex + 1} / {photoViewer.length}
            </Text>
          </View>
          <Pressable onPress={() => setPhotoViewer([])} style={styles.photoCloseBtn}>
            <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const PHOTO_H = 108;

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: { paddingHorizontal: 14, paddingBottom: 10, alignItems: 'flex-end' },
  addBtn:      { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  statsRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  statPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: '#ffffff0c' },
  statPillTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  // Scroll
  scroll: { paddingHorizontal: 16, paddingTop: 16 },

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
  sheetTitleRow:{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  sheetAccent: { width: 4, borderRadius: 2, alignSelf: 'stretch', minHeight: 42 },
  sheetTitle:  { fontSize: 18, fontFamily: 'Inter_700Bold', lineHeight: 24 },
  sheetProj:   { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 3 },
  sheetMeta:   { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sheetBtns:   { flexDirection: 'row', gap: 10 },
  sheetBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  sheetBtnTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  historyTxt: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },
  historyBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  historyBadgeTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  historyEmpty: { fontSize: 12, fontFamily: 'Inter_400Regular', marginHorizontal: 16, marginBottom: 12, fontStyle: 'italic' },
  wordmarkRow:    { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  wordmarkMain:   { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: 3 },
  wordmarkVersion:{ fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 2 },
  wordmarkLine:   { width: 28, height: 2, borderRadius: 1, marginTop: 4 },
  apptEntry: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
    overflow: 'hidden',
  },
  apptColorBar: { width: 3 },
  apptContent: { flex: 1, padding: 10, gap: 4 },
  apptTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  apptTitle: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  apptMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  apptMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  apptMetaTxt: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  apptCatBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  apptCatTxt: { fontSize: 10, fontFamily: 'Inter_500Medium' },

  // Alert card
  alertsCard:   { marginHorizontal: 16, marginBottom: 10, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  alertsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  alertsTitle:  { fontSize: 12, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.6 },
  alertRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  alertDot:     { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  alertName:    { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  alertTag:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  alertTagTxt:  { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  // Photo viewer
  photoOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  photoCloseArea: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  photoSlide:     { width: Dimensions.get('window').width, height: Dimensions.get('window').height, justifyContent: 'center', alignItems: 'center' },
  photoFull:      { width: '100%', height: '100%' },
  photoBar:       { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  photoCount:     { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  photoCloseBtn:  { position: 'absolute', top: 48, right: 16, zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});
