import AsyncStorage from '@react-native-async-storage/async-storage';

import { genId } from '@/utils/ids';

const KEYS = {
  TRANSACTIONS: '@yoann2/bank_transactions',
  SAVINGS_BALANCE: '@yoann2/bank_savings_balance',
  RECURRING: '@yoann2/bank_recurring_transfers',
  RECURRING_EXPENSES: '@yoann2/bank_recurring_expenses',
  MIGRATION_V1: '@yoann2/migration_expenses_v1',
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
  projectId?: string;
  taskId?: string;
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

/**
 * Executes a transfer between the current account and savings.
 * The bank transaction is deliberately recorded for both directions so the
 * current-account balance and the savings history stay in sync.
 */
export async function executeSavingsTransfer(
  direction: 'to' | 'from',
  amount: number,
  options?: { label?: string; date?: string; note?: string },
): Promise<BankTransaction> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Savings transfer amount must be positive');
  }

  const savings = await getSavingsBalance();
  const label = options?.label
    || (direction === 'to' ? 'Virement vers épargne' : 'Virement depuis épargne');

  await setSavingsBalance(
    direction === 'to'
      ? savings + amount
      : Math.max(0, savings - amount),
  );

  return addTransaction({
    type: direction === 'to' ? 'transfer_to_savings' : 'transfer_from_savings',
    amount,
    label,
    category: 'Épargne',
    date: options?.date ?? new Date().toISOString(),
    note: options?.note,
  });
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
  next.setHours(0, 0, 0, 0);
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
      await executeSavingsTransfer(rec.direction, rec.amount, {
        label,
        date: nextDate.toISOString(),
        note: `Récurrent · ${rec.frequency === 'monthly' ? 'mensuel' : 'hebdomadaire'}`,
      });
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

// ── Categories (liste unifiée) ────────────────────────────────────────────────

export const INCOME_CATEGORIES = [
  'Salaire', 'Freelance', 'Remboursement', 'Vente', 'Autre revenu',
];

/** Liste unifiée — vie courante + travaux/projets */
export const EXPENSE_CATEGORIES = [
  // Vie courante
  'Alimentation', 'Transport', 'Carburant', 'Logement', 'Santé',
  'Loisirs', 'Abonnements', 'Vêtements', 'Restauration',
  // Travaux / projets
  'Outillage', 'Électroménager', 'Consommable', 'Mobilier',
  'Matériaux', 'Main d\'œuvre', 'Quincaillerie', 'Équipement',
  // Autre
  'Autre',
];

// ── Category configs (name + keywords) ───────────────────────────────────────

export interface CategoryConfig {
  id: string;
  name: string;
  type: 'income' | 'expense';
  keywords: string[];
  /** Display order — lower = first */
  order?: number;
}

const CATEGORIES_KEY = '@yoann2/bank_categories_v2';

export const DEFAULT_EXPENSE_CATEGORY_CONFIGS: CategoryConfig[] = [
  // Vie courante
  { id: 'alimentation', name: 'Alimentation',   type: 'expense', keywords: ['courses'] },
  { id: 'transport',    name: 'Transport',       type: 'expense', keywords: [] },
  { id: 'carburant',    name: 'Carburant',       type: 'expense', keywords: ['essence', 'carburant', 'sp98', 'sp95', 'gazole'] },
  { id: 'logement',     name: 'Logement',        type: 'expense', keywords: ['loyer'] },
  { id: 'sante',        name: 'Santé',           type: 'expense', keywords: ['pharmacie', 'medecin', 'docteur'] },
  { id: 'loisirs',      name: 'Loisirs',         type: 'expense', keywords: [] },
  { id: 'abonnements',  name: 'Abonnements',     type: 'expense', keywords: [] },
  { id: 'assurance',   name: 'Assurance',       type: 'expense', keywords: ['assurance'] },
  { id: 'vetements',    name: 'Vêtements',       type: 'expense', keywords: [] },
  { id: 'restauration', name: 'Restauration',    type: 'expense', keywords: ['restaurant'] },
  // Travaux / projets
  { id: 'outillage',    name: 'Outillage',       type: 'expense', keywords: ['outil', 'perceuse', 'scie'] },
  { id: 'electromenager', name: 'Électroménager', type: 'expense', keywords: [] },
  { id: 'consommable',  name: 'Consommable',     type: 'expense', keywords: [] },
  { id: 'mobilier',     name: 'Mobilier',        type: 'expense', keywords: [] },
  { id: 'materiaux',    name: 'Matériaux',       type: 'expense', keywords: ['beton', 'parpaing', 'bois', 'placo'] },
  { id: 'maindoeuvre',  name: 'Main d\'œuvre',   type: 'expense', keywords: [] },
  { id: 'quincaillerie', name: 'Quincaillerie',  type: 'expense', keywords: [] },
  { id: 'equipement',   name: 'Équipement',      type: 'expense', keywords: [] },
  // Autre
  { id: 'autre',        name: 'Autre',           type: 'expense', keywords: [] },
];

