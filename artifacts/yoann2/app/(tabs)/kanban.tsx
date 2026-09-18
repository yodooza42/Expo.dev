import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { PriorityBadge } from '@/components/PriorityBadge';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { Task, TaskStatus } from '@/types';
import { computeStreak } from '@/utils/streakUtils';

const COLUMNS: { id: TaskStatus; label: string; icon: string }[] = [
  { id: 'inprogress', label: 'En cours', icon: 'progress-clock' },
  { id: 'todo', label: 'À faire', icon: 'format-list-checks' },
  { id: 'idea', label: 'Idées', icon: 'lightbulb-outline' },
  { id: 'waiting', label: 'En attente', icon: 'clock-outline' },
  { id: 'done', label: 'Terminées', icon: 'check-circle-outline' },
];

const COLUMN_COLORS: Record<TaskStatus, string> = {
  idea: '#607D8B',
  todo: '#2196F3',
  inprogress: '#FF9800',
  waiting: '#9E9E9E',
  done: '#4CAF50',
};

function KanbanCard({
  task,
  projectName,
  onMoveRequest,
  onOpen,
}: {
  task: Task;
  projectName?: string;
  onMoveRequest: (task: Task) => void;
  onOpen: (task: Task) => void;
}) {
  const colors = useColors();
  const { tasks: allTasks } = useApp();
  const isDone = task.status === 'done';
  const streak = computeStreak(task, allTasks);

  return (
    <Pressable
      onPress={() => onOpen(task)}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onMoveRequest(task);
      }}
      style={({ pressed }) => [
        styles.kanbanCard,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
        isDone && { opacity: 0.5 },
      ]}
    >
      {projectName && (
        <Text style={[styles.kanbanProject, { color: colors.primary }]} numberOfLines={1}>
          {projectName}
        </Text>
      )}
      <Text style={[styles.kanbanTitle, { color: colors.foreground }]} numberOfLines={3}>
        {task.title}
      </Text>
      <View style={styles.kanbanFooter}>
        <PriorityBadge priority={task.priority} small />
        {streak && streak.current > 1 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 11 }}>🔥</Text>
            <Text style={{ fontSize: 11, color: '#FF9800', fontFamily: 'Inter_500Medium' }}>{streak.current}</Text>
          </View>
        )}
        <Text style={[styles.kanbanDate, { color: colors.mutedForeground }]}>
          {new Date(task.dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </Text>
      </View>
    </Pressable>
  );
}

