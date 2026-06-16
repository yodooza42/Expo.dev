import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DaySchedule } from '@/widgets/widgetSettings';

export type PauseSession = {
  id: string;
  shiftDate: string;    // 'YYYY-MM-DD' du jour de début du shift (pas forcément le jour calendaire)
  startTs: number;      // Unix ms
  endTs: number;        // Unix ms
  durationSecs: number;
};

export type ActivePause = {
  startTs: number;
} | null;

export type ShiftClockouts = Record<string, string>; // shiftDate -> 'HH:MM' heure réelle de fin

const KEY_SESSIONS = '@yoann2_pause_sessions';
const KEY_ACTIVE   = '@yoann2_active_pause';
const KEY_CLOCKOUT = '@yoann2_shift_clockouts';

// ── Helpers date ──────────────────────────────────────────────────────────────

export function mkDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string {
  return mkDateStr(new Date());
}

/**
 * Retourne le 'YYYY-MM-DD' du shift qui "contient" l'horodatage ts.
 *
 * Logique : si le shift du JOUR PRÉCÉDENT s'étend après minuit (ex. 15:00→01:00)
 * et que l'heure actuelle est avant la fin de ce shift, le ts appartient au
 * shift de la veille.
 */
export function getShiftDate(ts: number, workSchedule?: DaySchedule[]): string {
  if (!workSchedule?.length) return mkDateStr(new Date(ts));
  const d = new Date(ts);
  const currentMins = d.getHours() * 60 + d.getMinutes();

  const prevDayIdx = (d.getDay() + 6) % 7;
  const prevSched = workSchedule[prevDayIdx];
  if (prevSched && !prevSched.off) {
    const [endH, endM]     = prevSched.end.split(':').map(Number);
    const [startH, startM] = prevSched.start.split(':').map(Number);
    const endMins   = endH * 60 + endM;
    const startMins = startH * 60 + startM;
    // Le shift de la veille passe minuit et on est encore avant sa fin
    if (endMins < startMins && currentMins < endMins) {
      const prev = new Date(d);
      prev.setDate(prev.getDate() - 1);
      return mkDateStr(prev);
    }
  }
  return mkDateStr(d);
}

export function currentShiftDate(workSchedule?: DaySchedule[]): string {
  return getShiftDate(Date.now(), workSchedule);
}

// ── Fenêtre de shift ──────────────────────────────────────────────────────────

export type ShiftWindow = {
  startTs: number;
  endTs: number;
  startLabel: string; // 'HH:MM'
  endLabel: string;   // 'HH:MM'
  durationSecs: number;
};

/**
 * Retourne la fenêtre [startTs, endTs] d'un shift.
 * Si clockoutOverride est fourni, il remplace l'heure de fin planifiée.
 */
export function getShiftWindow(
  shiftDate: string,
  workSchedule: DaySchedule[],
  clockoutOverride?: string,
): ShiftWindow | null {
  const d = new Date(shiftDate + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const dayIdx = d.getDay();
  const sched = workSchedule[dayIdx];
  if (!sched || sched.off) return null;

  const [sh, sm] = sched.start.split(':').map(Number);
  const startDate = new Date(d);
  startDate.setHours(sh, sm, 0, 0);

  const endLabel = clockoutOverride ?? sched.end;
  const [eh, em] = endLabel.split(':').map(Number);
  const endDate = new Date(d);
  endDate.setHours(eh, em, 0, 0);
  if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);

  return {
    startTs: startDate.getTime(),
    endTs: endDate.getTime(),
    startLabel: sched.start,
    endLabel,
    durationSecs: (endDate.getTime() - startDate.getTime()) / 1000,
  };
}

// ── AsyncStorage ──────────────────────────────────────────────────────────────

