import AsyncStorage from '@react-native-async-storage/async-storage';

import { genId } from '@/utils/ids';

const KEYS = {
  ASSETS:    '@yoann2/market_assets',
  OPS:       '@yoann2/market_operations',
  RECURRING: '@yoann2/market_recurring',
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MarketAsset {
  id: string;
  name: string;
  ticker?: string;
  createdAt: string;
}

export type MarketOpType = 'buy' | 'sell';

export interface MarketOperation {
  id: string;
  assetId: string;
  type: MarketOpType;
  amount: number;
  fees: number;
  date: string;
  note?: string;
  fromRecurringId?: string;
}

export interface MarketRecurring {
  id: string;
  assetId: string;
  amount: number;
  fees: number;
  frequency: 'monthly' | 'weekly';
  nextDate: string;
  note?: string;
  createdAt: string;
}

// ── Assets ────────────────────────────────────────────────────────────────────

export async function getMarketAssets(): Promise<MarketAsset[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.ASSETS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function addMarketAsset(asset: Omit<MarketAsset, 'id' | 'createdAt'>): Promise<MarketAsset> {
  const list = await getMarketAssets();
  const newItem: MarketAsset = { ...asset, id: genId(), createdAt: new Date().toISOString() };
  await AsyncStorage.setItem(KEYS.ASSETS, JSON.stringify([...list, newItem]));
  return newItem;
}

export async function updateMarketAsset(id: string, updates: Partial<Pick<MarketAsset, 'name' | 'ticker'>>): Promise<void> {
  const list = await getMarketAssets();
  await AsyncStorage.setItem(KEYS.ASSETS, JSON.stringify(list.map(a => a.id === id ? { ...a, ...updates } : a)));
}

export async function deleteMarketAsset(id: string): Promise<void> {
  const list = await getMarketAssets();
  await AsyncStorage.setItem(KEYS.ASSETS, JSON.stringify(list.filter(a => a.id !== id)));
  const ops = await getMarketOperations();
  await AsyncStorage.setItem(KEYS.OPS, JSON.stringify(ops.filter(o => o.assetId !== id)));
  const recs = await getMarketRecurrings();
  await AsyncStorage.setItem(KEYS.RECURRING, JSON.stringify(recs.filter(r => r.assetId !== id)));
}

// ── Operations ────────────────────────────────────────────────────────────────

export async function getMarketOperations(): Promise<MarketOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.OPS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function addMarketOperation(op: Omit<MarketOperation, 'id'>): Promise<MarketOperation> {
  const list = await getMarketOperations();
  const newItem: MarketOperation = { ...op, id: genId() };
  await AsyncStorage.setItem(KEYS.OPS, JSON.stringify([newItem, ...list]));
  return newItem;
}

export async function deleteMarketOperation(id: string): Promise<void> {
  const list = await getMarketOperations();
  await AsyncStorage.setItem(KEYS.OPS, JSON.stringify(list.filter(o => o.id !== id)));
}

// ── Recurring ─────────────────────────────────────────────────────────────────

export async function getMarketRecurrings(): Promise<MarketRecurring[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.RECURRING);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function addMarketRecurring(rec: Omit<MarketRecurring, 'id' | 'createdAt'>): Promise<MarketRecurring> {
  const list = await getMarketRecurrings();
  const newItem: MarketRecurring = { ...rec, id: genId(), createdAt: new Date().toISOString() };
  await AsyncStorage.setItem(KEYS.RECURRING, JSON.stringify([...list, newItem]));
  return newItem;
}

export async function deleteMarketRecurring(id: string): Promise<void> {
  const list = await getMarketRecurrings();
  await AsyncStorage.setItem(KEYS.RECURRING, JSON.stringify(list.filter(r => r.id !== id)));
}

export async function processMarketRecurrings(): Promise<void> {
  const recs = await getMarketRecurrings();
  const now = new Date();
  const updated: MarketRecurring[] = [];
  const newOps: MarketOperation[] = [];

  for (const rec of recs) {
    const due = new Date(rec.nextDate);
    if (due <= now) {
      newOps.push({
        id: genId(),
        assetId: rec.assetId,
        type: 'buy',
        amount: rec.amount,
        fees: rec.fees,
        date: due.toISOString().slice(0, 10),
        note: rec.note ?? 'Achat récurrent',
        fromRecurringId: rec.id,
      });
      const next = new Date(due);
      if (rec.frequency === 'monthly') next.setMonth(next.getMonth() + 1);
      else next.setDate(next.getDate() + 7);
      updated.push({ ...rec, nextDate: next.toISOString() });
    } else {
      updated.push(rec);
    }
  }

  if (newOps.length > 0) {
    const existing = await getMarketOperations();
    await AsyncStorage.setItem(KEYS.OPS, JSON.stringify([...newOps, ...existing]));
    await AsyncStorage.setItem(KEYS.RECURRING, JSON.stringify(updated));
  }
}

// ── Balance helpers ───────────────────────────────────────────────────────────

export function computeMarketBalance(ops: MarketOperation[]): number {
  return ops.reduce((sum, op) => {
    if (op.type === 'buy')  return sum + op.amount + op.fees;
    if (op.type === 'sell') return sum - (op.amount - op.fees);
    return sum;
  }, 0);
}

export function computeAssetBalance(ops: MarketOperation[], assetId: string): number {
  return computeMarketBalance(ops.filter(o => o.assetId === assetId));
}

export async function getMarketBalance(): Promise<number> {
  const ops = await getMarketOperations();
  return computeMarketBalance(ops);
}
