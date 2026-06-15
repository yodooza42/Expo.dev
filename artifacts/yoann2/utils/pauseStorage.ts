import AsyncStorage from '@react-native-async-storage/async-storage';

export type PauseSession = {
  id: string;
  date: string;        // 'YYYY-MM-DD'
  startTs: number;     // Unix ms
  endTs: number;       // Unix ms
  durationSecs: number;
};

export type ActivePause = {
  startTs: number;
} | null;

const KEY_SESSIONS    = '@yoann2_pause_sessions';
const KEY_ACTIVE      = '@yoann2_active_pause';

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function loadSessions(): Promise<PauseSession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SESSIONS);
    return raw ? (JSON.parse(raw) as PauseSession[]) : [];
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

/* ── Statistiques ── */

export type PauseStats = {
  todaySecs: number;
  weekSecs: number;
  dailyAvgSecs: number;          // moyenne sur les 7 derniers jours ayant eu au moins 1 session
  last7: { date: string; secs: number }[];
};

export function computeStats(sessions: PauseSession[], activePause: ActivePause): PauseStats {
  const now = Date.now();
  const today = todayStr();

  const allSessions = activePause
    ? [
        ...sessions,
        {
          id: '__active',
          date: today,
          startTs: activePause.startTs,
          endTs: now,
          durationSecs: Math.floor((now - activePause.startTs) / 1000),
        } satisfies PauseSession,
      ]
    : sessions;

  // Total aujourd'hui
  const todaySecs = allSessions
    .filter(s => s.date === today)
    .reduce((acc, s) => acc + s.durationSecs, 0);

  // Lundi de la semaine courante
  const nowDate = new Date();
  const dayOfWeek = nowDate.getDay(); // 0=dim
  const diffToMon = (dayOfWeek + 6) % 7;
  const weekStart = new Date(nowDate);
  weekStart.setDate(nowDate.getDate() - diffToMon);
  weekStart.setHours(0, 0, 0, 0);

  const weekSecs = allSessions
    .filter(s => s.startTs >= weekStart.getTime())
    .reduce((acc, s) => acc + s.durationSecs, 0);

  // 7 derniers jours
  const last7: { date: string; secs: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(nowDate);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const secs = allSessions
      .filter(s => s.date === dateStr)
      .reduce((acc, s) => acc + s.durationSecs, 0);
    last7.push({ date: dateStr, secs });
  }

  const daysWithData = last7.filter(d => d.secs > 0);
  const dailyAvgSecs = daysWithData.length
    ? Math.round(daysWithData.reduce((a, d) => a + d.secs, 0) / daysWithData.length)
    : 0;

  return { todaySecs, weekSecs, dailyAvgSecs, last7 };
}

export function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  if (m > 0) return `${String(m).padStart(2, '0')}min${String(s).padStart(2, '0')}`;
  return `${s}s`;
}

export function shortDate(dateStr: string): string {
  const parts = dateStr.split('-');
  return `${parts[2]}/${parts[1]}`;
}
