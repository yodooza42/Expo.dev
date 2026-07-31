import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { BottomSheet } from '@/components/BottomSheet';
import { CameraOcrIcon } from '@/components/CameraOcrIcon';
import { OcrScanModal } from '@/components/OcrScanModal';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  addRecurringExpense,
  addRecurringTransfer,
  BankTransaction,
  CategoryConfig,
  computeCurrentBalance,
  DEFAULT_CATEGORY_CONFIGS,
  deleteRecurringExpense,
  deleteRecurringTransfer,
  EXPENSE_CATEGORIES,
  getCategoryConfigs,
  getRecurringExpenses,
  getRecurringTransfers,
  getSavingsBalance,
  INCOME_CATEGORIES,
  matchCategoryByKeyword,
  processRecurringExpenses,
  processRecurringTransfers,
  RecurringExpense,
  RecurringFrequency,
  RecurringTransfer,
  setSavingsBalance,
  TransactionType,
} from '@/utils/bankStorage';
import { fmtDateShort } from '@/utils/date';
import { fmtEuro } from '@/utils/money';
import {
  computePortfolioValue,
  getMarketAssets,
  getMarketBalance,
  getMarketOperations,
  processMarketRecurrings,
} from '@/utils/marketStorage';
import { fetchLivePrices } from '@/utils/marketPrices';
import { pH } from '@/styles/header';

const SHOW_AMOUNTS_KEY      = '@yoann2/finance_show_amounts';
const SUMMARY_COLLAPSED_KEY = '@yoann2/finance_summary_collapsed';

// Cache prix marché — évite un appel réseau Yahoo à chaque focus (toutes les 5 min max)
let _livePricesCache: Record<string, { price: number }> | null = null;
let _livePricesCacheTs = 0;
const LIVE_PRICES_CACHE_TTL = 5 * 60_000;

const TYPE_CONFIG: Record<TransactionType, { label: string; icon: string; color: string; sign: string }> = {
  income:                  { label: 'Entrée',          icon: 'arrow-down-circle-outline',  color: '#4CAF50', sign: '+' },
  expense:                 { label: 'Sortie',           icon: 'arrow-up-circle-outline',    color: '#EF4444', sign: '-' },
  transfer_to_savings:     { label: 'Vers épargne',     icon: 'piggy-bank-outline',         color: '#2196F3', sign: '-' },
  transfer_from_savings:   { label: 'Depuis épargne',   icon: 'bank-transfer',              color: '#FF9800', sign: '+' },
  transfer_to_market:      { label: 'Vers marché',      icon: 'chart-areaspline',           color: '#8B5CF6', sign: '-' },
  transfer_from_market:    { label: 'Depuis marché',    icon: 'chart-areaspline',           color: '#8B5CF6', sign: '+' },
};

function formatAmount(amount: number, masked: boolean): string {
  if (masked) return '••••';
  return fmtEuro(amount);
}


function groupByMonth(txs: BankTransaction[]): { label: string; items: BankTransaction[]; sortKey: number }[] {
  const map = new Map<string, { items: BankTransaction[]; sortKey: number }>();
  for (const tx of txs) {
    const d = new Date(tx.date);
    const key = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const sortKey = d.getFullYear() * 100 + d.getMonth();
    if (!map.has(key)) map.set(key, { items: [], sortKey });
    map.get(key)!.items.push(tx);
  }
  return Array.from(map.entries())
    .map(([label, { items, sortKey }]) => ({
      label,
      sortKey,
      items: items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    }))
    .sort((a, b) => b.sortKey - a.sortKey);
}

type FilterType = 'all' | TransactionType;
const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all',                  label: 'Tout' },
  { key: 'income',               label: 'Entrées' },
  { key: 'expense',              label: 'Sorties' },
  { key: 'transfer_to_savings',  label: 'Épargne' },
];

interface FormState {
  type: TransactionType;
  amount: string;
  label: string;
  category: string;
  note: string;
  userNote: string;
  hidden: boolean;
  date: string;
}

const EMPTY_FORM: FormState = {
  type: 'expense',
  amount: '',
  label: '',
  category: '',
  note: '',
  userNote: '',
  hidden: false,
  date: new Date().toLocaleDateString('fr-FR'),
};

