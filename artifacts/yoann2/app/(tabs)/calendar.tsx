import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import type { Priority, Task } from '@/types';

const PRIORITY_COLORS: Record<Priority, string> = {
  low: '#4CAF50',
  medium: '#FF9800',
  high: '#F44336',
  critical: '#9C27B0',
};

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

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { tasks, projects } = useApp();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach(t => {
      const d = new Date(t.dueDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [tasks]);

  function dateKey(d: Date) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const selectedTasks = selectedDate ? (tasksByDate[selectedDate] ?? []) : [];
  const isToday = (d: Date) =>
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Calendrier</Text>
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
                {dayTasks.length > 0 && (
                  <View style={styles.dotRow}>
                    {dayTasks.slice(0, 3).map((t, j) => (
                      <View
                        key={j}
                        style={[styles.dot, { backgroundColor: PRIORITY_COLORS[t.priority] }]}
                      />
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {selectedTasks.length > 0 && (
          <View style={[styles.taskList, { paddingHorizontal: 16 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {selectedTasks.length} tâche{selectedTasks.length > 1 ? 's' : ''}
            </Text>
            {selectedTasks.map(t => {
              const proj = projects.find(p => p.id === t.projectId);
              const pColor = PRIORITY_COLORS[t.priority];
              return (
                <View
                  key={t.id}
                  style={[styles.taskItem, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: pColor }]}
                >
                  <View style={[styles.taskDot, { backgroundColor: pColor }]} />
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
                </View>
              );
            })}
          </View>
        )}

        <View style={[styles.legend, { paddingHorizontal: 16, marginTop: 16 }]}>
          <Text style={[styles.legendTitle, { color: colors.mutedForeground }]}>Légende priorité :</Text>
          <View style={styles.legendRow}>
            {(Object.entries(PRIORITY_COLORS) as [Priority, string][]).map(([p, c]) => (
              <View key={p} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c }]} />
                <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>
                  {{ low: 'Basse', medium: 'Moy.', high: 'Haute', critical: 'Crit.' }[p]}
                </Text>
              </View>
            ))}
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
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
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
  taskList: {
    marginTop: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 4,
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
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
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
    gap: 16,
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
