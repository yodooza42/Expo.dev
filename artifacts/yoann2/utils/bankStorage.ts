import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  TRANSACTIONS: '@yoann2/bank_transactions',
  SAVINGS_BALANCE: '@yoann2/bank_savings_balance',
};

export type TransactionType = 'income' | 'expense' | 'transfer_to_savings' | 'transfer_from_savings';

export interface BankTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  label: string;
  category: string;
  date: string;
  note?: string;
  fromExpenseId?: string;
}

function genId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

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
  return txs.reduce((sum, tx) => {
    if (tx.type === 'income') return sum + tx.amount;
    if (tx.type === 'expense') return sum - tx.amount;
    if (tx.type === 'transfer_to_savings') return sum - tx.amount;
    if (tx.type === 'transfer_from_savings') return sum + tx.amount;
    return sum;
  }, 0);
}

export const INCOME_CATEGORIES = [
  'Salaire', 'Freelance', 'Remboursement', 'Vente', 'Autre revenu',
];

export const EXPENSE_CATEGORIES = [
  'Alimentation', 'Transport', 'Logement', 'Santé', 'Loisirs',
  'Abonnements', 'Vêtements', 'Matériaux / Projet', 'Restauration', 'Autre',
];
