import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { GalleryRecoveryAsset } from '@/types/galleryRecovery';
import { resolveRecoveryAsset } from '@/utils/galleryPhotoRecovery';

/** Explicit dimensions: percentage widths + absolute children can collapse in native sheets. */
export function GalleryRecoveryThumbnail({ asset, size, selected = false, onSelect, onUnavailable }: {
  asset: GalleryRecoveryAsset;
  size: number;
  selected?: boolean;
  onSelect?: () => void;
  onUnavailable?: () => void;
}) {
  const colors = useColors();
  const [uri, setUri] = useState(asset.uri);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState('Aperçu inaccessible');
  const alive = useRef(true);
  const resolved = useRef(false);
  const resolving = useRef(false);
  const unavailable = useRef(onUnavailable);
  unavailable.current = onUnavailable;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (state !== 'loading') return;
    const timer = setTimeout(() => {
      setState('error');
      setMessage('Chargement trop long');
      unavailable.current?.();
    }, 15000);
    return () => clearTimeout(timer);
  }, [state, uri, attempt]);

  const fail = async () => {
    if (resolving.current) return;
    if (!resolved.current) {
      resolved.current = true;
      resolving.current = true;
      try {
        // Android gallery references can require the local/content URI returned by MediaLibrary.
        const local = await resolveRecoveryAsset(asset);
        if (!alive.current) return;
        if (local.uri && local.uri !== uri) {
          setUri(local.uri);
          setState('loading');
          return;
        }
      } catch (error) {
        if (alive.current) setMessage(error instanceof Error ? error.message : 'Accès à la photo impossible');
      } finally {
        resolving.current = false;
      }
    }
    if (alive.current) {
      setState('error');
      unavailable.current?.();
    }
  };

  return (
    <View style={{ width: size, gap: 4 }}>
      <Pressable
        testID={`recovery-candidate-${asset.assetId}`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${asset.filename}, ${state === 'error' ? 'aperçu inaccessible, réessayer' : 'sélectionner la photo'}`}
        onPress={() => {
          if (state === 'ready') onSelect?.();
          else if (state === 'error') {
            resolved.current = false;
            setMessage('Aperçu inaccessible');
            setState('loading');
            setAttempt(value => value + 1);
          }
        }}
        style={{
          width: size, height: size, borderRadius: 8, overflow: 'hidden', borderWidth: 2,
          borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.muted,
        }}>
        <Image key={`${uri}:${attempt}`} source={{ uri }} style={{ width: size - 4, height: size - 4 }}
          contentFit="cover" recyclingKey={asset.assetId}
          onLoad={() => { if (alive.current) setState('ready'); }}
          onError={() => { void fail(); }} />
        {state !== 'ready' && (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted, gap: 4 }]}>
            {state === 'loading' ? <ActivityIndicator color={colors.primary} /> : <>
              <MaterialCommunityIcons name="image-off-outline" size={22} color={colors.mutedForeground} />
              <Text style={{ color: colors.foreground, fontSize: 10 }}>Réessayer</Text>
            </>}
          </View>
        )}
        {selected && state === 'ready' && (
          <View style={{ position: 'absolute', top: 4, right: 4, borderRadius: 10, backgroundColor: colors.primary }}>
            <MaterialCommunityIcons name="check" size={20} color={colors.primaryForeground} />
          </View>
        )}
      </Pressable>
      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 10 }}>{asset.filename}</Text>
      {state === 'error' && <Text numberOfLines={3} style={{ color: colors.destructive, fontSize: 10 }}>{message}</Text>}
    </View>
  );
}
