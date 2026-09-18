import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AppColors } from '@/contexts/ThemeContext';
import { useColors } from '@/hooks/useColors';
import { useCarPlayer } from '@/hooks/useCarPlayer';
import { startCarPlaylist, setCarPlaylist } from '@/utils/carPlayer';
import { getManualTripState } from '@/utils/manualTripStorage';
import {
  deleteTrackFile,
  importTrack,
  loadPlaylist,
  savePlaylist,
  type Track,
} from '@/utils/playlistStorage';
import { getTripDistKm } from '@/utils/locationTracking';

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) {
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function fmtSegments(segs: { start: number; end?: number }[]): string {
  let ms = 0;
  for (const s of segs) ms += (s.end ?? Date.now()) - s.start;
  return fmt(ms);
}

export default function PlayerScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const player  = useCarPlayer();

  const [playlist,  setPlaylist]  = useState<Track[]>([]);
  const [importing, setImporting] = useState(false);
  const [tripInfo,  setTripInfo]  = useState<{ km: number; duration: string } | null>(null);
  const barWidth = useRef(0);

  useEffect(() => {
    loadPlaylist().then(tracks => {
      setPlaylist(tracks);
      setCarPlaylist(tracks);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const poll = async () => {
      const st = await getManualTripState().catch(() => null);
      if (st?.active) {
        setTripInfo({ km: getTripDistKm(), duration: fmtSegments(st.segments) });
      } else {
        setTripInfo(null);
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: false,
        multiple: true,
      });
      if (result.canceled) return;
      const added: Track[] = [];
      for (const asset of result.assets) {
        const t = await importTrack(asset.uri, asset.name ?? `Piste ${playlist.length + added.length + 1}`);
        added.push(t);
      }
      const updated = [...playlist, ...added];
      setPlaylist(updated);
      await savePlaylist(updated);
      setCarPlaylist(updated);
    } catch {
      Alert.alert('Erreur', "Impossible d'importer le fichier audio.");
    } finally {
      setImporting(false);
    }
  }, [playlist]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Supprimer', 'Retirer cette piste de la playlist ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const track = playlist.find(t => t.id === id);
          const updated = playlist.filter(t => t.id !== id);
          setPlaylist(updated);
          await savePlaylist(updated);
          setCarPlaylist(updated);
          if (track) deleteTrackFile(track).catch(() => {});
        },
      },
    ]);
  }, [playlist]);

  const currentTrack = player.tracks[player.currentIndex];
  const progress = player.durationMs > 0 ? player.positionMs / player.durationMs : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {tripInfo && (
        <View style={[
          styles.tripBanner,
          {
            backgroundColor: colors.primary + '22',
            borderBottomColor: colors.primary + '55',
            paddingTop: insets.top + 8,
          },
        ]}>
          <MaterialCommunityIcons name="car" size={13} color={colors.primary} />
          <Text style={[styles.tripText, { color: colors.primary }]}>
            Trajet · {tripInfo.km.toFixed(2)} km · {tripInfo.duration}
          </Text>
        </View>
      )}

      <View style={[styles.nowPlaying, { paddingTop: tripInfo ? 16 : insets.top + 20 }]}>
        <View style={[styles.artBox, { backgroundColor: colors.card }]}>
          <MaterialCommunityIcons
            name={player.isPlaying ? 'music-note' : 'music-note-outline'}
            size={72}
            color={player.isPlaying ? colors.primary : colors.mutedForeground}
          />
        </View>

        <Text style={[styles.trackName, { color: colors.foreground }]} numberOfLines={2}>
          {currentTrack?.name ?? (playlist.length > 0 ? 'Appuie sur ▶' : 'Aucune piste')}
        </Text>
        <Text style={[styles.trackSub, { color: colors.mutedForeground }]}>
          {playlist.length > 0
            ? `Playlist voiture · ${player.currentIndex + 1} / ${playlist.length}`
            : 'Importe des fichiers audio ↓'}
        </Text>

        <View style={styles.progressRow}>
          <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>
            {fmt(player.positionMs)}
          </Text>
          <View
            style={[styles.progressBg, { backgroundColor: colors.border }]}
            onLayout={(e: LayoutChangeEvent) => { barWidth.current = e.nativeEvent.layout.width; }}
          >
            <View
              style={[
                styles.progressFg,
                {
                  width: `${Math.min(100, Math.round(progress * 100))}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
          <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>
            {fmt(player.durationMs)}
          </Text>
        </View>

        <View style={styles.controls}>
          <Pressable
            onPress={player.prev}
            style={styles.ctrlBtn}
            disabled={player.currentIndex === 0}
          >
            <MaterialCommunityIcons
              name="skip-previous"
              size={44}
              color={player.currentIndex === 0 ? colors.mutedForeground : colors.foreground}
            />
          </Pressable>

          <Pressable
            onPress={() => {
              if (player.isPlaying) {
                player.pause();
              } else if (playlist.length > 0) {
                if (player.tracks.length === 0) {
                  startCarPlaylist(playlist, 0);
                } else {
                  player.resume();
                }
              }
            }}
            style={[styles.playBtn, { backgroundColor: colors.primary, opacity: playlist.length === 0 ? 0.4 : 1 }]}
          >
            <MaterialCommunityIcons
              name={player.isPlaying ? 'pause' : 'play'}
              size={44}
              color="#fff"
            />
          </Pressable>

          <Pressable
            onPress={player.next}
            style={styles.ctrlBtn}
            disabled={player.currentIndex >= playlist.length - 1}
          >
            <MaterialCommunityIcons
              name="skip-next"
              size={44}
              color={player.currentIndex >= playlist.length - 1 ? colors.mutedForeground : colors.foreground}
            />
          </Pressable>
        </View>
      </View>

      <View style={[styles.playlistSection, { borderTopColor: colors.border }]}>
        <View style={styles.playlistHeader}>
          <Text style={[styles.playlistTitle, { color: colors.mutedForeground }]}>
            PLAYLIST · {playlist.length} piste{playlist.length !== 1 ? 's' : ''}
          </Text>
          <Pressable
            onPress={handleImport}
            style={[styles.importBtn, { backgroundColor: colors.primary }]}
          >
            {importing
              ? <ActivityIndicator size="small" color="#fff" />
              : <MaterialCommunityIcons name="plus" size={20} color="#fff" />
            }
          </Pressable>
        </View>

        {playlist.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="music-off" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Playlist vide
            </Text>
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
              Importe des fichiers MP3 / AAC / FLAC depuis le téléphone.
              Le bouton ▶ du widget lancera automatiquement la première piste.
            </Text>
          </View>
        ) : (
          <FlatList
            data={playlist}
            keyExtractor={item => item.id}
            renderItem={({ item, index }) => (
              <TrackRow
                track={item}
                index={index}
                active={index === player.currentIndex && player.tracks.length > 0}
                playing={index === player.currentIndex && player.isPlaying}
                onPress={() => startCarPlaylist(playlist, index)}
                onDelete={() => handleDelete(item.id)}
                colors={colors}
              />
            )}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}
          />
        )}
      </View>
    </View>
  );
}

function TrackRow({
  track, index, active, playing, onPress, onDelete, colors,
}: {
  track: Track;
  index: number;
  active: boolean;
  playing: boolean;
  onPress: () => void;
  onDelete: () => void;
  colors: AppColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.trackRow,
        { borderBottomColor: colors.border },
        active ? { backgroundColor: colors.primary + '18' } : {},
      ]}
    >
      <View style={styles.trackNum}>
        {playing ? (
          <MaterialCommunityIcons name="volume-high" size={15} color={colors.primary} />
        ) : (
          <Text style={[styles.trackNumText, { color: active ? colors.primary : colors.mutedForeground }]}>
            {index + 1}
          </Text>
        )}
      </View>
      <Text
        style={[styles.trackRowName, { color: active ? colors.primary : colors.foreground }]}
        numberOfLines={1}
      >
        {track.name}
      </Text>
      <Pressable onPress={onDelete} hitSlop={10} style={styles.deleteBtn}>
        <MaterialCommunityIcons name="trash-can-outline" size={17} color={colors.mutedForeground} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  tripBanner:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  tripText:     { fontSize: 12, fontFamily: 'Inter_500Medium' },
  nowPlaying:   { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 12 },
  artBox:       { width: 150, height: 150, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  trackName:    { fontSize: 20, fontFamily: 'Inter_600SemiBold', textAlign: 'center', marginBottom: 4, lineHeight: 26 },
  trackSub:     { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 18 },
  progressRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', marginBottom: 20 },
  timeLabel:    { fontSize: 11, fontFamily: 'Inter_400Regular', width: 38, textAlign: 'center' },
  progressBg:   { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFg:   { height: '100%', borderRadius: 2 },
  controls:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  ctrlBtn:      { padding: 8 },
  playBtn:      { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  playlistSection: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth },
  playlistHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  playlistTitle:   { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 0.8 },
  importBtn:       { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  empty:           { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
  emptyTitle:      { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptyHint:       { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  list:            { flex: 1 },
  trackRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  trackNum:        { width: 20, alignItems: 'center' },
  trackNumText:    { fontSize: 13, fontFamily: 'Inter_400Regular' },
  trackRowName:    { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  deleteBtn:       { padding: 4 },
});
