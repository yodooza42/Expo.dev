import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SubPageHeader } from '@/components/SubPageHeader';
import { useColors } from '@/hooks/useColors';
import {
  getConsumptionLog,
  groupByDay,
  type ConsumptionEntry,
  type DayStats,
} from '@/utils/consumptionStorage';

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function fmtDayLabel(dateStr: string): string {
  const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const MONTHS = ['jan', 'fév', 'mar', 'avr', 'mai', 'jui', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
  const d = new Date(dateStr);
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (d.toDateString() === today) return "Aujourd'hui";
  if (d.toDateString() === yesterday) return 'Hier';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function EntryPill({ entry, colors }: { entry: ConsumptionEntry; colors: ReturnType<typeof useColors> }) {
  const isCoffee = entry.type === 'coffee';
  return (
    <View style={[styles.pill, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={styles.pillEmoji}>{isCoffee ? '☕' : '🚬'}</Text>
      <Text style={[styles.pillTime, { color: colors.mutedForeground }]}>{fmtTime(entry.timestamp)}</Text>
    </View>
  );
}

function DayBlock({ day, colors }: { day: DayStats; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.dayBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.dayHeader}>
        <Text style={[styles.dayLabel, { color: colors.foreground }]}>{fmtDayLabel(day.date)}</Text>
        <View style={styles.daySummary}>
          {day.coffee > 0 && (
            <View style={[styles.badge, { backgroundColor: '#4E342E' }]}>
              <Text style={styles.badgeText}>☕ {day.coffee}</Text>
            </View>
          )}
          {day.cigarette > 0 && (
            <View style={[styles.badge, { backgroundColor: '#37474F' }]}>
              <Text style={styles.badgeText}>🚬 {day.cigarette}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.pillsRow}>
        {day.entries.slice().reverse().map((e, i) => (
          <EntryPill key={`${e.timestamp}-${i}`} entry={e} colors={colors} />
        ))}
      </View>
    </View>
  );
}

export default function CountersScreen() {
  const colors = useColors();
  const [days, setDays] = useState<DayStats[]>([]);

  useFocusEffect(useCallback(() => {
    let active = true;
    getConsumptionLog().then(log => {
      if (!active) return;
      setDays(groupByDay(log));
    }).catch(() => {});
    return () => { active = false; };
  }, []));

  const today     = days[0] && new Date(days[0].date).toDateString() === new Date().toDateString() ? days[0] : null;
  const todayCoffee = today?.coffee ?? 0;
  const todayCigs   = today?.cigarette ?? 0;

  const weekCoffee    = days.slice(0, 7).reduce((s, d) => s + d.coffee, 0);
  const weekCigarette = days.slice(0, 7).reduce((s, d) => s + d.cigarette, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SubPageHeader title="Consommation" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Résumé aujourd'hui ── */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#4E342E' }]}>
            <Text style={styles.statEmoji}>☕</Text>
            <Text style={styles.statValue}>{todayCoffee}</Text>
            <Text style={styles.statLabel}>Cafés aujourd'hui</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#37474F' }]}>
            <Text style={styles.statEmoji}>🚬</Text>
            <Text style={styles.statValue}>{todayCigs}</Text>
            <Text style={styles.statLabel}>Clopes aujourd'hui</Text>
          </View>
        </View>

        {/* ── Résumé semaine ── */}
        <View style={styles.weekRow}>
          <View style={[styles.weekCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.weekLabel, { color: colors.mutedForeground }]}>Cette semaine</Text>
            <Text style={[styles.weekValue, { color: colors.foreground }]}>
              ☕ {weekCoffee}  ·  🚬 {weekCigarette}
            </Text>
          </View>
        </View>

        {/* ── Historique par jour ── */}
        {days.length === 0 ? (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            Aucune consommation enregistrée encore.{'\n'}Utilise les boutons ☕ 🚬 du widget.
          </Text>
        ) : (
          days.map(d => (
            <DayBlock key={d.date} day={d} colors={colors} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1 },
  scroll:     { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  statsRow:   { flexDirection: 'row', gap: 12 },
  statCard:   {
    flex: 1, borderRadius: 16, padding: 18, alignItems: 'center', gap: 4,
  },
  statEmoji:  { fontSize: 28 },
  statValue:  { fontSize: 32, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  statLabel:  { fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  weekRow:    {},
  weekCard:   {
    borderRadius: 14, borderWidth: 1, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  weekLabel:  { fontSize: 12, fontFamily: 'Inter_500Medium' },
  weekValue:  { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  dayBlock:   { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  dayHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel:   { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  daySummary: { flexDirection: 'row', gap: 6 },
  badge:      { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:  { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  pillsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill:       {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4,
  },
  pillEmoji:  { fontSize: 13 },
  pillTime:   { fontSize: 12, fontFamily: 'Inter_400Regular' },
  empty:      { textAlign: 'center', marginTop: 60, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 22 },
});
