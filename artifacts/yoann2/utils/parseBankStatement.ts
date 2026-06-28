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
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function parseFrDate(raw: string): string {
  const parts = raw.split(/[\/\.\-]/);
  if (parts.length < 2) return new Date().toISOString();
  let d = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10);
  let y = parts.length >= 3 ? parseInt(parts[2], 10) : new Date().getFullYear();
  if (y < 100) y += 2000;
  if (d > 31 || m > 12) { const tmp = d; d = m; m = tmp; }
  const dateObj = new Date(y, m - 1, d);
  return isNaN(dateObj.getTime()) ? new Date().toISOString() : dateObj.toISOString();
}

function toDisplayDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function displayDateToIso(display: string): string {
  const parts = display.split('/');
  if (parts.length !== 3) return new Date().toISOString();
  const [d, m, y] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

const DATE_RE = /\b(\d{1,2}[\/\.\-]\d{1,2}(?:[\/\.\-]\d{2,4})?)\b/;

// Matches: 25€  25,90€  1 250,90€  25.90€  25 €  25,90 €  €25  €25,90  -12,50€
const EURO_RE = /[-+]?\s*\d{1,3}(?:[\s\u00A0]\d{3})*(?:[,\.]\d{1,2})?\s*€|€\s*[-+]?\s*\d{1,3}(?:[\s\u00A0]\d{3})*(?:[,\.]\d{1,2})?/gi;

function cleanEuroAmount(raw: string): number {
  const s = raw
    .replace(/€/g, '')
    .replace(/[\s\u00A0]/g, '')
    .replace(',', '.');
  return Math.abs(parseFloat(s));
}

const NOISE_WORDS = /^(DEBIT|CREDIT|DÉBIT|CRÉDIT|SOLDE|TOTAL|DATE|LIBELLÉ|LIBELLE|MONTANT|OPÉRATION|OPERATION|RÉFÉRENCE|REFERENCE|DISPONIBLE|ANCIEN|NOUVEAU|RELEVÉ|RELEVE)$/i;

function extractName(line: string): string {
  let name = line
    .replace(EURO_RE, '')
    .replace(DATE_RE, '')
    .replace(/[|;:\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const words = name.split(' ').filter(w => !NOISE_WORDS.test(w) && w.length > 1);
  return words.join(' ').substring(0, 80);
}

export function parseBankStatementText(rawText: string): OcrLine[] {
  const results: OcrLine[] = [];

  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 1);

  for (const line of lines) {
    EURO_RE.lastIndex = 0;
    const euroMatches = line.match(EURO_RE);
    if (!euroMatches || euroMatches.length === 0) continue;

    const rawAmount = cleanEuroAmount(euroMatches[euroMatches.length - 1]!);
    if (isNaN(rawAmount) || rawAmount <= 0 || rawAmount > 999_999) continue;

    const name = extractName(line);
    if (name.length < 1 && !DATE_RE.test(line)) continue;

    const dateMatch = line.match(DATE_RE);
    const iso = dateMatch ? parseFrDate(dateMatch[1]!) : new Date().toISOString();

    results.push({
      id: makeId(),
      selected: true,
      date: toDisplayDate(iso),
      name: name.length > 0 ? name : '—',
      amount: rawAmount.toFixed(2),
      category: '',
      projectId: '',
    });
  }

  return results;
}
