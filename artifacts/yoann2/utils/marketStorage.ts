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
  ticker?: string;       // Ticker Trade Republic (affiché)
  yahooSymbol?: string;  // Symbole Yahoo Finance résolu automatiquement
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
  pricePerShare?: number;  // cours à l'achat/vente (optionnel, permet le calcul P&L)
  qty?: number;            // nb d'actions = amount / pricePerShare (calculé à la sauvegarde)
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

export async function updateMarketAsset(id: string, updates: Partial<Pick<MarketAsset, 'name' | 'ticker' | 'yahooSymbol'>>): Promise<void> {
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
  // Compute qty from amount / pricePerShare if both provided
  const qty = op.pricePerShare && op.pricePerShare > 0
    ? op.amount / op.pricePerShare
    : op.qty;
  const newItem: MarketOperation = { ...op, id: genId(), qty };
  await AsyncStorage.setItem(KEYS.OPS, JSON.stringify([newItem, ...list]));
  return newItem;
}

export async function updateMarketOperation(
  id: string,
  updates: Partial<Omit<MarketOperation, 'id' | 'assetId'>>,
): Promise<void> {
  const list = await getMarketOperations();
  const newList = list.map(op => {
    if (op.id !== id) return op;
    const merged = { ...op, ...updates };
    // Recompute qty if pricePerShare changed
    const qty = merged.pricePerShare && merged.pricePerShare > 0
      ? merged.amount / merged.pricePerShare
      : merged.qty;
    return { ...merged, qty };
  });
  await AsyncStorage.setItem(KEYS.OPS, JSON.stringify(newList));
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

/** Coût de revient total (cash investi - cash récupéré) */
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

/** Nombre d'actions nettes détenues pour un actif (opérations avec qty uniquement) */
export function computeAssetQtyHeld(ops: MarketOperation[], assetId: string): number {
  return ops
    .filter(o => o.assetId === assetId && o.qty !== undefined)
    .reduce((sum, o) => {
      if (o.type === 'buy')  return sum + (o.qty ?? 0);
      if (o.type === 'sell') return sum - (o.qty ?? 0);
      return sum;
    }, 0);
}

export interface AssetPnl {
  costBasis:    number;
  currentValue: number;  // = qty × currentPrice, ou costBasis si pas de prix
  pnl:          number;  // currentValue - costBasis
  pnlPct:       number;  // pnl / costBasis × 100
  hasLivePrice: boolean;
}

/** Calcule la P&L d'un actif à partir des opérations et du cours actuel */
export function computeAssetPnl(
  ops: MarketOperation[],
  assetId: string,
  currentPrice?: number,
): AssetPnl {
  const costBasis = computeAssetBalance(ops, assetId);
  const qty = computeAssetQtyHeld(ops, assetId);
  const hasLivePrice = currentPrice !== undefined && qty > 0;
  const currentValue = hasLivePrice ? qty * currentPrice! : costBasis;
  const pnl = currentValue - costBasis;
  const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  return { costBasis, currentValue, pnl, pnlPct, hasLivePrice };
}

/** Valeur totale du portefeuille (cours actuels pour les actifs cotés, cost basis sinon) */
export function computePortfolioValue(
  ops: MarketOperation[],
  assets: MarketAsset[],
  prices: Record<string, number>,
): { currentValue: number; costBasis: number } {
  let currentValue = 0;
  let costBasis = 0;
  for (const asset of assets) {
    const cb = computeAssetBalance(ops, asset.id);
    costBasis += cb;
    // Priorité : yahooSymbol (résolu auto) > ticker TR
    const priceKey = asset.yahooSymbol ?? asset.ticker;
    const price = priceKey ? prices[priceKey] : undefined;
    const qty = computeAssetQtyHeld(ops, asset.id);
    if (price !== undefined && qty > 0) {
      currentValue += qty * price;
    } else {
      currentValue += cb; // fallback coût de revient
    }
  }
  return { currentValue, costBasis };
}

export async function getMarketBalance(): Promise<number> {
  const ops = await getMarketOperations();
  return computeMarketBalance(ops);
}

// ── Portfolio time series ─────────────────────────────────────────────────────

export interface PortfolioDataPoint {
  date: string;          // ISO yyyy-MM-dd
  costBasis: number;     // cumulative cash invested at this point
  projectedValue: number; // qty held × current price (or costBasis if no live price)
}

/**
 * Builds a time series of portfolio value by replaying operations in
 * chronological order and applying current prices to historical quantities.
 * This is an approximation (not historical prices), but accurately shows
 * how capital was deployed over time at today's valuation.
 */
export function buildPortfolioTimeSeries(
  ops: MarketOperation[],
  assets: MarketAsset[],
  prices: Record<string, number>,
): PortfolioDataPoint[] {
  const sorted = [...ops].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];

  const assetPriceMap = new Map<string, number>();
  for (const asset of assets) {
    const key = asset.yahooSymbol ?? asset.ticker;
    if (key && prices[key] !== undefined) {
      assetPriceMap.set(asset.id, prices[key]);
    }
  }

  const qtyByAsset  = new Map<string, number>();
  const costByAsset = new Map<string, number>();
  let totalCost = 0;
  const points: PortfolioDataPoint[] = [];

  for (const op of sorted) {
    const qty     = op.qty ?? 0;
    const prevQty = qtyByAsset.get(op.assetId) ?? 0;
    const prevCost = costByAsset.get(op.assetId) ?? 0;

    if (op.type === 'buy') {
      qtyByAsset.set(op.assetId, prevQty + qty);
      costByAsset.set(op.assetId, prevCost + op.amount + op.fees);
      totalCost += op.amount + op.fees;
    } else {
      qtyByAsset.set(op.assetId, prevQty - qty);
      const recovered = op.amount - op.fees;
      costByAsset.set(op.assetId, Math.max(0, prevCost - recovered));
      totalCost -= recovered;
    }

    let projectedValue = 0;
    for (const [assetId, heldQty] of qtyByAsset.entries()) {
      const assetCost = costByAsset.get(assetId) ?? 0;
      // Include asset if we have either qty or a positive cost basis.
      // Operations without pricePerShare (e.g. recurring buys) have qty=0 but
      // still represent real invested capital — fall back to cost basis for those.
      if (heldQty <= 0 && assetCost <= 0) continue;
      const price = assetPriceMap.get(assetId);
      if (heldQty > 0 && price !== undefined && price > 0) {
        // Best case: we know qty and have a live price
        projectedValue += heldQty * price;
      } else {
        // Fallback: use cost basis, consistent with computePortfolioValue
        projectedValue += assetCost;
      }
    }

    const date = op.date.slice(0, 10);
    const point: PortfolioDataPoint = { date, costBasis: Math.max(0, totalCost), projectedValue };
    if (points.length > 0 && points[points.length - 1].date === date) {
      points[points.length - 1] = point;
    } else {
      points.push(point);
    }
  }

  // Add today as the final point so the chart reaches the present
  const today = new Date().toISOString().slice(0, 10);
  const last = points[points.length - 1];
  if (last && last.date !== today) {
    points.push({ date: today, costBasis: last.costBasis, projectedValue: last.projectedValue });
  }

  return points;
}
