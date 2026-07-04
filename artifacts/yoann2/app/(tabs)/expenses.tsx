import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { CameraOcrIcon } from '@/components/CameraOcrIcon';
import { OcrScanModal } from '@/components/OcrScanModal';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  addRecurringExpense,
  addRecurringTransfer,
  addTransaction,
  BankTransaction,
  computeCurrentBalance,
  deleteRecurringExpense,
  deleteRecurringTransfer,
  deleteTransaction,
  EXPENSE_CATEGORIES,
  getRecurringExpenses,
  getRecurringTransfers,
  getSavingsBalance,
  getTransactions,
  INCOME_CATEGORIES,
  processRecurringExpenses,
  processRecurringTransfers,
  RecurringExpense,
  RecurringFrequency,
  RecurringTransfer,
  setSavingsBalance,
  TransactionType,
  updateTransaction,
} from '@/utils/bankStorage';
import { fmtDateShort } from '@/utils/date';

const SHOW_AMOUNTS_KEY = '@yoann2/finance_show_amounts';

const TYPE_CONFIG: Record<TransactionType, { label: string; icon: string; color: string; sign: string }> = {
  income:                { label: 'Entrée',          icon: 'arrow-down-circle-outline',  color: '#4CAF50', sign: '+' },
  expense:               { label: 'Sortie',           icon: 'arrow-up-circle-outline',    color: '#EF4444', sign: '-' },
  transfer_to_savings:   { label: 'Vers épargne',     icon: 'piggy-bank-outline',         color: '#2196F3', sign: '-' },
  transfer_from_savings: { label: 'Depuis épargne',   icon: 'bank-transfer',              color: '#FF9800', sign: '+' },
};

function formatAmount(amount: number, masked: boolean): string {
  if (masked) return '••••';
  return `${amount.toFixed(2).replace('.', ',')} €`;
}


