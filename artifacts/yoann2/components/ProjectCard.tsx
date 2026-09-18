import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/hooks/useColors';
import type { Project, Task } from '@/types';
import { PriorityBadge } from './PriorityBadge';
import { ProgressBar } from './ProgressBar';

interface Props {
  project: Project;
  tasks: Task[];
  onLongPress?: () => void;
}

const STATUS_LABELS: Record<Project['status'], string> = {
  idea: 'Idée',
  todo: 'À faire',
  inprogress: 'En cours',
  waiting: 'En attente',
  done: 'Terminé',
  abandoned: 'Abandonné',
};

const STATUS_COLORS: Record<Project['status'], string> = {
  idea: '#607D8B',
  todo: '#2196F3',
  inprogress: '#FF9800',
  waiting: '#9E9E9E',
  done: '#4CAF50',
  abandoned: '#F44336',
};

export function ProjectCard({ project, tasks, onLongPress }: Props) {
  const colors = useColors();
  const router = useRouter();

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const progress = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;
  const dueDate = new Date(project.dueDate);
  const now = new Date();
  const isOverdue = dueDate < now && project.status !== 'done' && project.status !== 'abandoned';
  const isBudgetOver = project.budget > 0 && project.spent > project.budget;
  const daysToDue = (dueDate.getTime() - now.getTime()) / 86400000;
  const isNearDue = !isOverdue && daysToDue <= 7 && project.status !== 'done' && project.status !== 'abandoned';
  const isBudgetNear = !isBudgetOver && project.budget > 0 && project.spent / project.budget > 0.8;

  const healthColor =
    project.status === 'done' ? '#4CAF50' :
    project.status === 'abandoned' ? undefined :
    (isOverdue || isBudgetOver) ? '#F44336' :
    (isNearDue || isBudgetNear) ? '#FF9800' :
    '#4CAF50';

  const statusColor = STATUS_COLORS[project.status];

  return (
    <Pressable
      onPress={() => router.push(`/project/${project.id}`)}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {project.name}
          </Text>
          <View style={styles.titleRight}>
            {healthColor && (
              <View style={[styles.healthDot, { backgroundColor: healthColor }]} />
            )}
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '25', borderColor: statusColor }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[project.status]}</Text>
            </View>
          </View>
        </View>
        <View style={styles.meta}>
          <MaterialCommunityIcons name="tag-outline" size={12} color={colors.mutedForeground} />
          <Text style={[styles.category, { color: colors.mutedForeground }]}>{project.category}</Text>
          {isOverdue && (
            <>
              <MaterialCommunityIcons name="clock-alert-outline" size={12} color={colors.destructive} />
              <Text style={[styles.category, { color: colors.destructive }]}>En retard</Text>
            </>
          )}
        </View>
      </View>

      {project.description.length > 0 && (
        <Text style={[styles.desc, { color: colors.mutedForeground }]} numberOfLines={2}>
          {project.description}
        </Text>
      )}

      <View style={styles.footer}>
        <ProgressBar progress={progress} />
        <View style={styles.footerMeta}>
          <PriorityBadge priority={project.priority} small />
          <Text style={[styles.taskCount, { color: colors.mutedForeground }]}>
            {doneTasks}/{totalTasks} tâches
          </Text>
          {project.budget > 0 && (
            <Text style={[styles.taskCount, { color: colors.mutedForeground }]}>
              {project.spent}€/{project.budget}€
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  header: {
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  category: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginRight: 8,
  },
  desc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  footer: {
    gap: 8,
  },
  footerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  taskCount: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
