import AsyncStorage from '@react-native-async-storage/async-storage';

const TASKS_KEY = '@yoann2_tasks';
const APPTS_KEY = '@yoann2_appointments';

const PRIORITY_COLORS: Record<string, string> = {
  low: '#4CAF50',
  medium: '#FF9800',
  high: '#F44336',
  critical: '#9C27B0',
};

export const MAX_TASKS = 3;

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

export interface WidgetItem {
  title: string;
  color: string;
  deadline: string;
}

export interface WidgetAppt {
  title: string;
  time: string;
}

export interface WidgetData {
  tasks: WidgetItem[];
  todayAppts: WidgetAppt[];
  moreCount: number;
}

interface RawTask {
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

export function buildWidgetData(tasks: RawTask[], appointments: RawAppt[]): WidgetData {
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

  const allItems: WidgetItem[] = pending.map(t => ({
    title: t.title,
    color: PRIORITY_COLORS[t.priority] ?? '#9E9E9E',
    deadline: formatDeadline(t.dueDate),
  }));

  const moreCount = Math.max(0, allItems.length - MAX_TASKS);

  const todayAppts: WidgetAppt[] = (appointments ?? [])
    .filter(a => {
      const d = new Date(a.date);
      return !isNaN(d.getTime()) && sameDay(d, today);
    })
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    .map(a => ({ title: a.title, time: a.time || '' }));

  return {
    tasks: allItems.slice(0, MAX_TASKS),
    todayAppts,
    moreCount,
  };
}

export async function getWidgetDataFromStorage(): Promise<WidgetData> {
  let tasks: RawTask[] = [];
  let appts: RawAppt[] = [];
  try {
    const [t, a] = await AsyncStorage.multiGet([TASKS_KEY, APPTS_KEY]);
    if (t[1]) tasks = JSON.parse(t[1]);
    if (a[1]) appts = JSON.parse(a[1]);
  } catch {}
  return buildWidgetData(tasks, appts);
}