function groupByMonth(txs: BankTransaction[]): { label: string; items: BankTransaction[] }[] {
  const map = new Map<string, BankTransaction[]>();
  for (const tx of txs) {
    const key = new Date(tx.date).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
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
  const { expenses, projects, tasks, addExpense, updateExpense, deleteExpense } = useApp();

  const [transactions, setTransactions]   = useState<BankTransaction[]>([]);
  const [savingsBalance, setSavingsBal]   = useState(0);
  const [showAmounts, setShowAmounts]     = useState(false);
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
  const [recurringStartDate, setRecurringStartDate] = useState<Date>(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; });
  const [showRecurringDatePicker, setShowRecurringDatePicker] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDir, setTransferDir]     = useState<'to' | 'from'>('to');

  // Recurring expenses (abonnements)
  const [recurringExpenseList, setRecurringExpenseList] = useState<RecurringExpense[]>([]);
  const [isRecurringExpense, setIsRecurringExpense]     = useState(false);
  const [recurringExpenseFreq, setRecurringExpenseFreq] = useState<RecurringFrequency>('monthly');
  const [recurringExpenseStart, setRecurringExpenseStart] = useState<Date>(new Date());
  const [showRecExpDatePicker, setShowRecExpDatePicker] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;

  async function load() {
    await Promise.all([processRecurringTransfers(), processRecurringExpenses()]);
    const [txs, sav, shown, recs, recExps] = await Promise.all([
      getTransactions(),
      getSavingsBalance(),
      AsyncStorage.getItem(SHOW_AMOUNTS_KEY),
      getRecurringTransfers(),
      getRecurringExpenses(),
    ]);
    setTransactions(txs);
    setSavingsBal(sav);
    setRecurringList(recs);
    setRecurringExpenseList(recExps);
    if (shown === 'true') setShowAmounts(true);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  function toggleAmounts() {
    Haptics.selectionAsync();
    setShowAmounts(v => {
      AsyncStorage.setItem(SHOW_AMOUNTS_KEY, String(!v));
      return !v;
    });
  }

  const projectExpenseTxIds = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(t => { if (t.fromExpenseId) set.add(t.fromExpenseId); });
    return set;
  }, [transactions]);

  const allTransactions = useMemo((): BankTransaction[] => {
    const projTxs: BankTransaction[] = expenses
      .filter(e => !projectExpenseTxIds.has(e.id))
      .map(e => ({
        id: `proj_${e.id}`,
        type: 'expense' as TransactionType,
        amount: e.amount,
        label: e.name,
        category: e.category || 'Matériaux / Projet',
        date: e.date,
        note: projects.find(p => p.id === e.projectId)?.name,
        fromExpenseId: e.id,
      }));
    return [...transactions, ...projTxs].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [transactions, expenses, projects, projectExpenseTxIds]);

  const filtered = useMemo(() =>
    filter === 'all' ? allTransactions : allTransactions.filter(t => t.type === filter),
    [allTransactions, filter]
  );

  const grouped = useMemo(() => groupByMonth(filtered), [filtered]);

  const currentBalance = useMemo(() => computeCurrentBalance(allTransactions), [allTransactions]);

  const monthIncome = useMemo(() => {
    const now = new Date();
    return allTransactions
      .filter(t => {
        const d = new Date(t.date);
        return !t.hidden
          && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
          && (t.type === 'income' || t.type === 'transfer_from_savings');
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [allTransactions]);

  const monthExpense = useMemo(() => {
    const now = new Date();
    return allTransactions
      .filter(t => {
        const d = new Date(t.date);
        return !t.hidden
          && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
          && (t.type === 'expense' || t.type === 'transfer_to_savings');
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [allTransactions]);

  function openForm(type: TransactionType = 'expense', tx?: BankTransaction) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsRecurringExpense(false);
    setRecurringExpenseFreq('monthly');
    setRecurringExpenseStart(new Date());
    if (tx) {
      setEditId(tx.id);
      const noteVal = tx.note ?? '';
      const matchedProj = projects.find(p => noteVal === p.name || noteVal.startsWith(p.name + ' · '));
      setNoteProjId(matchedProj?.id ?? null);
      // Restore linked task if any
      if (matchedProj) {
        const suffix = noteVal.slice(matchedProj.name.length + 3); // ' · '
        const matchedTask = tasks.find(t => t.projectId === matchedProj.id && t.title === suffix);
        setNoteTaskId(matchedTask?.id ?? null);
      } else {
        setNoteTaskId(null);
      }
      setForm({
        type: tx.type,
        amount: tx.amount.toString(),
        label: tx.label,
        category: tx.category,
        note: noteVal,
        userNote: tx.userNote ?? '',
        hidden: tx.hidden ?? false,
        date: (() => {
          const d = new Date(tx.date);
          return isNaN(d.getTime()) ? new Date().toLocaleDateString('fr-FR') : d.toLocaleDateString('fr-FR');
        })(),
      });
    } else {
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
      if (editId.startsWith('proj_')) {
        // Transaction is a project expense displayed as a fake Finance row
        const originalId = editId.slice(5);
        updateExpense(originalId, { name: label, amount, date: isoDate, category: cat });
      } else {
        // Real bank transaction — update it
        const existingTx = transactions.find(t => t.id === editId);
        await updateTransaction(editId, {
          type:     form.type,
          amount,
          label,
          category: cat,
          date:     isoDate,
          note:     form.note.trim() || undefined,
          userNote: userNoteVal,
          hidden:   form.hidden || undefined,
        });
        // If it has a linked project expense, sync it too
        if (existingTx?.fromExpenseId) {
          const linkedExp = expenses.find(e => e.id === existingTx.fromExpenseId);
          if (linkedExp) {
            updateExpense(existingTx.fromExpenseId, {
              name:      label,
              amount,
              date:      isoDate,
              category:  cat,
              projectId: noteProjId ?? linkedExp.projectId,
              taskId:    noteTaskId ?? undefined,
            });
          }
        }
      }
    } else {
      // Build common project expense data when a project is linked
      const projExpenseData = noteProjId && form.type === 'expense'
        ? { projectId: noteProjId, taskId: noteTaskId ?? undefined, name: label, amount, date: isoDate, category: cat }
        : null;

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
        // First occurrence
        const projExp = projExpenseData ? addExpense({ ...projExpenseData, date: recurringExpenseStart.toISOString() }) : null;
        await addTransaction({
          type:            form.type,
          amount,
          label,
          category:        cat,
          date:            recurringExpenseStart.toISOString(),
          note:            `Récurrent · ${recurringExpenseFreq === 'monthly' ? 'mensuel' : 'hebdomadaire'}`,
          userNote:        userNoteVal,
          hidden:          form.hidden || undefined,
          fromExpenseId:   projExp?.id,
        });
      } else {
        // One-shot transaction
        const projExp = projExpenseData ? addExpense(projExpenseData) : null;
        await addTransaction({
          type:          form.type,
          amount,
          label,
          category:      cat,
          date:          isoDate,
          note:          form.note.trim() || undefined,
          userNote:      userNoteVal,
          hidden:        form.hidden || undefined,
          fromExpenseId: projExp?.id,
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
          await deleteTransaction(id);
          // Also remove the linked project expense (if any)
          if (tx?.fromExpenseId) deleteExpense(tx.fromExpenseId);
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
      await addTransaction({
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
    const resetDate = new Date(); resetDate.setMonth(resetDate.getMonth() + 1);
    setRecurringStartDate(resetDate);
    load();
  }

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

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
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Finance</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowOcr(true); }}
            hitSlop={8}
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <CameraOcrIcon size={18} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/expense-stats')}
            hitSlop={8}
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="chart-bar" size={18} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={toggleAmounts}
            hitSlop={8}
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons
              name={showAmounts ? 'eye-outline' : 'eye-off-outline'}
              size={18}
              color={colors.mutedForeground}
            />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>

        {/* ── Sticky balance card ── */}
        <View style={{ backgroundColor: colors.background, paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Compte courant */}
            <View style={styles.balanceMain}>
              <Text style={[styles.balanceLbl, { color: colors.mutedForeground }]}>Solde courant</Text>
              <Text style={[styles.balanceAmount, { color: currentBalance >= 0 ? colors.foreground : colors.destructive }]}>
                {showAmounts ? `${currentBalance >= 0 ? '' : '-'}${Math.abs(currentBalance).toFixed(2).replace('.', ',')} €` : '••••••'}
              </Text>
              <View style={styles.balanceRow}>
                <View style={styles.balanceStat}>
                  <MaterialCommunityIcons name="arrow-down-circle" size={14} color="#4CAF50" />
                  <Text style={[styles.balanceStatTxt, { color: colors.mutedForeground }]}>
                    {showAmounts ? `+${monthIncome.toFixed(2).replace('.', ',')} €` : '••••'}
                  </Text>
                </View>
                <View style={[styles.balanceDivider, { backgroundColor: colors.border }]} />
                <View style={styles.balanceStat}>
                  <MaterialCommunityIcons name="arrow-up-circle" size={14} color="#EF4444" />
                  <Text style={[styles.balanceStatTxt, { color: colors.mutedForeground }]}>
                    {showAmounts ? `-${monthExpense.toFixed(2).replace('.', ',')} €` : '••••'}
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
                {showAmounts ? `${savingsBalance.toFixed(2).replace('.', ',')} €` : '••••'}
              </Text>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTransferDir('to'); setShowTransfer(true); }}
                style={[styles.transferBtn, { backgroundColor: '#2196F3' + '18', borderColor: '#2196F3' + '40' }]}
              >
                <MaterialCommunityIcons name="bank-transfer" size={15} color="#2196F3" />
                <Text style={[styles.transferBtnTxt, { color: '#2196F3' }]}>Virer</Text>
              </Pressable>
            </View>
          </View>
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
                      return `${net >= 0 ? '+' : ''}${net.toFixed(2).replace('.', ',')} €`;
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
                    {showAmounts ? `${rec.amount.toFixed(2).replace('.', ',')} € · ` : '•••• · '}
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
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={closeForm} />
          <View style={[styles.formSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Handle */}
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* Form header: title + delete button */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={[styles.formTitle, { color: colors.foreground }]}>
                {editId ? 'Modifier la transaction' : 'Nouvelle transaction'}
              </Text>
              {editId && !editId.startsWith('proj_') && (
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
              {(['income', 'expense', 'transfer_to_savings', 'transfer_from_savings'] as TransactionType[]).map(type => {
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
              onChangeText={v => setForm(f => ({ ...f, label: v }))}
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
                    onPress={() => setForm(f => ({ ...f, category: cat }))}
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
            {form.type !== 'transfer_to_savings' && form.type !== 'transfer_from_savings' && (
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
                  const projTasks = tasks.filter(t => t.projectId === noteProjId && t.status !== 'done');
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
                          onChange={(_e, d) => { setShowRecExpDatePicker(false); if (d) setRecurringExpenseStart(d); }}
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
          </View>
        </View>
      </Modal>

      {/* ── Transfer modal ── */}
      <Modal visible={showTransfer} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => { setShowTransfer(false); setIsRecurring(false); }} />
          <View style={[styles.formSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.transferTitle, { color: colors.foreground }]}>Virement épargne</Text>

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
                        if (selected) setRecurringStartDate(selected);
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
          </View>
        </View>
      </Modal>

      <OcrScanModal visible={showOcr} onClose={() => setShowOcr(false)} />
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
  iconBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  balanceCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
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

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  formSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
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
