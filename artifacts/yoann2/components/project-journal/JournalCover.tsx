import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Pattern, Path, Rect } from 'react-native-svg';
import { JOURNAL_COLORS as c, JOURNAL_PAPER as p } from '@/constants/journal';

export function JournalCover({ title, summary }: { title: string; summary: string }) {
  return <View style={s.cover}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${p.width} ${p.height}`} preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern id="journal-grid" width={p.gridSize} height={p.gridSize} patternUnits="userSpaceOnUse">
          <Path d={`M ${p.gridSize} 0 H 0 V ${p.gridSize}`} stroke={c.grid} strokeWidth="0.7" fill="none" />
        </Pattern>
        <Pattern id="journal-binding-lines" width={p.bindingWidth} height={p.gridSize} patternUnits="userSpaceOnUse">
          <Path d={`M 0 ${p.gridSize / 2} H ${p.bindingWidth}`} stroke={c.divider} strokeWidth="0.65" opacity="0.38" fill="none" />
        </Pattern>
      </Defs>
      <Rect width={p.width} height={p.height} fill={c.paper} />
      <Rect width={p.bindingWidth} height={p.height} fill={c.binding} />
      <Rect width={p.bindingWidth} height={p.height} fill="url(#journal-binding-lines)" />
      <Rect x={p.gridStart} width={p.width - p.gridStart} height={p.height} fill="url(#journal-grid)" />
      <Path d={`M ${p.bindingWidth} 0 V ${p.height}`} stroke={c.divider} strokeWidth="2" opacity="0.7" />
      <Path d={`M ${p.gridStart} 0 V ${p.height}`} stroke={c.divider} strokeWidth="1" opacity="0.35" />
      {p.punchCenters.map(y => <React.Fragment key={y}>
        <Circle cx={p.punchX} cy={y} r="7" fill={c.punch} />
        <Ellipse cx={p.punchX} cy={y + 27} rx="8" ry="16" fill={c.punch} />
      </React.Fragment>)}
    </Svg>
    <Text style={s.eyebrow}>LES PROJETS PRENNENT VIE</Text>
    <Text style={s.title}>{title || 'Carnet de bord'}</Text>
    <View style={s.rule} />
    <Text style={s.summary}>{summary}</Text>
    <Text style={s.footer}>Petites étapes. Vraies réalisations.</Text>
  </View>;
}
const s = StyleSheet.create({
  cover: { backgroundColor: c.paper, borderRadius: 5, overflow: 'hidden', padding: 28, paddingLeft: 74, gap: 13 },
  eyebrow: { color: c.ink, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.8, fontSize: 9 },
  title: { color: c.ink, fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 38, marginTop: 10 },
  rule: { width: 52, height: 2, backgroundColor: c.rule, marginVertical: 4 },
  summary: { color: c.ink, fontSize: 13, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  footer: { color: c.muted, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 6 },
});
