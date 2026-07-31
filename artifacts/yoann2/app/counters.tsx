import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { SubPageHeader } from '@/components/SubPageHeader';
import { useColors } from '@/hooks/useColors';
import {
  addConsumptionAt,
  getConsumptionLog,
  groupByDay,
  removeConsumption,
  type ConsumptionEntry,
  type ConsumptionType,
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

function tagColor(tag: string): string {
  if (tag.includes('error') || tag.includes('catch')) return '#EF5350';
  if (tag.includes('ADD_COFFEE') || tag.includes('ADD_CIGARETTE') || tag.includes('COFFEE') || tag.includes('CIGARETTE')) return '#FFC107';
  if (tag.includes('success')) return '#66BB6A';
  return '#90A4AE';
}

// ── AddModal ──────────────────────────────────────────────────────────────────
function AddModal({
  visible,
  colors,
  onClose,
  onAdded,
}: {
  visible: boolean;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [type, setType] = useState<ConsumptionType>('coffee');
  const [timeStr, setTimeStr] = useState('');
  const [dayOffset, setDayOffset] = useState(0);
  const [error, setError] = useState('');

  function reset() {
    setTimeStr('');
    setDayOffset(0);
    setError('');
    setType('coffee');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function parseTime(raw: string): { h: number; m: number } | null {
    const s = raw.replace(/\D/g, '');
    if (s.length === 3) {
      const h = parseInt(s[0]!, 10);
      const m = parseInt(s.slice(1), 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { h, m };
    }
    if (s.length === 4) {
      const h = parseInt(s.slice(0, 2), 10);
      const m = parseInt(s.slice(2), 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { h, m };
    }
    return null;
  }

  async function handleAdd() {
    const parsed = parseTime(timeStr);
    if (!parsed) {
      setError('Format invalide — ex: 1250 = 12h50, 845 = 8h45');
      return;
    }
    const base = new Date();
    base.setDate(base.getDate() + dayOffset);
    base.setHours(parsed.h, parsed.m, 0, 0);
    await addConsumptionAt(type, base.toISOString());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    reset();
    onAdded();
    onClose();
  }

  const dayLabels: Record<number, string> = { 0: "Aujourd'hui", '-1': 'Hier', '-2': 'Avant-hier' };
  const dayLabel = dayLabels[dayOffset] ?? `J${dayOffset}`;

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Ajouter manuellement" avoidKeyboard>
          {/* Type selector */}
          <View style={styles.typeRow}>
            <Pressable
              onPress={() => setType('coffee')}
              style={[styles.typeBtn, {
                backgroundColor: type === 'coffee' ? '#4E342E' : colors.muted,
                borderColor: type === 'coffee' ? '#8D6E63' : colors.border,
              }]}
            >
              <Text style={styles.typeBtnEmoji}>☕</Text>
              <Text style={[styles.typeBtnText, { color: type === 'coffee' ? '#FFFFFF' : colors.mutedForeground }]}>Café</Text>
            </Pressable>
            <Pressable
              onPress={() => setType('cigarette')}
              style={[styles.typeBtn, {
                backgroundColor: type === 'cigarette' ? '#37474F' : colors.muted,
                borderColor: type === 'cigarette' ? '#607D8B' : colors.border,
              }]}
            >
              <Text style={styles.typeBtnEmoji}>🚬</Text>
              <Text style={[styles.typeBtnText, { color: type === 'cigarette' ? '#FFFFFF' : colors.mutedForeground }]}>Clope</Text>
            </Pressable>
          </View>

          {/* Day selector */}
          <View style={styles.dayRow}>
            <Pressable
              onPress={() => setDayOffset(v => v - 1)}
              disabled={dayOffset <= -7}
              style={[styles.dayArrow, { backgroundColor: colors.muted, opacity: dayOffset <= -7 ? 0.3 : 1 }]}
            >
              <Text style={[styles.dayArrowText, { color: colors.foreground }]}>‹</Text>
            </Pressable>
            <Text style={[styles.dayLabel, { color: colors.foreground }]}>{dayLabel}</Text>
            <Pressable
              onPress={() => setDayOffset(v => v + 1)}
              disabled={dayOffset >= 0}
              style={[styles.dayArrow, { backgroundColor: colors.muted, opacity: dayOffset >= 0 ? 0.3 : 1 }]}
            >
              <Text style={[styles.dayArrowText, { color: colors.foreground }]}>›</Text>
            </Pressable>
          </View>

          {/* Time input */}
          <View style={styles.timeInputWrap}>
            <TextInput
              value={timeStr}
              onChangeText={t => { setTimeStr(t); setError(''); }}
              placeholder="1250 = 12h50  ·  845 = 8h45"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              maxLength={4}
              style={[styles.timeInput, { color: colors.foreground, borderColor: error ? '#EF5350' : colors.border, backgroundColor: colors.background }]}
              returnKeyType="done"
              onSubmitEditing={handleAdd}
              autoFocus
            />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.sheetActions}>
            <Pressable onPress={handleClose} style={[styles.sheetBtn, { backgroundColor: colors.muted }]}>
              <Text style={[styles.sheetBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
            </Pressable>
            <Pressable
              onPress={handleAdd}
              disabled={!timeStr.trim()}
              style={[styles.sheetBtn, { backgroundColor: type === 'coffee' ? '#4E342E' : '#37474F', opacity: timeStr.trim() ? 1 : 0.4 }]}
            >
              <Text style={[styles.sheetBtnText, { color: '#FFFFFF' }]}>
                {type === 'coffee' ? '☕' : '🚬'} Ajouter
              </Text>
            </Pressable>
          </View>
    </BottomSheet>
  );
}

// ── EntryPill ─────────────────────────────────────────────────────────────────
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
        Alert.alert(
          'Supprimer ?',
          `${isCoffee ? '☕ Café' : '🚬 Clope'} à ${fmtTime(entry.timestamp)}`,
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Supprimer',
              style: 'destructive',
              onPress: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                onDelete(entry.timestamp);
              },
            },
          ],
        );
      }}
      activeOpacity={0.6}
    >
      <Text style={styles.pillEmoji}>{isCoffee ? '☕' : '🚬'}</Text>
      <Text style={[styles.pillTime, { color: colors.mutedForeground }]}>{fmtTime(entry.timestamp)}</Text>
      <Text style={[styles.pillDel, { color: colors.mutedForeground }]}>✕</Text>
    </TouchableOpacity>
  );
}

