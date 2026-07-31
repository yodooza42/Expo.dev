import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { BottomSheet } from '@/components/BottomSheet';
import { SubPageHeader } from '@/components/SubPageHeader';
import { exportExpensesCSV, exportExpensesPDF } from '@/utils/expenseExport';
import { fmtDateSlash } from '@/utils/date';
import { fmtEuro } from '@/utils/money';

const SHOW_AMOUNTS_KEY = '@yoann2/show_amounts';

const { width } = Dimensions.get('window');
const CHART_W = width - 32;
const CHART_H = 200;
const PAD = { top: 20, right: 16, bottom: 36, left: 46 };

const LINE_COLORS = [
  '#FFC107', '#2196F3', '#4CAF50', '#F44336',
  '#9C27B0', '#FF9800', '#00BCD4', '#E91E63',
];

// Couleurs par catégorie de revenu
const INCOME_CAT_COLORS: Record<string, string> = {
  'Salaire':          '#4CAF50',
  'Freelance':        '#66BB6A',
  'Vente':            '#26A69A',
  'Allocation':       '#00BCD4',
  'Remboursement':    '#29B6F6',
  'Investissement':   '#8BC34A',
  'Autre revenu':     '#43A047',
  'Non classé':       '#9E9E9E',
};

// Couleurs par catégorie de dépense
const CAT_COLORS: Record<string, string> = {
  'Alimentation': '#FF9800',
  'Transport': '#2196F3',
  'Carburant': '#F44336',
  'Logement': '#4CAF50',
  'Santé': '#E91E63',
  'Loisirs': '#9C27B0',
  'Abonnements': '#00BCD4',
  'Vêtements': '#795548',
  'Matériaux / Projet': '#607D8B',
  'Restauration': '#FF5722',
  'Autre': '#9E9E9E',
  'Non classé': '#9E9E9E',
};

const SEASONS_LABELS = ['Printemps', 'Été', 'Automne', 'Hiver'];

type DepMode = 'mensuel' | 'saisonnier' | 'annuel';
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

function initSeason(): { season: number; year: number } {
  const m = new Date().getMonth();
  const y = new Date().getFullYear();
  if (m <= 1)  return { season: 3, year: y };       // jan/fév → Hiver(Y)
  if (m <= 4)  return { season: 0, year: y };       // mar-mai → Printemps(Y)
  if (m <= 7)  return { season: 1, year: y };       // jun-aoû → Été(Y)
  if (m <= 10) return { season: 2, year: y };       // sep-nov → Automne(Y)
  return { season: 3, year: y + 1 };               // déc → Hiver(Y+1)
}

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

