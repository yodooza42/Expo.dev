import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProjectPhoto } from '@/components/ProjectPhoto';
import { useColors } from '@/hooks/useColors';
import type { Task } from '@/types';
import { subTaskPhotoAssignmentKey } from '@/utils/projectPhotoLinks';

const photoWidth = (Dimensions.get('window').width - 64) / 3;

interface Props {
  projectName: string;
  photos: string[];
  tasks: Task[];
  onClose: () => void;
  onSave: (assignments: Record<string, string>) => void;
}

interface Destination {
  key: string | null;
  taskTitle: string;
  title: string;
}

export function ProjectPhotoDistributionModal({ projectName, photos, tasks, onClose, onSave }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const destinations = useMemo<Destination[]>(() => [
    { key: null, taskTitle: '', title: 'Non réparties' },
    ...tasks.flatMap(task => (task.subTasks ?? []).map(subTask => ({
      key: subTaskPhotoAssignmentKey(task.id, subTask.id),
      taskTitle: task.title,
      title: subTask.title,
    }))),
  ], [tasks]);
  const [assignments, setAssignments] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const photo of photos) {
      for (const task of tasks) {
        const subTask = task.subTasks?.find(item => item.photoUris?.includes(photo));
        if (subTask) {
          initial[photo] = subTaskPhotoAssignmentKey(task.id, subTask.id);
          break;
        }
      }
    }
    return initial;
  });
  const [activeDestination, setActiveDestination] = useState<string | null>(
    () => destinations.find(item => item.key !== null)?.key ?? null,
  );
  const activeItem = destinations.find(item => item.key === activeDestination) ?? destinations[0];
  const assignedCount = photos.filter(photo => (assignments[photo] ?? null) === activeDestination).length;

  function togglePhoto(photo: string) {
    setAssignments(previous => {
      const current = previous[photo] ?? null;
      if (current === activeDestination) {
        if (current === null) return previous;
        const next = { ...previous };
        delete next[photo];
        return next;
      }
      if (activeDestination === null) return previous;
      return { ...previous, [photo]: activeDestination };
    });
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer la répartition des photos"
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
        />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>Répartir les photos</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Projet · {projectName}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              testID="close-project-photo-distribution"
              onPress={onClose}
              hitSlop={10}
            >
              <MaterialCommunityIcons name="close" size={23} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <Text style={[styles.instruction, { color: colors.mutedForeground }]}>
            Choisis une sous-tâche, puis touche les photos à lui associer. Dans « Non réparties », touche une photo pour la détacher.
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.destinations}>
            {destinations.map(destination => {
              const active = destination.key === activeDestination;
              const count = photos.filter(photo => (assignments[photo] ?? null) === destination.key).length;
              return (
                <Pressable
                  key={destination.key ?? 'unassigned'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${destination.title}${destination.taskTitle ? `, tâche ${destination.taskTitle}` : ''}, ${count} photo(s)`}
                  testID={`project-photo-destination-${destination.key ?? 'unassigned'}`}
                  onPress={() => setActiveDestination(destination.key)}
                  style={[styles.destination, {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary + '22' : colors.background,
                  }]}
                >
                  <Text numberOfLines={1} style={[styles.destinationTitle, { color: active ? colors.primary : colors.foreground }]}>
                    {destination.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.destinationSubtitle, { color: colors.mutedForeground }]}>
                    {destination.taskTitle || 'À garder dans le projet'} · {count}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={[styles.countLabel, { color: colors.mutedForeground }]}>
            {assignedCount} photo{assignedCount > 1 ? 's' : ''} pour « {activeItem?.title ?? 'Non réparties'} »
          </Text>

          <ScrollView
            style={styles.photoScroll}
            contentContainerStyle={styles.photoGrid}
            showsVerticalScrollIndicator
            persistentScrollbar
          >
            {photos.map((photo, index) => {
              const assignedKey = assignments[photo] ?? null;
              const destination = destinations.find(item => item.key === assignedKey);
              const active = assignedKey === activeDestination && assignedKey !== null;
              return (
                <Pressable
                  key={photo}
                  accessibilityRole="button"
                  accessibilityLabel={`Photo ${index + 1}, ${destination?.title ?? 'non répartie'}`}
                  accessibilityState={{ selected: active }}
                  testID={`project-photo-distribution-photo-${index}`}
                  onPress={() => togglePhoto(photo)}
                  style={[styles.photoCard, {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: colors.background,
                  }]}
                >
                  <View style={styles.photoImageWrap}>
                    <ProjectPhoto uri={photo} style={styles.photoImage} contentFit="cover" />
                    {active && (
                      <View style={[styles.check, { backgroundColor: colors.primary }]}>
                        <MaterialCommunityIcons name="check" size={14} color={colors.primaryForeground} />
                      </View>
                    )}
                  </View>
                  <Text numberOfLines={1} style={[styles.photoTitle, { color: colors.foreground }]}>
                    Photo {index + 1}
                  </Text>
                  <Text numberOfLines={1} style={[styles.photoSubtitle, { color: colors.mutedForeground }]}>
                    {destination ? `${destination.taskTitle} · ${destination.title}` : 'Non répartie'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              testID="cancel-project-photo-distribution"
              onPress={onClose}
              style={[styles.cancelButton, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>Annuler</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              testID="save-project-photo-distribution"
              onPress={() => onSave(assignments)}
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
            >
              <MaterialCommunityIcons name="content-save-outline" size={18} color={colors.primaryForeground} />
              <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }}>Enregistrer</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: { height: '88%', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 10, gap: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  instruction: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  destinations: { gap: 8, paddingVertical: 2 },
  destination: { maxWidth: 220, minWidth: 135, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderRadius: 12 },
  destinationTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  destinationSubtitle: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3 },
  countLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  photoScroll: { flex: 1, minHeight: 0 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 6 },
  photoCard: { width: photoWidth, padding: 4, borderWidth: 1.5, borderRadius: 10 },
  photoImageWrap: { width: '100%', aspectRatio: 1, borderRadius: 7, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%' },
  check: { position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  photoTitle: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 4 },
  photoSubtitle: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  cancelButton: { minHeight: 48, paddingHorizontal: 16, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12 },
});
