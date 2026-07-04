import AsyncStorage from '@react-native-async-storage/async-storage';

import { genId } from '@/utils/ids';

const KEYS = {
  TRANSACTIONS: '@yoann2/bank_transactions',
  SAVINGS_BALANCE: '@yoann2/bank_savings_balance',
  RECURRING: '@yoann2/bank_recurring_transfers',
  RECURRING_EXPENSES: '@yoann2/bank_recurring_expenses',
};

export type TransactionType = 'income' | 'expense' | 'transfer_to_savings' | 'transfer_from_savings' | 'transfer_to_market' | 'transfer_from_market';

export interface BankTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  label: string;
  category: string;
  date: string;
  note?: string;
  userNote?: string;
  hidden?: boolean;
  fromExpenseId?: string;
  fromRecurringExpenseId?: string;
}

export type RecurringFrequency = 'weekly' | 'monthly';

export interface RecurringExpense {
  id: string;
  type: 'income' | 'expense';
  label: string;
  amount: number;
  category: string;
  frequency: RecurringFrequency;
  nextDate: string;
  userNote?: string;
  createdAt: string;
}

export interface RecurringTransfer {
  id: string;
  direction: 'to' | 'from';
  amount: number;
  label: string;
  frequency: RecurringFrequency;
  nextDate: string;
  createdAt: string;
}


// ── BankTransaction ──────────────────────────────────────────────────────────

export async function getTransactions(): Promise<BankTransaction[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.TRANSACTIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveTransactions(txs: BankTransaction[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(txs));
}

export async function addTransaction(tx: Omit<BankTransaction, 'id'>): Promise<BankTransaction> {
  const txs = await getTransactions();
  const newTx: BankTransaction = { ...tx, id: genId() };
  await saveTransactions([newTx, ...txs]);
  return newTx;
}

export async function deleteTransaction(id: string): Promise<void> {
  const txs = await getTransactions();
  await saveTransactions(txs.filter(t => t.id !== id));
}

export async function updateTransaction(id: string, updates: Partial<Omit<BankTransaction, 'id'>>): Promise<void> {
  const txs = await getTransactions();
  await saveTransactions(txs.map(t => t.id === id ? { ...t, ...updates } : t));
}

// ── SavingsBalance ───────────────────────────────────────────────────────────

export async function getSavingsBalance(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SAVINGS_BALANCE);
    return raw ? parseFloat(raw) : 0;
  } catch {
    return 0;
  }
}

export async function setSavingsBalance(balance: number): Promise<void> {
  await AsyncStorage.setItem(KEYS.SAVINGS_BALANCE, String(balance));
}

export function computeCurrentBalance(txs: BankTransaction[]): number {
  return txs
    .filter(tx => !tx.hidden)
    .reduce((sum, tx) => {
      if (tx.type === 'income') return sum + tx.amount;
      if (tx.type === 'expense') return sum - tx.amount;
      if (tx.type === 'transfer_to_savings') return sum - tx.amount;
      if (tx.type === 'transfer_from_savings') return sum + tx.amount;
      if (tx.type === 'transfer_to_market') return sum - tx.amount;
      if (tx.type === 'transfer_from_market') return sum + tx.amount;
      return sum;
    }, 0);
}

// ── RecurringTransfer ────────────────────────────────────────────────────────

export async function getRecurringTransfers(): Promise<RecurringTransfer[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.RECURRING);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveRecurringTransfers(recs: RecurringTransfer[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.RECURRING, JSON.stringify(recs));
}

export async function addRecurringTransfer(
  rec: Omit<RecurringTransfer, 'id' | 'createdAt'>
): Promise<RecurringTransfer> {
  const recs = await getRecurringTransfers();
  const newRec: RecurringTransfer = {
    ...rec,
    id: genId(),
    createdAt: new Date().toISOString(),
  };
  await saveRecurringTransfers([...recs, newRec]);
  return newRec;
}

export async function deleteRecurringTransfer(id: string): Promise<void> {
  const recs = await getRecurringTransfers();
  await saveRecurringTransfers(recs.filter(r => r.id !== id));
}

function nextOccurrence(from: Date, frequency: RecurringFrequency): Date {
  const next = new Date(from);
  if (frequency === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  } else {
    next.setDate(next.getDate() + 7);
  }
  return next;
}

export async function processRecurringTransfers(): Promise<number> {
  const recs = await getRecurringTransfers();
  const now = new Date();
  let executed = 0;

  for (const rec of recs) {
    let nextDate = new Date(rec.nextDate);
    while (nextDate <= now) {
      const label = rec.label || (rec.direction === 'to' ? 'Virement épargne auto' : 'Virement depuis épargne auto');
      await addTransaction({
        type: rec.direction === 'to' ? 'transfer_to_savings' : 'transfer_from_savings',
        amount: rec.amount,
        label,
        category: 'Épargne',
        date: nextDate.toISOString(),
        note: `Récurrent · ${rec.frequency === 'monthly' ? 'mensuel' : 'hebdomadaire'}`,
      });
      const savings = await getSavingsBalance();
      await setSavingsBalance(
        rec.direction === 'to'
          ? savings + rec.amount
          : Math.max(0, savings - rec.amount)
      );
      nextDate = nextOccurrence(nextDate, rec.frequency);
      executed++;
    }
    rec.nextDate = nextDate.toISOString();
  }

  if (executed > 0) {
    await saveRecurringTransfers(recs);
  }
  return executed;
}

// ── RecurringExpense ─────────────────────────────────────────────────────────

export async function getRecurringExpenses(): Promise<RecurringExpense[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.RECURRING_EXPENSES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveRecurringExpenses(recs: RecurringExpense[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.RECURRING_EXPENSES, JSON.stringify(recs));
}

export async function addRecurringExpense(
  rec: Omit<RecurringExpense, 'id' | 'createdAt'>
): Promise<RecurringExpense> {
  const recs = await getRecurringExpenses();
  const newRec: RecurringExpense = {
    ...rec,
    id: genId(),
    createdAt: new Date().toISOString(),
  };
  await saveRecurringExpenses([...recs, newRec]);
  return newRec;
}

export async function deleteRecurringExpense(id: string): Promise<void> {
  const recs = await getRecurringExpenses();
  await saveRecurringExpenses(recs.filter(r => r.id !== id));
}

export async function processRecurringExpenses(): Promise<number> {
  const recs = await getRecurringExpenses();
  const now = new Date();
  let executed = 0;

  for (const rec of recs) {
    let nextDate = new Date(rec.nextDate);
    while (nextDate <= now) {
      await addTransaction({
        type: rec.type,
        amount: rec.amount,
        label: rec.label,
        category: rec.category,
        date: nextDate.toISOString(),
        note: `Récurrent · ${rec.frequency === 'monthly' ? 'mensuel' : 'hebdomadaire'}`,
        userNote: rec.userNote,
        fromRecurringExpenseId: rec.id,
      });
      nextDate = nextOccurrence(nextDate, rec.frequency);
      executed++;
    }
    rec.nextDate = nextDate.toISOString();
  }

  if (executed > 0) {
    await saveRecurringExpenses(recs);
  }
  return executed;
}

// ── Categories ───────────────────────────────────────────────────────────────

export const INCOME_CATEGORIES = [
  'Salaire', 'Freelance', 'Remboursement', 'Vente', 'Autre revenu',
];

export const EXPENSE_CATEGORIES = [
  'Alimentation', 'Transport', 'Logement', 'Santé', 'Loisirs',
  'Abonnements', 'Vêtements', 'Matériaux / Projet', 'Restauration', 'Autre',
];