export async function loadSessions(): Promise<PauseSession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SESSIONS);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Array<Record<string, unknown>>;
    return arr.map(s => ({
      id:           String(s.id ?? ''),
      shiftDate:    String(s.shiftDate ?? (s as Record<string, unknown>).date ?? todayStr()),
      startTs:      Number(s.startTs ?? 0),
      endTs:        Number(s.endTs ?? 0),
      durationSecs: Number(s.durationSecs ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function saveSessions(sessions: PauseSession[]): Promise<void> {
  await AsyncStorage.setItem(KEY_SESSIONS, JSON.stringify(sessions));
}

export async function loadActivePause(): Promise<ActivePause> {
  try {
    const raw = await AsyncStorage.getItem(KEY_ACTIVE);
    return raw ? (JSON.parse(raw) as ActivePause) : null;
  } catch {
    return null;
  }
}

export async function saveActivePause(ap: ActivePause): Promise<void> {
  if (ap === null) {
    await AsyncStorage.removeItem(KEY_ACTIVE);
  } else {
    await AsyncStorage.setItem(KEY_ACTIVE, JSON.stringify(ap));
  }
}

export async function loadClockouts(): Promise<ShiftClockouts> {
  try {
    const raw = await AsyncStorage.getItem(KEY_CLOCKOUT);
    return raw ? (JSON.parse(raw) as ShiftClockouts) : {};
  } catch {
    return {};
  }
}

export async function saveClockout(shiftDate: string, time: string | null): Promise<void> {
  const current = await loadClockouts();
  if (time === null) {
    delete current[shiftDate];
  } else {
    current[shiftDate] = time;
  }
  await AsyncStorage.setItem(KEY_CLOCKOUT, JSON.stringify(current));
}

// ── Formatage ─────────────────────────────────────────────────────────────────

export function formatDuration(secs: number): string {
  if (secs <= 0) return '0s';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  if (m > 0) return `${m}min${String(s).padStart(2, '0')}`;
  return `${s}s`;
}

export function formatHHMM(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}

const DAYS_FR   = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

export function longShiftDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}

export function shortDate(dateStr: string): string {
  const parts = dateStr.split('-');
  return `${parts[2]}/${parts[1]}`;
}

// ── Stats (widget-compat) ─────────────────────────────────────────────────────

export type PauseStats = {
  todaySecs: number;
  weekSecs: number;
  dailyAvgSecs: number;
  last7: { date: string; secs: number }[];
};

export function computeStats(
  sessions: PauseSession[],
  activePause: ActivePause,
  workSchedule?: DaySchedule[],
): PauseStats {
  const now = Date.now();
  const today = currentShiftDate(workSchedule);

  const activeSec = activePause ? Math.floor((now - activePause.startTs) / 1000) : 0;
  const allForStats = activePause
    ? [...sessions, {
        id: '__active', shiftDate: today,
        startTs: activePause.startTs, endTs: now, durationSecs: activeSec,
      }]
    : sessions;

  const todaySecs = allForStats
    .filter(s => s.shiftDate === today)
    .reduce((a, s) => a + s.durationSecs, 0);

  const nowDate   = new Date();
  const diffToMon = (nowDate.getDay() + 6) % 7;
  const weekStart = new Date(nowDate);
  weekStart.setDate(nowDate.getDate() - diffToMon);
  weekStart.setHours(0, 0, 0, 0);

  const weekSecs = allForStats
    .filter(s => new Date(s.shiftDate + 'T00:00:00') >= weekStart)
    .reduce((a, s) => a + s.durationSecs, 0);

  const last7: { date: string; secs: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(nowDate);
    d.setDate(d.getDate() - i);
    const ds = mkDateStr(d);
    const secs = allForStats.filter(s => s.shiftDate === ds).reduce((a, s) => a + s.durationSecs, 0);
    last7.push({ date: ds, secs });
  }

  const daysWithData  = last7.filter(d => d.secs > 0);
  const dailyAvgSecs  = daysWithData.length
    ? Math.round(daysWithData.reduce((a, d) => a + d.secs, 0) / daysWithData.length)
    : 0;

  return { todaySecs, weekSecs, dailyAvgSecs, last7 };
}
