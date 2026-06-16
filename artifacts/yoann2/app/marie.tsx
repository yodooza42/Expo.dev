import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import {
  type MariePlanning,
  type Shift,
  SHIFT_TIMES,
  loadMariePlanning,
  setMarieDay,
} from '@/utils/marieStorage';

// ── Helpers ────────────────────────────────────────────────────────────────

const FR_MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const FR_DAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const FR_DAYS_LONG  = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  const d = new Date(year, month - 1, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y, month: m, day: d };
}

function weekdayIndex(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  const d = new Date(year, month - 1, day).getDay();
  return d === 0 ? 6 : d - 1;
}

function parseMonth(monthStr: string): { year: number; month: number } {
  const [y, m] = monthStr.split('-').map(Number);
  return { year: y, month: m };
}

function addMonths(monthStr: string, delta: number): string {
  let { year, month } = parseMonth(monthStr);
  month += delta;
  if (month > 12) { month -= 12; year++; }
  if (month < 1)  { month += 12; year--; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Total minutes worked (PB=7h40, PD=7h10)
function shiftMinutes(shift: Shift): number {
  return shift === 'PB' ? 7 * 60 + 40 : 7 * 60 + 10;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MarieScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const topPad  = Platform.OS === 'web' ? 67 : insets.top;

  const [monthStr, setMonthStr] = useState(currentMonthStr);
  const [planning, setPlanning] = useState<MariePlanning>({});

  useEffect(() => {
    loadMariePlanning().then(setPlanning);
  }, []);

  const { year, month } = parseMonth(monthStr);
  const totalDays = daysInMonth(year, month);
  const firstDay  = firstDayOfWeek(year, month);

  const monthLabel = `${FR_MONTHS[month - 1]} ${year}`;

  // Working days for this month
  const workingDays = Array.from({ length: totalDays }, (_, i) => toDateKey(year, month, i + 1))
    .filter(d => planning[d]);

  // Stats
  const pbCount = workingDays.filter(d => planning[d] === 'PB').length;
  const pdCount = workingDays.filter(d => planning[d] === 'PD').length;
  const totalMin = workingDays.reduce((s, d) => s + shiftMinutes(planning[d]!), 0);
  const totalH   = Math.floor(totalMin / 60);
  const totalM   = totalMin % 60;

  const handleToggle = useCallback(async (dateKey: string) => {
    const current = planning[dateKey];
    let next: Shift | null;
    if (!current)       next = 'PB';
    else if (current === 'PB') next = 'PD';
    else                next = null;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = await setMarieDay(dateKey, next);
    setPlanning({ ...updated });
  }, [planning]);

  // Calendar grid cells: blanks + days
  const calendarCells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  // Pad to full rows of 7
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Marie</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Planning mensuel</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

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

        {/* ── Stats row ── */}
        {workingDays.length > 0 && (
          <View style={styles.statsRow}>
            <View style={[styles.statChip, { backgroundColor: SHIFT_TIMES.PB.color + '20' }]}>
              <Text style={[styles.statChipTxt, { color: SHIFT_TIMES.PB.color }]}>{pbCount} PB</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: SHIFT_TIMES.PD.color + '20' }]}>
              <Text style={[styles.statChipTxt, { color: SHIFT_TIMES.PD.color }]}>{pdCount} PD</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: colors.card }]}>
              <MaterialCommunityIcons name="clock-outline" size={12} color={colors.mutedForeground} />
              <Text style={[styles.statChipTxt, { color: colors.mutedForeground }]}>
                {totalH}h{totalM > 0 ? String(totalM).padStart(2, '0') : ''}
              </Text>
            </View>
          </View>
        )}

        {/* ── Calendar grid ── */}
        <View style={[styles.calCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Day headers */}
          <View style={styles.calHeaderRow}>
            {FR_DAYS_SHORT.map((d, i) => (
              <Text key={i} style={[styles.calHeaderCell, { color: i >= 5 ? '#FF9800' : colors.mutedForeground }]}>{d}</Text>
            ))}
          </View>

          {/* Day cells */}
          {Array.from({ length: calendarCells.length / 7 }, (_, row) => (
            <View key={row} style={styles.calRow}>
              {calendarCells.slice(row * 7, row * 7 + 7).map((dayNum, col) => {
                if (dayNum === null) {
                  return <View key={col} style={styles.calCell} />;
                }
                const dateKey = toDateKey(year, month, dayNum);
                const shift   = planning[dateKey];
                const isToday = dateKey === toDateKey(
                  new Date().getFullYear(),
                  new Date().getMonth() + 1,
                  new Date().getDate(),
                );
                const bgColor = shift
                  ? SHIFT_TIMES[shift].color
                  : isToday
                    ? colors.primary + '30'
                    : 'transparent';
                const textColor = shift
                  ? '#fff'
                  : isToday
                    ? colors.primary
                    : colors.foreground;

                return (
                  <Pressable
                    key={col}
                    onPress={() => handleToggle(dateKey)}
                    style={({ pressed }) => [
                      styles.calCell,
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <View style={[
                      styles.calDayCircle,
                      { backgroundColor: bgColor },
                      isToday && !shift && { borderWidth: 1.5, borderColor: colors.primary },
                    ]}>
                      <Text style={[styles.calDayNum, { color: textColor }]}>{dayNum}</Text>
                    </View>
                    {shift && (
                      <Text style={[styles.calDayShift, { color: SHIFT_TIMES[shift].color }]}>
                        {shift}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* Legend */}
          <View style={[styles.calLegend, { borderTopColor: colors.border }]}>
            <Text style={[styles.calLegendHint, { color: colors.mutedForeground }]}>
              Appuyer pour : vide → PB → PD → vide
            </Text>
          </View>
        </View>

        {/* ── Working days list ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            JOURS TRAVAILLÉS · {workingDays.length}
          </Text>
        </View>

        {workingDays.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>
              Aucun jour saisi pour {monthLabel}
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Appuie sur un jour du calendrier pour ajouter un quart
            </Text>
          </View>
        ) : (
          workingDays.map(dateKey => {
            const { day } = parseDateKey(dateKey);
            const wdIdx  = weekdayIndex(dateKey);
            const shift  = planning[dateKey]!;
            const info   = SHIFT_TIMES[shift];
            return (
              <Pressable
                key={dateKey}
                onPress={() => handleToggle(dateKey)}
                style={({ pressed }) => [
                  styles.dayRow,
                  { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={[styles.dayShiftBar, { backgroundColor: info.color }]} />
                <View style={styles.dayContent}>
                  <View style={styles.dayLeft}>
                    <Text style={[styles.dayName, { color: colors.mutedForeground }]}>
                      {FR_DAYS_LONG[wdIdx]}
                    </Text>
                    <Text style={[styles.dayNum2, { color: colors.foreground }]}>{day}</Text>
                  </View>
                  <View style={[styles.shiftBadge, { backgroundColor: info.color + '22' }]}>
                    <Text style={[styles.shiftBadgeTxt, { color: info.color }]}>{shift}</Text>
                  </View>
                  <Text style={[styles.dayTimes, { color: colors.foreground }]}>
                    {info.start} – {info.end}
                  </Text>
                </View>
                <MaterialCommunityIcons name="gesture-tap" size={14} color={colors.mutedForeground + '60'} style={{ marginRight: 4 }} />
              </Pressable>
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
  backBtn: { width: 36, alignItems: 'flex-start' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  headerSub:   { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },

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

  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statChipTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  calCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 20,
    padding: 12,
  },
  calHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  calHeaderCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    paddingBottom: 4,
  },
  calRow: { flexDirection: 'row', marginBottom: 2 },
  calCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  calDayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayNum: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  calDayShift: { fontSize: 8, fontFamily: 'Inter_700Bold', marginTop: 1 },
  calLegend: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 8,
    alignItems: 'center',
  },
  calLegendHint: { fontSize: 10, fontFamily: 'Inter_400Regular' },

  sectionHeader: { marginBottom: 8 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.6 },

  emptyCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyTxt: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  emptySub: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    overflow: 'hidden',
  },
  dayShiftBar: { width: 4, alignSelf: 'stretch' },
  dayContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  dayLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 5, minWidth: 70 },
  dayName: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  dayNum2: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  shiftBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  shiftBadgeTxt: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  dayTimes: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1, textAlign: 'right' },
});
