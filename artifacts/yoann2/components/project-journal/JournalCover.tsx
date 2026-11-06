import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Pattern, Path, Rect } from 'react-native-svg';
import { JOURNAL_COLORS as c } from '@/constants/journal';

export function JournalCover({ title, summary }: { title: string; summary: string }) {
  return <View style={s.cover}>
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs><Pattern id="journal-grid" width="16" height="16" patternUnits="userSpaceOnUse">
        <Path d="M 16 0 L 0 0 0 16" stroke={c.grid} strokeWidth="0.5" fill="none" />
      </Pattern></Defs>
      <Rect width="100%" height="100%" fill="url(#journal-grid)" />
      <Path d="M 26 0 V 500" stroke={c.rule} strokeWidth="1" opacity="0.55" />
    </Svg>
    <Text style={s.eyebrow}>LES PROJETS PRENNENT VIE</Text>
    <Text style={s.title}>{title || 'Carnet de bord'}</Text>
    <View style={s.rule} />
    <Text style={s.summary}>{summary}</Text>
    <Text style={s.footer}>Petites étapes. Vraies réalisations.</Text>
  </View>;
}
const s = StyleSheet.create({
  cover: { backgroundColor: c.paper, borderRadius: 5, overflow: 'hidden', padding: 28, paddingLeft: 42, gap: 13 },
  eyebrow: { color: c.ink, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.8, fontSize: 9 },
  title: { color: c.ink, fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 38, marginTop: 10 },
  rule: { width: 52, height: 2, backgroundColor: c.rule, marginVertical: 4 },
  summary: { color: c.ink, fontSize: 13, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  footer: { color: c.muted, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 6 },
});
