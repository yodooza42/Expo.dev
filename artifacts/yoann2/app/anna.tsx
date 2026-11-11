import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SubPageHeader } from '@/components/SubPageHeader';
import { useColors } from '@/hooks/useColors';
import { loadAnnaPlanning, toggleAnnaDay, type AnnaPlanning } from '@/utils/annaStorage';

const NOUNOU_COLOR = '#EC4899';
const FR_MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const FR_DAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month - 1, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseMonth(monthStr: string): { year: number; month: number } {
  const [year, month] = monthStr.split('-').map(Number);
  return { year: year!, month: month! };
}

function addMonths(monthStr: string, delta: number): string {
  const date = new Date(`${monthStr}-01T12:00:00`);
  date.setMonth(date.getMonth() + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function AnnaScreen() {
  const colors = useColors();
  const [monthStr, setMonthStr] = useState(currentMonthStr);
  const [planning, setPlanning] = useState<AnnaPlanning>({});

  useFocusEffect(useCallback(() => {
    let active = true;
    loadAnnaPlanning().then(data => { if (active) setPlanning(data); });
    return () => { active = false; };
  }, []));

  const { year, month } = parseMonth(monthStr);
  const monthLabel = `${FR_MONTHS[month - 1]} ${year}`;
  const totalDays = daysInMonth(year, month);
  const firstDay = firstDayOfWeek(year, month);
  const dateCells = useMemo<(number | null)[]>(() => {
    const cells: (number | null)[] = [
      ...Array(firstDay).fill(null),
      ...Array.from({ length: totalDays }, (_, index) => index + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [firstDay, totalDays]);
  const selectedDays = useMemo(() => Object.keys(planning)
    .filter(key => key.startsWith(`${monthStr}-`))
    .sort(), [planning, monthStr]);

  const handleToggle = useCallback(async (dateKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const updated = await toggleAnnaDay(dateKey, !planning[dateKey]);
      setPlanning({ ...updated });
    } catch {
      // Keep the last saved calendar visible if local storage fails.
    }
  }, [planning]);

  async function handleShare() {
    const dates = selectedDays.map(dateKey => {
      const [y, m, d] = dateKey.split('-').map(Number);
      return new Date(y!, m! - 1, d!).toLocaleDateString('fr-FR', {
        weekday: 'short', day: 'numeric', month: 'short',
      });
    });
    const message = [
      `Planning nounou — ${monthLabel}`,
      '',
      dates.length ? dates.map(date => `• ${date}`).join('\n') : 'Aucun jour de nounou sélectionné ce mois-ci.',
      '',
      'Généré par Yoann2.0',
    ].join('\n');
    await Share.share({ message, title: `Planning nounou — ${monthLabel}` });
  }

  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SubPageHeader
        title="Anna"
        subtitle="Planning nounou"
        right={
          <Pressable testID="anna-share-planning" accessibilityLabel="Partager le planning nounou"
            onPress={handleShare} hitSlop={12} style={styles.shareBtn}>
            <MaterialCommunityIcons name="share-variant-outline" size={20} color={NOUNOU_COLOR} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.monthNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable testID="anna-previous-month" accessibilityLabel="Mois précédent"
            onPress={() => setMonthStr(current => addMonths(current, -1))} hitSlop={12} style={styles.monthArrow}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.foreground }]}>{monthLabel}</Text>
          <Pressable testID="anna-next-month" accessibilityLabel="Mois suivant"
            onPress={() => setMonthStr(current => addMonths(current, 1))} hitSlop={12} style={styles.monthArrow}>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statChip, { backgroundColor: `${NOUNOU_COLOR}20` }]}>
            <View style={[styles.nounouDot, { backgroundColor: NOUNOU_COLOR }]} />
            <Text style={[styles.statChipTxt, { color: NOUNOU_COLOR }]}>
              {selectedDays.length} jour{selectedDays.length > 1 ? 's' : ''} nounou
            </Text>
          </View>
        </View>

        <View style={[styles.calCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.calHeaderRow}>
            {FR_DAYS_SHORT.map((day, index) => (
              <Text key={`${day}-${index}`} style={[styles.calHeaderCell, {
                color: index >= 5 ? '#FF9800' : colors.mutedForeground,
              }]}>{day}</Text>
            ))}
          </View>

          {Array.from({ length: dateCells.length / 7 }, (_, row) => (
            <View key={row} style={styles.calRow}>
              {dateCells.slice(row * 7, row * 7 + 7).map((dayNum, col) => {
                if (dayNum === null) return <View key={col} style={styles.calCell} />;
                const dateKey = toDateKey(year, month, dayNum);
                const selected = !!planning[dateKey];
                const isToday = dateKey === todayKey;
                const dayColor = selected ? '#fff' : isToday ? colors.primary : colors.foreground;

                return (
                  <Pressable key={col} testID={`anna-day-${dateKey}`} accessibilityRole="checkbox"
                    accessibilityLabel={`${dayNum} ${FR_MONTHS[month - 1]}${selected ? ', jour de nounou' : ', pas de nounou'}`}
                    accessibilityState={{ checked: selected }}
                    onPress={() => { void handleToggle(dateKey); }}
                    style={({ pressed }) => [styles.calCell, { opacity: pressed ? 0.6 : 1 }]}>
                    <View style={[
                      styles.calDayCircle,
                      { backgroundColor: selected ? NOUNOU_COLOR : isToday ? `${colors.primary}30` : 'transparent' },
                      isToday && !selected && { borderWidth: 1.5, borderColor: colors.primary },
                    ]}>
                      <Text style={[styles.calDayNum, { color: dayColor }]}>{dayNum}</Text>
                    </View>
                    {selected && <Text style={[styles.calDayLabel, { color: NOUNOU_COLOR }]}>Nounou</Text>}
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={[styles.calLegend, { borderTopColor: colors.border }]}>
            <View style={[styles.legendDot, { backgroundColor: NOUNOU_COLOR }]} />
            <Text style={[styles.calLegendHint, { color: colors.mutedForeground }]}>
              Appuyer pour sélectionner ou désélectionner un jour
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  shareBtn: { width: 36, alignItems: 'flex-end' },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  monthArrow: { padding: 4 },
  monthLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statChipTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  nounouDot: { width: 8, height: 8, borderRadius: 4 },
  calCard: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
    marginBottom: 20, padding: 12,
  },
  calHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  calHeaderCell: {
    flex: 1, textAlign: 'center', fontSize: 11,
    fontFamily: 'Inter_600SemiBold', paddingBottom: 4,
  },
  calRow: { flexDirection: 'row', marginBottom: 2 },
  calCell: { flex: 1, alignItems: 'center', paddingVertical: 2, minHeight: 48 },
  calDayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  calDayNum: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  calDayLabel: { fontSize: 7, lineHeight: 9, fontFamily: 'Inter_700Bold', marginTop: 1 },
  calLegend: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 10,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  calLegendHint: { fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
