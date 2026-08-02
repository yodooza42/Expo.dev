import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { Task } from '@/types';
import { PriorityBadge } from './PriorityBadge';

interface Props {
  task: Task;
  projectName?: string;
  onLongPress?: (task: Task) => void;
}

const STATUS_ICONS: Record<Task['status'], string> = {
  idea: 'lightbulb-outline',
  todo: 'checkbox-blank-circle-outline',
  inprogress: 'progress-clock',
  waiting: 'clock-outline',
  done: 'check-circle',
};

const EISENHOWER_LABELS: Record<Task['eisenhower'], string> = {
  do_now: 'À faire maintenant',
  schedule: 'Planifier',
  delegate: 'Déléguer',
  eliminate: 'Supprimer',
};

const EISENHOWER_COLORS: Record<Task['eisenhower'], string> = {
  do_now: '#F44336',
  schedule: '#2196F3',
  delegate: '#FF9800',
  eliminate: '#9E9E9E',
};

export function TaskCard({ task, projectName, onLongPress }: Props) {
  const colors = useColors();
  const router = useRouter();
  const { updateTask } = useApp();

  const dueDate = new Date(task.dueDate);
  const isOverdue = dueDate < new Date() && task.status !== 'done';
  const isDone = task.status === 'done';
  const eisColor = EISENHOWER_COLORS[task.eisenhower];

  function toggleDone() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateTask(task.id, { status: isDone ? 'todo' : 'done' });
  }

  return (
    <Pressable
      onPress={() => router.push(`/task/${task.id}`)}
      onLongPress={() => onLongPress?.(task)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: isDone ? colors.border : colors.border },
        isDone && { opacity: 0.6 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={styles.row}>
        <Pressable onPress={toggleDone} style={styles.checkBtn} hitSlop={8}>
          <MaterialCommunityIcons
            name={isDone ? 'check-circle' : (STATUS_ICONS[task.status] as any)}
            size={22}
            color={isDone ? colors.priorityLow : colors.mutedForeground}
          />
        </Pressable>
        <View style={styles.content}>
          <Text
            style={[
              styles.title,
              { color: colors.foreground },
              isDone && { textDecorationLine: 'line-through', color: colors.mutedForeground },
            ]}
            numberOfLines={2}
          >
            {task.title}
          </Text>
          <View style={styles.meta}>
            {projectName && (
              <Text style={[styles.project, { color: colors.primary }]} numberOfLines={1}>
                {projectName}
              </Text>
            )}
            <View
              style={[styles.eisBadge, { backgroundColor: eisColor + '20', borderColor: eisColor }]}
            >
              <Text style={[styles.eisLabel, { color: eisColor }]}>
                {EISENHOWER_LABELS[task.eisenhower]}
              </Text>
            </View>
          </View>
          <View style={styles.footer}>
            <PriorityBadge priority={task.priority} small />
            {(task.subTasks?.length ?? 0) > 0 && (
              <Text style={[styles.date, { color: colors.mutedForeground }]}>
                <MaterialCommunityIcons name="format-list-checks" size={11} color={colors.mutedForeground} />
                {' '}{task.subTasks!.filter(s => s.done).length}/{task.subTasks!.length}
              </Text>
            )}
            <Text
              style={[
                styles.date,
                { color: isOverdue ? colors.destructive : colors.mutedForeground },
              ]}
            >
              <MaterialCommunityIcons
                name={isOverdue ? 'clock-alert-outline' : 'calendar-outline'}
                size={11}
                color={isOverdue ? colors.destructive : colors.mutedForeground}
              />
              {' '}{dueDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  checkBtn: {
    marginTop: 2,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    lineHeight: 20,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  project: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  eisBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
  },
  eisLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  date: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
