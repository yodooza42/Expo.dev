import { genId } from '@/utils/ids';

export interface OcrLine {
  id: string;
  selected: boolean;
  date: string;
  name: string;
  amount: string;
  category: string;
  projectId: string;
}

function makeId(): string {
  return genId();
}

// ── Date parsing ────────────────────────────────────────────────────────────

const FR_MONTHS: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
  jan: 1, fév: 2, fev: 2, mar: 3, avr: 4, jui: 6, jul: 7, aoû: 8, sep: 9, oct: 10, nov: 11, déc: 12, dec: 12,
};

// Matches: 12/06/2025  12.06.25  12-06
const DATE_RE_NUM = /\b(\d{1,2}[\/\.\-]\d{1,2}(?:[\/\.\-]\d{2,4})?)\b/;
// Matches: 12 juin  09 juin 2025  2 mars
const DATE_RE_FR = /\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|jan|fév|fev|mar|avr|jui|jul|aoû|sep|oct|nov|déc|dec)(?:\s+(\d{4}))?\b/i;

function parseFrDateNum(raw: string): Date | null {
  const parts = raw.split(/[\/\.\-]/);
  if (parts.length < 2) return null;
  let d = parseInt(parts[0]!, 10);
  let m = parseInt(parts[1]!, 10);
  let y = parts.length >= 3 ? parseInt(parts[2]!, 10) : new Date().getFullYear();
  if (y < 100) y += 2000;
  if (d > 31 || m > 12) { const tmp = d; d = m; m = tmp; }
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

function parseFrDateLiteral(match: RegExpMatchArray): Date | null {
  const d = parseInt(match[1]!, 10);
  const m = FR_MONTHS[match[2]!.toLowerCase()];
  const y = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();
  if (!m) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

function extractDate(line: string): Date | null {
  const frMatch = line.match(DATE_RE_FR);
  if (frMatch) return parseFrDateLiteral(frMatch);
  const numMatch = line.match(DATE_RE_NUM);
  if (numMatch) return parseFrDateNum(numMatch[1]!);
  return null;
}

function toDisplayDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function displayDateToIso(display: string): string {
  const parts = display.split('/');
  if (parts.length !== 3) return new Date().toISOString();
  const [d, m, y] = parts.map(Number);
  const date = new Date(y!, m! - 1, d!);
  return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

// ── Amount parsing ───────────────────────────────────────────────────────────

// Matches: 25€  25,90€  1 250,90€  25.90€  25 €  +1 745,00 €  -12,50€  €25
const EURO_RE = /[-+]?\s*\d{1,3}(?:[\s\u00A0]\d{3})*(?:[,\.]\d{1,2})?\s*€|€\s*[-+]?\s*\d{1,3}(?:[\s\u00A0]\d{3})*(?:[,\.]\d{1,2})?/gi;

function cleanEuroAmount(raw: string): number {
  const s = raw.replace(/€/g, '').replace(/[\s\u00A0]/g, '').replace(',', '.');
  return Math.abs(parseFloat(s));
}

// ── Name cleaning ────────────────────────────────────────────────────────────

const NOISE_WORDS = /^(DEBIT|CREDIT|DÉBIT|CRÉDIT|SOLDE|TOTAL|DATE|LIBELLÉ|LIBELLE|MONTANT|OPÉRATION|OPERATION|RÉFÉRENCE|REFERENCE|DISPONIBLE|ANCIEN|NOUVEAU|RELEVÉ|RELEVE|ROUND|UP|ENVOYÉ|ENVOYE|TERMINÉ|TERMINE)$/i;

function extractName(line: string): string {
  EURO_RE.lastIndex = 0;
  let name = line
    .replace(EURO_RE, '')
    .replace(DATE_RE_FR, '')
    .replace(DATE_RE_NUM, '')
    .replace(/[|;:\t·•]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const words = name.split(' ').filter(w => !NOISE_WORDS.test(w) && w.length > 1);
  return words.join(' ').substring(0, 80).trim();
}

// ── Main parser ──────────────────────────────────────────────────────────────

export function parseBankStatementText(rawText: string): OcrLine[] {
  const results: OcrLine[] = [];

  const rawLines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 1);

  let lastDate: Date | null = null;
  let lastNonAmountName = '';

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;

    EURO_RE.lastIndex = 0;
    const euroMatches = line.match(EURO_RE);

    // Track last seen date (even on lines without amount)
    const lineDate = extractDate(line);
    if (lineDate) lastDate = lineDate;

    if (!euroMatches || euroMatches.length === 0) {
      // No amount — save as potential name context for next line
      const candidate = extractName(line);
      if (candidate.length > 1) lastNonAmountName = candidate;
      continue;
    }

    const rawAmount = cleanEuroAmount(euroMatches[euroMatches.length - 1]!);
    if (isNaN(rawAmount) || rawAmount <= 0 || rawAmount > 999_999) continue;

    // Prefer name from this line; fall back to previous non-amount line
    let name = extractName(line);
    if (name.length < 2 && lastNonAmountName.length > 1) {
      name = lastNonAmountName;
    }
    lastNonAmountName = '';

    const date = lineDate ?? lastDate ?? new Date();

    results.push({
      id: makeId(),
      selected: true,
      date: toDisplayDate(date),
      name: name.length > 0 ? name : '—',
      amount: rawAmount.toFixed(2),
      category: '',
      projectId: '',
    });
  }

  return results;
}
