import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import type { Priority, ProjectStatus } from '@/types';

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

export default function ProjectsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { projects, getProjectTasks, categories } = useApp();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const filtered = projects.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && p.priority !== priorityFilter) return false;
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
    return true;
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Projets</Text>
          <Pressable
            onPress={() => router.push('/project/new')}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="plus" size={22} color={colors.primaryForeground} />
          </Pressable>
        </View>
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
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="folder-open-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>Aucun projet</Text>
            <Pressable
              onPress={() => router.push('/project/new')}
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.emptyBtnLabel, { color: colors.primaryForeground }]}>Créer un projet</Text>
            </Pressable>
          </View>
        ) : (
          filtered.map(p => (
            <ProjectCard key={p.id} project={p} tasks={getProjectTasks(p.id)} />
          ))
        )}
      </ScrollView>
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
});
