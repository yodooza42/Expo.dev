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

const AMOUNT_RE_GLOBAL = /[-+]?\s*\d{1,3}(?:[\s\u00A0]\d{3})*(?:[,\.]\d{1,2})?(?=\s|$)/g;

function cleanAmountStr(raw: string): number {
  const s = raw.replace(/[\s\u00A0]/g, '').replace(',', '.');
  return Math.abs(parseFloat(s));
}

const NOISE_WORDS = /^(DEBIT|CREDIT|DÉBIT|CRÉDIT|SOLDE|TOTAL|DATE|LIBELLÉ|LIBELLE|MONTANT|OPÉRATION|OPERATION|RÉFÉRENCE|REFERENCE|DISPONIBLE|ANCIEN|NOUVEAU|RELEVÉ|RELEVE)$/i;

export function parseBankStatementText(rawText: string): OcrLine[] {
  const results: OcrLine[] = [];
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 3);

  for (const line of lines) {
    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;

    const amounts = line.match(AMOUNT_RE_GLOBAL);
    if (!amounts || amounts.length === 0) continue;

    const rawAmount = cleanAmountStr(amounts[amounts.length - 1]!);
    if (isNaN(rawAmount) || rawAmount <= 0 || rawAmount > 999_999) continue;

    let name = line
      .replace(DATE_RE, '')
      .replace(AMOUNT_RE_GLOBAL, '')
      .replace(/[|;:\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const words = name.split(' ').filter(w => !NOISE_WORDS.test(w) && w.length > 1);
    name = words.join(' ').substring(0, 80);
    if (name.length < 2) continue;

    const iso = parseFrDate(dateMatch[1]!);

    results.push({
      id: makeId(),
      selected: true,
      date: toDisplayDate(iso),
      name,
      amount: rawAmount.toFixed(2),
      category: '',
      projectId: '',
    });
  }

  if (results.length === 0) {
    const amountOnlyLines = lines.filter(l => AMOUNT_RE_GLOBAL.test(l));
    AMOUNT_RE_GLOBAL.lastIndex = 0;
    for (const line of amountOnlyLines) {
      const amounts = line.match(AMOUNT_RE_GLOBAL);
      if (!amounts) continue;
      const rawAmount = cleanAmountStr(amounts[amounts.length - 1]!);
      if (isNaN(rawAmount) || rawAmount <= 0) continue;
      const name = line.replace(AMOUNT_RE_GLOBAL, '').replace(/\s{2,}/g, ' ').trim().substring(0, 80);
      if (name.length < 2) continue;
      results.push({
        id: makeId(),
        selected: true,
        date: toDisplayDate(new Date().toISOString()),
        name,
        amount: rawAmount.toFixed(2),
        category: '',
        projectId: '',
      });
    }
  }

  return results;
}