export default function FinanceScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const params  = useLocalSearchParams<{ add?: string }>();
  const { transactions, projects, tasks, addTransactionCtx, updateTransactionCtx, deleteTransactionCtx, reloadTransactions } = useApp();
  const [savingsBalance, setSavingsBal]   = useState(0);
  const [marketBalance, setMarketBal]     = useState(0);
  const [showAmounts, setShowAmounts]         = useState(false);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [searchActive, setSearchActive]         = useState(false);
  const [searchQuery, setSearchQuery]           = useState('');
  const [filter, setFilter]               = useState<FilterType>('all');
  const [showForm, setShowForm]           = useState(false);
  const [editId, setEditId]               = useState<string | null>(null);
  const [form, setForm]                   = useState<FormState>(EMPTY_FORM);
  const [showTransfer, setShowTransfer]   = useState(false);
  const [showOcr, setShowOcr]             = useState(false);
  const [noteProjId, setNoteProjId]       = useState<string | null>(null);
  const [noteTaskId, setNoteTaskId]       = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isRecurring, setIsRecurring]     = useState(false);
  const [recurringFreq, setRecurringFreq] = useState<RecurringFrequency>('monthly');
  const [recurringList, setRecurringList] = useState<RecurringTransfer[]>([]);
  const [recurringStartDate, setRecurringStartDate] = useState<Date>(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setHours(0, 0, 0, 0); return d; });
  const [showRecurringDatePicker, setShowRecurringDatePicker] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDir, setTransferDir]     = useState<'to' | 'from'>('to');

  // Recurring expenses (abonnements)
  const [recurringExpenseList, setRecurringExpenseList] = useState<RecurringExpense[]>([]);
  const [isRecurringExpense, setIsRecurringExpense]     = useState(false);
  const [recurringExpenseFreq, setRecurringExpenseFreq] = useState<RecurringFrequency>('monthly');
  const [recurringExpenseStart, setRecurringExpenseStart] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [showRecExpDatePicker, setShowRecExpDatePicker] = useState(false);

  const [categoryConfigs, setCategoryConfigs] = useState<CategoryConfig[]>(DEFAULT_CATEGORY_CONFIGS);
  const categoryLockedRef = useRef(false);

  const slideAnim = useRef(new Animated.Value(0)).current;

  async function load() {
    getCategoryConfigs().then(setCategoryConfigs);
    await Promise.all([processRecurringTransfers(), processRecurringExpenses(), processMarketRecurrings()]);
    const [sav, shown, recs, recExps, mktAssets, mktOps] = await Promise.all([
      getSavingsBalance(),
      AsyncStorage.getItem(SHOW_AMOUNTS_KEY),
      getRecurringTransfers(),
      getRecurringExpenses(),
      getMarketAssets(),
      getMarketOperations(),
    ]);
    setSavingsBal(sav);
    setRecurringList(recs);
    setRecurringExpenseList(recExps);
    if (shown === 'true') setShowAmounts(true);
    const collapsed = await AsyncStorage.getItem(SUMMARY_COLLAPSED_KEY);
    if (collapsed === 'true') setSummaryCollapsed(true);

    // Essaie de récupérer les cours en direct — priorité yahooSymbol sur ticker TR
    const symbols = [...new Set(
      mktAssets.map(a => a.yahooSymbol ?? a.ticker).filter((s): s is string => Boolean(s)),
    )];
    let currentMktVal: number;
    if (symbols.length > 0) {
      try {
        const now = Date.now();
        let livePrices: Record<string, { price: number }>;
        if (_livePricesCache && now - _livePricesCacheTs < LIVE_PRICES_CACHE_TTL) {
          livePrices = _livePricesCache;
        } else {
          livePrices = await fetchLivePrices(symbols);
          _livePricesCache = livePrices;
          _livePricesCacheTs = now;
        }
        const priceMap: Record<string, number> = {};
        for (const [t, lp] of Object.entries(livePrices)) priceMap[t] = lp.price;
        const { currentValue } = computePortfolioValue(mktOps, mktAssets, priceMap);
        currentMktVal = currentValue;
      } catch {
        currentMktVal = await getMarketBalance();
      }
    } else {
      currentMktVal = await getMarketBalance();
    }
    setMarketBal(currentMktVal);
    await reloadTransactions();
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  useFocusEffect(useCallback(() => {
    if (params.add === '1') {
      openForm('expense');
      router.setParams({ add: '' });
    }
  }, [params.add]));

  function toggleSummary() {
    Haptics.selectionAsync();
    setSummaryCollapsed(v => {
      AsyncStorage.setItem(SUMMARY_COLLAPSED_KEY, String(!v));
      return !v;
    });
  }

  function toggleAmounts() {
    Haptics.selectionAsync();
    setShowAmounts(v => {
      AsyncStorage.setItem(SHOW_AMOUNTS_KEY, String(!v));
      return !v;
    });
  }

  const filtered = useMemo(() =>
    filter === 'all' ? transactions : transactions.filter(t => t.type === filter),
    [transactions, filter]
  );

  const searched = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(t => {
      const inLabel    = t.label.toLowerCase().includes(q);
      const inCategory = t.category.toLowerCase().includes(q);
      const inNote     = (t.note ?? '').toLowerCase().includes(q);
      const inUserNote = (t.userNote ?? '').toLowerCase().includes(q);
      return inLabel || inCategory || inNote || inUserNote;
    });
  }, [filtered, searchQuery]);

  const [visibleYears, setVisibleYears] = useState<Set<number>>(() => new Set([new Date().getFullYear()]));

  const allYears = useMemo(() => {
    const set = new Set(transactions.map(t => new Date(t.date).getFullYear()));
    return Array.from(set).sort((a, b) => b - a);
  }, [transactions]);

  const yearFiltered = useMemo(() => {
    if (searchQuery.trim()) return searched;
    return searched.filter(t => visibleYears.has(new Date(t.date).getFullYear()));
  }, [searched, visibleYears, searchQuery]);

  const grouped = useMemo(() => groupByMonth(yearFiltered), [yearFiltered]);

  const hiddenYears = useMemo(() =>
    allYears.filter(y => !visibleYears.has(y)),
    [allYears, visibleYears]
  );

  const currentBalance = useMemo(() => computeCurrentBalance(transactions), [transactions]);

  const monthIncome = useMemo(() => {
    const now = new Date();
    return transactions
      .filter(t => {
        const d = new Date(t.date);
        return !t.hidden
          && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
          && (t.type === 'income' || t.type === 'transfer_from_savings');
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [transactions]);

  const monthExpense = useMemo(() => {
    const now = new Date();
    return transactions
      .filter(t => {
        const d = new Date(t.date);
        return !t.hidden
          && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
          && (t.type === 'expense' || t.type === 'transfer_to_savings');
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [transactions]);

  function openForm(type: TransactionType = 'expense', tx?: BankTransaction) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsRecurringExpense(false);
    setRecurringExpenseFreq('monthly');
    setRecurringExpenseStart(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
    if (tx) {
      setEditId(tx.id);
      setNoteProjId(tx.projectId ?? null);
      setNoteTaskId(tx.taskId ?? null);
      categoryLockedRef.current = true;
      setForm({
        type: tx.type,
        amount: tx.amount.toString(),
        label: tx.label,
        category: tx.category,
        note: tx.note ?? '',
        userNote: tx.userNote ?? '',
        hidden: tx.hidden ?? false,
        date: (() => {
          const d = new Date(tx.date);
          return isNaN(d.getTime()) ? new Date().toLocaleDateString('fr-FR') : d.toLocaleDateString('fr-FR');
        })(),
      });
    } else {
      categoryLockedRef.current = false;
      setEditId(null);
      setNoteProjId(null);
      setForm({ ...EMPTY_FORM, type });
    }
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setNoteProjId(null);
    setNoteTaskId(null);
    setShowDatePicker(false);
    setIsRecurringExpense(false);
    setForm(EMPTY_FORM);
  }

  function parseFrDate(s: string): string {
    const parts = s.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      const dt = new Date(y, m - 1, d);
      if (!isNaN(dt.getTime())) return dt.toISOString();
    }
    return new Date().toISOString();
  }

  async function handleSave() {
    const amount = parseFloat(form.amount.replace(',', '.'));
    if (!form.label.trim() || isNaN(amount) || amount <= 0) {
      Alert.alert('Champs manquants', 'Renseigne un libellé et un montant valide.');
      return;
    }
    const isoDate = parseFrDate(form.date);
    const label   = form.label.trim();
    const cat     = form.category || (form.type === 'income' ? 'Autre revenu' : 'Autre');
    const userNoteVal = form.userNote.trim() || undefined;

    if (editId) {
      await updateTransactionCtx(editId, {
        type:      form.type,
        amount,
        label,
        category:  cat,
        date:      isoDate,
        note:      form.note.trim() || undefined,
        userNote:  userNoteVal,
        hidden:    form.hidden || undefined,
        projectId: noteProjId ?? undefined,
        taskId:    noteTaskId ?? undefined,
      });
    } else {
      // If recurring expense (abonnement), save template + first occurrence
      if (isRecurringExpense && (form.type === 'expense' || form.type === 'income')) {
        const nextDate = new Date(recurringExpenseStart);
        if (recurringExpenseFreq === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
        else nextDate.setDate(nextDate.getDate() + 7);
        await addRecurringExpense({
          type: form.type as 'expense' | 'income',
          label,
          amount,
          category: cat,
          frequency: recurringExpenseFreq,
          nextDate: nextDate.toISOString(),
          userNote: userNoteVal,
        });
        await addTransactionCtx({
          type:      form.type,
          amount,
          label,
          category:  cat,
          date:      recurringExpenseStart.toISOString(),
          note:      `Récurrent · ${recurringExpenseFreq === 'monthly' ? 'mensuel' : 'hebdomadaire'}`,
          userNote:  userNoteVal,
          hidden:    form.hidden || undefined,
          projectId: noteProjId ?? undefined,
          taskId:    noteTaskId ?? undefined,
        });
      } else {
        await addTransactionCtx({
          type:      form.type,
          amount,
          label,
          category:  cat,
          date:      isoDate,
          note:      form.note.trim() || undefined,
          userNote:  userNoteVal,
          hidden:    form.hidden || undefined,
          projectId: noteProjId ?? undefined,
          taskId:    noteTaskId ?? undefined,
        });
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeForm();
    load();
  }

  async function handleDelete(id: string) {
    const tx = transactions.find(t => t.id === id);
    Alert.alert('Supprimer', 'Supprimer cette transaction ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          await deleteTransactionCtx(id);
          closeForm();
          load();
        },
      },
    ]);
  }

  async function handleTransfer() {
    const amount = parseFloat(transferAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Montant invalide');
      return;
    }

    if (isRecurring) {
      await addRecurringTransfer({
        direction: transferDir,
        amount,
        label: transferDir === 'to' ? 'Virement vers épargne' : 'Virement depuis épargne',
        frequency: recurringFreq,
        nextDate: recurringStartDate.toISOString(),
      });
    } else {
      const newSavings = transferDir === 'to'
        ? savingsBalance + amount
        : Math.max(0, savingsBalance - amount);
      await setSavingsBalance(newSavings);
      const type: TransactionType = transferDir === 'to' ? 'transfer_to_savings' : 'transfer_from_savings';
      await addTransactionCtx({
        type,
        amount,
        label: transferDir === 'to' ? 'Virement vers épargne' : 'Virement depuis épargne',
        category: 'Épargne',
        date: new Date().toISOString(),
      });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowTransfer(false);
    setTransferAmount('');
    setIsRecurring(false);
    const resetDate = new Date(); resetDate.setMonth(resetDate.getMonth() + 1); resetDate.setHours(0, 0, 0, 0);
    setRecurringStartDate(resetDate);
    load();
  }

  const categories: string[] = (() => {
    if (form.type !== 'income' && form.type !== 'expense') return [];
    const names = categoryConfigs.filter(c => c.type === form.type).map(c => c.name);
    return names.length > 0 ? names : (form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES);
  })();

  function renderTransaction({ item: tx }: { item: BankTransaction }) {
    const cfg = TYPE_CONFIG[tx.type];
    return (
      <Pressable
        onPress={() => openForm(tx.type, tx)}
        style={({ pressed }) => [
          styles.txRow,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : (tx.hidden ? 0.45 : 1) },
        ]}
      >
        <View style={[styles.txIcon, { backgroundColor: cfg.color + '20' }]}>
          <MaterialCommunityIcons name={cfg.icon as any} size={20} color={cfg.color} />
        </View>
        <View style={styles.txBody}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[styles.txLabel, { color: colors.foreground }]} numberOfLines={1}>{tx.label}</Text>
            {tx.hidden && (
              <MaterialCommunityIcons name="eye-off-outline" size={12} color={colors.mutedForeground} />
            )}
            {tx.fromRecurringExpenseId && (
              <MaterialCommunityIcons name="repeat" size={12} color={colors.mutedForeground} />
            )}
          </View>
          <View style={styles.txMeta}>
            {tx.category ? (
              <Text style={[styles.txCat, { color: colors.mutedForeground }]}>{tx.category}</Text>
            ) : null}
            {tx.userNote ? (
              <Text style={[styles.txNote, { color: colors.mutedForeground }]} numberOfLines={1}>· {tx.userNote}</Text>
            ) : tx.note ? (
              <Text style={[styles.txNote, { color: colors.mutedForeground }]} numberOfLines={1}>· {tx.note}</Text>
            ) : null}
          </View>
          <Text style={[styles.txDate, { color: colors.mutedForeground }]}>{fmtDateShort(tx.date)}</Text>
        </View>
        <Text style={[styles.txAmount, { color: tx.hidden ? colors.mutedForeground : cfg.color }]}>
          {cfg.sign}{formatAmount(tx.amount, !showAmounts)}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[pH.rowSpaced, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[pH.title, { color: colors.foreground }]}>Finance</Text>
        <View style={pH.btnGroup}>
          <Pressable
            onPress={() => {
              if (searchActive) {
                setSearchActive(false);
                setSearchQuery('');
              } else {
                setSearchActive(true);
              }
              Haptics.selectionAsync();
            }}
            hitSlop={8}
            style={[pH.btn, {
              backgroundColor: searchActive ? colors.primary + '25' : colors.card,
              borderColor: searchActive ? colors.primary : colors.border,
            }]}
          >
            <MaterialCommunityIcons
              name="magnify"
              size={18}
              color={searchActive ? colors.primary : colors.mutedForeground}
            />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowOcr(true); }}
            hitSlop={8}
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <CameraOcrIcon size={18} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/category-settings')}
            hitSlop={8}
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="tag-multiple-outline" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/expense-stats')}
            hitSlop={8}
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="chart-bar" size={18} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={toggleAmounts}
            hitSlop={8}
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons
              name={showAmounts ? 'eye-outline' : 'eye-off-outline'}
              size={18}
              color={colors.mutedForeground}
            />
          </Pressable>
          <Pressable
            onPress={toggleSummary}
            hitSlop={8}
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons
              name={summaryCollapsed ? 'chevron-down' : 'chevron-up'}
              size={18}
              color={colors.mutedForeground}
            />
          </Pressable>
        </View>
      </View>

      {/* ── Barre de recherche ── */}
      {searchActive && (
        <View style={[styles.searchBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <View style={[styles.searchInputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="magnify" size={18} color={colors.mutedForeground} />
            <TextInput
              autoFocus
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Libellé, catégorie, note…"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.searchInput, { color: colors.foreground }]}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={16} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>
          {searchQuery.length > 0 && (
            <Text style={[styles.searchCount, { color: colors.mutedForeground }]}>
              {searched.length} résultat{searched.length !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>

        {/* ── Sticky balance card ── */}
        <View style={{ backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
          {summaryCollapsed ? (
            /* Vue compacte quand replié */
            <Pressable
              onPress={toggleSummary}
              style={[styles.balanceCardCompact, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="bank-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.balanceLblCompact, { color: colors.mutedForeground }]}>Solde courant</Text>
              <Text style={[styles.balanceAmountCompact, { color: currentBalance >= 0 ? colors.foreground : colors.destructive }]}>
                {showAmounts ? fmtEuro(currentBalance) : '••••••'}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : (
            <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Compte courant */}
              <View style={styles.balanceMain}>
                <Text style={[styles.balanceLbl, { color: colors.mutedForeground }]}>Solde courant</Text>
                <Text style={[styles.balanceAmount, { color: currentBalance >= 0 ? colors.foreground : colors.destructive }]}>
                  {showAmounts ? fmtEuro(currentBalance) : '••••••'}
                </Text>
                <View style={styles.balanceRow}>
                  <View style={styles.balanceStat}>
                    <MaterialCommunityIcons name="arrow-down-circle" size={14} color="#4CAF50" />
                    <Text style={[styles.balanceStatTxt, { color: colors.mutedForeground }]}>
                      {showAmounts ? `+${fmtEuro(monthIncome)}` : '••••'}
                    </Text>
                  </View>
                  <View style={[styles.balanceDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.balanceStat}>
                    <MaterialCommunityIcons name="arrow-up-circle" size={14} color="#EF4444" />
                    <Text style={[styles.balanceStatTxt, { color: colors.mutedForeground }]}>
                      {showAmounts ? `-${fmtEuro(monthExpense)}` : '••••'}
                    </Text>
                  </View>
                  <Text style={[styles.balanceMonthHint, { color: colors.mutedForeground }]}>ce mois</Text>
                </View>
              </View>

              {/* Épargne */}
              <View style={[styles.savingsRow, { borderTopColor: colors.border }]}>
                <View style={styles.savingsLeft}>
                  <MaterialCommunityIcons name="piggy-bank-outline" size={16} color="#2196F3" />
                  <Text style={[styles.savingsLbl, { color: colors.mutedForeground }]}>Épargne</Text>
                </View>
                <Text style={[styles.savingsAmount, { color: '#2196F3' }]}>
                  {showAmounts ? fmtEuro(savingsBalance) : '••••'}
                </Text>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTransferDir('to'); setShowTransfer(true); }}
                  style={[styles.transferBtn, { backgroundColor: '#2196F3' + '18', borderColor: '#2196F3' + '40' }]}
                >
                  <MaterialCommunityIcons name="bank-transfer" size={15} color="#2196F3" />
                  <Text style={[styles.transferBtnTxt, { color: '#2196F3' }]}>Virer</Text>
                </Pressable>
              </View>

              {/* Marché */}
              <View style={[styles.savingsRow, { borderTopColor: colors.border }]}>
                <View style={styles.savingsLeft}>
                  <MaterialCommunityIcons name="chart-areaspline" size={16} color="#8B5CF6" />
                  <Text style={[styles.savingsLbl, { color: colors.mutedForeground }]}>Marché</Text>
                </View>
                <Text style={[styles.savingsAmount, { color: '#8B5CF6' }]}>
                  {showAmounts ? fmtEuro(marketBalance) : '••••'}
                </Text>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/market-manager'); }}
                  style={[styles.transferBtn, { backgroundColor: '#8B5CF618', borderColor: '#8B5CF640' }]}
                >
                  <MaterialCommunityIcons name="chart-line" size={15} color="#8B5CF6" />
                  <Text style={[styles.transferBtnTxt, { color: '#8B5CF6' }]}>Gérer</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* ── Quick actions ── */}
        <View style={styles.quickActions}>
          {(['income', 'expense'] as TransactionType[]).map(type => {
            const cfg = TYPE_CONFIG[type];
            return (
              <Pressable
                key={type}
                onPress={() => openForm(type)}
                style={({ pressed }) => [
                  styles.quickBtn,
                  { backgroundColor: cfg.color + '15', borderColor: cfg.color + '40', opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <MaterialCommunityIcons name={cfg.icon as any} size={20} color={cfg.color} />
                <Text style={[styles.quickBtnTxt, { color: cfg.color }]}>{cfg.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Filter chips ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={{ marginBottom: 4 }}
        >
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[
                  styles.filterChip,
                  active
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.filterChipTxt, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Transaction list grouped by month ── */}
        {grouped.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="bank-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Aucune transaction</Text>
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Appuie sur + Entrée ou + Sortie pour commencer</Text>
          </View>
        ) : grouped.map(({ label, items }) => (
          <View key={label} style={styles.monthGroup}>
            <View style={styles.monthHeader}>
              <Text style={[styles.monthLabel, { color: colors.mutedForeground }]}>{label}</Text>
              <View style={[styles.monthDivider, { backgroundColor: colors.border }]} />
              <Text style={[styles.monthTotal, { color: colors.mutedForeground }]}>
                {showAmounts
                  ? (() => {
                      const net = items.reduce((s, t) => {
                        if (t.type === 'income' || t.type === 'transfer_from_savings') return s + t.amount;
                        return s - t.amount;
                      }, 0);
                      return `${net >= 0 ? '+' : ''}${fmtEuro(net)}`;
                    })()
                  : '••••'
                }
              </Text>
            </View>
            {items.map(tx => (
              <View key={tx.id} style={{ paddingHorizontal: 16, marginBottom: 6 }}>
                {renderTransaction({ item: tx })}
              </View>
            ))}
          </View>
        ))}

        {/* ── Voir années précédentes ── */}
        {!searchQuery.trim() && hiddenYears.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 8 }}>
            {hiddenYears.map(year => (
              <Pressable
                key={year}
                onPress={() => { Haptics.selectionAsync(); setVisibleYears(prev => new Set([...prev, year])); }}
                style={({ pressed }) => [styles.loadYearBtn, { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialCommunityIcons name="calendar-outline" size={15} color={colors.primary} />
                <Text style={[styles.loadYearTxt, { color: colors.primary }]}>Voir {year}</Text>
                <MaterialCommunityIcons name="chevron-down" size={15} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Abonnements récurrents ── */}
        {recurringExpenseList.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>ABONNEMENTS RÉCURRENTS</Text>
            {recurringExpenseList.map(rec => (
              <View key={rec.id} style={[styles.recurringRow, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 6 }]}>
                <MaterialCommunityIcons name="repeat" size={16} color={rec.type === 'expense' ? '#EF4444' : '#4CAF50'} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recurringRowLabel, { color: colors.foreground }]}>{rec.label}</Text>
                  <Text style={[styles.recurringRowSub, { color: colors.mutedForeground }]}>
                    {showAmounts ? `${fmtEuro(rec.amount)} · ` : '•••• · '}
                    {rec.frequency === 'monthly' ? 'Mensuel' : 'Hebdomadaire'} · prochain : {new Date(rec.nextDate).toLocaleDateString('fr-FR')}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    Alert.alert('Supprimer', 'Arrêter cet abonnement récurrent ?', [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Supprimer', style: 'destructive', onPress: async () => { await deleteRecurringExpense(rec.id); load(); } },
                    ]);
                  }}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="#EF4444" />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Add transaction modal ── */}
      <BottomSheet visible={showForm} onClose={closeForm} avoidKeyboard>
            {/* Form header: title + delete button */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={[styles.formTitle, { color: colors.foreground }]}>
                {editId ? 'Modifier la transaction' : 'Nouvelle transaction'}
              </Text>
              {editId && (
                <Pressable
                  onPress={() => handleDelete(editId)}
                  hitSlop={8}
                  style={{ padding: 6, borderRadius: 8, backgroundColor: '#EF444420' }}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color="#EF4444" />
                </Pressable>
              )}
            </View>

            {/* Type selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {(['income', 'expense', 'transfer_to_savings', 'transfer_from_savings', 'transfer_to_market', 'transfer_from_market'] as TransactionType[]).map(type => {
                const cfg = TYPE_CONFIG[type];
                const active = form.type === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => setForm(f => ({ ...f, type, category: '' }))}
                    style={[
                      styles.typeChip,
                      active
                        ? { backgroundColor: cfg.color, borderColor: cfg.color }
                        : { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <MaterialCommunityIcons name={cfg.icon as any} size={14} color={active ? '#fff' : colors.mutedForeground} />
                    <Text style={[styles.typeChipTxt, { color: active ? '#fff' : colors.mutedForeground }]}>{cfg.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Libellé */}
            <TextInput
              value={form.label}
              onChangeText={v => {
                const autoType = (form.type === 'income' || form.type === 'expense') ? form.type : null;
                const matched = autoType && !categoryLockedRef.current
                  ? matchCategoryByKeyword(v, categoryConfigs, autoType)
                  : '';
                setForm(f => ({ ...f, label: v, ...(matched ? { category: matched } : {}) }));
              }}
              placeholder="Libellé"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
            />

            {/* Montant + Date */}
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <TextInput
                value={form.amount}
                onChangeText={v => setForm(f => ({ ...f, amount: v }))}
                placeholder="0,00"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                style={[styles.amountInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              />
              <Text style={[styles.amountEuro, { color: colors.mutedForeground }]}>€</Text>
              <TextInput
                value={form.date}
                onChangeText={v => setForm(f => ({ ...f, date: v }))}
                placeholder="JJ/MM/AAAA"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                style={[styles.dateInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              />
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowDatePicker(true); }}
                hitSlop={8}
                style={[styles.calBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <MaterialCommunityIcons name="calendar-outline" size={18} color={colors.primary} />
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={(() => {
                    const parts = form.date.split('/');
                    if (parts.length === 3) {
                      const [d, m, y] = parts.map(Number);
                      const dt = new Date(y, m - 1, d);
                      if (!isNaN(dt.getTime())) return dt;
                    }
                    return new Date();
                  })()}
                  mode="date"
                  display="calendar"
                  maximumDate={new Date(new Date().getFullYear() + 5, 11, 31)}
                  onChange={(_event, selected) => {
                    setShowDatePicker(false);
                    if (selected) {
                      const d = selected.getDate().toString().padStart(2, '0');
                      const m = (selected.getMonth() + 1).toString().padStart(2, '0');
                      const y = selected.getFullYear();
                      setForm(f => ({ ...f, date: `${d}/${m}/${y}` }));
                    }
                  }}
                />
              )}
            </View>

            {/* Catégorie */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {categories.map(cat => {
                const active = form.category === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      categoryLockedRef.current = true;
                      setForm(f => ({ ...f, category: cat }));
                    }}
                    style={[
                      styles.catChip,
                      active
                        ? { backgroundColor: colors.primary + '25', borderColor: colors.primary }
                        : { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.catChipTxt, { color: active ? colors.primary : colors.mutedForeground }]}>{cat}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Lier à un projet */}
            {form.type !== 'transfer_to_savings' && form.type !== 'transfer_from_savings' && form.type !== 'transfer_to_market' && form.type !== 'transfer_from_market' && (
              <View style={{ gap: 6 }}>
                <Text style={[styles.projPickerLabel, { color: colors.mutedForeground }]}>Projet lié (optionnel)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <Pressable
                    onPress={() => { setNoteProjId(null); setNoteTaskId(null); setForm(f => ({ ...f, note: '' })); }}
                    style={[
                      styles.catChip,
                      !noteProjId
                        ? { backgroundColor: colors.primary + '25', borderColor: colors.primary }
                        : { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.catChipTxt, { color: !noteProjId ? colors.primary : colors.mutedForeground }]}>Aucun</Text>
                  </Pressable>
                  {projects.filter(p => !p.archived).map(p => {
                    const active = noteProjId === p.id;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => {
                          setNoteProjId(p.id);
                          setNoteTaskId(null);
                          setForm(f => ({ ...f, note: p.name }));
                        }}
                        style={[
                          styles.catChip,
                          active
                            ? { backgroundColor: colors.primary + '25', borderColor: colors.primary }
                            : { backgroundColor: colors.background, borderColor: colors.border },
                        ]}
                      >
                        <Text style={[styles.catChipTxt, { color: active ? colors.primary : colors.mutedForeground }]}>{p.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Tâches du projet sélectionné */}
                {noteProjId && (() => {
                  const projTasks = tasks.filter(t => t.projectId === noteProjId);
                  if (projTasks.length === 0) return null;
                  const projName = projects.find(p => p.id === noteProjId)?.name ?? '';
                  return (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {projTasks.map(t => {
                        const active = form.note === projName + ' · ' + t.title;
                        return (
                          <Pressable
                            key={t.id}
                            onPress={() => {
                              setNoteTaskId(active ? null : t.id);
                              setForm(f => ({
                                ...f,
                                note: active ? projName : projName + ' · ' + t.title,
                              }));
                            }}
                            style={[
                              styles.catChip,
                              active
                                ? { backgroundColor: '#F59E0B20', borderColor: '#F59E0B' }
                                : { backgroundColor: colors.background, borderColor: colors.border },
                            ]}
                          >
                            <Text style={[styles.catChipTxt, { color: active ? '#F59E0B' : colors.mutedForeground }]}>· {t.title}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  );
                })()}
              </View>
            )}

            {/* Note libre */}
            <TextInput
              value={form.userNote}
              onChangeText={v => setForm(f => ({ ...f, userNote: v }))}
              placeholder="Note (optionnel)…"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, minHeight: 40 }]}
              multiline
            />

            {/* Abonnement récurrent (income/expense uniquement, nouvelle transaction) */}
            {!editId && (form.type === 'expense' || form.type === 'income') && (
              <View style={{ gap: 6 }}>
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setIsRecurringExpense(v => !v); }}
                  style={[styles.toggleRow, { backgroundColor: colors.background, borderColor: isRecurringExpense ? colors.primary : colors.border }]}
                >
                  <MaterialCommunityIcons name="repeat" size={16} color={isRecurringExpense ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.toggleRowTxt, { color: isRecurringExpense ? colors.primary : colors.mutedForeground }]}>
                    Abonnement récurrent
                  </Text>
                  <View style={[styles.toggleDot, { backgroundColor: isRecurringExpense ? colors.primary : colors.border }]} />
                </Pressable>

                {isRecurringExpense && (
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['monthly', 'weekly'] as RecurringFrequency[]).map(freq => (
                        <Pressable
                          key={freq}
                          onPress={() => setRecurringExpenseFreq(freq)}
                          style={[
                            styles.freqChip,
                            recurringExpenseFreq === freq
                              ? { backgroundColor: colors.primary + '20', borderColor: colors.primary }
                              : { backgroundColor: colors.background, borderColor: colors.border },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={freq === 'monthly' ? 'calendar-month-outline' : 'calendar-week-outline'}
                            size={14}
                            color={recurringExpenseFreq === freq ? colors.primary : colors.mutedForeground}
                          />
                          <Text style={[styles.freqChipTxt, { color: recurringExpenseFreq === freq ? colors.primary : colors.mutedForeground }]}>
                            {freq === 'monthly' ? 'Mensuel' : 'Hebdomadaire'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.recurringHint, { color: colors.mutedForeground }]}>Premier :</Text>
                      <Pressable
                        onPress={() => setShowRecExpDatePicker(true)}
                        style={[styles.recurringDateBtn, { backgroundColor: colors.background, borderColor: colors.primary }]}
                      >
                        <Text style={[styles.recurringDateTxt, { color: colors.primary }]}>
                          {recurringExpenseStart.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}
                        </Text>
                        <MaterialCommunityIcons name="calendar-outline" size={13} color={colors.primary} />
                      </Pressable>
                      {showRecExpDatePicker && (
                        <DateTimePicker
                          value={recurringExpenseStart}
                          mode="date"
                          display="calendar"
                          onChange={(_e, d) => { setShowRecExpDatePicker(false); if (d) { d.setHours(0, 0, 0, 0); setRecurringExpenseStart(d); } }}
                        />
                      )}
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Masquer du budget */}
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setForm(f => ({ ...f, hidden: !f.hidden })); }}
              style={[styles.toggleRow, { backgroundColor: colors.background, borderColor: form.hidden ? '#9E9E9E' : colors.border }]}
            >
              <MaterialCommunityIcons name="eye-off-outline" size={16} color={form.hidden ? colors.foreground : colors.mutedForeground} />
              <Text style={[styles.toggleRowTxt, { color: form.hidden ? colors.foreground : colors.mutedForeground, flex: 1 }]}>
                Masquer du budget
              </Text>
              <View style={[styles.toggleDot, { backgroundColor: form.hidden ? colors.foreground : colors.border }]} />
            </Pressable>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={closeForm} style={[styles.btn, { flex: 1, backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.btnTxt, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
              <Pressable onPress={handleSave} style={[styles.btn, { flex: 2, backgroundColor: colors.primary }]}>
                <Text style={[styles.btnTxt, { color: colors.primaryForeground }]}>{editId ? 'Modifier' : 'Enregistrer'}</Text>
              </Pressable>
            </View>
      </BottomSheet>

      {/* ── Transfer modal ── */}
      <BottomSheet
        visible={showTransfer}
        onClose={() => { setShowTransfer(false); setIsRecurring(false); }}
        title="Virement épargne"
        avoidKeyboard
      >

            {/* Direction */}
            <View style={styles.transferDirRow}>
              {(['to', 'from'] as const).map(dir => (
                <Pressable
                  key={dir}
                  onPress={() => setTransferDir(dir)}
                  style={[
                    styles.transferDirBtn,
                    transferDir === dir
                      ? { backgroundColor: '#2196F3', borderColor: '#2196F3' }
                      : { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={dir === 'to' ? 'arrow-right' : 'arrow-left'}
                    size={14}
                    color={transferDir === dir ? '#fff' : colors.mutedForeground}
                  />
                  <Text style={[styles.transferDirTxt, { color: transferDir === dir ? '#fff' : colors.mutedForeground }]}>
                    {dir === 'to' ? 'Vers épargne' : 'Depuis épargne'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Montant */}
            <TextInput
              value={transferAmount}
              onChangeText={setTransferAmount}
              placeholder="Montant (ex: 200)"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              autoFocus
            />

            {/* Toggle récurrent */}
            <Pressable
              onPress={() => setIsRecurring(v => !v)}
              style={[styles.recurringToggle, { backgroundColor: colors.background, borderColor: isRecurring ? '#2196F3' : colors.border }]}
            >
              <MaterialCommunityIcons
                name={isRecurring ? 'repeat' : 'repeat-off'}
                size={18}
                color={isRecurring ? '#2196F3' : colors.mutedForeground}
              />
              <Text style={[styles.recurringToggleTxt, { color: isRecurring ? '#2196F3' : colors.mutedForeground }]}>
                {isRecurring ? 'Virement récurrent' : 'Ponctuel (une fois)'}
              </Text>
            </Pressable>

            {/* Fréquence (visible si récurrent) */}
            {isRecurring && (
              <View style={{ gap: 6 }}>
                <Text style={[styles.projPickerLabel, { color: colors.mutedForeground }]}>Fréquence</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(['monthly', 'weekly'] as RecurringFrequency[]).map(freq => (
                    <Pressable
                      key={freq}
                      onPress={() => {
                        setRecurringFreq(freq);
                        const d = new Date();
                        if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
                        else d.setDate(d.getDate() + 7);
                        setRecurringStartDate(d);
                      }}
                      style={[
                        styles.freqChip,
                        recurringFreq === freq
                          ? { backgroundColor: '#2196F320', borderColor: '#2196F3' }
                          : { backgroundColor: colors.background, borderColor: colors.border },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={freq === 'monthly' ? 'calendar-month-outline' : 'calendar-week-outline'}
                        size={14}
                        color={recurringFreq === freq ? '#2196F3' : colors.mutedForeground}
                      />
                      <Text style={[styles.freqChipTxt, { color: recurringFreq === freq ? '#2196F3' : colors.mutedForeground }]}>
                        {freq === 'monthly' ? 'Mensuel' : 'Hebdomadaire'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.recurringHint, { color: colors.mutedForeground }]}>Premier virement :</Text>
                  <Pressable
                    onPress={() => setShowRecurringDatePicker(true)}
                    style={[styles.recurringDateBtn, { backgroundColor: colors.background, borderColor: '#2196F3' }]}
                  >
                    <Text style={[styles.recurringDateTxt, { color: '#2196F3' }]}>
                      {recurringStartDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </Text>
                    <MaterialCommunityIcons name="calendar-outline" size={14} color="#2196F3" />
                  </Pressable>
                  {showRecurringDatePicker && (
                    <DateTimePicker
                      value={recurringStartDate}
                      mode="date"
                      display="calendar"
                      minimumDate={new Date()}
                      onChange={(_e, selected) => {
                        setShowRecurringDatePicker(false);
                        if (selected) { selected.setHours(0, 0, 0, 0); setRecurringStartDate(selected); }
                      }}
                    />
                  )}
                </View>
              </View>
            )}

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => { setShowTransfer(false); setIsRecurring(false); }} style={[styles.btn, { flex: 1, backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.btnTxt, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
              <Pressable onPress={handleTransfer} style={[styles.btn, { flex: 2, backgroundColor: '#2196F3' }]}>
                <Text style={[styles.btnTxt, { color: '#fff' }]}>{isRecurring ? 'Programmer' : 'Valider'}</Text>
              </Pressable>
            </View>

            {/* Virements programmés existants */}
            {recurringList.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={[styles.projPickerLabel, { color: colors.mutedForeground, marginTop: 4 }]}>Virements programmés</Text>
                {recurringList.map(rec => (
                  <View key={rec.id} style={[styles.recurringRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <MaterialCommunityIcons name="repeat" size={16} color="#2196F3" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.recurringRowLabel, { color: colors.foreground }]}>
                        {rec.direction === 'to' ? '→ Épargne' : '← Depuis épargne'} · {rec.amount.toFixed(0)} €
                      </Text>
                      <Text style={[styles.recurringRowSub, { color: colors.mutedForeground }]}>
                        {rec.frequency === 'monthly' ? 'Mensuel' : 'Hebdomadaire'} · prochain : {new Date(rec.nextDate).toLocaleDateString('fr-FR')}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        Alert.alert('Supprimer', 'Arrêter ce virement récurrent ?', [
                          { text: 'Annuler', style: 'cancel' },
                          { text: 'Supprimer', style: 'destructive', onPress: async () => { await deleteRecurringTransfer(rec.id); load(); } },
                        ]);
                      }}
                      hitSlop={8}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color="#EF4444" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
      </BottomSheet>

      <OcrScanModal visible={showOcr} onClose={() => setShowOcr(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },


  searchBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    padding: 0,
  },
  searchCount: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },

  balanceCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  balanceCardCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  balanceLblCompact: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  balanceAmountCompact: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  balanceMain: { padding: 20, gap: 4 },
  balanceLbl: { fontSize: 12, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.8 },
  balanceAmount: { fontSize: 36, fontFamily: 'Inter_700Bold', letterSpacing: -1 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  balanceStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  balanceStatTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  balanceDivider: { width: 1, height: 14 },
  balanceMonthHint: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  savingsLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  marketEmoji: { fontSize: 15, lineHeight: 18 },
  savingsLbl: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  savingsAmount: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  transferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  transferBtnTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  quickActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 12, marginBottom: 10 },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickBtnTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  filterRow: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  monthGroup: { marginBottom: 4 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  monthLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize', minWidth: 90 },
  monthDivider: { flex: 1, height: 1 },
  monthTotal: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  loadYearBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 13, borderRadius: 12, borderWidth: 1 },
  loadYearTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txBody: { flex: 1, gap: 2 },
  txLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  txMeta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  txCat: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  txNote: { fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1 },
  txDate: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  txAmount: { fontSize: 15, fontFamily: 'Inter_700Bold', minWidth: 72, textAlign: 'right' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTxt: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  emptyHint: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 40 },

  formTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  projPickerLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.6 },

  amountInput: {
    width: 110,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  amountEuro: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  dateInput: {
    width: 108,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  calBtn: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeChipTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },

  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  catChipTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  btn: {
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTxt: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  transferTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  transferDirRow: { flexDirection: 'row', gap: 10 },
  transferDirBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  transferDirTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  recurringToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  recurringToggleTxt: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  recurringHint: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  freqChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  freqChipTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  recurringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  recurringRowLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  recurringRowSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },

  recurringDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  recurringDateTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  sectionHeader: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggleRowTxt: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  toggleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
