import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { Appointment, Priority, Task } from '@/types';

const PRIORITY_COLORS: Record<Priority, string> = {
  low: '#4CAF50',
  medium: '#FF9800',
  high: '#F44336',
  critical: '#9C27B0',
};

const APPOINTMENT_COLOR = '#7C3AED';

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

function appointmentDateKey(a: Appointment) {
  const d = new Date(a.date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tasks, projects, appointments, deleteAppointment } = useApp();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

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
    const map: Record<string, Appointment[]> = {};
    appointments.forEach(a => {
      const key = appointmentDateKey(a);
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [appointments]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const selectedTasks = selectedDate ? (tasksByDate[selectedDate] ?? []) : [];
  const selectedAppointments = selectedDate ? (appointmentsByDate[selectedDate] ?? []) : [];

  const isToday = (d: Date) =>
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Calendrier</Text>
          <Pressable
            onPress={() => router.push('/appointment/new')}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="calendar-plus" size={18} color={colors.primaryForeground} />
            <Text style={[styles.addBtnLabel, { color: colors.primaryForeground }]}>RDV</Text>
          </Pressable>
        </View>
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

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.grid, { paddingHorizontal: 12 }]}>
          {days.map((d, i) => {
            const key = dateKey(d);
            const dayTasks = tasksByDate[key] ?? [];
            const dayAppts = appointmentsByDate[key] ?? [];
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
                key={i}
                onPress={() => setSelectedDate(isSelected ? null : key)}
                style={[
                  styles.dayCell,
                  isSelected && { backgroundColor: colors.primary + '25', borderColor: colors.primary },
                  !isSelected && todayFlag && { borderColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.dayNum,
                    { color: isCurrentMonth ? colors.foreground : colors.border },
                    todayFlag && { color: colors.primary, fontFamily: 'Inter_700Bold' },
                  ]}
                >
                  {d.getDate()}
                </Text>
                <View style={styles.dotRow}>
                  {dayTasks.slice(0, 2).map((t, j) => (
                    <View key={j} style={[styles.dot, { backgroundColor: PRIORITY_COLORS[t.priority] }]} />
                  ))}
                  {dayAppts.slice(0, 1).map((_, j) => (
                    <View key={`a${j}`} style={[styles.dot, { backgroundColor: APPOINTMENT_COLOR }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {(selectedTasks.length > 0 || selectedAppointments.length > 0) && (
          <View style={[styles.dayDetail, { paddingHorizontal: 16 }]}>
            {selectedAppointments.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  <MaterialCommunityIcons name="calendar-clock" size={15} color={APPOINTMENT_COLOR} />
                  {'  '}Rendez-vous ({selectedAppointments.length})
                </Text>
                {selectedAppointments.map(a => (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push(`/appointment/${a.id}`)}
                    style={[styles.apptItem, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: APPOINTMENT_COLOR }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.apptTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {a.title}
                      </Text>
                      <View style={styles.apptMeta}>
                        {a.time ? (
                          <Text style={[styles.apptDetail, { color: APPOINTMENT_COLOR }]}>
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

            {selectedTasks.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: selectedAppointments.length > 0 ? 12 : 0 }]}>
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
                        <Text style={[styles.taskTitle, { color: colors.foreground }]} numberOfLines={2}>
                          {t.title}
                        </Text>
                        {proj && (
                          <Text style={[styles.taskProj, { color: colors.primary }]}>{proj.name}</Text>
                        )}
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
    gap: 12,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  dayHeaders: {
    flexDirection: 'row',
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    paddingBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  dayCell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: 2,
  },
  dayNum: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  dotRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dayDetail: {
    marginTop: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 4,
  },
  apptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  apptTitle: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  apptMeta: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  apptDetail: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  taskTitle: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  taskProj: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  legend: {
    gap: 6,
  },
  legendTitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