function MoveModal({
  task,
  onClose,
  onMove,
  colors,
}: {
  task: Task;
  onClose: () => void;
  onMove: (status: TaskStatus) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <BottomSheet visible onClose={onClose} title="Déplacer vers…">
        <Text style={[styles.modalTask, { color: colors.mutedForeground }]} numberOfLines={2}>
          {task.title}
        </Text>
        <View style={styles.modalOptions}>
          {COLUMNS.filter(c => c.id !== task.status).map(col => (
            <Pressable
              key={col.id}
              onPress={() => onMove(col.id)}
              style={({ pressed }) => [
                styles.modalOption,
                { backgroundColor: COLUMN_COLORS[col.id] + '20', borderColor: COLUMN_COLORS[col.id] },
                pressed && { opacity: 0.7 },
              ]}
            >
              <MaterialCommunityIcons name={col.icon as any} size={18} color={COLUMN_COLORS[col.id]} />
              <Text style={[styles.modalOptionLabel, { color: COLUMN_COLORS[col.id] }]}>{col.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={onClose} style={[styles.cancelBtn, { borderColor: colors.border }]}>
          <Text style={[styles.cancelLabel, { color: colors.mutedForeground }]}>Annuler</Text>
        </Pressable>
    </BottomSheet>
  );
}

export default function KanbanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tasks, projects, appointments, getStats, updateTask } = useApp();
  const [movingTask, setMovingTask] = useState<Task | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>('all');

  const now    = new Date();
  const stats  = getStats();

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcomingAppts = appointments.filter(a => {
    if (!a.date) return false;
    const d = new Date(a.date);
    return !isNaN(d.getTime()) && d >= todayStart;
  }).length;

  const filteredTasks = selectedProject === 'all'
    ? tasks
    : tasks.filter(t => t.projectId === selectedProject);

  function handleMove(status: TaskStatus) {
    if (!movingTask) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateTask(movingTask.id, { status });
    setMovingTask(null);
  }

  function handleOpen(task: Task) {
    router.push(`/task/${task.id}`);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Kanban</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectFilter} contentContainerStyle={{ gap: 6 }}>
          {[{ id: 'all', name: 'Tous' }, ...projects].map(p => (
            <Pressable
              key={p.id}
              onPress={() => setSelectedProject(p.id)}
              style={[
                styles.filterChip,
                selectedProject === p.id
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: colors.secondary, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.filterLabel, { color: selectedProject === p.id ? colors.primaryForeground : colors.mutedForeground }]}>
                {p.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Appuie pour ouvrir · Maintiens pour déplacer
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.board}
        style={{ flex: 1 }}
      >
        {COLUMNS.map(col => {
          const colTasks = filteredTasks.filter(t => t.status === col.id);
          const colColor = COLUMN_COLORS[col.id];
          return (
            <View key={col.id} style={[styles.column, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.colHeader, { borderBottomColor: colors.border }]}>
                <View style={[styles.colDot, { backgroundColor: colColor }]} />
                <Text style={[styles.colTitle, { color: colors.foreground }]}>{col.label}</Text>
                <View style={[styles.colBadge, { backgroundColor: colColor + '30' }]}>
                  <Text style={[styles.colCount, { color: colColor }]}>{colTasks.length}</Text>
                </View>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.colContent}
              >
                {colTasks.length === 0 ? (
                  <View style={[styles.emptyCol, { borderColor: colors.border }]}>
                    <MaterialCommunityIcons name={col.icon as any} size={24} color={colors.mutedForeground} />
                    <Text style={[styles.emptyColText, { color: colors.mutedForeground }]}>Vide</Text>
                  </View>
                ) : (
                  colTasks.map(task => {
                    const proj = projects.find(p => p.id === task.projectId);
                    return (
                      <KanbanCard
                        key={task.id}
                        task={task}
                        projectName={proj?.name}
                        onMoveRequest={setMovingTask}
                        onOpen={handleOpen}
                      />
                    );
                  })
                )}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>

      {/* ── STATS FOOTER ── */}
      <View style={[styles.statsFooter, { backgroundColor: colors.background }]}>
        {/* Date divider */}
        <View style={styles.todayRow}>
          <View style={[styles.todayLine, { backgroundColor: colors.primary }]} />
          <View style={[styles.todayPill, { backgroundColor: colors.primary }]}>
            <Text style={[styles.todayTxt, { color: colors.primaryForeground }]}>
              Aujourd'hui  ·  {now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
          </View>
          <View style={[styles.todayLine, { backgroundColor: colors.primary }]} />
        </View>

        {/* Single row — icon + number only */}
        <View style={styles.statsRow}>
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
      </View>

      {movingTask && (
        <MoveModal
          task={movingTask}
          colors={colors}
          onClose={() => setMovingTask(null)}
          onMove={handleMove}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: -2,
  },
  projectFilter: { flexShrink: 0 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  board: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  statsFooter: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 6,
  },
  todayLine: { flex: 1, height: 1 },
  todayPill: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
  },
  todayTxt: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 5,
    marginBottom: 0,
    justifyContent: 'center',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: '#ffffff0c',
  },
  statPillTxt: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  column: {
    width: 200,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  colDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  colTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  colBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colCount: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  colContent: {
    padding: 8,
    gap: 8,
    paddingBottom: 16,
  },
  kanbanCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  kanbanProject: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  kanbanTitle: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    lineHeight: 18,
  },
  kanbanFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kanbanDate: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  emptyCol: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 6,
  },
  emptyColText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  modalTask: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  modalOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalOptionLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  cancelBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelLabel: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
});
