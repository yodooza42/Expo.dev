import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function StoryVideoReview({ uri, onShare, onDiscard, isSharing }: {
  uri: string; onShare: () => void; onDiscard: () => void; isSharing: boolean;
}) {
  const colors = useColors();
  const player = useVideoPlayer(uri);
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  return <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <Text style={[s.title, { color: colors.foreground }]}>Vérifier avant de partager</Text>
    <VideoView player={player} nativeControls contentFit="contain" style={s.video} />
    {status === 'error' && <Text style={{ color: colors.destructive }}>
      Lecture indisponible : {error?.message || 'ce format vidéo ne peut pas être lu ici'}. Tu peux recréer la vidéo ou partager le fichier manuellement.
    </Text>}
    <Text style={[s.text, { color: colors.mutedForeground }]}>Rien n’est envoyé automatiquement. Lance la lecture pour vérifier le montage.</Text>
    <Pressable testID="share-memory" disabled={isSharing} onPress={() => { player.pause(); onShare(); }}
      style={[s.button, { backgroundColor: colors.primary, opacity: isSharing ? 0.5 : 1 }]}>
      <Text style={[s.title, { color: colors.primaryForeground }]}>{isSharing ? 'Partage…' : 'Partager le souvenir'}</Text>
    </Pressable>
    <Pressable disabled={isSharing} onPress={onDiscard} style={s.button}>
      <Text style={[s.text, { color: colors.mutedForeground }]}>Fermer la vidéo et revenir au brouillon</Text>
    </Pressable>
  </View>;
}

const s = StyleSheet.create({
  card: { padding: 16, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 14 },
  video: { width: '100%', height: 360 }, title: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  text: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  button: { borderRadius: 10, padding: 14, alignItems: 'center' },
});