import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { Project } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  active:    '#4CAF50',
  inprogress:'#FF9800',
  planning:  '#2196F3',
  onhold:    '#9E9E9E',
  completed: '#9C27B0',
};

export default function ProjectReportsScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { projects, tasks } = useApp();

  const active = projects.filter(p => !p.archived);

  function openReport(project: Project) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/project-report/${project.id}` as any);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={22} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Rapports Photo</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={active}
        keyExtractor={p => p.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="folder-open-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Aucun projet actif
            </Text>
          </View>
        }
        renderItem={({ item: project }) => {
          const projectTasks  = tasks.filter(t => t.projectId === project.id);
          const doneCount     = projectTasks.filter(t => t.status === 'done').length;
          const photoCount    = projectTasks.reduce((s, t) => s + t.photos.length, 0);
          const statusColor   = STATUS_COLORS[project.status] ?? colors.primary;

          return (
            <Pressable
              onPress={() => openReport(project)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] },
              ]}
            >
              <View style={[styles.colorBar, { backgroundColor: statusColor }]} />
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {project.name}
                </Text>
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                  {projectTasks.length} tâche{projectTasks.length !== 1 ? 's' : ''} · {doneCount} terminée{doneCount !== 1 ? 's' : ''} · {photoCount} photo{photoCount !== 1 ? 's' : ''}
                </Text>
                {project.budget > 0 && (
                  <Text style={[styles.cardBudget, { color: colors.mutedForeground }]}>
                    Budget : {project.budget.toLocaleString('fr-FR')} €
                  </Text>
                )}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.mutedForeground} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  header:      {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  list:        { padding: 16, gap: 12 },
  card: {
    borderRadius: 14, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
  },
  colorBar:  { width: 4, alignSelf: 'stretch', minHeight: 70 },
  cardBody:  { flex: 1, padding: 14, gap: 3 },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  cardSub:   { fontSize: 12, fontFamily: 'Inter_400Regular' },
  cardBudget:{ fontSize: 11, fontFamily: 'Inter_400Regular' },
  empty:     { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
