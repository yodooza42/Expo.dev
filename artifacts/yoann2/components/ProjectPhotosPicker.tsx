import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
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

type Props = {
  visible: boolean;
  projectName: string;
  photos: string[];
  onClose: () => void;
  onConfirm: (uris: string[]) => void;
};

export function ProjectPhotosPicker({ visible, projectName, photos, onClose, onConfirm }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) setSelected(new Set());
  }, [visible]);

  function toggle(uri: string) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }

  function confirm() {
    if (selected.size === 0) return;
    onConfirm(photos.filter(uri => selected.has(uri)));
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) + 14 },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: `${colors.primary}18` }]}>
              <MaterialCommunityIcons name="folder-image" size={21} color={colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.foreground }]}>Photos du projet</Text>
              <Text numberOfLines={1} style={[styles.projectName, { color: colors.mutedForeground }]}>{projectName}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer"
              testID="close-project-photos-picker" onPress={onClose} hitSlop={8} style={styles.close}>
              <MaterialCommunityIcons name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Sélectionne les photos à associer. Elles resteront aussi dans le projet.
          </Text>

          {photos.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="image-multiple-outline" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Toutes les photos du projet sont déjà liées à cette tâche.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
            >
              {photos.map((uri, index) => {
                const isSelected = selected.has(uri);
                return (
                  <Pressable
                    key={`${uri}:${index}`}
                    testID={`project-photo-option-${index}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={`Photo ${index + 1}${isSelected ? ', sélectionnée' : ''}`}
                    onPress={() => toggle(uri)}
                    style={[
                      styles.photo,
                      { borderColor: isSelected ? colors.primary : colors.border },
                    ]}
                  >
                    <ProjectPhoto uri={uri} style={styles.image} contentFit="cover" />
                    {isSelected && (
                      <View style={[styles.selectedMark, { backgroundColor: colors.primary }]}>
                        <MaterialCommunityIcons name="check" size={14} color={colors.primaryForeground} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.actions}>
            <Pressable testID="cancel-project-photo-association" onPress={onClose}
              style={[styles.cancelButton, { borderColor: colors.border }]}>
              <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Annuler</Text>
            </Pressable>
            <Pressable
              testID="confirm-project-photo-association"
              accessibilityRole="button"
              disabled={selected.size === 0}
              onPress={confirm}
              style={[
                styles.confirmButton,
                { backgroundColor: selected.size ? colors.primary : colors.muted },
              ]}
            >
              <MaterialCommunityIcons
                name="folder-plus-outline"
                size={18}
                color={selected.size ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text style={[
                styles.confirmText,
                { color: selected.size ? colors.primaryForeground : colors.mutedForeground },
              ]}>
                Associer{selected.size ? ` (${selected.size})` : ''}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { maxHeight: '84%', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 10, gap: 12 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  projectName: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  scroll: { minHeight: 120, flexGrow: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 6 },
  photo: { width: '31.5%', aspectRatio: 1, borderWidth: 2, borderRadius: 12, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  selectedMark: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  empty: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  emptyText: { maxWidth: 250, textAlign: 'center', fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  cancelButton: { minHeight: 48, paddingHorizontal: 18, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  confirmButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12 },
  confirmText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