function getMonthsForPeriod(period: PeriodKey, customStart: string, customEnd: string): MonthPoint[] {
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
  const router = useRouter();
  const { projects, transactions } = useApp();
  const expenses = useMemo(
    () => transactions.filter(t => t.type === 'expense'),
    [transactions]
  );
  const incomes = useMemo(
    () => transactions.filter(t => t.type === 'income'),
    [transactions]
  );

  // ── État existant ─────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<PeriodKey>('6m');
  const [selectedExpenseCat, setSelectedExpenseCat] = useState<string | null>(null);
  const [catSort, setCatSort] = useState<'date-desc' | 'date-asc' | 'price-desc' | 'price-asc' | 'project'>('date-desc');
  const [exporting, setExporting] = useState(false);
  const [showAmounts, setShowAmounts] = useState(false);

  React.useEffect(() => {
    AsyncStorage.getItem(SHOW_AMOUNTS_KEY).then(val => {
      if (val === 'true') setShowAmounts(true);
    });
  }, []);

  function toggleShowAmounts() {
    Haptics.selectionAsync();
    setShowAmounts(v => {
      const next = !v;
      AsyncStorage.setItem(SHOW_AMOUNTS_KEY, String(next));
      return next;
    });
  }

  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    return `01/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  });
  const [customEnd, setCustomEnd] = useState(() => fmtDateSlash(new Date()));

  // ── État section "Dépenses" (nouveau) ─────────────────────────────────────
  const [depMode, setDepMode] = useState<DepMode>('mensuel');
  const [depMonth, setDepMonth] = useState(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  }));
  const [depSeason, setDepSeason] = useState(initSeason);
  const [depYear, setDepYear] = useState(() => new Date().getFullYear());

  // Plage de dates pour la période sélectionnée
  const depRange = useMemo(() => {
    if (depMode === 'mensuel') {
      const start = new Date(depMonth.year, depMonth.month, 1);
      const end = new Date(depMonth.year, depMonth.month + 1, 0, 23, 59, 59, 999);
      const raw = start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return { startTs: start.getTime(), endTs: end.getTime(), label: raw.charAt(0).toUpperCase() + raw.slice(1) };
    }
    if (depMode === 'saisonnier') {
      const { season, year } = depSeason;
      let start: Date, end: Date;
      if (season === 0) {      // Printemps : mars-mai
        start = new Date(year, 2, 1); end = new Date(year, 4, 31, 23, 59, 59, 999);
      } else if (season === 1) { // Été : juin-août
        start = new Date(year, 5, 1); end = new Date(year, 7, 31, 23, 59, 59, 999);
      } else if (season === 2) { // Automne : sept-nov
        start = new Date(year, 8, 1); end = new Date(year, 10, 30, 23, 59, 59, 999);
      } else {                  // Hiver : déc(Y-1) – fév(Y)
        start = new Date(year - 1, 11, 1); end = new Date(year, 2, 0, 23, 59, 59, 999);
      }
      return { startTs: start.getTime(), endTs: end.getTime(), label: `${SEASONS_LABELS[season]} ${year}` };
    }
    // Annuel
    const start = new Date(depYear, 0, 1);
    const end = new Date(depYear, 11, 31, 23, 59, 59, 999);
    return { startTs: start.getTime(), endTs: end.getTime(), label: String(depYear) };
  }, [depMode, depMonth, depSeason, depYear]);

  // Totaux par catégorie pour la période sélectionnée
  const depByCat = useMemo(() => {
    const filtered = expenses.filter(e => {
      const ts = new Date(e.date).getTime();
      return ts >= depRange.startTs && ts <= depRange.endTs;
    });
    const map = new Map<string, number>();
    filtered.forEach(e => {
      const cat = e.category?.trim() || 'Non classé';
      map.set(cat, (map.get(cat) ?? 0) + e.amount);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses, depRange]);

  const depTotal = useMemo(() => depByCat.reduce((s, [, v]) => s + v, 0), [depByCat]);

  const [statsView, setStatsView] = useState<'expense' | 'income'>('expense');

  const incByCat = useMemo(() => {
    const filtered = incomes.filter(e => {
      const ts = new Date(e.date).getTime();
      return ts >= depRange.startTs && ts <= depRange.endTs;
    });
    const map = new Map<string, number>();
    filtered.forEach(e => {
      const cat = e.category?.trim() || 'Non classé';
      map.set(cat, (map.get(cat) ?? 0) + e.amount);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [incomes, depRange]);

  const incTotal = useMemo(() => incByCat.reduce((s, [, v]) => s + v, 0), [incByCat]);

  function depNavPrev() {
    Haptics.selectionAsync();
    if (depMode === 'mensuel') {
      setDepMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 });
    } else if (depMode === 'saisonnier') {
      setDepSeason(s => s.season === 0 ? { season: 3, year: s.year - 1 } : { season: s.season - 1, year: s.year });
    } else {
      setDepYear(y => y - 1);
    }
  }

  function depNavNext() {
    Haptics.selectionAsync();
    if (depMode === 'mensuel') {
      setDepMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 });
    } else if (depMode === 'saisonnier') {
      setDepSeason(s => s.season === 3 ? { season: 0, year: s.year + 1 } : { season: s.season + 1, year: s.year });
    } else {
      setDepYear(y => y + 1);
    }
  }

  // ── Données section "Dépenses projets" (existant) ─────────────────────────
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

  const expenseCategoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach(e => {
      const cat = e.category?.trim() || 'Non classé';
      map.set(cat, (map.get(cat) ?? 0) + e.amount);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

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
  const labelStep = months.length <= 6 ? 1 : months.length <= 12 ? 2 : months.length <= 18 ? 3 : 4;

  async function handleExport() {
    if (expenses.length === 0) return;
    Alert.alert('Exporter les dépenses', "Choisir le format d'export :", [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'CSV',
        onPress: async () => {
          setExporting(true);
          try { await exportExpensesCSV(expenses, projects, 'Toutes dépenses'); }
          catch { Alert.alert('Erreur', "Impossible d'exporter en CSV"); }
          finally { setExporting(false); }
        },
      },
      {
        text: 'PDF',
        onPress: async () => {
          setExporting(true);
          try { await exportExpensesPDF(expenses, projects, 'Toutes dépenses'); }
          catch { Alert.alert('Erreur', "Impossible d'exporter en PDF"); }
          finally { setExporting(false); }
        },
      },
    ]);
  }

  function toggleProject(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else { next.add(id); }
      return next;
    });
  }

  const totalAll = expenses.reduce((s, e) => s + e.amount, 0);
  const gridTicks = [0, 0.25, 0.5, 0.75, 1];

  const catDetailExpenses = useMemo(() => {
    if (!selectedExpenseCat) return [];
    const source = statsView === 'income' ? incomes : expenses;
    const cat = selectedExpenseCat === 'Non classé' ? '' : selectedExpenseCat;
    const filtered = source.filter(e => {
      const ts = new Date(e.date).getTime();
      if (ts < depRange.startTs || ts > depRange.endTs) return false;
      return selectedExpenseCat === 'Non classé'
        ? !e.category?.trim()
        : (e.category?.trim() || '') === cat;
    });
    return [...filtered].sort((a, b) => {
      if (catSort === 'date-desc') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (catSort === 'date-asc') return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (catSort === 'price-desc') return b.amount - a.amount;
      if (catSort === 'price-asc') return a.amount - b.amount;
      if (catSort === 'project') {
        const pa = projects.find(p => p.id === a.projectId)?.name ?? '';
        const pb = projects.find(p => p.id === b.projectId)?.name ?? '';
        return pa.localeCompare(pb);
      }
      return 0;
    });
  }, [selectedExpenseCat, statsView, expenses, incomes, depRange, catSort, projects]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SubPageHeader
        title="Statistiques"
        right={
          <>
            <Pressable
              onPress={handleExport}
              disabled={exporting || expenses.length === 0}
              hitSlop={8}
              style={[styles.exportBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: expenses.length === 0 ? 0.4 : 1 }]}
            >
              <MaterialCommunityIcons
                name={exporting ? 'loading' : 'export-variant'}
                size={18}
                color={colors.primary}
              />
            </Pressable>
            <Pressable
              onPress={toggleShowAmounts}
              hitSlop={8}
              style={[styles.exportBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons
                name={showAmounts ? 'eye-outline' : 'eye-off-outline'}
                size={18}
                color={colors.mutedForeground}
              />
            </Pressable>
          </>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {expenses.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="chart-line" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Aucune dépense enregistrée</Text>
          </View>
        ) : (
          <>
            {/* ═══════════════════════════════════════════════
                SECTION : Dépenses / Revenus
            ════════════════════════════════════════════════ */}

            {/* Toggle Dépenses / Revenus */}
            <View style={[styles.statsToggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setStatsView('expense'); }}
                style={[styles.statsToggleBtn, statsView === 'expense' && { backgroundColor: '#EF444420' }]}
              >
                <MaterialCommunityIcons name="arrow-up-circle-outline" size={16} color={statsView === 'expense' ? '#EF4444' : colors.mutedForeground} />
                <Text style={[styles.statsToggleTxt, { color: statsView === 'expense' ? '#EF4444' : colors.mutedForeground }]}>Dépenses</Text>
                {showAmounts && (
                  <Text style={[styles.statsToggleAmt, { color: statsView === 'expense' ? '#EF4444' : colors.mutedForeground }]}>
                    {fmtEuro(depTotal)}
                  </Text>
                )}
              </Pressable>
              <View style={{ width: 1, backgroundColor: colors.border, marginVertical: 6 }} />
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setStatsView('income'); }}
                style={[styles.statsToggleBtn, statsView === 'income' && { backgroundColor: '#4CAF5020' }]}
              >
                <MaterialCommunityIcons name="arrow-down-circle-outline" size={16} color={statsView === 'income' ? '#4CAF50' : colors.mutedForeground} />
                <Text style={[styles.statsToggleTxt, { color: statsView === 'income' ? '#4CAF50' : colors.mutedForeground }]}>Revenus</Text>
                {showAmounts && (
                  <Text style={[styles.statsToggleAmt, { color: statsView === 'income' ? '#4CAF50' : colors.mutedForeground }]}>
                    {fmtEuro(incTotal)}
                  </Text>
                )}
              </Pressable>
            </View>

            {/* Sélecteur de mode (partagé) */}
            <View style={[styles.tabRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {(['mensuel', 'saisonnier', 'annuel'] as DepMode[]).map(mode => (
                <Pressable
                  key={mode}
                  onPress={() => { Haptics.selectionAsync(); setDepMode(mode); }}
                  style={[styles.tabBtn, depMode === mode && { backgroundColor: statsView === 'income' ? '#4CAF50' : colors.primary }]}
                >
                  <Text style={[styles.tabBtnTxt, { color: depMode === mode ? colors.primaryForeground : colors.mutedForeground }]}>
                    {mode === 'mensuel' ? 'Mensuel' : mode === 'saisonnier' ? 'Saisonnier' : 'Annuel'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Navigation période (partagée) */}
            <View style={styles.depNavRow}>
              <Pressable onPress={depNavPrev} hitSlop={14} style={[styles.depNavBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="chevron-left" size={22} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.depNavLabel, { color: colors.foreground }]}>{depRange.label}</Text>
              <Pressable onPress={depNavNext} hitSlop={14} style={[styles.depNavBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.foreground} />
              </Pressable>
            </View>

            {/* Contenu conditionnel selon la vue */}
            {(() => {
              const byCat  = statsView === 'expense' ? depByCat  : incByCat;
              const total  = statsView === 'expense' ? depTotal   : incTotal;
              const colors_ = statsView === 'expense' ? CAT_COLORS : INCOME_CAT_COLORS;
              const accentColor = statsView === 'expense' ? colors.primary : '#4CAF50';
              const emptyLabel = statsView === 'expense' ? 'Aucune dépense sur cette période' : 'Aucun revenu sur cette période';
              return byCat.length === 0 ? (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>{emptyLabel}</Text>
                  </View>
                </View>
              ) : (
                <>
                  <View style={[styles.depTotalRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.depTotalLbl, { color: colors.mutedForeground }]}>Total période</Text>
                    <Text style={[styles.depTotalAmt, { color: accentColor }]}>
                      {showAmounts ? fmtEuro(total) : '••••'}
                    </Text>
                  </View>
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {byCat.map(([cat, amt], i) => {
                      const pct = total > 0 ? (amt / total) * 100 : 0;
                      const catColor = colors_[cat] ?? accentColor;
                      return (
                        <Pressable
                          key={cat}
                          onPress={() => { Haptics.selectionAsync(); setSelectedExpenseCat(cat); }}
                          style={({ pressed }) => [
                            styles.catBlock,
                            i < byCat.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                            pressed && { opacity: 0.75 },
                          ]}
                        >
                          <View style={styles.catRowInner}>
                            <View style={[styles.catDot, { backgroundColor: catColor }]} />
                            <Text style={[styles.catName, { color: colors.foreground }]}>{cat}</Text>
                            <Text style={[styles.catPct, { color: colors.mutedForeground }]}>{pct.toFixed(0)}%</Text>
                            <Text style={[styles.catAmount, { color: catColor }]}>
                              {showAmounts ? fmtEuro(amt) : '••••'}
                            </Text>
                            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.mutedForeground} />
                          </View>
                          <View style={[styles.catTrack, { backgroundColor: colors.border }]}>
                            <View style={[styles.catFill, { width: `${pct}%` as any, backgroundColor: catColor }]} />
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              );
            })()}

            {/* ═══════════════════════════════════════════════
                Séparateur
            ════════════════════════════════════════════════ */}
            <View style={[styles.separator, { backgroundColor: colors.border }]} />

            {/* ═══════════════════════════════════════════════
                SECTION : Dépenses projets (statistiques existantes)
            ════════════════════════════════════════════════ */}
            <Text style={[styles.sectionProjects, { color: colors.mutedForeground }]}>Dépenses projets</Text>

            {/* Par catégorie de dépense */}
            <Text style={[styles.subsection, { color: colors.mutedForeground }]}>Par catégorie</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {expenseCategoryTotals.length === 0 ? (
                <View style={styles.catRow}>
                  <Text style={[styles.catName, { color: colors.mutedForeground }]}>Aucune dépense catégorisée</Text>
                </View>
              ) : expenseCategoryTotals.map(([cat, total], i) => {
                const pct = totalAll > 0 ? (total / totalAll) * 100 : 0;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => { Haptics.selectionAsync(); setSelectedExpenseCat(cat); }}
                    style={({ pressed }) => [
                      styles.catBlock,
                      i < expenseCategoryTotals.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    <View style={styles.catRowInner}>
                      <MaterialCommunityIcons name="tag-outline" size={15} color={colors.primary} />
                      <Text style={[styles.catName, { color: colors.foreground }]}>{cat}</Text>
                      <Text style={[styles.catPct, { color: colors.mutedForeground }]}>{pct.toFixed(0)}%</Text>
                      <Text style={[styles.catAmount, { color: colors.primary }]}>{showAmounts ? fmtEuro(total) : '••••'}</Text>
                      <MaterialCommunityIcons name="chevron-right" size={16} color={colors.mutedForeground} />
                    </View>
                    <View style={[styles.catTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.catFill, { width: `${pct}%` as any, backgroundColor: colors.primary }]} />
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Par projet */}
            <Text style={[styles.subsection, { color: colors.mutedForeground }]}>Par projet</Text>
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
                          <View style={[styles.budgetFill, { width: `${pct}%`, backgroundColor: over ? colors.destructive : colors.primary }]} />
                        </View>
                        <Text style={[styles.budgetLbl, { color: over ? colors.destructive : colors.mutedForeground }]}>
                          {showAmounts ? `${fmtEuro(total)} / ${fmtEuro(budget)}` : '••••'}
                        </Text>
                      </>
                    )}
                  </View>
                  <Text style={[styles.projAmount, { color: over ? colors.destructive : colors.primary }]}>
                    {showAmounts ? fmtEuro(total) : '••••'}
                  </Text>
                </View>
              );
            })}

            {/* Comparaison mensuelle */}
            {projects.length > 0 && (
              <>
                <Text style={[styles.subsection, { color: colors.mutedForeground }]}>Comparaison mensuelle</Text>

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

                    <Text style={[styles.periodInfo, { color: colors.mutedForeground }]}>
                      {months[0]
                        ? `${months[0].label} ${months[0].year} → ${months[months.length - 1]!.label} ${months[months.length - 1]!.year}  ·  ${months.length} mois`
                        : ''}
                    </Text>

                    <View style={[styles.chartBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Svg width={CHART_W - 32} height={CHART_H}>
                        {gridTicks.map(t => {
                          const y = PAD.top + innerH * (1 - t);
                          const label = Math.round(maxVal * t);
                          return (
                            <React.Fragment key={t}>
                              <Line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y} stroke={colors.border} strokeWidth={1} />
                              <SvgText x={PAD.left - 4} y={y + 4} fontSize={8} fill={colors.mutedForeground} textAnchor="end">
                                {showAmounts ? (label > 999 ? `${Math.round(label / 100) / 10}k` : String(label)) : '••'}
                              </SvgText>
                            </React.Fragment>
                          );
                        })}
                        {months.map((m, i) => {
                          if (i % labelStep !== 0 && i !== months.length - 1) return null;
                          const shortLabel = m.label.replace('.', '');
                          const showYear = m.month === 0 || i === 0;
                          const slotW = innerW / months.length;
                          const cx = PAD.left + slotW * i + slotW / 2;
                          return (
                            <SvgText key={i} x={cx} y={CHART_H - 6} fontSize={8} fill={colors.mutedForeground} textAnchor="middle">
                              {showYear ? `${shortLabel} ${String(m.year).slice(2)}` : shortLabel}
                            </SvgText>
                          );
                        })}
                        {months.map((_, i) => {
                          const slotW = innerW / months.length;
                          const n = chartData.length || 1;
                          const groupW = Math.min(slotW * 0.72, n * 22);
                          const barW = groupW / n;
                          const groupStart = PAD.left + slotW * i + (slotW - groupW) / 2;
                          return chartData.map(({ project, data, color }, j) => {
                            const v = data[i] ?? 0;
                            if (v <= 0) return null;
                            const h = (v / maxVal) * innerH;
                            const x = groupStart + j * barW;
                            const y = PAD.top + innerH - h;
                            return (
                              <Rect
                                key={`${project.id}-${i}`}
                                x={x + barW * 0.12}
                                y={y}
                                width={barW * 0.76}
                                height={h}
                                rx={2}
                                fill={color}
                              />
                            );
                          });
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

      {/* Modal détail catégorie */}
      <BottomSheet visible={!!selectedExpenseCat} onClose={() => setSelectedExpenseCat(null)} maxHeight="85%">
            <View style={styles.catSheetHeader}>
              <MaterialCommunityIcons name="tag-outline" size={18} color={colors.primary} />
              <Text style={[styles.catSheetTitle, { color: colors.foreground }]} numberOfLines={1}>
                {selectedExpenseCat}
              </Text>
              <Text style={[styles.catSheetCount, { color: colors.mutedForeground }]}>
                {catDetailExpenses.length} {statsView === 'income' ? 'revenu' : 'dépense'}{catDetailExpenses.length !== 1 ? 's' : ''}
              </Text>
              <Pressable onPress={() => setSelectedExpenseCat(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {([
                { key: 'date-desc', label: 'Plus récent' },
                { key: 'date-asc', label: 'Plus ancien' },
                { key: 'price-desc', label: 'Prix ↓' },
                { key: 'price-asc', label: 'Prix ↑' },
                { key: 'project', label: 'Projet A→Z' },
              ] as const).map(opt => {
                const active = catSort === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setCatSort(opt.key)}
                    style={[
                      styles.sortChip,
                      active
                        ? { backgroundColor: colors.primary, borderColor: colors.primary }
                        : { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.sortChipTxt, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={[styles.catSheetTotal, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.catSheetTotalLbl, { color: colors.mutedForeground }]}>Total</Text>
              <Text style={[styles.catSheetTotalAmt, { color: colors.primary }]}>
                {showAmounts ? fmtEuro(catDetailExpenses.reduce((s, e) => s + e.amount, 0)) : '••••'}
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {catDetailExpenses.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Text style={[styles.catSheetTotalLbl, { color: colors.mutedForeground }]}>Aucun{statsView === 'income' ? '' : 'e'} {statsView === 'income' ? 'revenu' : 'dépense'}</Text>
                </View>
              ) : catDetailExpenses.map((exp, i) => {
                const proj = projects.find(p => p.id === exp.projectId);
                return (
                  <View
                    key={exp.id}
                    style={[
                      styles.catSheetRow,
                      i < catDetailExpenses.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.catSheetRowName, { color: colors.foreground }]} numberOfLines={1}>
                        {exp.label}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {proj && (
                          <Text style={[styles.catSheetRowSub, { color: colors.primary }]} numberOfLines={1}>
                            {proj.name}
                          </Text>
                        )}
                        <Text style={[styles.catSheetRowSub, { color: colors.mutedForeground }]}>
                          {new Date(exp.date).toLocaleDateString('fr-FR')}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.catSheetRowAmt, { color: colors.foreground }]}>
                      {showAmounts ? fmtEuro(exp.amount) : '••••'}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
      </BottomSheet>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: 'center' },
  exportBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  section: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
  },
  sectionProjects: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  subsection: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 2,
  },

  // ── Toggle Dépenses / Revenus ─────────────────────────────────────────────
  statsToggleRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  statsToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statsToggleTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  statsToggleAmt: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  // ── Dépenses : sélecteur de mode ──────────────────────────────────────────
  tabRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  // ── Dépenses : navigation période ─────────────────────────────────────────
  depNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  depNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depNavLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', textAlign: 'center', flex: 1 },

  // ── Dépenses : total période ───────────────────────────────────────────────
  depTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  depTotalLbl: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  depTotalAmt: { fontSize: 20, fontFamily: 'Inter_700Bold' },

  // ── Catégories ──────────────────────────────────────────────────────────────
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  catBlock: { paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  catRowInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  catPct: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  catAmount: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  catTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  catFill: { height: 4, borderRadius: 2 },

  // ── Séparateur ──────────────────────────────────────────────────────────────
  separator: { height: 1, marginVertical: 8 },

  // ── Projets ─────────────────────────────────────────────────────────────────
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

  // ── Graphe ───────────────────────────────────────────────────────────────────
  periodChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
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
  customDateInput: { fontSize: 14, fontFamily: 'Inter_600SemiBold', borderBottomWidth: 1, paddingBottom: 2 },
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
  chartBox: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12, minHeight: 80 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendTxt: { fontSize: 11, fontFamily: 'Inter_400Regular', maxWidth: 100 },

  // ── États vides ──────────────────────────────────────────────────────────────
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTxt: { fontSize: 15, fontFamily: 'Inter_400Regular' },

  // ── Sheet catégorie ───────────────────────────────────────────────────────────
  catSheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catSheetTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_700Bold' },
  catSheetCount: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  catSheetTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  catSheetTotalLbl: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  catSheetTotalAmt: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  catSheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  catSheetRowName: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  catSheetRowSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  catSheetRowAmt: { fontSize: 15, fontFamily: 'Inter_700Bold', minWidth: 70, textAlign: 'right' },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  sortChipTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});
