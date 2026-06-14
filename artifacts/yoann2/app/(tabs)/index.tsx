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
  const { projects, tasks, appointments, getStats, getProjectTasks } = useApp();

  const stats = getStats();
  const now = new Date();
  const todayStr = now.toDateString();

  const activeProjects = useMemo(() => projects.filter(p => !p.archived), [projects]);

  const alerts = useMemo(() => {
    const list: { type: 'overdue_proj' | 'budget' | 'critical'; label: string; id: string }[] = [];
    for (const p of activeProjects) {
      if (p.dueDate && new Date(p.dueDate) < now && p.status !== 'done' && p.status !== 'abandoned') {
        list.push({ type: 'overdue_proj', label: p.name, id: p.id });
      }
      if (p.budget > 0 && p.spent > p.budget) {
        list.push({ type: 'budget', label: p.name, id: p.id });
      }
    }
    for (const t of tasks) {
      if (t.priority === 'critical' && t.status !== 'done') {
        list.push({ type: 'critical', label: t.title, id: t.projectId });
      }
    }
    return list.slice(0, 5);
  }, [activeProjects, tasks]);

  const todayTasks = useMemo(() => {
    return tasks
      .filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate).toDateString() === todayStr)
      .sort((a, b) => {
        const o = { critical: 0, high: 1, medium: 2, low: 3 };
        return o[a.priority] - o[b.priority];
      })
      .slice(0, 3);
  }, [tasks]);

  const nextAppointment = useMemo(() => {
    return appointments
      .filter(a => {
        const d = new Date(a.date + 'T' + (a.time || '00:00'));
        return d >= now;
      })
      .sort((a, b) => {
        const da = new Date(a.date + 'T' + (a.time || '00:00'));
        const db = new Date(b.date + 'T' + (b.time || '00:00'));
        return da.getTime() - db.getTime();
      })[0] ?? null;
  }, [appointments]);

  const priorityTasks = useMemo(() => {
    return tasks
      .filter(t => t.status !== 'done')
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const pa = priorityOrder[a.priority];
        const pb = priorityOrder[b.priority];
        if (pa !== pb) return pa - pb;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      })
      .slice(0, 4);
  }, [tasks]);

  const projectProgress = useMemo(() => {
    return activeProjects.map(p => {
      const pt = getProjectTasks(p.id);
      const done = pt.filter(t => t.status === 'done').length;
      const progress = pt.length > 0 ? (done / pt.length) * 100 : 0;
      const overdue = pt.some(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now);
      const budgetOk = p.budget === 0 || p.spent <= p.budget;
      return { project: p, progress, taskCount: pt.length, overdue, budgetOk };
    });
  }, [activeProjects, getProjectTasks]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const ALERT_CONFIG = {
    overdue_proj: { icon: 'clock-alert-outline', color: '#FF5722', label: 'En retard' },
    budget: { icon: 'cash-remove', color: '#F44336', label: 'Budget dépassé' },
    critical: { icon: 'alert-circle-outline', color: '#E91E63', label: 'Critique' },
  };

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
        <View style={[styles.headerContent, { alignItems: 'flex-end' }]}>
          <View>
            <Text style={[styles.appName, { color: colors.foreground }]}>Yoann2.0</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, textTransform: 'capitalize' }}>
              {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
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
          <StatCard label="Projets" value={stats.totalProjects} icon="folder-multiple-outline" accent={colors.primary} />
          <StatCard label="Tâches" value={stats.totalTasks} icon="format-list-checks" accent="#2196F3" />
          <StatCard label="En retard" value={stats.overdueTasks} icon="clock-alert-outline" accent={colors.destructive} />
          <StatCard label="Terminées" value={stats.completedTasks} icon="check-circle-outline" accent="#4CAF50" />
        </View>

        {alerts.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="alert-circle" size={16} color="#F44336" />
                <Text style={[styles.label, { color: colors.foreground }]}>Alertes</Text>
              </View>
              <View style={[styles.alertBadge, { backgroundColor: '#F4433618' }]}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: '#F44336' }}>{alerts.length}</Text>
              </View>
            </View>
            <View style={styles.alertList}>
              {alerts.map((alert, i) => {
                const cfg = ALERT_CONFIG[alert.type];
                return (
                  <Pressable
                    key={i}
                    onPress={() => alert.id && router.push(`/project/${alert.id}`)}
                    style={({ pressed }) => [
                      styles.alertCard,
                      { backgroundColor: cfg.color + '15', borderColor: cfg.color + '40' },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <MaterialCommunityIcons name={cfg.icon as any} size={18} color={cfg.color} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alertType, { color: cfg.color }]}>{cfg.label}</Text>
                      <Text style={[styles.alertLabel, { color: colors.foreground }]} numberOfLines={1}>{alert.label}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={16} color={cfg.color} />
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {(todayTasks.length > 0 || nextAppointment) && (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="calendar-today" size={16} color={colors.primary} />
                <Text style={[styles.label, { color: colors.foreground }]}>Aujourd'hui</Text>
              </View>
            </View>

            {nextAppointment && (
              <Pressable
                onPress={() => router.push('/calendar' as any)}
                style={({ pressed }) => [
                  styles.apptCard,
                  { backgroundColor: colors.card, borderColor: colors.primary + '40' },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <MaterialCommunityIcons name="calendar-clock" size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.apptTitle, { color: colors.foreground }]} numberOfLines={1}>{nextAppointment.title}</Text>
                  <Text style={[styles.apptSub, { color: colors.mutedForeground }]}>
                    {new Date(nextAppointment.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {nextAppointment.time ? ` · ${nextAppointment.time}` : ''}
                    {nextAppointment.location ? ` · ${nextAppointment.location}` : ''}
                  </Text>
                </View>
              </Pressable>
            )}

            {todayTasks.map(task => {
              const proj = projects.find(p => p.id === task.projectId);
              return <TaskCard key={task.id} task={task} projectName={proj?.name} />;
            })}

            {todayTasks.length === 0 && !nextAppointment && null}
          </>
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.label, { color: colors.foreground }]}>Tâches prioritaires</Text>
          <Pressable onPress={() => router.push('/projects' as any)}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>Voir tout</Text>
          </Pressable>
        </View>

        {priorityTasks.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="check-all" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucune tâche urgente</Text>
          </View>
        ) : (
          priorityTasks.map(task => {
            const proj = projects.find(p => p.id === task.projectId);
            return <TaskCard key={task.id} task={task} projectName={proj?.name} />;
          })
        )}

        {projectProgress.length > 0 && (
          <>
            <Text style={[styles.label, { color: colors.foreground, marginTop: 8 }]}>Progression par projet</Text>
            {projectProgress.map(({ project, progress, taskCount, overdue, budgetOk }) => (
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                    <Text style={[styles.projName, { color: colors.foreground }]} numberOfLines={1}>
                      {project.name}
                    </Text>
                    {overdue && (
                      <MaterialCommunityIcons name="clock-alert-outline" size={13} color="#FF5722" />
                    )}
                    {!budgetOk && (
                      <MaterialCommunityIcons name="cash-remove" size={13} color="#F44336" />
                    )}
                  </View>
                  <Text style={[styles.projPct, { color: colors.primary }]}>{Math.round(progress)}%</Text>
                </View>
                <ProgressBar progress={progress} height={5} />
                <Text style={[styles.projMeta, { color: colors.mutedForeground }]}>
                  {taskCount} tâches · {project.category}
                </Text>
              </Pressable>
            ))}
          </>
        )}
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
  appName: {
    fontSize: 32,
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
    gap: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  label: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  seeAll: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  alertList: {
    gap: 6,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  alertType: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  alertLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    marginTop: 1,
  },
  apptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  apptTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  apptSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
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
