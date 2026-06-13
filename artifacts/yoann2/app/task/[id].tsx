import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PriorityBadge } from '@/components/PriorityBadge';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { TaskStatus } from '@/types';

const { width } = Dimensions.get('window');

const STATUSES: TaskStatus[] = ['idea', 'todo', 'inprogress', 'waiting', 'done'];
const STATUS_LABELS: Record<TaskStatus, string> = {
  idea: 'Idée', todo: 'À faire', inprogress: 'En cours', waiting: 'En attente', done: 'Terminé',
};
const EISENHOWER_LABELS: Record<string, string> = {
  do_now: 'À faire maintenant', schedule: 'Planifier', delegate: 'Déléguer', eliminate: 'Supprimer',
};
const EISENHOWER_COLORS: Record<string, string> = {
  do_now: '#F44336', schedule: '#2196F3', delegate: '#FF9800', eliminate: '#9E9E9E',
};

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tasks, projects, updateTask, deleteTask } = useApp();

  const taskMaybe = tasks.find(t => t.id === id);
  const project = taskMaybe ? projects.find(p => p.id === taskMaybe.projectId) : null;
  const [photoViewIdx, setPhotoViewIdx] = useState<number | null>(null);

  if (!taskMaybe) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground, padding: 20 }}>Tâche introuvable.</Text>
      </View>
    );
  }
  const task = taskMaybe;

  const dueDate = new Date(task.dueDate);
  const isOverdue = dueDate < new Date() && task.status !== 'done';
  const eisColor = EISENHOWER_COLORS[task.eisenhower];

  function handleDelete() {
    Alert.alert('Supprimer', 'Supprimer cette tâche ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => { deleteTask(task.id); router.back(); },
      },
    ]);
  }

  function toggleDone() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>Détail tâche</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push(`/task/new?id=${task.id}`)} hitSlop={8}>
            <MaterialCommunityIcons name="pencil-outline" size={22} color={colors.primary} />
          </Pressable>
          <Pressable onPress={handleDelete} hitSlop={8}>
            <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.destructive} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Pressable onPress={toggleDone} hitSlop={8}>
              <MaterialCommunityIcons
                name={task.status === 'done' ? 'check-circle' : 'circle-outline'}
                size={28}
                color={task.status === 'done' ? '#4CAF50' : colors.mutedForeground}
              />
            </Pressable>
            <Text
              style={[
                styles.title,
                { color: colors.foreground },
                task.status === 'done' && { textDecorationLine: 'line-through', color: colors.mutedForeground },
              ]}
            >
              {task.title}
            </Text>
          </View>

          {project && (
            <Pressable onPress={() => router.push(`/project/${project.id}`)}>
              <View style={[styles.projLink, { backgroundColor: colors.primary + '20' }]}>
                <MaterialCommunityIcons name="folder-outline" size={16} color={colors.primary} />
                <Text style={[styles.projLinkTxt, { color: colors.primary }]}>{project.name}</Text>
                <MaterialCommunityIcons name="chevron-right" size={14} color={colors.primary} />
              </View>
            </Pressable>
          )}

          <View style={styles.badges}>
            <PriorityBadge priority={task.priority} />
            <View style={[styles.statusBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.statusTxt, { color: colors.foreground }]}>{STATUS_LABELS[task.status]}</Text>
            </View>
            {isOverdue && (
              <View style={[styles.statusBadge, { backgroundColor: colors.destructive + '20', borderColor: colors.destructive }]}>
                <MaterialCommunityIcons name="clock-alert-outline" size={12} color={colors.destructive} />
                <Text style={[styles.statusTxt, { color: colors.destructive }]}>En retard</Text>
              </View>
            )}
          </View>

          <View style={[styles.infoGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.infoItem, { borderBottomColor: colors.border }]}>
              <MaterialCommunityIcons name="calendar-clock" size={16} color={colors.primary} />
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Échéance</Text>
              <Text style={[styles.infoValue, { color: isOverdue ? colors.destructive : colors.foreground }]}>
                {dueDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
            <View style={[styles.infoItem, { borderBottomColor: colors.border }]}>
              <MaterialCommunityIcons name="calendar-plus" size={16} color={colors.primary} />
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Créée le</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {new Date(task.createdAt).toLocaleDateString('fr-FR')}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <MaterialCommunityIcons name="matrix" size={16} color={eisColor} />
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Eisenhower</Text>
              <Text style={[styles.infoValue, { color: eisColor }]}>{EISENHOWER_LABELS[task.eisenhower]}</Text>
            </View>
          </View>

          <View style={[styles.scoreRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.scoreItem}>
              <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>Importance</Text>
              <Text style={[styles.scoreValue, { color: colors.foreground }]}>{task.importance}/5</Text>
            </View>
            <View style={[styles.scoreDivider, { backgroundColor: colors.border }]} />
            <View style={styles.scoreItem}>
              <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>Urgence</Text>
              <Text style={[styles.scoreValue, { color: colors.foreground }]}>{task.urgency}/5</Text>
            </View>
          </View>

          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Statut</Text>
            <View style={styles.statusRow}>
              {STATUSES.map(s => (
                <Pressable
                  key={s}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateTask(task.id, { status: s }); }}
                  style={[
                    styles.statusChip,
                    task.status === s ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                  ]}
                >
                  <Text style={[styles.statusChipTxt, { color: task.status === s ? colors.primaryForeground : colors.mutedForeground }]}>
                    {STATUS_LABELS[s]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {task.description.length > 0 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Description</Text>
              <Text style={[styles.body2, { color: colors.mutedForeground }]}>{task.description}</Text>
            </View>
          )}

          {task.notes.length > 0 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Notes</Text>
              <View style={[styles.notesBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.body2, { color: colors.foreground }]}>{task.notes}</Text>
              </View>
            </View>
          )}

          {task.photos.length > 0 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Photos</Text>
              <View style={styles.photoGrid}>
                {task.photos.map((uri, idx) => (
                  <Pressable key={idx} onPress={() => setPhotoViewIdx(idx)} style={styles.photoThumb}>
                    <Image source={{ uri }} style={styles.photoImg} contentFit="cover" />
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={photoViewIdx !== null} animationType="fade" transparent>
        <View style={[styles.photoModal, { backgroundColor: 'rgba(0,0,0,0.95)' }]}>
          <Pressable onPress={() => setPhotoViewIdx(null)} style={styles.photoClose}>
            <MaterialCommunityIcons name="close" size={26} color="#fff" />
          </Pressable>
          {photoViewIdx !== null && task.photos[photoViewIdx] && (
            <Image source={{ uri: task.photos[photoViewIdx] }} style={styles.photoFull} contentFit="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}

const THUMB = (width - 48) / 3;
const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, gap: 10,
  },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  headerActions: { flexDirection: 'row', gap: 16 },
  body: { padding: 16, gap: 16 },
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  title: { flex: 1, fontSize: 20, fontFamily: 'Inter_600SemiBold', lineHeight: 28 },
  projLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, alignSelf: 'flex-start' },
  projLinkTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  infoGrid: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  infoLabel: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  infoValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'right', flexShrink: 1, flexWrap: 'wrap' },
  scoreRow: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  scoreItem: { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 4 },
  scoreDivider: { width: 1 },
  scoreLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  scoreValue: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  statusChipTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  body2: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 22 },
  notesBox: { padding: 14, borderRadius: 12, borderWidth: 1 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumb: { width: THUMB, height: THUMB, borderRadius: 10, overflow: 'hidden' },
  photoImg: { width: '100%', height: '100%' },
  photoModal: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photoClose: { position: 'absolute', top: 60, right: 20, zIndex: 10 },
  photoFull: { width, height: width * 1.2 },
});
