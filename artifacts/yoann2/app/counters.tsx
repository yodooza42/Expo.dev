import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SubPageHeader } from '@/components/SubPageHeader';
import { useColors } from '@/hooks/useColors';
import {
  getConsumptionLog,
  groupByDay,
  removeConsumption,
  type ConsumptionEntry,
  type DayStats,
} from '@/utils/consumptionStorage';

const WIDGET_LOG_KEY = '@yoann2_widget_debug_log';

interface WidgetLogEntry {
  t: string;
  tag: string;
  data: string;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
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

function EntryPill({
  entry,
  colors,
  onDelete,
}: {
  entry: ConsumptionEntry;
  colors: ReturnType<typeof useColors>;
  onDelete: (ts: string) => void;
}) {
  const isCoffee = entry.type === 'coffee';
  return (
    <TouchableOpacity
      style={[styles.pill, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onDelete(entry.timestamp);
      }}
      activeOpacity={0.6}
    >
      <Text style={styles.pillEmoji}>{isCoffee ? '☕' : '🚬'}</Text>
      <Text style={[styles.pillTime, { color: colors.mutedForeground }]}>{fmtTime(entry.timestamp)}</Text>
      <Text style={[styles.pillDel, { color: colors.mutedForeground }]}>✕</Text>
    </TouchableOpacity>
  );
}

function DayBlock({
  day,
  colors,
  onDelete,
}: {
  day: DayStats;
  colors: ReturnType<typeof useColors>;
  onDelete: (ts: string) => void;
}) {
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
          <EntryPill key={`${e.timestamp}-${i}`} entry={e} colors={colors} onDelete={onDelete} />
        ))}
      </View>
    </View>
  );
}

function tagColor(tag: string): string {
  if (tag.includes('error') || tag.includes('catch')) return '#EF5350';
  if (tag.includes('ADD_COFFEE') || tag.includes('ADD_CIGARETTE') || tag.includes('COFFEE') || tag.includes('CIGARETTE')) return '#FFC107';
  if (tag.includes('success')) return '#66BB6A';
  return '#90A4AE';
}

export default function CountersScreen() {
  const colors = useColors();
  const [days, setDays] = useState<DayStats[]>([]);
  const [widgetLog, setWidgetLog] = useState<WidgetLogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([
      getConsumptionLog(),
      AsyncStorage.getItem(WIDGET_LOG_KEY).catch(() => null),
    ]).then(([log, rawLog]) => {
      if (!active) return;
      setDays(groupByDay(log));
      if (rawLog) {
        try {
          setWidgetLog((JSON.parse(rawLog) as WidgetLogEntry[]).slice().reverse());
        } catch {}
      }
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
            <DayBlock
              key={d.date}
              day={d}
              colors={colors}
              onDelete={async (ts) => {
                await removeConsumption(ts);
                const log = await getConsumptionLog();
                setDays(groupByDay(log));
              }}
            />
          ))
        )}

        {/* ── Log widget (debug) ── */}
        <TouchableOpacity
          style={[styles.debugToggle, { borderColor: colors.border }]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setShowLog(v => !v);
          }}
        >
          <Text style={[styles.debugToggleText, { color: colors.mutedForeground }]}>
            {showLog ? '▲ Masquer log widget' : '▼ Log widget (debug)'}
            {widgetLog.length > 0 ? `  ·  ${widgetLog.length} entrées` : ''}
          </Text>
        </TouchableOpacity>

        {showLog && (
          <View style={[styles.logBox, { backgroundColor: '#0A0A0A', borderColor: colors.border }]}>
            {widgetLog.length === 0 ? (
              <Text style={styles.logEmpty}>Aucun log widget disponible.</Text>
            ) : (
              widgetLog.map((entry, i) => (
                <View key={i} style={styles.logRow}>
                  <Text style={[styles.logTime, { color: '#546E7A' }]}>{fmtTime(entry.t)}</Text>
                  <Text style={[styles.logTag, { color: tagColor(entry.tag) }]}>{entry.tag}</Text>
                  <Text style={styles.logData} numberOfLines={2}>{entry.data}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1 },
  scroll:           { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  statsRow:         { flexDirection: 'row', gap: 12 },
  statCard:         { flex: 1, borderRadius: 16, padding: 18, alignItems: 'center', gap: 4 },
  statEmoji:        { fontSize: 28 },
  statValue:        { fontSize: 32, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  statLabel:        { fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  weekRow:          {},
  weekCard:         { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekLabel:        { fontSize: 12, fontFamily: 'Inter_500Medium' },
  weekValue:        { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  dayBlock:         { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  dayHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel:         { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  daySummary:       { flexDirection: 'row', gap: 6 },
  badge:            { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:        { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  pillsRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill:             { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  pillEmoji:        { fontSize: 13 },
  pillTime:         { fontSize: 12, fontFamily: 'Inter_400Regular' },
  pillDel:          { fontSize: 10, fontFamily: 'Inter_400Regular', marginLeft: 2 },
  empty:            { textAlign: 'center', marginTop: 60, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 22 },
  debugToggle:      { borderRadius: 10, borderWidth: 1, padding: 10, alignItems: 'center', marginTop: 4 },
  debugToggleText:  { fontSize: 12, fontFamily: 'Inter_400Regular' },
  logBox:           { borderRadius: 10, borderWidth: 1, padding: 10, gap: 8 },
  logEmpty:         { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#546E7A', textAlign: 'center', paddingVertical: 8 },
  logRow:           { gap: 1 },
  logTime:          { fontSize: 10, fontFamily: 'Inter_400Regular' },
  logTag:           { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  logData:          { fontSize: 10, fontFamily: 'Inter_400Regular', color: '#78909C' },
});