export const DEFAULT_INCOME_CATEGORY_CONFIGS: CategoryConfig[] = [
  { id: 'salaire',       name: 'Salaire',       type: 'income', keywords: ['salaire'] },
  { id: 'freelance',     name: 'Freelance',      type: 'income', keywords: [] },
  { id: 'remboursement', name: 'Remboursement',  type: 'income', keywords: ['remboursement', 'rbt'] },
  { id: 'vente',         name: 'Vente',          type: 'income', keywords: [] },
  { id: 'autre-revenu',  name: 'Autre revenu',   type: 'income', keywords: [] },
];

export const DEFAULT_CATEGORY_CONFIGS: CategoryConfig[] = [
  ...DEFAULT_EXPENSE_CATEGORY_CONFIGS,
  ...DEFAULT_INCOME_CATEGORY_CONFIGS,
];

export async function getCategoryConfigs(): Promise<CategoryConfig[]> {
  try {
    const raw = await AsyncStorage.getItem(CATEGORIES_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as CategoryConfig[];
      // Merge any new default categories not yet in stored list
      const storedIds = new Set(stored.map(c => c.id));
      const missing = DEFAULT_CATEGORY_CONFIGS.filter(c => !storedIds.has(c.id));
      const merged = missing.length > 0 ? [...stored, ...missing] : stored;
      // Backfill missing order values for existing configs
      const maxOrder = Math.max(...merged.map((c, i) => c.order ?? i), 0);
      let nextOrder = maxOrder + 1;
      return merged
        .map(c => (c.order == null ? { ...c, order: nextOrder++ } : c))
        .sort((a, b) => (a.order! - b.order!));
    }
  } catch {}
  return DEFAULT_CATEGORY_CONFIGS.map((c, i) => ({ ...c, order: i + 1 }));
}

export async function saveCategoryConfigs(configs: CategoryConfig[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(configs));
  } catch {}
}

/** Retourne le nom de la catégorie dont un mot-clé correspond au libellé (insensible à la casse). */
export function matchCategoryByKeyword(
  label: string,
  configs: CategoryConfig[],
  type: 'income' | 'expense',
): string {
  const lower = label.toLowerCase();
  for (const cfg of configs.filter(c => c.type === type)) {
    for (const kw of cfg.keywords) {
      if (kw && lower.includes(kw.toLowerCase())) return cfg.name;
    }
  }
  return '';
}

// ── Migration : expenses AppContext → BankTransactions ───────────────────────

interface LegacyExpense {
  id: string;
  projectId: string;
  taskId?: string;
  name: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
}

/** Migration one-shot : convertit les anciennes dépenses projet en BankTransactions.
 *  Idempotente : ne s'exécute qu'une fois (flag AsyncStorage). */
export async function migrateExpensesToTransactions(): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(KEYS.MIGRATION_V1);
    if (done) return;

    const raw = await AsyncStorage.getItem('@yoann2_expenses');
    if (!raw) {
      await AsyncStorage.setItem(KEYS.MIGRATION_V1, 'done');
      return;
    }

    const legacyExpenses: LegacyExpense[] = JSON.parse(raw);
    if (!legacyExpenses.length) {
      await AsyncStorage.setItem(KEYS.MIGRATION_V1, 'done');
      return;
    }

    const existingTxs = await getTransactions();

    // Map fromExpenseId → transaction for quick lookup
    const fromExpenseMap = new Map<string, BankTransaction>();
    existingTxs.forEach(t => {
      if (t.fromExpenseId) fromExpenseMap.set(t.fromExpenseId, t);
    });

    let updated = [...existingTxs];

    for (const exp of legacyExpenses) {
      const linked = fromExpenseMap.get(exp.id);
      if (linked) {
        // Patch existing bank transaction with projectId/taskId
        updated = updated.map(t =>
          t.id === linked.id
            ? { ...t, projectId: exp.projectId, taskId: exp.taskId ?? undefined }
            : t
        );
      } else {
        // Pas de bank transaction → créer une nouvelle
        const newTx: BankTransaction = {
          id: genId(),
          type: 'expense',
          amount: exp.amount,
          label: exp.name,
          category: exp.category || 'Autre',
          date: exp.date,
          projectId: exp.projectId,
          taskId: exp.taskId ?? undefined,
          userNote: exp.description ?? undefined,
          fromExpenseId: exp.id,
        };
        updated = [newTx, ...updated];
      }
    }

    await saveTransactions(updated);
    await AsyncStorage.setItem(KEYS.MIGRATION_V1, 'done');
  } catch (e) {
    // Migration failed silently — retry next launch
    console.error('[migration] expenses→transactions failed:', e);
  }
}
