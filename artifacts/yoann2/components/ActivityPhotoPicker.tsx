import * as MediaLibrary from 'expo-media-library';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useColors } from '@/hooks/useColors';
import { fmtHHMM, fmtWeekdayShort } from '@/utils/date';

export function ActivityPhotoPicker({
  visible, startTime, endTime, busy, multiple, onClose, onPick, onBrowse,
}: {
  visible: boolean; startTime: number; endTime: number; busy: boolean; multiple: boolean;
  onClose: () => void; onPick: (assets: MediaLibrary.Asset[]) => void; onBrowse: () => void;
}) {
  const colors = useColors();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [limited, setLimited] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const requestVersion = useRef(0);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    requestVersion.current++;
    setAssets([]); setMore(false); setCursor(undefined); setError(''); setLimited(false);
    setSelected(new Set());
    if (Platform.OS === 'web') {
      setError('Les suggestions de la galerie sont disponibles sur ton téléphone.');
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
        if (!active) return;
        if (!permission.granted) {
          setError('Accès aux photos non autorisé. Tu peux utiliser le sélecteur de la galerie ci-dessous.');
          return;
        }
        setLimited(permission.accessPrivileges === 'limited');
        const result = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo', createdAfter: startTime - 1, createdBefore: endTime + 1,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]], first: 60,
        });
        if (active) {
          setAssets(result.assets); setCursor(result.endCursor); setMore(result.hasNextPage);
        }
      } catch {
        if (active) setError('Impossible de charger les suggestions. Tu peux choisir une photo dans la galerie.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; requestVersion.current++; };
  }, [visible, startTime, endTime, multiple]);
  const loadMore = async () => {
    if (loading || !more || !cursor) return;
    setLoading(true); setError('');
    const version = requestVersion.current;
    try {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo', createdAfter: startTime - 1, createdBefore: endTime + 1,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]], first: 60, after: cursor,
      });
      if (version !== requestVersion.current) return;
      setAssets(previous => [...previous, ...result.assets.filter(asset => !previous.some(item => item.id === asset.id))]);
      setMore(result.hasNextPage && result.endCursor !== cursor); setCursor(result.endCursor);
    } catch { if (version === requestVersion.current) setError('Impossible de charger les photos suivantes. Réessaie ou ouvre la galerie.'); }
    finally { if (version === requestVersion.current) setLoading(false); }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Photos de l’activité">
      <Text style={{ color: colors.mutedForeground }}>Photos prises entre {fmtWeekdayShort(startTime)} {fmtHHMM(startTime)} et {fmtWeekdayShort(endTime)} {fmtHHMM(endTime)}.</Text>
      {limited && <Text style={{ color: colors.mutedForeground }}>Accès limité : seules les photos autorisées peuvent être proposées.</Text>}
      {!!error && <Text style={{ color: colors.mutedForeground }}>{error}</Text>}
      <View style={styles.grid}>
        {assets.map(asset => <Pressable
          key={asset.id} disabled={busy} onPress={() => {
            if (!multiple) { onPick([asset]); return; }
            setSelected(previous => {
              const next = new Set(previous);
              if (next.has(asset.id)) next.delete(asset.id); else next.add(asset.id);
              return next;
            });
          }}
          accessibilityRole={multiple ? 'checkbox' : 'button'}
          accessibilityState={{ checked: multiple ? selected.has(asset.id) : undefined, disabled: busy }}
          accessibilityLabel={`Joindre la photo du ${fmtWeekdayShort(asset.creationTime)} à ${fmtHHMM(asset.creationTime)}`}
          style={[styles.asset, { opacity: busy ? 0.5 : 1 }]}
        >
          <Image source={{ uri: asset.uri }} resizeMode="cover" resizeMethod="resize" style={styles.image} />
          {multiple && <Text style={{ color: selected.has(asset.id) ? colors.primary : colors.mutedForeground }}>{selected.has(asset.id) ? '✓ Sélectionnée' : 'Sélectionner'}</Text>}
          <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{fmtWeekdayShort(asset.creationTime)} · {fmtHHMM(asset.creationTime)}</Text>
        </Pressable>)}
      </View>
      {(loading || busy) && <ActivityIndicator color={colors.primary} />}
      {!loading && !error && assets.length === 0 && <Text style={{ color: colors.mutedForeground }}>Aucune photo trouvée pendant cette activité.</Text>}
      {more && <Pressable disabled={loading || busy} onPress={() => { void loadMore(); }} style={styles.button}>
        <Text style={{ color: colors.primary }}>Voir plus de photos</Text>
      </Pressable>}
      {multiple && <Pressable
        disabled={busy || selected.size === 0}
        onPress={() => onPick(assets.filter(asset => selected.has(asset.id)))}
        style={[styles.button, { backgroundColor: selected.size ? colors.primary : colors.muted }]}
      >
        <Text style={{ color: selected.size ? colors.primaryForeground : colors.mutedForeground }}>Ajouter {selected.size ? `${selected.size} photo${selected.size > 1 ? 's' : ''}` : 'les photos sélectionnées'}</Text>
      </Pressable>}
      <Pressable disabled={busy} onPress={onBrowse} style={[styles.button, { backgroundColor: colors.muted }]}>
        <Text style={{ color: colors.primary }}>Ouvrir toute la galerie</Text>
      </Pressable>
      <Pressable disabled={busy} onPress={onClose} style={styles.button}><Text style={{ color: colors.mutedForeground }}>Fermer</Text></Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  asset: { flexBasis: '30%', flexGrow: 1, maxWidth: '32%', gap: 4 },
  image: { width: '100%', aspectRatio: 1, borderRadius: 8 },
  button: { paddingVertical: 13, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center' },
});
