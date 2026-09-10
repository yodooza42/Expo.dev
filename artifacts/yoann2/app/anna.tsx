import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import { SubPageHeader } from '@/components/SubPageHeader';
import { loadAnnaBadges, NOUNOU_COLORS, saveAnnaBadges, type AnnaBadges, type Nounou } from '@/utils/annaStorage';
import { loadMariePlanning, SHIFT_TIMES, type MariePlanning, type Shift } from '@/utils/marieStorage';
import { DEFAULT_WORK_SCHEDULE, getWidgetSettings, type DaySchedule } from '@/widgets/widgetSettings';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Reads Yoann's schedule for a given weekday from the live "Planning de
 * travail" (Travail tab), instead of a hardcoded copy — so edits there are
 * reflected here.
 * `workSchedule` index convention: 0=Dimanche … 6=Samedi (Date.getDay()).
 * `weekdayIdx` here: 0=Monday … 6=Sunday.
 */
function yoannScheduleFor(weekdayIdx: number, workSchedule: DaySchedule[]): { start: string; end: string } | null {
  const day = workSchedule[(weekdayIdx + 1) % 7];
  if (!day || day.off) return null;
  return { start: day.start, end: day.end };
}

const FR_MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const FR_DAYS_LONG = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const FR_DAYS_CAP  = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
const FR_MONTHS_COURT = ['jan.', 'fév.', 'mar.', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sep.', 'oct.', 'nov.', 'déc.'];

function toMins(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMins(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Marie's "not home" windows — 45min buffer before/after shift
const MARIE_WINDOWS: Record<Shift, [number, number]> = {
  PB: [toMins('06:15'), toMins('15:15')],
  PD: [toMins('11:45'), toMins('20:15')],
};

function intersect(a: [number, number], b: [number, number]): [number, number] | null {
  const start = Math.max(a[0], b[0]);
  const end   = Math.min(a[1], b[1]);
  return start < end ? [start, end] : null;
}

/**
 * Returns [startMins, endMins] | null.
 * Uses Yoann's live work schedule (weekdayIdx 0=Mon…6=Sun) and Marie's shift.
 */
function nobodyHome(weekdayIdx: number, shift: Shift | undefined, workSchedule: DaySchedule[]): [number, number] | null {
  const yoann = yoannScheduleFor(weekdayIdx, workSchedule);
  if (!yoann || !shift) return null;

  // Yoann: 45min before start → end (extended hours if crosses midnight)
  let yStart = toMins(yoann.start) - 45;
  let yEnd   = toMins(yoann.end);
  if (yEnd <= toMins(yoann.start)) yEnd += 24 * 60;
  if (yStart < 0) yStart = 0;

  return intersect([yStart, yEnd], MARIE_WINDOWS[shift]);
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseMonth(s: string): { year: number; month: number } {
  const [y, m] = s.split('-').map(Number);
  return { year: y, month: m };
}

function addMonths(s: string, delta: number): string {
  let { year, month } = parseMonth(s);
  month += delta;
  if (month > 12) { month -= 12; year++; }
  if (month < 1)  { month += 12; year--; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function weekdayIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 ? 6 : day - 1;
}

function durationLabel(startMins: number, endMins: number): string {
  const diff = endMins - startMins;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? (m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`) : `${m}min`;
}

// ── Types ──────────────────────────────────────────────────────────────────

type DayEntry = {
  dateKey: string;
  start: number;
  end: number;
  nounou: Nounou;
};

// ── Component ──────────────────────────────────────────────────────────────

export default function AnnaScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const topPad  = Platform.OS === 'web' ? 67 : insets.top;

  const [monthStr, setMonthStr]         = useState(currentMonthStr);
  const [marie,    setMarie]            = useState<MariePlanning>({});
  const [badges,   setBadges]           = useState<AnnaBadges>({});
  const [workSchedule, setWorkSchedule] = useState<DaySchedule[]>(DEFAULT_WORK_SCHEDULE);

  // Reload on every focus (not just on mount) so edits made in the "Travail"
  // tab are reflected immediately when coming back to this screen.
  useFocusEffect(useCallback(() => {
    loadMariePlanning().then(setMarie);
    loadAnnaBadges().then(setBadges);
    getWidgetSettings().then(s => setWorkSchedule(s.workSchedule));
  }, []));

  const { year, month } = parseMonth(monthStr);
  const monthLabel = `${FR_MONTHS[month - 1]} ${year}`;

  // Compute "nobody home" days for this month using Yoann's live work schedule
  const entries: DayEntry[] = useMemo(() => {
    const result: DayEntry[] = [];
    const total = daysInMonth(year, month);
    for (let d = 1; d <= total; d++) {
      const dateKey = toDateKey(year, month, d);
      const wdIdx   = weekdayIndex(dateKey);
      const shift   = marie[dateKey];
      const window  = nobodyHome(wdIdx, shift, workSchedule);
      if (window) {
        result.push({
          dateKey,
          start:  window[0],
          end:    window[1],
          nounou: badges[dateKey] ?? 'Isabelle',
        });
      }
    }
    return result;
  }, [year, month, marie, badges, workSchedule]);

  const handleToggleNounou = useCallback(async (dateKey: string) => {
    const current = badges[dateKey] ?? 'Isabelle';
    const next: Nounou = current === 'Isabelle' ? 'Evelyne' : 'Isabelle';
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = { ...badges, [dateKey]: next };
    setBadges(updated);
    await saveAnnaBadges(updated);
  }, [badges]);

  async function handleShare() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (entries.length === 0) {
      await Share.share({
        message: `Planning Nounou — ${monthLabel}\n\nAucune période sans surveillance ce mois-ci.\n\nGénéré par Yoann2.0`,
        title: `Planning Nounou — ${monthLabel}`,
      });
      return;
    }

    const lines = entries.map(e => {
      const wdIdx = weekdayIndex(e.dateKey);
      const [,, d] = e.dateKey.split('-').map(Number);
      const dayLabel = `${FR_DAYS_CAP[wdIdx]} ${d} ${FR_MONTHS_COURT[month - 1]}`;
      const period   = `${fromMins(e.start)} → ${fromMins(e.end)} (${durationLabel(e.start, e.end)})`;
      return `📅 ${dayLabel}\n   ${period}\n   👩 ${e.nounou}`;
    });

    const message = [
      `🍼 Planning Nounou — ${monthLabel}`,
      `${entries.length} période${entries.length > 1 ? 's' : ''} sans surveillance`,
      '',
      ...lines,
      '',
      '—',
      'Généré par Yoann2.0',
    ].join('\n');

    await Share.share({ message, title: `Planning Nounou — ${monthLabel}` });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      <SubPageHeader
        title="Anna"
        subtitle="Planning nounou"
        right={
          <Pressable onPress={handleShare} hitSlop={12} style={styles.shareBtn}>
            <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.primary} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Month navigation ── */}
        <View style={[styles.monthNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={() => setMonthStr(m => addMonths(m, -1))} hitSlop={12} style={styles.monthArrow}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.foreground }]}>{monthLabel}</Text>
          <Pressable onPress={() => setMonthStr(m => addMonths(m, 1))} hitSlop={12} style={styles.monthArrow}>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {/* ── Legend ── */}
        <View style={[styles.legendCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="information-outline" size={14} color={colors.mutedForeground} />
          <Text style={[styles.legendTxt, { color: colors.mutedForeground }]}>
            Périodes où ni Marie ni Yoann ne sont à la maison.{'\n'}
            Appuie sur le badge pour changer de nounou.
          </Text>
        </View>

        {/* ── Nounou legend ── */}
        <View style={styles.nounouLegend}>
          {(['Isabelle', 'Evelyne'] as Nounou[]).map(n => (
            <View key={n} style={[styles.nounouChip, { backgroundColor: NOUNOU_COLORS[n] + '20' }]}>
              <View style={[styles.nounouDot, { backgroundColor: NOUNOU_COLORS[n] }]} />
              <Text style={[styles.nounouChipTxt, { color: NOUNOU_COLORS[n] }]}>{n}</Text>
            </View>
          ))}
        </View>

        {/* ── Section header ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            PÉRIODES SANS SURVEILLANCE · {entries.length}
          </Text>
          {entries.length > 0 && (
            <Pressable onPress={handleShare} style={styles.shareMini}>
              <MaterialCommunityIcons name="share-variant-outline" size={14} color={colors.primary} />
              <Text style={[styles.shareMiniTxt, { color: colors.primary }]}>Partager</Text>
            </Pressable>
          )}
        </View>

        {/* ── Entries list ── */}
        {entries.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="baby-carriage" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>
              Aucune période sans surveillance
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Saisis les heures de travail dans l'onglet Travail et le planning de Marie pour voir les périodes.
            </Text>
          </View>
        ) : (
          entries.map(e => {
            const wdIdx   = weekdayIndex(e.dateKey);
            const [, , d] = e.dateKey.split('-').map(Number);
            const color   = NOUNOU_COLORS[e.nounou];

            return (
              <View
                key={e.dateKey}
                style={[styles.entryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                {/* Left: date */}
                <View style={styles.entryDate}>
                  <Text style={[styles.entryDayName, { color: colors.mutedForeground }]}>
                    {FR_DAYS_LONG[wdIdx]}
                  </Text>
                  <Text style={[styles.entryDayNum, { color: colors.foreground }]}>{d}</Text>
                </View>

                {/* Center: period + sources */}
                <View style={styles.entryCenter}>
                  <Text style={[styles.entryPeriod, { color: colors.foreground }]}>
                    {fromMins(e.start)} → {fromMins(e.end)}
                  </Text>
                  <Text style={[styles.entryDuration, { color: colors.mutedForeground }]}>
                    {durationLabel(e.start, e.end)}
                  </Text>
                  {/* Source chips */}
                  <View style={styles.sourceRow}>
                    {(() => {
                      const wdIdx = weekdayIndex(e.dateKey);
                      const y = yoannScheduleFor(wdIdx, workSchedule);
                      return y ? (
                        <View style={[styles.sourceChip, { backgroundColor: '#FFC10722' }]}>
                          <Text style={[styles.sourceChipTxt, { color: '#FFC107' }]}>
                            Yoann {y.start}
                          </Text>
                        </View>
                      ) : null;
                    })()}
                    {marie[e.dateKey] && (
                      <View style={[styles.sourceChip, { backgroundColor: SHIFT_TIMES[marie[e.dateKey]!].color + '22' }]}>
                        <Text style={[styles.sourceChipTxt, { color: SHIFT_TIMES[marie[e.dateKey]!].color }]}>
                          Marie {marie[e.dateKey]}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Right: nounou badge (tappable) */}
                <Pressable
                  onPress={() => handleToggleNounou(e.dateKey)}
                  style={({ pressed }) => [
                    styles.nounouBadge,
                    { backgroundColor: color + '22', borderColor: color + '50', opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <MaterialCommunityIcons name="account" size={14} color={color} />
                  <Text style={[styles.nounouBadgeTxt, { color }]}>{e.nounou}</Text>
                  <MaterialCommunityIcons name="swap-horizontal" size={11} color={color + '80'} />
                </Pressable>
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn:      { width: 36, alignItems: 'flex-start' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 17, fontFamily: 'Inter_700Bold' },
  headerSub:    { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  shareBtn:     { width: 36, alignItems: 'flex-end' },

  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  monthArrow: { padding: 4 },
  monthLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },

  legendCard: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  legendTxt: { fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 18 },

  nounouLegend: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  nounouChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  nounouDot: { width: 8, height: 8, borderRadius: 4 },
  nounouChipTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.6 },
  shareMini: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shareMiniTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  emptyCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyTxt: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  emptySub: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },

  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    padding: 14,
    gap: 12,
  },
  entryDate: { alignItems: 'center', minWidth: 36 },
  entryDayName: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  entryDayNum:  { fontSize: 22, fontFamily: 'Inter_700Bold', lineHeight: 26 },
  entryCenter: { flex: 1 },
  entryPeriod:   { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  entryDuration: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  sourceRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  sourceChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  sourceChipTxt: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  nounouBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  nounouBadgeTxt: { fontSize: 11, fontFamily: 'Inter_700Bold' },
});
