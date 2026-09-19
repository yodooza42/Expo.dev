import * as MediaLibrary from 'expo-media-library';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image as RNImage,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';

type GalleryPhotoPickerProps = {
  visible: boolean;
  title: string;
  referenceDate: Date | null;
  onClose: () => void;
  onAddAssets: (assets: MediaLibrary.Asset[]) => void | Promise<void>;
  onBrowseAll: () => void | Promise<void>;
};

function getLocalDayBounds(date: Date): { start: number; end: number } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() - 1 };
}

export function GalleryPhotoPicker({
  visible,
  title,
  referenceDate,
  onClose,
  onAddAssets,
  onBrowseAll,
}: GalleryPhotoPickerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const referenceDay = useMemo(
    () => referenceDate ? referenceDate.getTime() : null,
    [referenceDate],
  );
  const referenceLabel = referenceDate
    ? referenceDate.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    : null;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setAssets([]);
    setSelected(new Set());
    setPermissionDenied(false);

    async function loadDayAssets() {
      if (Platform.OS === 'web' || !referenceDate) return;
      setLoading(true);
      try {
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) {
          if (!cancelled) setPermissionDenied(true);
          return;
        }
        const { start, end } = getLocalDayBounds(referenceDate);
        const result = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          createdAfter: start,
          createdBefore: end,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
          first: 200,
        });
        if (!cancelled) setAssets(result.assets);
      } catch {
        if (!cancelled) setPermissionDenied(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDayAssets();
    return () => { cancelled = true; };
  }, [visible, referenceDay]);

  function toggleAsset(id: string) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmSelection() {
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);
    try {
      await onAddAssets(assets.filter(asset => selected.has(asset.id)));
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 16,
            maxHeight: '82%',
            paddingBottom: insets.bottom + 16,
          }}
          onStartShouldSetResponder={() => true}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: 'Inter_700Bold' }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={{ color: colors.mutedForeground, fontSize: 24, lineHeight: 24 }}>×</Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 12 }}>
            {referenceLabel
              ? `Photos prises le ${referenceLabel}. Touche pour sélectionner.`
              : 'Choisis une date pour mettre des photos en avant.'}
          </Text>

          {loading ? (
            <View style={{ minHeight: 150, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 8 }}>Recherche des photos…</Text>
            </View>
          ) : permissionDenied ? (
            <View style={{ minHeight: 110, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: 'center' }}>
                L’accès aux photos du jour n’est pas disponible.
              </Text>
            </View>
          ) : assets.length === 0 ? (
            <View style={{ minHeight: 110, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: 'center' }}>
                Aucune photo trouvée pour cette date.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {assets.map(asset => {
                const isSelected = selected.has(asset.id);
                return (
                  <Pressable
                    key={asset.id}
                    onPress={() => toggleAsset(asset.id)}
                    style={{ width: 96, height: 96, borderRadius: 10, overflow: 'hidden' }}
                  >
                    <RNImage source={{ uri: asset.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    <View style={{
                      position: 'absolute',
                      inset: 0,
                      borderWidth: isSelected ? 3 : 0,
                      borderColor: colors.primary,
                      backgroundColor: isSelected ? `${colors.primary}38` : 'transparent',
                      borderRadius: 10,
                    }} />
                    <View style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: isSelected ? colors.primary : 'rgba(0,0,0,0.45)',
                      borderWidth: isSelected ? 0 : 1.5,
                      borderColor: '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {isSelected && <Text style={{ color: colors.primaryForeground, fontSize: 13, fontWeight: '700' }}>✓</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Pressable
              onPress={() => { onClose(); void onBrowseAll(); }}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: colors.muted }}
            >
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 13 }}>
                Parcourir toute la galerie
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void confirmSelection()}
              disabled={selected.size === 0 || submitting}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: selected.size === 0 ? colors.muted : colors.primary,
              }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={{
                  color: selected.size === 0 ? colors.mutedForeground : colors.primaryForeground,
                  fontFamily: 'Inter_600SemiBold',
                  fontSize: 13,
                }}>
                  Associer{selected.size > 0 ? ` (${selected.size})` : ''}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}