// ── DayBlock ──────────────────────────────────────────────────────────────────
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
        <Text style={[styles.dayLabel2, { color: colors.foreground }]}>{fmtDayLabel(day.date)}</Text>
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

// ── Screen ────────────────────────────────────────────────────────────────────
export default function CountersScreen() {
  const colors = useColors();
  const [days, setDays] = useState<DayStats[]>([]);
  const [widgetLog, setWidgetLog] = useState<WidgetLogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  async function reload() {
    const [log, rawLog] = await Promise.all([
      getConsumptionLog(),
      AsyncStorage.getItem(WIDGET_LOG_KEY).catch(() => null),
    ]);
    setDays(groupByDay(log));
    if (rawLog) {
      try { setWidgetLog((JSON.parse(rawLog) as WidgetLogEntry[]).slice().reverse()); } catch {}
    }
  }

  useFocusEffect(useCallback(() => {
    let active = true;
    reload().catch(() => {}).finally(() => { if (!active) return; });
    return () => { active = false; };
  }, []));

  const today     = days[0] && new Date(days[0].date).toDateString() === new Date().toDateString() ? days[0] : null;
  const todayCoffee = today?.coffee ?? 0;
  const todayCigs   = today?.cigarette ?? 0;

  const weekCoffee    = days.slice(0, 7).reduce((s, d) => s + d.coffee, 0);
  const weekCigarette = days.slice(0, 7).reduce((s, d) => s + d.cigarette, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SubPageHeader
        title="Consommation"
        right={
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setShowAddModal(true); }}
            hitSlop={8}
            style={styles.headerAddBtn}
          >
            <Text style={[styles.headerAddText, { color: colors.foreground }]}>＋</Text>
          </Pressable>
        }
      />

      <AddModal
        visible={showAddModal}
        colors={colors}
        onClose={() => setShowAddModal(false)}
        onAdded={reload}
      />

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
  container:       { flex: 1 },
  scroll:          { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  statsRow:        { flexDirection: 'row', gap: 12 },
  statCard:        { flex: 1, borderRadius: 16, padding: 18, alignItems: 'center', gap: 4 },
  statEmoji:       { fontSize: 28 },
  statValue:       { fontSize: 32, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  statLabel:       { fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  weekRow:         {},
  weekCard:        { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekLabel:       { fontSize: 12, fontFamily: 'Inter_500Medium' },
  weekValue:       { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  addBtn:          { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 14 },
  addBtnEmoji:     { fontSize: 18 },
  addBtnText:      { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  addBtnSub:       { fontSize: 12, fontFamily: 'Inter_400Regular' },

  dayBlock:        { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  dayHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel2:       { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  daySummary:      { flexDirection: 'row', gap: 6 },
  badge:           { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:       { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  pillsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill:            { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  pillEmoji:       { fontSize: 13 },
  pillTime:        { fontSize: 12, fontFamily: 'Inter_400Regular' },
  pillDel:         { fontSize: 10, fontFamily: 'Inter_400Regular', marginLeft: 2 },
  empty:           { textAlign: 'center', marginTop: 60, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 22 },
  debugToggle:     { borderRadius: 10, borderWidth: 1, padding: 10, alignItems: 'center', marginTop: 4 },
  debugToggleText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  logBox:          { borderRadius: 10, borderWidth: 1, padding: 10, gap: 8 },
  logEmpty:        { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#546E7A', textAlign: 'center', paddingVertical: 8 },
  logRow:          { gap: 1 },
  logTime:         { fontSize: 10, fontFamily: 'Inter_400Regular' },
  logTag:          { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  logData:         { fontSize: 10, fontFamily: 'Inter_400Regular', color: '#78909C' },

  headerAddBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerAddText:   { fontSize: 22, fontFamily: 'Inter_400Regular' },
  typeRow:         { flexDirection: 'row', gap: 10 },
  typeBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 14 },
  typeBtnEmoji:    { fontSize: 20 },
  typeBtnText:     { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  dayRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  dayArrow:        { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayArrowText:    { fontSize: 22, fontFamily: 'Inter_600SemiBold' },
  dayLabel:        { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  timeInputWrap:   {},
  timeInput:       { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center', letterSpacing: 4 },
  errorText:       { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#EF5350', textAlign: 'center' },
  sheetActions:    { flexDirection: 'row', gap: 10 },
  sheetBtn:        { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sheetBtnText:    { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
