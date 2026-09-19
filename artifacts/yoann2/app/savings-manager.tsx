import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { SubPageHeader } from '@/components/SubPageHeader';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  addRecurringTransfer,
  computeCurrentBalance,
  deleteRecurringTransfer,
  executeSavingsTransfer,
  getRecurringTransfers,
  getSavingsBalance,
  getTransactions,
  processRecurringTransfers,
  type BankTransaction,
  type RecurringFrequency,
  type RecurringTransfer,
} from '@/utils/bankStorage';
import { fmtEuro } from '@/utils/money';

const SAVINGS_COLOR = '#2196F3';

function nextDateFor(frequency: RecurringFrequency): Date {
  const date = new Date();
  if (frequency === 'monthly') date.setMonth(date.getMonth() + 1);
  else date.setDate(date.getDate() + 7);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatOperationDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function operationDescription(tx: BankTransaction): { label: string; sign: '+' | '-' } {
  return tx.type === 'transfer_to_savings'
    ? { label: 'Ajout sur le compte épargne', sign: '+' }
    : { label: 'Retrait vers le compte courant', sign: '-' };
}

export default function SavingsManagerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { transactions, reloadTransactions } = useApp();

  const [savingsBalance, setSavingsBalance] = useState(0);
  const [operations, setOperations] = useState<BankTransaction[]>([]);
  const [recurringList, setRecurringList] = useState<RecurringTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferDir, setTransferDir] = useState<'to' | 'from'>('to');
  const [transferAmount, setTransferAmount] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFreq, setRecurringFreq] = useState<RecurringFrequency>('monthly');
  const [recurringStartDate, setRecurringStartDate] = useState<Date>(() => nextDateFor('monthly'));
  const [showRecurringDatePicker, setShowRecurringDatePicker] = useState(false);

  const currentBalance = useMemo(() => {
    return computeCurrentBalance(transactions);
  }, [transactions]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Process due schedules before reading the history, so an automatic
      // addition always creates its matching current-account operation.
      await processRecurringTransfers();
      const [balance, txs, recurring] = await Promise.all([
        getSavingsBalance(),
        getTransactions(),
        getRecurringTransfers(),
      ]);
      setSavingsBalance(balance);
      setOperations(
        txs
          .filter(tx => tx.type === 'transfer_to_savings' || tx.type === 'transfer_from_savings')
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      );
      setRecurringList(recurring);
      await reloadTransactions();
    } finally {
      setLoading(false);
    }
  }, [reloadTransactions]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  function openTransfer(direction: 'to' | 'from') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTransferDir(direction);
    setTransferAmount('');
    setIsRecurring(false);
    setRecurringFreq('monthly');
    setRecurringStartDate(nextDateFor('monthly'));
    setShowTransfer(true);
  }

  async function handleTransfer() {
    const amount = parseFloat(transferAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Montant invalide', 'Saisis un montant supérieur à zéro.');
      return;
    }

    try {
      if (isRecurring) {
        await addRecurringTransfer({
          direction: transferDir,
          amount,
          label: transferDir === 'to' ? 'Virement vers épargne' : 'Virement depuis épargne',
          frequency: recurringFreq,
          nextDate: recurringStartDate.toISOString(),
        });
      } else {
        await executeSavingsTransfer(transferDir, amount);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowTransfer(false);
      await load();
    } catch {
      Alert.alert('Virement impossible', 'Le virement n’a pas pu être enregistré.');
    }
  }

  function handleDeleteRecurring(recurring: RecurringTransfer) {
    Alert.alert(
      'Supprimer',
      'Arrêter ce virement automatique ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteRecurringTransfer(recurring.id);
            await load();
          },
        },
      ],
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SubPageHeader title="Compte épargne" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.balanceHeader}>
            <View style={[styles.balanceIcon, { backgroundColor: `${SAVINGS_COLOR}18` }]}>
              <MaterialCommunityIcons name="piggy-bank-outline" size={24} color={SAVINGS_COLOR} />
            </View>
            <View style={styles.balanceHeaderText}>
              <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>SOLDE ÉPARGNE</Text>
              <Text style={[styles.balanceAmount, { color: colors.foreground }]}>
                {fmtEuro(savingsBalance)}
              </Text>
            </View>
          </View>
          <View style={[styles.currentBalanceRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.currentBalanceLabel, { color: colors.mutedForeground }]}>
              Solde courant après virements
            </Text>
            <Text style={[styles.currentBalanceAmount, { color: currentBalance >= 0 ? colors.foreground : colors.destructive }]}>
              {fmtEuro(currentBalance)}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => openTransfer('to')}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: `${SAVINGS_COLOR}18`, borderColor: `${SAVINGS_COLOR}55`, opacity: pressed ? 0.72 : 1 },
            ]}
          >
            <MaterialCommunityIcons name="arrow-down-circle-outline" size={20} color={SAVINGS_COLOR} />
            <Text style={[styles.actionText, { color: SAVINGS_COLOR }]}>Ajouter</Text>
          </Pressable>
          <Pressable
            onPress={() => openTransfer('from')}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.72 : 1 },
            ]}
          >
            <MaterialCommunityIcons name="arrow-up-circle-outline" size={20} color={colors.mutedForeground} />
            <Text style={[styles.actionText, { color: colors.foreground }]}>Retirer</Text>
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>OPÉRATIONS</Text>
        {loading ? (
          <ActivityIndicator color={SAVINGS_COLOR} style={styles.loader} />
        ) : operations.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="bank-transfer-in" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucune opération</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Les ajouts et retraits apparaîtront ici.
            </Text>
          </View>
        ) : (
          <View style={[styles.operationsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {operations.map((tx, index) => {
              const operation = operationDescription(tx);
              const isLast = index === operations.length - 1;
              return (
                <View key={tx.id} style={[styles.operationRow, !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                  <View style={[styles.operationIcon, { backgroundColor: operation.sign === '+' ? '#4CAF5018' : '#FF980018' }]}>
                    <MaterialCommunityIcons
                      name={operation.sign === '+' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                      size={19}
                      color={operation.sign === '+' ? '#4CAF50' : '#FF9800'}
                    />
                  </View>
                  <View style={styles.operationInfo}>
                    <Text style={[styles.operationLabel, { color: colors.foreground }]}>{operation.label}</Text>
                    <Text style={[styles.operationDate, { color: colors.mutedForeground }]}>
                      {formatOperationDate(tx.date)}{tx.note ? ` · ${tx.note}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.operationAmount, { color: operation.sign === '+' ? '#4CAF50' : '#FF9800' }]}>
                    {operation.sign}{fmtEuro(tx.amount)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {recurringList.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>VIREMENTS AUTOMATIQUES</Text>
            <View style={[styles.operationsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {recurringList.map(recurring => (
                <View key={recurring.id} style={styles.recurringRow}>
                  <MaterialCommunityIcons name="repeat" size={19} color={SAVINGS_COLOR} />
                  <View style={styles.operationInfo}>
                    <Text style={[styles.operationLabel, { color: colors.foreground }]}>
                      {recurring.direction === 'to' ? 'Vers épargne' : 'Depuis épargne'} · {fmtEuro(recurring.amount)}
                    </Text>
                    <Text style={[styles.operationDate, { color: colors.mutedForeground }]}>
                      {recurring.frequency === 'monthly' ? 'Mensuel' : 'Hebdomadaire'} · prochain : {formatOperationDate(recurring.nextDate)}
                    </Text>
                  </View>
                  <Pressable onPress={() => handleDeleteRecurring(recurring)} hitSlop={8}>
                    <MaterialCommunityIcons name="trash-can-outline" size={19} color={colors.destructive} />
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={showTransfer}
        onClose={() => setShowTransfer(false)}
        title={transferDir === 'to' ? 'Ajouter à l’épargne' : 'Retirer de l’épargne'}
        avoidKeyboard
      >
        <View style={styles.directionRow}>
          {(['to', 'from'] as const).map(direction => (
            <Pressable
              key={direction}
              onPress={() => setTransferDir(direction)}
              style={[
                styles.directionButton,
                transferDir === direction
                  ? { backgroundColor: SAVINGS_COLOR, borderColor: SAVINGS_COLOR }
                  : { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <MaterialCommunityIcons
                name={direction === 'to' ? 'arrow-down' : 'arrow-up'}
                size={15}
                color={transferDir === direction ? '#fff' : colors.mutedForeground}
              />
              <Text style={[styles.directionText, { color: transferDir === direction ? '#fff' : colors.mutedForeground }]}>
                {direction === 'to' ? 'Vers épargne' : 'Depuis épargne'}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          value={transferAmount}
          onChangeText={setTransferAmount}
          placeholder="Montant (ex : 200)"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="decimal-pad"
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
          autoFocus
        />

        <Pressable
          onPress={() => setIsRecurring(value => !value)}
          style={[styles.recurringToggle, { backgroundColor: colors.background, borderColor: isRecurring ? SAVINGS_COLOR : colors.border }]}
        >
          <MaterialCommunityIcons
            name={isRecurring ? 'repeat' : 'repeat-off'}
            size={18}
            color={isRecurring ? SAVINGS_COLOR : colors.mutedForeground}
          />
          <Text style={[styles.recurringToggleText, { color: isRecurring ? SAVINGS_COLOR : colors.mutedForeground }]}>
            {isRecurring ? 'Virement automatique' : 'Ponctuel (une fois)'}
          </Text>
        </Pressable>

        {isRecurring && (
          <View style={styles.recurringForm}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Fréquence</Text>
            <View style={styles.frequencyRow}>
              {(['monthly', 'weekly'] as RecurringFrequency[]).map(frequency => (
                <Pressable
                  key={frequency}
                  onPress={() => {
                    setRecurringFreq(frequency);
                    setRecurringStartDate(nextDateFor(frequency));
                  }}
                  style={[
                    styles.frequencyButton,
                    recurringFreq === frequency
                      ? { backgroundColor: `${SAVINGS_COLOR}20`, borderColor: SAVINGS_COLOR }
                      : { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.frequencyText, { color: recurringFreq === frequency ? SAVINGS_COLOR : colors.mutedForeground }]}>
                    {frequency === 'monthly' ? 'Mensuel' : 'Hebdomadaire'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.dateRow}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Premier virement</Text>
              <Pressable
                onPress={() => setShowRecurringDatePicker(true)}
                style={[styles.dateButton, { backgroundColor: colors.background, borderColor: SAVINGS_COLOR }]}
              >
                <Text style={[styles.dateText, { color: SAVINGS_COLOR }]}>
                  {recurringStartDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </Text>
                <MaterialCommunityIcons name="calendar-outline" size={15} color={SAVINGS_COLOR} />
              </Pressable>
              {showRecurringDatePicker && (
                <DateTimePicker
                  value={recurringStartDate}
                  mode="date"
                  display="calendar"
                  minimumDate={new Date()}
                  onChange={(_event, selected) => {
                    setShowRecurringDatePicker(false);
                    if (selected) {
                      selected.setHours(0, 0, 0, 0);
                      setRecurringStartDate(selected);
                    }
                  }}
                />
              )}
            </View>
          </View>
        )}

        <View style={styles.sheetActions}>
          <Pressable
            onPress={() => setShowTransfer(false)}
            style={[styles.sheetButton, { backgroundColor: colors.background, borderColor: colors.border }]}
          >
            <Text style={[styles.sheetButtonText, { color: colors.mutedForeground }]}>Annuler</Text>
          </Pressable>
          <Pressable
            onPress={handleTransfer}
            style={[styles.sheetButton, { backgroundColor: SAVINGS_COLOR, borderColor: SAVINGS_COLOR, flex: 1.4 }]}
          >
            <Text style={[styles.sheetButtonText, { color: '#fff' }]}>{isRecurring ? 'Programmer' : 'Valider'}</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  balanceCard: {
    margin: 16,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 20,
  },
  balanceIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceHeaderText: { flex: 1, gap: 4 },
  eyebrow: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.8,
  },
  balanceAmount: {
    fontSize: 31,
    fontFamily: 'Inter_700Bold',
  },
  currentBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  currentBalanceLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  currentBalanceAmount: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 8,
  },
  loader: { marginTop: 30 },
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    padding: 25,
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  operationsCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  operationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  operationIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  operationInfo: { flex: 1, gap: 3 },
  operationLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  operationDate: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  operationAmount: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  recurringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  directionRow: { flexDirection: 'row', gap: 10 },
  directionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 13,
    borderWidth: 1,
  },
  directionText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  recurringToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  recurringToggleText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  recurringForm: { gap: 8 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.6 },
  frequencyRow: { flexDirection: 'row', gap: 10 },
  frequencyButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  frequencyText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dateText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  sheetActions: { flexDirection: 'row', gap: 10 },
  sheetButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 13,
    borderWidth: 1,
  },
  sheetButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});