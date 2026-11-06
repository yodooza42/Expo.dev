import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, type ImageProps } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { photoCandidates } from '@/utils/photoReferences';

type Props = { uri: string; style?: ImageProps['style']; contentFit?: ImageProps['contentFit'] };

/** Shared task/project rendering: never leave an unexplained empty black tile. */
export function ProjectPhoto(props: Props) {
  return <ResolvedPhoto key={props.uri} {...props} />;
}

function ResolvedPhoto({ uri, style, contentFit = 'cover' }: Props) {
  const colors = useColors();
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    let current = true;
    photoCandidates(uri).then(result => {
      if (current) setCandidates(result);
    }).catch(() => { if (current) setCandidates([uri]); });
    return () => { current = false; };
  }, [uri]);
  if (!candidates) return <View style={[style, styles.unavailable, { borderColor: colors.border }]}>
    <ActivityIndicator color={colors.mutedForeground} />
  </View>;
  if (candidates && index >= candidates.length) {
    return <View style={[style, styles.unavailable, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityLabel="Photo inaccessible">
      <MaterialCommunityIcons name="image-broken-variant" size={26} color={colors.mutedForeground} />
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Photo inaccessible</Text>
    </View>;
  }
  return <Image source={{ uri: candidates[index] }} style={style} contentFit={contentFit}
    recyclingKey={`${uri}:${index}`} onError={() => setIndex(value => value + 1)} />;
}

const styles = StyleSheet.create({
  unavailable: { justifyContent: 'center', alignItems: 'center', gap: 6, borderWidth: 1 },
  label: { fontSize: 11, textAlign: 'center', paddingHorizontal: 6 },
});
