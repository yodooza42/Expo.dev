import type { DaySchedule } from '@/widgets/widgetSettings';
import type { MariePlanning } from '@/utils/marieStorage';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WalkSlot {
  date: string;          // YYYY-MM-DD
  dateLabel: string;     // "ven 18 juil."
  slotStartMins: number; // minutes depuis minuit
  slotEndMins: number;
  durationMins: number;
  weather?: WalkWeather;
}

export interface WalkWeather {
  emoji: string;
  label: string;
  tempC: number;
  rainProb: number;
  score: number; // 3=super, 2=ok, 1=mitigé, 0=mauvais
}

export interface HourlyWeather {
  time: string[];
  weathercode: number[];
  temperature_2m: number[];
  precipitation_probability: number[];
}

// ── Constantes ────────────────────────────────────────────────────────────────

const WINDOW_START = 10 * 60;  // 600  → 10h00
const WINDOW_END   = 24 * 60;  // 1440 → 00h00 (minuit)
const MIN_DURATION = 3 * 60;   // 180  → 3 heures minimum

const DAYS_FR   = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

// Horaires fixes des shifts de Marie (minutes depuis minuit)
const MARIE_SHIFT_TIMES = {
  PB: { start: 7 * 60,         end: 14 * 60 + 40 }, // 07:00 → 14:40
  PD: { start: 12 * 60 + 30,   end: 19 * 60 + 40 }, // 12:30 → 19:40
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minsToStr(m: number): string {
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}h${String(mm).padStart(2, '0')}`;
}

export function durationLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/**
 * Retourne les intervalles "à la maison" dans [wStart, wEnd]
 * en soustrayant l'intervalle de travail [workStart, workEnd].
 */
function homeIntervals(
  workStart: number,
  workEnd: number,
  wStart: number,
  wEnd: number,
): [number, number][] {
  const result: [number, number][] = [];
  if (workStart > wStart) {
    const e = Math.min(workStart, wEnd);
    if (e > wStart) result.push([wStart, e]);
  }
  if (workEnd < wEnd) {
    const s = Math.max(workEnd, wStart);
    if (wEnd > s) result.push([s, wEnd]);
  }
  return result;
}

function yoannHomeInWindow(sched: DaySchedule, windowStart = WINDOW_START): [number, number][] {
  if (sched.off) return [[windowStart, WINDOW_END]];
  const ws = toMins(sched.start);
  let we   = toMins(sched.end);
  if (we <= ws) we += 1440; // passage minuit (ex: 17h→01h)
  const intervals = homeIntervals(ws, we, windowStart, WINDOW_END);
  return intervals;
}

function marieHomeInWindow(shift: 'PB' | 'PD' | undefined): [number, number][] {
  if (!shift) return [[WINDOW_START, WINDOW_END]];
  const { start, end } = MARIE_SHIFT_TIMES[shift];
  return homeIntervals(start, end, WINDOW_START, WINDOW_END);
}

function intersectIntervals(
  a: [number, number][],
  b: [number, number][],
): [number, number][] {
  const result: [number, number][] = [];
  for (const [as_, ae] of a) {
    for (const [bs, be] of b) {
      const s = Math.max(as_, bs);
      const e = Math.min(ae, be);
      if (e > s) result.push([s, e]);
    }
  }
  return result;
}

// ── Calcul des créneaux ───────────────────────────────────────────────────────

export function computeWalkSlots(
  workSchedule: DaySchedule[],
  mariePlanning: MariePlanning,
  days = 7,
): WalkSlot[] {
  const slots: WalkSlot[] = [];
  const now       = new Date();
  const nowMins   = now.getHours() * 60 + now.getMinutes();

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dow     = d.getDay(); // 0=dim
    const sched   = workSchedule[dow];
    if (!sched) continue;

    // Aujourd'hui : ne montrer que ce qui est encore à venir (si après 12h)
    const windowStart = i === 0 && nowMins > WINDOW_START ? nowMins : WINDOW_START;

    const yHome = yoannHomeInWindow(sched, windowStart);
    const mHome = marieHomeInWindow(mariePlanning[dateStr] as 'PB' | 'PD' | undefined);

    const overlaps = intersectIntervals(yHome, mHome);

    for (const [s, e] of overlaps) {
      const dur = e - s;
      if (dur < MIN_DURATION) continue;

      const dayLabel = `${DAYS_FR[dow]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
      slots.push({
        date: dateStr,
        dateLabel: dayLabel,
        slotStartMins: s,
        slotEndMins:   e,
        durationMins:  dur,
      });
    }
  }

  return slots;
}

