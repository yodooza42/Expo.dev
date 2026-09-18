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
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProjectCard } from '@/components/ProjectCard';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { Priority, Project, ProjectStatus } from '@/types';

const STATUS_FILTERS: { label: string; value: ProjectStatus | 'all' }[] = [
  { label: 'Tous', value: 'all' },
  { label: 'Idée', value: 'idea' },
  { label: 'À faire', value: 'todo' },
  { label: 'En cours', value: 'inprogress' },
  { label: 'En attente', value: 'waiting' },
  { label: 'Terminé', value: 'done' },
  { label: 'Abandonné', value: 'abandoned' },
];

const PRIORITY_FILTERS: { label: string; value: Priority | 'all' }[] = [
  { label: 'Toutes', value: 'all' },
  { label: 'Faible', value: 'low' },
  { label: 'Moyenne', value: 'medium' },
  { label: 'Haute', value: 'high' },
  { label: 'Critique', value: 'critical' },
];

const STATUS_COLORS: Record<ProjectStatus, string> = {
  idea: '#607D8B',
  todo: '#2196F3',
  inprogress: '#FF9800',
  waiting: '#9E9E9E',
  done: '#4CAF50',
  abandoned: '#F44336',
};

export default function ProjectsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { projects, getProjectTasks, categories, reorderProjects } = useApp();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [reorderMode, setReorderMode] = useState(false);
  const [showArchived, setShowArchived] = useState(false);


  const archivedCount = projects.filter(p => p.archived).length;

  const filtered = projects.filter(p => {
    if (!showArchived && p.archived) return false;
    if (showArchived && !p.archived) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && p.priority !== priorityFilter) return false;
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
    return true;
  });

  const activeFiltered = !showArchived ? filtered : projects.filter(p => {
    if (!p.archived) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    return true;
  });

  function enterReorderMode() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReorderMode(true);
  }

  function exitReorderMode() {
    setReorderMode(false);
  }

  function moveProject(index: number, direction: 'up' | 'down') {
    const newOrder = [...projects];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    reorderProjects(newOrder);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const displayList = showArchived ? activeFiltered : filtered;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Projets</Text>
          <View style={styles.headerBtns}>
            {!reorderMode && archivedCount > 0 && (
              <Pressable
                onPress={() => { setShowArchived(v => !v); setReorderMode(false); }}
                style={[
                  styles.archiveBtn,
                  {
                    backgroundColor: showArchived ? colors.primary + '20' : colors.secondary,
                    borderColor: showArchived ? colors.primary : colors.border,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={showArchived ? 'archive' : 'archive-outline'}
                  size={16}
                  color={showArchived ? colors.primary : colors.mutedForeground}
                />
                <Text style={[styles.archiveBtnLabel, { color: showArchived ? colors.primary : colors.mutedForeground }]}>
                  {archivedCount}
                </Text>
              </Pressable>
            )}
            {!reorderMode && (
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/project-reports' as any); }}
                hitSlop={8}
                style={[styles.reportBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <MaterialCommunityIcons name="printer-outline" size={18} color={colors.primary} />
              </Pressable>
            )}
            {reorderMode ? (
              <Pressable
                onPress={exitReorderMode}
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="check" size={22} color={colors.primaryForeground} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.push('/project/new')}
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="plus" size={22} color={colors.primaryForeground} />
              </Pressable>
            )}
          </View>
        </View>

        {reorderMode ? (
          <View style={[styles.reorderBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="swap-vertical" size={16} color={colors.primary} />
            <Text style={[styles.reorderTxt, { color: colors.mutedForeground }]}>
              Maintenez et utilisez les flèches pour réorganiser
            </Text>
          </View>
        ) : (
          <>
            {showArchived && (
              <View style={[styles.archiveBanner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
                <MaterialCommunityIcons name="archive" size={14} color={colors.primary} />
                <Text style={[styles.archiveBannerTxt, { color: colors.primary }]}>
                  Projets archivés ({archivedCount})
                </Text>
              </View>
            )}
            <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="magnify" size={18} color={colors.mutedForeground} />
              <TextInput
                placeholder="Rechercher un projet…"
                placeholderTextColor={colors.mutedForeground}
                value={search}
                onChangeText={setSearch}
                style={[styles.searchInput, { color: colors.foreground }]}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 6, paddingRight: 16 }}>
              {STATUS_FILTERS.map(f => (
                <Pressable
                  key={f.value}
                  onPress={() => setStatusFilter(f.value)}
                  style={[
                    styles.filterChip,
                    statusFilter === f.value
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: colors.secondary, borderColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterLabel,
                      { color: statusFilter === f.value ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 6, paddingRight: 16 }}>
              {[{ label: 'Toutes catégories', value: 'all' }, ...categories.map(c => ({ label: c.name, value: c.name }))].map(f => (
                <Pressable
                  key={f.value}
                  onPress={() => setCategoryFilter(f.value)}
                  style={[
                    styles.filterChip,
                    categoryFilter === f.value
                      ? { backgroundColor: colors.secondary, borderColor: colors.primary }
                      : { backgroundColor: colors.secondary, borderColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterLabel,
                      { color: categoryFilter === f.value ? colors.primary : colors.mutedForeground },
                    ]}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {reorderMode ? (
          projects.filter(p => !p.archived).length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>Aucun projet à réorganiser</Text>
            </View>
          ) : (
            projects.filter(p => !p.archived).map((p, index) => (
              <ReorderRow
                key={p.id}
                project={p}
                index={index}
                total={projects.filter(q => !q.archived).length}
                colors={colors}
                onMove={moveProject}
              />
            ))
          )
        ) : displayList.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name={showArchived ? 'archive-outline' : 'folder-open-outline'} size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>
              {showArchived ? 'Aucun projet archivé' : 'Aucun projet'}
            </Text>
            {!showArchived && (
              <Pressable
                onPress={() => router.push('/project/new')}
                style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.emptyBtnLabel, { color: colors.primaryForeground }]}>Créer un projet</Text>
              </Pressable>
            )}
          </View>
        ) : (
          displayList.map(p => (
            <View key={p.id} style={showArchived ? styles.archivedWrapper : undefined}>
              <ProjectCard
                project={p}
                tasks={getProjectTasks(p.id)}
                onLongPress={showArchived ? undefined : enterReorderMode}
              />
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function ReorderRow({
  project,
  index,
  total,
  colors,
  onMove,
}: {
  project: Project;
  index: number;
  total: number;
  colors: ReturnType<typeof useColors>;
  onMove: (index: number, direction: 'up' | 'down') => void;
}) {
  const STATUS_COLORS_LOCAL: Record<ProjectStatus, string> = {
    idea: '#607D8B',
    todo: '#2196F3',
    inprogress: '#FF9800',
    waiting: '#9E9E9E',
    done: '#4CAF50',
    abandoned: '#F44336',
  };
  const dot = STATUS_COLORS_LOCAL[project.status];

  return (
    <View style={[styles.reorderRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.reorderDot, { backgroundColor: dot }]} />
      <Text style={[styles.reorderName, { color: colors.foreground }]} numberOfLines={1}>{project.name}</Text>
      <View style={styles.reorderBtns}>
        <Pressable
          onPress={() => onMove(index, 'up')}
          disabled={index === 0}
          style={[styles.arrowBtn, index === 0 && { opacity: 0.25 }]}
          hitSlop={6}
        >
          <MaterialCommunityIcons name="chevron-up" size={26} color={colors.primary} />
        </Pressable>
        <Pressable
          onPress={() => onMove(index, 'down')}
          disabled={index === total - 1}
          style={[styles.arrowBtn, index === total - 1 && { opacity: 0.25 }]}
          hitSlop={6}
        >
          <MaterialCommunityIcons name="chevron-down" size={26} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  archiveBtnLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  archiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  archiveBannerTxt: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  filterRow: {
    flexShrink: 0,
  },
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
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  emptyBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyBtnLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  reorderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  reorderTxt: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
    gap: 12,
  },
  reorderDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  reorderName: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  reorderBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  arrowBtn: {
    padding: 4,
  },
  archivedWrapper: {
    opacity: 0.6,
  },
});
