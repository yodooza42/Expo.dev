import AsyncStorage from '@react-native-async-storage/async-storage';
import { fmtWeekdayShort } from '@/utils/date';

const SESSIONS_KEY = '@work_sessions_v1';
const REPORTS_KEY  = '@work_reports_v1';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkSession = {
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM  (heure d'embauche réelle)
  endTime: string;    // HH:MM  (heure de débauche réelle)
};

export type WeekSummary = {
  weekStart: string;       // YYYY-MM-DD  (lundi)
  weekEnd: string;         // YYYY-MM-DD  (dimanche)
  totalMinutes: number;
  overtimeMinutes: number; // au-delà de 35h
  nightMinutes: number;    // 22h-06h
  days: string[];          // dates incluses dans la semaine
};

export type MonthlyReport = {
  month: string;           // YYYY-MM
  label: string;           // "Juin 2026"
  totalMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  daysWorked: number;
  weeks: WeekSummary[];
  generatedAt: string;     // ISO
};

// ── Storage ───────────────────────────────────────────────────────────────────

export async function loadWorkSessions(): Promise<Record<string, WorkSession>> {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, WorkSession>) : {};
  } catch {
    return {};
  }
}

export async function saveWorkSession(session: WorkSession): Promise<void> {
  const all = await loadWorkSessions();
  all[session.date] = session;
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
}

export async function deleteWorkSession(date: string): Promise<void> {
  const all = await loadWorkSessions();
  delete all[date];
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
}

export async function loadMonthlyReports(): Promise<MonthlyReport[]> {
  try {
    const raw = await AsyncStorage.getItem(REPORTS_KEY);
    return raw ? (JSON.parse(raw) as MonthlyReport[]) : [];
  } catch {
    return [];
  }
}

export async function saveMonthlyReport(report: MonthlyReport): Promise<void> {
  const all = await loadMonthlyReports();
  const idx = all.findIndex(r => r.month === report.month);
  if (idx >= 0) all[idx] = report;
  else all.unshift(report);
  all.sort((a, b) => b.month.localeCompare(a.month));
  await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(all));
}

// ── Calculs ───────────────────────────────────────────────────────────────────

function toMins(t: string): number {
  const [hStr, mStr] = t.split(':');
  return (parseInt(hStr ?? '0', 10)) * 60 + (parseInt(mStr ?? '0', 10));
}

/** Minutes totales d'une session (gère le passage minuit) */
export function calcSessionMinutes(start: string, end: string): number {
  let s = toMins(start);
  let e = toMins(end);
  if (e <= s) e += 1440; // passage minuit
  return Math.max(0, e - s);
}

/** Minutes de nuit (22h→06h) dans une session */
export function calcNightMinutes(start: string, end: string): number {
  let s = toMins(start);
  let e = toMins(end);
  if (e <= s) e += 1440;

  // Fenêtres nuit sur un espace 0-48h pour couvrir les passages minuit
  const windows: [number, number][] = [
    [0,    360],   // 00:00 – 06:00
    [1320, 1440],  // 22:00 – 24:00
    [1440, 1800],  // (J+1) 00:00 – 06:00
    [2760, 2880],  // (J+1) 22:00 – 24:00
  ];

  return windows.reduce((acc, [ws, we]) => {
    return acc + Math.max(0, Math.min(e, we) - Math.max(s, ws));
  }, 0);
}

/** Date du lundi de la semaine (ISO) */
function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

function getSundayOf(mondayStr: string): string {
  const d = new Date(mondayStr + 'T12:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function monthLabel(month: string): string {
  const [yStr, mStr] = month.split('-');
  const y = parseInt(yStr ?? '2000', 10);
  const m = parseInt(mStr ?? '1', 10);
  const lbl = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return lbl.charAt(0).toUpperCase() + lbl.slice(1);
}

// ── Génération rapport ────────────────────────────────────────────────────────

export function generateMonthlyReport(
  month: string,
  allSessions: Record<string, WorkSession>
): MonthlyReport {
  const monthSessions = Object.values(allSessions).filter(
    s => s.date.startsWith(month) && s.startTime && s.endTime
  );

  // Groupe par semaine (clé = lundi)
  const weekMap = new Map<string, WorkSession[]>();
  for (const s of monthSessions) {
    const monday = getMondayOf(s.date);
    if (!weekMap.has(monday)) weekMap.set(monday, []);
    weekMap.get(monday)!.push(s);
  }

  const weeks: WeekSummary[] = [];
  let totalMinutes    = 0;
  let overtimeMinutes = 0;
  let nightMinutes    = 0;

  for (const [weekStart, sess] of weekMap) {
    const weekTotal = sess.reduce((a, s) => a + calcSessionMinutes(s.startTime, s.endTime), 0);
    const weekNight = sess.reduce((a, s) => a + calcNightMinutes(s.startTime, s.endTime), 0);
    const weekOver  = Math.max(0, weekTotal - 35 * 60);

    weeks.push({
      weekStart,
      weekEnd: getSundayOf(weekStart),
      totalMinutes: weekTotal,
      overtimeMinutes: weekOver,
      nightMinutes: weekNight,
      days: sess.map(s => s.date).sort(),
    });

    totalMinutes    += weekTotal;
    overtimeMinutes += weekOver;
    nightMinutes    += weekNight;
  }

  weeks.sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  return {
    month,
    label: monthLabel(month),
    totalMinutes,
    overtimeMinutes,
    nightMinutes,
    daysWorked: monthSessions.length,
    weeks,
    generatedAt: new Date().toISOString(),
  };
}

// ── Import historique ─────────────────────────────────────────────────────────

const IMPORT_FLAG_PREFIX = '@import_done_';

/** Importe un lot de sessions sans écraser les sessions existantes (merge). */
export async function importSessionsBatch(sessions: WorkSession[]): Promise<void> {
  const all = await loadWorkSessions();
  for (const s of sessions) {
    all[s.date] = s;
  }
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
}

/** Vérifie si un import pour un mois donné a déjà été fait. */
export async function isMonthImported(month: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(IMPORT_FLAG_PREFIX + month);
  return v === '1';
}

/** Marque un mois comme importé. */
export async function markMonthImported(month: string): Promise<void> {
  await AsyncStorage.setItem(IMPORT_FLAG_PREFIX + month, '1');
}

// ── Helpers date ──────────────────────────────────────────────────────────────

/** "2026-06" → "Juin 2026" */
export function formatMonth(month: string): string {
  return monthLabel(month);
}

/** Minutes → "7h30" */
export function formatMinutes(mins: number): string {
  if (mins === 0) return '0h';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** Mois courant "YYYY-MM" */
export function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Mois précédent "YYYY-MM" */
export function getPreviousMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Dernières N dates (aujourd'hui en premier) */
export function getRecentDates(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** "2026-06-16" → "Lun 16 juin" */
export function formatShortDate(dateStr: string): string {
  return fmtWeekdayShort(new Date(dateStr + 'T12:00:00'));
}

/** "2026-06-16" → numéro du jour JS (0=dim) */
export function getDayIndex(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay();
}
