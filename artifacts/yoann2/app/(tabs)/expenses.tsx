import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';

const { width } = Dimensions.get('window');
const CHART_W = width - 32;
const CHART_H = 200;
const PAD = { top: 20, right: 16, bottom: 36, left: 46 };

const LINE_COLORS = [
  '#FFC107', '#2196F3', '#4CAF50', '#F44336',
  '#9C27B0', '#FF9800', '#00BCD4', '#E91E63',
];

type PeriodKey = '3m' | '6m' | '1y' | '2y' | 'custom';

interface MonthPoint {
  year: number;
  month: number;
  label: string;
}

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: '3m', label: '3 mois' },
  { key: '6m', label: '6 mois' },
  { key: '1y', label: '1 an' },
  { key: '2y', label: '2 ans' },
  { key: 'custom', label: 'Période…' },
];

function parseFrDate(s: string): Date | null {
  const parts = s.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return null;
  return date;
}

function getMonthsBetween(start: Date, end: Date): MonthPoint[] {
  const result: MonthPoint[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    result.push({
      year: cur.getFullYear(),
      month: cur.getMonth(),
      label: cur.toLocaleDateString('fr-FR', { month: 'short', year: cur.getFullYear() !== new Date().getFullYear() ? '2-digit' : undefined }),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}

function getMonthsForPeriod(
  period: PeriodKey,
  customStart: string,
  customEnd: string
): MonthPoint[] {
  const now = new Date();
  if (period === 'custom') {
    const s = parseFrDate(customStart);
    const e = parseFrDate(customEnd);
    if (!s || !e || s > e) return [];
    return getMonthsBetween(s, e);
  }
  const monthsBack = period === '3m' ? 3 : period === '6m' ? 6 : period === '1y' ? 12 : 24;
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
  return getMonthsBetween(start, now);
}

export default function ExpensesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { projects, expenses } = useApp();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<PeriodKey>('6m');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    return `01/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  });
  const [customEnd, setCustomEnd] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  });

  useFocusEffect(
    useCallback(() => {
      if (selectedIds.size === 0 && projects.length > 0) {
        setSelectedIds(new Set(projects.slice(0, 3).map(p => p.id)));
      }
    }, [projects])
  );

  const months = useMemo(
    () => getMonthsForPeriod(period, customStart, customEnd),
    [period, customStart, customEnd]
  );

  const projectTotals = useMemo(() => {
    return projects
      .map(p => ({
        project: p,
        total: expenses.filter(e => e.projectId === p.id).reduce((s, e) => s + e.amount, 0),
      }))
      .filter(pt => pt.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [projects, expenses]);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    projectTotals.forEach(({ project, total }) => {
      const cat = project.category || 'Sans catégorie';
      map.set(cat, (map.get(cat) ?? 0) + total);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [projectTotals]);

  const chartData = useMemo(() => {
    return projects
      .filter(p => selectedIds.has(p.id))
      .map((p, idx) => {
        const data = months.map(({ year, month }) =>
          expenses
            .filter(e => {
              if (e.projectId !== p.id) return false;
              const d = new Date(e.date);
              return d.getFullYear() === year && d.getMonth() === month;
            })
            .reduce((s, e) => s + e.amount, 0)
        );
        const color = LINE_COLORS[projects.indexOf(p) % LINE_COLORS.length];
        return { project: p, data, color };
      });
  }, [selectedIds, projects, expenses, months]);

  const maxVal = useMemo(() => {
    const all = chartData.flatMap(d => d.data);
    return Math.max(...all, 1);
  }, [chartData]);

  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;

  function getX(i: number) {
    return PAD.left + (months.length <= 1 ? innerW / 2 : (i / (months.length - 1)) * innerW);
  }
  function getY(v: number) {
    return PAD.top + innerH - (v / maxVal) * innerH;
  }

  const labelStep = months.length <= 6 ? 1 : months.length <= 12 ? 2 : months.length <= 18 ? 3 : 4;

  function toggleProject(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const totalAll = expenses.reduce((s, e) => s + e.amount, 0);
  const gridTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Finances</Text>
        <View style={[styles.totalBadge, { backgroundColor: colors.primary + '18' }]}>
          <Text style={[styles.totalTxt, { color: colors.primary }]}>
            {totalAll.toFixed(2)} €
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {expenses.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="chart-line" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>
              Aucune dépense enregistrée
            </Text>
          </View>
        ) : (
          <>
            {/* Category totals */}
            <Text style={[styles.section, { color: colors.mutedForeground }]}>Par catégorie</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {categoryTotals.map(([cat, total], i) => (
                <View
                  key={cat}
                  style={[
                    styles.catRow,
                    i < categoryTotals.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <MaterialCommunityIcons name="tag-outline" size={16} color={colors.primary} />
                  <Text style={[styles.catName, { color: colors.foreground }]}>{cat}</Text>
                  <Text style={[styles.catAmount, { color: colors.primary }]}>
                    {total.toFixed(2)} €
                  </Text>
                </View>
              ))}
            </View>

            {/* Per project */}
            <Text style={[styles.section, { color: colors.mutedForeground }]}>Par projet</Text>
            {projectTotals.map(({ project, total }) => {
              const budget = project.budget;
              const pct = budget > 0 ? Math.min((total / budget) * 100, 100) : 0;
              const over = budget > 0 && total > budget;
              return (
                <View
                  key={project.id}
                  style={[styles.projRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={[styles.projName, { color: colors.foreground }]}>{project.name}</Text>
                    <Text style={[styles.projCat, { color: colors.mutedForeground }]}>{project.category}</Text>
                    {budget > 0 && (
                      <>
                        <View style={[styles.budgetTrack, { backgroundColor: colors.border }]}>
                          <View style={[styles.budgetFill, {
                            width: `${pct}%`,
                            backgroundColor: over ? colors.destructive : colors.primary,
                          }]} />
                        </View>
                        <Text style={[styles.budgetLbl, { color: over ? colors.destructive : colors.mutedForeground }]}>
                          {total.toFixed(2)} € / {budget} €
                        </Text>
                      </>
                    )}
                  </View>
                  <Text style={[styles.projAmount, { color: over ? colors.destructive : colors.primary }]}>
                    {total.toFixed(2)} €
                  </Text>
                </View>
              );
            })}

            {/* Chart section */}
            {projects.length > 0 && (
              <>
                <Text style={[styles.section, { color: colors.mutedForeground }]}>Comparaison mensuelle</Text>

                {/* Period selector */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 8 }}>
                  {PERIOD_OPTIONS.map(opt => {
                    const active = period === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => setPeriod(opt.key)}
                        style={[
                          styles.periodChip,
                          active
                            ? { backgroundColor: colors.primary, borderColor: colors.primary }
                            : { backgroundColor: colors.card, borderColor: colors.border },
                        ]}
                      >
                        <Text style={[styles.periodChipTxt, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Custom date range inputs */}
                {period === 'custom' && (
                  <View style={[styles.customDateRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <MaterialCommunityIcons name="calendar-start" size={16} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.customDateLabel, { color: colors.mutedForeground }]}>Début (JJ/MM/AAAA)</Text>
                      <TextInput
                        value={customStart}
                        onChangeText={setCustomStart}
                        placeholder="01/01/2024"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="numeric"
                        style={[styles.customDateInput, { color: colors.foreground, borderColor: colors.border }]}
                      />
                    </View>
                    <View style={[styles.customDateDivider, { backgroundColor: colors.border }]} />
                    <MaterialCommunityIcons name="calendar-end" size={16} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.customDateLabel, { color: colors.mutedForeground }]}>Fin (JJ/MM/AAAA)</Text>
                      <TextInput
                        value={customEnd}
                        onChangeText={setCustomEnd}
                        placeholder="31/12/2024"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="numeric"
                        style={[styles.customDateInput, { color: colors.foreground, borderColor: colors.border }]}
                      />
                    </View>
                  </View>
                )}

                {months.length === 0 ? (
                  <View style={[styles.chartBox, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>
                      Période invalide — vérifiez les dates
                    </Text>
                  </View>
                ) : (
                  <>
                    {/* Project selector chips */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 8 }}>
                      {projects.map((p, idx) => {
                        const on = selectedIds.has(p.id);
                        const c = LINE_COLORS[idx % LINE_COLORS.length];
                        return (
                          <Pressable
                            key={p.id}
                            onPress={() => toggleProject(p.id)}
                            style={[
                              styles.chip,
                              on
                                ? { backgroundColor: c + '25', borderColor: c }
                                : { backgroundColor: colors.card, borderColor: colors.border },
                            ]}
                          >
                            <View style={[styles.chipDot, { backgroundColor: on ? c : colors.mutedForeground }]} />
                            <Text style={[styles.chipTxt, { color: on ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                              {p.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    {/* Period info */}
                    <Text style={[styles.periodInfo, { color: colors.mutedForeground }]}>
                      {months[0]
                        ? `${months[0].label} ${months[0].year} → ${months[months.length - 1].label} ${months[months.length - 1].year}  ·  ${months.length} mois`
                        : ''}
                    </Text>

                    {/* SVG Line chart */}
                    <View style={[styles.chartBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Svg width={CHART_W - 32} height={CHART_H}>
                        {gridTicks.map(t => {
                          const y = PAD.top + innerH * (1 - t);
                          const label = Math.round(maxVal * t);
                          return (
                            <React.Fragment key={t}>
                              <Line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y} stroke={colors.border} strokeWidth={1} />
                              <SvgText x={PAD.left - 4} y={y + 4} fontSize={8} fill={colors.mutedForeground} textAnchor="end">
                                {label > 999 ? `${Math.round(label / 100) / 10}k` : String(label)}
                              </SvgText>
                            </React.Fragment>
                          );
                        })}

                        {months.map((m, i) => {
                          if (i % labelStep !== 0 && i !== months.length - 1) return null;
                          const shortLabel = m.label.replace('.', '');
                          const showYear = m.month === 0 || i === 0;
                          return (
                            <SvgText key={i} x={getX(i)} y={CHART_H - 6} fontSize={8} fill={colors.mutedForeground} textAnchor="middle">
                              {showYear ? `${shortLabel} ${String(m.year).slice(2)}` : shortLabel}
                            </SvgText>
                          );
                        })}

                        {chartData.map(({ project, data, color }) => {
                          const pathD = data.reduce((acc, v, i) => {
                            const x = getX(i);
                            const y = getY(v);
                            return acc + (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
                          }, '');
                          return (
                            <React.Fragment key={project.id}>
                              <Path d={pathD} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                              {data.map((v, i) =>
                                v > 0 ? <Circle key={i} cx={getX(i)} cy={getY(v)} r={months.length > 12 ? 2.5 : 4} fill={color} /> : null
                              )}
                            </React.Fragment>
                          );
                        })}
                      </Svg>

                      <View style={styles.legend}>
                        {chartData.map(({ project, color }) => (
                          <View key={project.id} style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: color }]} />
                            <Text style={[styles.legendTxt, { color: colors.mutedForeground }]} numberOfLines={1}>
                              {project.name}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  totalBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  totalTxt: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  content: { paddingHorizontal: 16, gap: 8 },
  section: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
  },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  catName: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  catAmount: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  projRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  projName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  projCat: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  budgetTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  budgetFill: { height: 5, borderRadius: 3 },
  budgetLbl: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  projAmount: { fontSize: 16, fontFamily: 'Inter_700Bold', minWidth: 60, textAlign: 'right' },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  periodChipTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 4,
  },
  customDateLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 3 },
  customDateInput: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    borderBottomWidth: 1,
    paddingBottom: 2,
  },
  customDateDivider: { width: 1, height: 36, marginHorizontal: 2 },
  periodInfo: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 160,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  chartBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    minHeight: 80,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendTxt: { fontSize: 11, fontFamily: 'Inter_400Regular', maxWidth: 100 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTxt: { fontSize: 15, fontFamily: 'Inter_400Regular' },
});
