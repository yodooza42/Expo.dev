import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, type ImageProps } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useCatalogueVersion } from '@/hooks/useCatalogueVersion';
import { useColors } from '@/hooks/useColors';
import { resolvePhotoRef } from '@/utils/library/catalogue';
import { isLibraryRef } from '@/utils/library/paths';
import { photoCandidates } from '@/utils/photoReferences';

type Props = { uri: string; style?: ImageProps['style']; contentFit?: ImageProps['contentFit'] };

/** Shared task/project rendering: never leave an unexplained empty black tile. */
export function ProjectPhoto(props: Props) {
  const version = useCatalogueVersion();
  return <ResolvedPhoto key={`${props.uri}:${version}`} {...props} />;
}

function ResolvedPhoto({ uri, style, contentFit = 'cover' }: Props) {
  const colors = useColors();
  // Library references resolve synchronously: no loading flash when the catalogue changes.
  const [candidates, setCandidates] = useState<string[] | null>(() => {
    if (!isLibraryRef(uri)) return null;
    const resolved = resolvePhotoRef(uri);
    return resolved === uri ? [] : [resolved];
  });
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (isLibraryRef(uri)) return;
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
