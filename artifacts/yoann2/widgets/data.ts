import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_WIDGET_SETTINGS, formatScheduleLabel, type WidgetSettings } from './widgetSettings';

const TASKS_KEY = '@yoann2_tasks';
const APPTS_KEY = '@yoann2_appointments';
const SETTINGS_KEY = '@yoann2_widget_settings';
const CONFIRM_KEY = '@yoann2_widget_confirm_id';

const PRIORITY_COLORS: Record<string, string> = {
  low: '#4CAF50',
  medium: '#FF9800',
  high: '#F44336',
  critical: '#9C27B0',
};

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
const DAYS_FR = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

export interface WidgetItem {
  id: string;
  title: string;
  color: string;
  deadline: string;
}

export interface WidgetAppt {
  title: string;
  time: string;
}

export interface WidgetNextEvent {
  title: string;
  when: string;
  color: string;
}

export interface WidgetData {
  tasks: WidgetItem[];
  todayAppts: WidgetAppt[];
  nextApptLabel: string;
  nextEvent: WidgetNextEvent | null;
  todayWork: string;
  confirmTask: WidgetItem | null;
  settings: WidgetSettings;
  todayLabel: string;
}

interface RawTask {
  id?: string;
  title: string;
  dueDate?: string;
  priority: string;
  status: string;
}

interface RawAppt {
  title: string;
  date: string;
  time?: string;
}

function formatDeadline(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const suffix = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]}${suffix}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatNextAppt(appt: RawAppt): string {
  const d = new Date(appt.date);
  const yr = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  const ts = appt.time ? ` ${appt.time}` : '';
  return `prochain RDV : ${d.getDate()} ${MONTHS_FR[d.getMonth()]}${yr}${ts} — ${appt.title}`;
}

export function buildWidgetData(
  tasks: RawTask[],
  appointments: RawAppt[],
  settings: WidgetSettings = DEFAULT_WIDGET_SETTINGS,
  confirmId: string | null = null
): WidgetData {
  const today = new Date();

  const pending = (tasks ?? []).filter(t => t.status !== 'done');
  pending.sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate) : null;
    const db = b.dueDate ? new Date(b.dueDate) : null;
    if (da && db) {
      const diff = da.getTime() - db.getTime();
      if (diff !== 0) return diff;
    } else if (da && !db) return -1;
    else if (!da && db) return 1;
    return (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
  });

  const taskItems: WidgetItem[] = pending.map(t => ({
    id: t.id ?? '',
    title: t.title,
    color: PRIORITY_COLORS[t.priority] ?? '#9E9E9E',
    deadline: formatDeadline(t.dueDate),
  }));

  const todayAppts: WidgetAppt[] = (appointments ?? [])
    .filter(a => {
      const d = new Date(a.date);
      return !isNaN(d.getTime()) && sameDay(d, today);
    })
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    .map(a => ({ title: a.title, time: a.time || '' }));

  let nextApptLabel = 'aucun rendez-vous prévu';
  if (todayAppts.length === 0) {
    const future = (appointments ?? [])
      .filter(a => {
        const d = new Date(a.date);
        return !isNaN(d.getTime()) && !sameDay(d, today) && d > today;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (future.length > 0) {
      nextApptLabel = formatNextAppt(future[0]);
    }
  }

  const confirmTask = confirmId ? (taskItems.find(t => t.id === confirmId) ?? null) : null;

  const todayLabel = `${DAYS_FR[today.getDay()]}. ${today.getDate()} ${MONTHS_FR[today.getMonth()]}`;

  // Horaires de travail du jour
  const todaySched = settings.workSchedule?.[today.getDay()];
  const todayWork = todaySched ? formatScheduleLabel(todaySched) : 'Repos';

  // Prochain événement : tâches (avec échéance) + RDV, du plus proche
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  type Candidate = { date: Date; title: string; color: string; time?: string };
  const candidates: Candidate[] = [];

  for (const t of pending) {
    if (!t.dueDate) continue;
    const d = new Date(t.dueDate);
    if (isNaN(d.getTime()) || d < startToday) continue;
    candidates.push({ date: d, title: t.title, color: PRIORITY_COLORS[t.priority] ?? '#9E9E9E' });
  }
  for (const a of appointments ?? []) {
    const d = new Date(a.date);
    if (isNaN(d.getTime())) continue;
    if (a.time) {
      const [hh, mm] = a.time.split(':').map(Number);
      if (!isNaN(hh)) d.setHours(hh, mm || 0, 0, 0);
    }
    if (d < startToday) continue;
    candidates.push({ date: d, title: a.title, color: settings.primaryColor, time: a.time });
  }
  candidates.sort((a, b) => a.date.getTime() - b.date.getTime());

  let nextEvent: WidgetNextEvent | null = null;
  if (candidates.length > 0) {
    const c = candidates[0];
    const isToday = sameDay(c.date, today);
    const datePart = isToday
      ? "Aujourd'hui"
      : `${DAYS_FR[c.date.getDay()]}. ${c.date.getDate()} ${MONTHS_FR[c.date.getMonth()]}`;
    const timePart = c.time ? ` · ${c.time.replace(':', 'h')}` : '';
    nextEvent = { title: c.title, when: `${datePart}${timePart}`, color: c.color };
  }

  return {
    tasks: taskItems,
    todayAppts,
    nextApptLabel,
    nextEvent,
    todayWork,
    confirmTask,
    settings,
    todayLabel,
  };
}

export async function getWidgetDataFromStorage(): Promise<WidgetData> {
  let tasks: RawTask[] = [];
  let appts: RawAppt[] = [];
  let settings = DEFAULT_WIDGET_SETTINGS;
  let confirmId: string | null = null;
  try {
    const [t, a, s, c] = await AsyncStorage.multiGet([TASKS_KEY, APPTS_KEY, SETTINGS_KEY, CONFIRM_KEY]);
    if (t[1]) tasks = JSON.parse(t[1]);
    if (a[1]) appts = JSON.parse(a[1]);
    if (s[1]) settings = { ...DEFAULT_WIDGET_SETTINGS, ...JSON.parse(s[1]) };
    if (c[1]) confirmId = c[1];
  } catch {}
  return buildWidgetData(tasks, appts, settings, confirmId);
}

export async function setConfirmId(id: string | null): Promise<void> {
  try {
    if (id === null) {
      await AsyncStorage.removeItem(CONFIRM_KEY);
    } else {
      await AsyncStorage.setItem(CONFIRM_KEY, id);
    }
  } catch {}
}

export async function markTaskDone(taskId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(TASKS_KEY);
    if (!raw) return;
    const tasks: Array<RawTask & { id?: string }> = JSON.parse(raw);
    const updated = tasks.map(t => (t.id === taskId ? { ...t, status: 'done' } : t));
    await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(updated));
  } catch {}
}
