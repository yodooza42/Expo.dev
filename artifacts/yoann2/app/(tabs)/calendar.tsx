import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { CalendarPeriod, Priority, Task } from '@/types';
import { getRecurringTransfers, type RecurringTransfer } from '@/utils/bankStorage';
import { pH } from '@/styles/header';

const PRIORITY_COLORS: Record<Priority, string> = {
  low: '#4CAF50',
  medium: '#FF9800',
  high: '#F44336',
  critical: '#9C27B0',
};

const APPOINTMENT_COLOR  = '#7C3AED';
const MARIE_APPT_COLOR   = '#EC4899';
const TRANSFER_COLOR     = '#F59E0B';

function projectTransfersForMonth(
  transfers: RecurringTransfer[],
  year: number,
  month: number,
): Record<string, RecurringTransfer[]> {
  const monthStart = new Date(year, month, 1);
  const monthEnd   = new Date(year, month + 1, 0);
  const map: Record<string, RecurringTransfer[]> = {};

  for (const rec of transfers) {
    let date = new Date(rec.nextDate);
    if (date > monthEnd) continue;
    while (date < monthStart) {
      if (rec.frequency === 'monthly') {
        date = new Date(date.getFullYear(), date.getMonth() + 1, date.getDate());
      } else {
        date = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
    }
    while (date <= monthEnd) {
      const k = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (!map[k]) map[k] = [];
      map[k].push(rec);
      if (rec.frequency === 'monthly') {
        date = new Date(date.getFullYear(), date.getMonth() + 1, date.getDate());
      } else {
        date = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
    }
  }
  return map;
}

function apptColor(a: { fromMarie?: boolean }): string {
  return a.fromMarie ? MARIE_APPT_COLOR : APPOINTMENT_COLOR;
}

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function getDaysInMonth(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: Date[] = [];
  const startDay = (first.getDay() + 6) % 7;
  for (let i = 0; i < startDay; i++) {
    days.push(new Date(year, month, -startDay + i + 1));
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, days.length - last.getDate() - startDay + 1));
  }
  return days;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function periodDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function periodDateForCalendarKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || month === undefined || !day) return '';
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function appointmentDateKey(a: { date: string }) {
  const d = new Date(a.date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function periodLanes(
  periods: CalendarPeriod[],
  week: Date[],
): { period: CalendarPeriod; startCol: number; endCol: number; lane: number }[] {
  const weekStart = periodDateKey(week[0]!);
  const weekEnd = periodDateKey(week[6]!);
  const visible = periods
    .filter(p => p.startDate <= weekEnd && p.endDate >= weekStart)
    .map(p => ({
      period: p,
      startCol: p.startDate <= weekStart ? 0 : week.findIndex(d => periodDateKey(d) === p.startDate),
      endCol: p.endDate >= weekEnd ? 6 : week.findIndex(d => periodDateKey(d) === p.endDate),
      lane: 0,
    }))
    .sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol);

  const laneEnds: number[] = [];
  visible.forEach(item => {
    let lane = laneEnds.findIndex(end => end < item.startCol);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = item.endCol;
    item.lane = lane;
  });
  return visible;
}

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tasks, projects, appointments, calendarPeriods } = useApp();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [recurringTransfers, setRecurringTransfers] = useState<RecurringTransfer[]>([]);

  useEffect(() => {
    getRecurringTransfers().then(setRecurringTransfers).catch(() => {});
  }, []);

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach(t => {
      const key = dateKey(new Date(t.dueDate));
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [tasks]);

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, typeof appointments> = {};
    appointments.forEach(a => {
      const key = appointmentDateKey(a);
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [appointments]);

  const transfersByDate = useMemo(
    () => projectTransfersForMonth(recurringTransfers, year, month),
    [recurringTransfers, year, month],
  );

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const selectedTasks        = selectedDate ? (tasksByDate[selectedDate]        ?? []) : [];
  const selectedAppointments = selectedDate ? (appointmentsByDate[selectedDate] ?? []) : [];
  const selectedTransfers    = selectedDate ? (transfersByDate[selectedDate]    ?? []) : [];
  const selectedPeriods = selectedDate
    ? calendarPeriods.filter(p => {
        const selectedPeriodDate = periodDateForCalendarKey(selectedDate);
        return p.startDate <= selectedPeriodDate && p.endDate >= selectedPeriodDate;
      })
    : [];

  const isToday = (d: Date) =>
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <View style={styles.titleRow}>
          {/* Boutons gauche */}
          <View style={pH.btnGroup}>
            <Pressable
              onPress={() => router.push('/appointment-list' as any)}
              hitSlop={8}
              style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="format-list-bulleted" size={18} color={colors.foreground} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/shopping-list' as any)}
              hitSlop={8}
              style={[pH.btn, { backgroundColor: '#FF980018', borderColor: '#FF980055' }]}
            >
              <MaterialCommunityIcons name="cart-outline" size={18} color="#FF9800" />
            </Pressable>
          </View>

          {/* Icon buttons */}
          <View style={pH.btnGroup}>
            <Pressable
              onPress={() => router.push('/appointment/new')}
              hitSlop={8}
              style={[pH.btn, { backgroundColor: '#7C3AED22', borderColor: '#7C3AED55' }]}
            >
              <MaterialCommunityIcons name="calendar-plus" size={18} color="#7C3AED" />
            </Pressable>
            <Pressable
              onPress={() => router.push('/calendar-period/new' as any)}
              hitSlop={8}
              style={[pH.btn, { backgroundColor: '#14B8A622', borderColor: '#14B8A655' }]}
            >
              <MaterialCommunityIcons name="calendar-range" size={18} color="#14B8A6" />
            </Pressable>
            <Pressable
              onPress={() => router.push('/work' as any)}
              hitSlop={8}
              style={[pH.btn, { backgroundColor: '#FFC10722', borderColor: '#FFC10755' }]}
            >
              <MaterialCommunityIcons name="briefcase-outline" size={18} color="#FFC107" />
            </Pressable>
            <Pressable
              onPress={() => router.push('/marie' as any)}
              hitSlop={8}
              style={[pH.btn, { backgroundColor: '#FF980022', borderColor: '#FF980055' }]}
            >
              <MaterialCommunityIcons name="account-heart-outline" size={18} color="#FF9800" />
            </Pressable>
            <Pressable
              onPress={() => router.push('/anna' as any)}
              hitSlop={8}
              style={[pH.btn, { backgroundColor: '#E91E6322', borderColor: '#E91E6355' }]}
            >
              <MaterialCommunityIcons name="baby-carriage" size={18} color="#E91E63" />
            </Pressable>
          </View>
        </View>

        {/* Month navigation */}
        <View style={styles.navRow}>
          <Pressable onPress={prevMonth} style={[styles.navBtn, { backgroundColor: colors.card }]}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.foreground }]}>
            {MONTHS_FR[month]} {year}
          </Text>
          <Pressable onPress={nextMonth} style={[styles.navBtn, { backgroundColor: colors.card }]}>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={styles.dayHeaders}>
          {DAYS_FR.map(d => (
            <Text key={d} style={[styles.dayHeader, { color: colors.mutedForeground }]}>{d}</Text>
          ))}
        </View>
      </View>

      {/* ── Calendar ── */}
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.calendarGrid, { paddingHorizontal: 12 }]}>
          {Array.from({ length: Math.ceil(days.length / 7) }, (_, weekIndex) => {
            const week = days.slice(weekIndex * 7, weekIndex * 7 + 7);
            const bands = periodLanes(calendarPeriods, week);
            const laneCount = bands.length ? Math.max(...bands.map(b => b.lane)) + 1 : 0;
            return (
              <View key={`week-${weekIndex}`} style={[styles.weekRow, { height: 58 + laneCount * 13 }]}>
                {week.map((d, dayIndex) => {
                  const key = dateKey(d);
                  const dayTasks = tasksByDate[key] ?? [];
                  const dayAppts = appointmentsByDate[key] ?? [];
                  const dayTransfers = transfersByDate[key] ?? [];
                  const isCurrentMonth = d.getMonth() === month;
                  const isSelected = selectedDate === key;
                  const todayFlag = isToday(d);
                  const topPriority = dayTasks.reduce<Priority | null>((best, t) => {
                    const order: Priority[] = ['critical', 'high', 'medium', 'low'];
                    if (!best) return t.priority;
                    return order.indexOf(t.priority) < order.indexOf(best) ? t.priority : best;
                  }, null);
                  return (
                    <Pressable
                      key={dayIndex}
                      onPress={() => setSelectedDate(isSelected ? null : key)}
                      style={[
                        styles.dayCell,
                        isSelected && { backgroundColor: colors.primary + '25', borderColor: colors.primary },
                        !isSelected && todayFlag && { borderColor: colors.primary },
                      ]}
                    >
                      <Text style={[styles.dayNum, { color: isCurrentMonth ? colors.foreground : colors.border }, todayFlag && { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
                        {d.getDate()}
                      </Text>
                      <View style={styles.dotRow}>
                        {topPriority && <View style={[styles.dot, { backgroundColor: PRIORITY_COLORS[topPriority] }]} />}
                        {dayAppts.slice(0, 2).map((a, j) => <View key={`a${j}`} style={[styles.dot, { backgroundColor: apptColor(a) }]} />)}
                        {dayTransfers.length > 0 && <View style={[styles.dot, { backgroundColor: TRANSFER_COLOR }]} />}
                      </View>
                    </Pressable>
                  );
                })}
                {bands.map(({ period, startCol, endCol, lane }) => (
                  <Pressable
                    key={period.id}
                    onPress={() => router.push(`/calendar-period/new?id=${period.id}` as any)}
                    style={[
                      styles.periodBand,
                      {
                        left: `${(startCol * 100) / 7}%`,
                        width: `${((endCol - startCol + 1) * 100) / 7}%`,
                        top: 39 + lane * 13,
                        backgroundColor: period.color,
                      },
                    ]}
                  >
                    {startCol === 0 && <Text style={styles.periodBandText} numberOfLines={1}>{period.name}</Text>}
                  </Pressable>
                ))}
              </View>
            );
          })}
        </View>

        {/* ── Selected day detail ── */}
        {(selectedTasks.length > 0 || selectedAppointments.length > 0 || selectedTransfers.length > 0 || selectedPeriods.length > 0) && (
          <View style={[styles.dayDetail, { paddingHorizontal: 16 }]}>
            {selectedPeriods.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  <MaterialCommunityIcons name="calendar-range" size={15} color="#14B8A6" />
                  {'  '}Périodes ({selectedPeriods.length})
                </Text>
                {selectedPeriods.map(period => (
                  <Pressable
                    key={period.id}
                    onPress={() => router.push(`/calendar-period/new?id=${period.id}` as any)}
                    style={[styles.apptItem, { backgroundColor: `${period.color}22`, borderColor: `${period.color}66`, borderLeftColor: period.color }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.apptTitle, { color: colors.foreground }]}>{period.name}</Text>
                      <Text style={[styles.apptDetail, { color: period.color }]}>
                        {period.owner === 'marie' ? 'Marie' : period.owner === 'both' ? 'Nous deux' : 'Yoann'}
                        {' · '}{period.startDate.split('-').reverse().join('/')} → {period.endDate.split('-').reverse().join('/')}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={colors.mutedForeground} />
                  </Pressable>
                ))}
              </>
            )}
            {selectedAppointments.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: selectedPeriods.length > 0 ? 12 : 0 }]}>
                  <MaterialCommunityIcons name="calendar-clock" size={15} color={APPOINTMENT_COLOR} />
                  {'  '}Rendez-vous ({selectedAppointments.length})
                </Text>
                {selectedAppointments.map(a => (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push(`/appointment/${a.id}`)}
                    style={[styles.apptItem, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: apptColor(a) }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.apptTitle, { color: colors.foreground }]} numberOfLines={1}>{a.title}</Text>
                      {a.fromMarie && (
                        <Text style={[styles.apptDetail, { color: MARIE_APPT_COLOR, marginBottom: 2 }]}>
                          <MaterialCommunityIcons name="heart-outline" size={11} /> Marie
                        </Text>
                      )}
                      <View style={styles.apptMeta}>
                        {a.time ? (
                          <Text style={[styles.apptDetail, { color: apptColor(a) }]}>
                            <MaterialCommunityIcons name="clock-outline" size={12} /> {a.time}
                          </Text>
                        ) : null}
                        {a.location ? (
                          <Text style={[styles.apptDetail, { color: colors.mutedForeground }]} numberOfLines={1}>
                            <MaterialCommunityIcons name="map-marker-outline" size={12} /> {a.location}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={colors.mutedForeground} />
                  </Pressable>
                ))}
              </>
            )}

            {selectedTransfers.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: (selectedAppointments.length > 0 || selectedPeriods.length > 0) ? 12 : 0 }]}>
                  <MaterialCommunityIcons name="bank-transfer" size={15} color={TRANSFER_COLOR} />
                  {'  '}Virements programmés ({selectedTransfers.length})
                </Text>
                {selectedTransfers.map((rec, idx) => (
                  <View
                    key={`${rec.id}-${idx}`}
                    style={[styles.taskItem, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: TRANSFER_COLOR }]}
                  >
                    <MaterialCommunityIcons name="bank-transfer" size={18} color={TRANSFER_COLOR} style={{ marginRight: 4 }} />
                    <Text style={[styles.taskTitle, { color: colors.foreground, flex: 1 }]}>
                      {rec.direction === 'to'
                        ? '⚠️ Virement vers compte épargne'
                        : '⚠️ Virement depuis compte épargne'}
                    </Text>
                    <Text style={[styles.taskProj, { color: colors.mutedForeground }]}>
                      {rec.frequency === 'monthly' ? 'Mensuel' : 'Hebdo'}
                    </Text>
                  </View>
                ))}
              </>
            )}

            {selectedTasks.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: (selectedPeriods.length > 0 || selectedAppointments.length > 0 || selectedTransfers.length > 0) ? 12 : 0 }]}>
                  Tâches ({selectedTasks.length})
                </Text>
                {selectedTasks.map(t => {
                  const proj = projects.find(p => p.id === t.projectId);
                  const pColor = PRIORITY_COLORS[t.priority];
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => router.push(`/task/${t.id}`)}
                      style={[styles.taskItem, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: pColor }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.taskTitle, { color: colors.foreground }]} numberOfLines={2}>{t.title}</Text>
                        {proj && <Text style={[styles.taskProj, { color: colors.primary }]}>{proj.name}</Text>}
                      </View>
                      <MaterialCommunityIcons
                        name={t.status === 'done' ? 'check-circle' : 'circle-outline'}
                        size={18}
                        color={t.status === 'done' ? '#4CAF50' : colors.mutedForeground}
                      />
                    </Pressable>
                  );
                })}
              </>
            )}
          </View>
        )}

        {/* ── Legend ── */}
        <View style={[styles.legend, { paddingHorizontal: 16, marginTop: 16 }]}>
          <Text style={[styles.legendTitle, { color: colors.mutedForeground }]}>Légende :</Text>
          <View style={styles.legendRow}>
            {(Object.entries(PRIORITY_COLORS) as [Priority, string][]).map(([p, c]) => (
              <View key={p} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c }]} />
                <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>
                  {{ low: 'Basse', medium: 'Moy.', high: 'Haute', critical: 'Crit.' }[p]}
                </Text>
              </View>
            ))}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: APPOINTMENT_COLOR }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>RDV</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: MARIE_APPT_COLOR }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>RDV Marie</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: TRANSFER_COLOR }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Virement</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#14B8A6' }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Période</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  monthLabel: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  dayHeaders: { flexDirection: 'row' },
  dayHeader: {
    flex: 1, textAlign: 'center', fontSize: 12,
    fontFamily: 'Inter_500Medium', paddingBottom: 4,
  },
  calendarGrid: { gap: 3 },
  weekRow: { position: 'relative', flexDirection: 'row', gap: 2 },
  dayCell: {
    flex: 1,
    height: 56,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, borderWidth: 1, borderColor: 'transparent', padding: 2,
  },
  dayNum: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  dotRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  periodBand: {
    position: 'absolute',
    height: 10,
    borderRadius: 3,
    paddingHorizontal: 4,
    justifyContent: 'center',
    zIndex: 2,
  },
  periodBandText: { color: '#fff', fontSize: 8, fontFamily: 'Inter_700Bold', lineHeight: 10 },
  dayDetail: { marginTop: 16, gap: 8 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  apptItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1, borderLeftWidth: 4,
  },
  apptTitle: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  apptMeta: { flexDirection: 'row', gap: 10, marginTop: 2, flexWrap: 'wrap' },
  apptDetail: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  taskItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1, borderLeftWidth: 4,
  },
  taskTitle: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  taskProj: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  legend: { gap: 6 },
  legendTitle: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  legendRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
