import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/ProgressBar';
import { StatCard } from '@/components/StatCard';
import { TaskCard } from '@/components/TaskCard';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { projects, tasks, getStats, getProjectTasks } = useApp();

  const stats = getStats();

  const priorityTasks = useMemo(() => {
    const now = new Date();
    return tasks
      .filter(t => t.status !== 'done')
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const pa = priorityOrder[a.priority];
        const pb = priorityOrder[b.priority];
        if (pa !== pb) return pa - pb;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      })
      .slice(0, 5);
  }, [tasks]);

  const projectProgress = useMemo(() => {
    return projects.map(p => {
      const pt = getProjectTasks(p.id);
      const done = pt.filter(t => t.status === 'done').length;
      const progress = pt.length > 0 ? (done / pt.length) * 100 : 0;
      return { project: p, progress, taskCount: pt.length };
    });
  }, [projects, getProjectTasks]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={['#1A1500', colors.background]}
        style={[styles.header, { paddingTop: topPad + 16 }]}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>Bonjour 👋</Text>
            <Text style={[styles.appName, { color: colors.foreground }]}>Yoann2.0</Text>
          </View>
          <Pressable
            onPress={() => router.push('/project/new')}
            style={[styles.headerBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="plus" size={22} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.statsGrid}>
          <StatCard
            label="Projets"
            value={stats.totalProjects}
            icon="folder-multiple-outline"
            accent={colors.primary}
          />
          <StatCard
            label="Tâches"
            value={stats.totalTasks}
            icon="format-list-checks"
            accent="#2196F3"
          />
          <StatCard
            label="En retard"
            value={stats.overdueTasks}
            icon="clock-alert-outline"
            accent={colors.destructive}
          />
          <StatCard
            label="Terminées"
            value={stats.completedTasks}
            icon="check-circle-outline"
            accent="#4CAF50"
          />
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Progression globale</Text>
            <Text style={[styles.progressValue, { color: colors.primary }]}>{stats.globalProgress}%</Text>
          </View>
          <ProgressBar progress={stats.globalProgress} height={8} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.label, { color: colors.foreground }]}>Tâches prioritaires</Text>
          <Pressable onPress={() => router.push('/projects')}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>Voir tout</Text>
          </Pressable>
        </View>

        {priorityTasks.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="check-all" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Aucune tâche urgente
            </Text>
          </View>
        ) : (
          priorityTasks.map(task => {
            const proj = projects.find(p => p.id === task.projectId);
            return <TaskCard key={task.id} task={task} projectName={proj?.name} />;
          })
        )}

        <Text style={[styles.label, { color: colors.foreground, marginTop: 8 }]}>Progression par projet</Text>
        {projectProgress.map(({ project, progress, taskCount }) => (
          <Pressable
            key={project.id}
            onPress={() => router.push(`/project/${project.id}`)}
            style={({ pressed }) => [
              styles.projProgress,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={styles.projProgressHeader}>
              <Text style={[styles.projName, { color: colors.foreground }]} numberOfLines={1}>
                {project.name}
              </Text>
              <Text style={[styles.projPct, { color: colors.primary }]}>
                {Math.round(progress)}%
              </Text>
            </View>
            <ProgressBar progress={progress} height={5} />
            <Text style={[styles.projMeta, { color: colors.mutedForeground }]}>
              {taskCount} tâches · {project.category}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  appName: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 16,
    gap: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  section: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  progressValue: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  label: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  seeAll: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  projProgress: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  projProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projName: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  projPct: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  projMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