// ── Enrichissement météo ──────────────────────────────────────────────────────

const WX_MAP: Record<number, { emoji: string; label: string; score: number }> = {
  0:  { emoji: '☀️', label: 'Ensoleillé',           score: 3 },
  1:  { emoji: '🌤', label: 'Peu nuageux',            score: 3 },
  2:  { emoji: '⛅', label: 'Partiellement nuageux',  score: 2 },
  3:  { emoji: '☁️', label: 'Couvert',               score: 2 },
  45: { emoji: '🌫', label: 'Brouillard',             score: 1 },
  48: { emoji: '🌫', label: 'Brouillard givrant',     score: 1 },
  51: { emoji: '🌦', label: 'Bruine légère',          score: 1 },
  53: { emoji: '🌦', label: 'Bruine',                 score: 1 },
  55: { emoji: '🌧', label: 'Bruine dense',           score: 0 },
  61: { emoji: '🌧', label: 'Pluie légère',           score: 1 },
  63: { emoji: '🌧', label: 'Pluie',                  score: 0 },
  65: { emoji: '🌧', label: 'Pluie forte',            score: 0 },
  71: { emoji: '🌨', label: 'Neige légère',           score: 1 },
  73: { emoji: '🌨', label: 'Neige',                  score: 0 },
  75: { emoji: '❄️', label: 'Neige forte',            score: 0 },
  80: { emoji: '🌦', label: 'Averses légères',        score: 1 },
  81: { emoji: '🌦', label: 'Averses',                score: 1 },
  82: { emoji: '🌧', label: 'Averses fortes',         score: 0 },
  95: { emoji: '⛈', label: 'Orage',                  score: 0 },
  96: { emoji: '⛈', label: 'Orage + grêle',          score: 0 },
  99: { emoji: '⛈', label: 'Orage violent',          score: 0 },
};

function resolveWx(code: number) {
  return WX_MAP[code] ?? WX_MAP[Math.round(code / 10) * 10] ?? { emoji: '🌡', label: 'Inconnu', score: 1 };
}

export function enrichSlotsWithWeather(
  slots: WalkSlot[],
  hourly: HourlyWeather,
): WalkSlot[] {
  return slots.map(slot => {
    const startH = Math.floor(slot.slotStartMins / 60);
    const endH   = Math.min(Math.ceil(slot.slotEndMins / 60), 23);
    const prefix = slot.date + 'T';

    const indices: number[] = [];
    for (let h = startH; h <= endH; h++) {
      const ts  = prefix + String(h).padStart(2, '0') + ':00';
      const idx = hourly.time.indexOf(ts);
      if (idx !== -1) indices.push(idx);
    }

    if (indices.length === 0) return slot;

    let worst = { emoji: '☀️', label: 'Ensoleillé', score: 3 };
    let maxTemp = -Infinity;
    let maxRain = 0;

    for (const idx of indices) {
      const wx = resolveWx(hourly.weathercode[idx] ?? 0);
      if (wx.score < worst.score) worst = wx;
      maxTemp = Math.max(maxTemp, hourly.temperature_2m[idx] ?? 0);
      maxRain = Math.max(maxRain, hourly.precipitation_probability[idx] ?? 0);
    }

    return {
      ...slot,
      weather: {
        emoji:    worst.emoji,
        label:    worst.label,
        tempC:    Math.round(maxTemp),
        rainProb: maxRain,
        score:    worst.score,
      },
    };
  });
}
