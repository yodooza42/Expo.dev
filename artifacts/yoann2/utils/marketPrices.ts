// Yahoo Finance unofficial API — pas d'auth requise, fonctionne en React Native (pas de CORS)
// Couvre tous les marchés : ENGI.PA (Euronext Paris), AAPL (NASDAQ), etc.
// Fallback : cost basis affiché si l'appel échoue.

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const HEADERS = { 'User-Agent': 'Mozilla/5.0' };

export interface LivePrice {
  price: number;
  currency: string;
  change1d?: number;  // % variation sur 1 jour
}

export async function fetchLivePrice(ticker: string): Promise<LivePrice | null> {
  try {
    const url = `${BASE}${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const prev = meta.chartPreviousClose ?? meta.previousClose;
    const change1d = prev && prev > 0
      ? ((meta.regularMarketPrice - prev) / prev) * 100
      : undefined;
    return {
      price:    meta.regularMarketPrice,
      currency: meta.currency ?? 'EUR',
      change1d,
    };
  } catch {
    return null;
  }
}

export async function fetchLivePrices(
  tickers: string[],
): Promise<Record<string, LivePrice>> {
  if (tickers.length === 0) return {};
  // Appels en parallèle pour chaque ticker
  const results = await Promise.all(
    tickers.map(async t => ({ ticker: t, data: await fetchLivePrice(t) })),
  );
  const out: Record<string, LivePrice> = {};
  for (const r of results) {
    if (r.data) out[r.ticker] = r.data;
  }
  return out;
}
