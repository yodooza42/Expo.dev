import AsyncStorage from '@react-native-async-storage/async-storage';

const TASKS_KEY = '@yoann2_tasks';
const APPTS_KEY = '@yoann2_appointments';
const OFFSET_KEY = '@yoann2_widget_offset';

const PRIORITY_COLORS: Record<string, string> = {
  low: '#4CAF50',
  medium: '#FF9800',
  high: '#F44336',
  critical: '#9C27B0',
};
const APPT_COLOR = '#7C3AED';

export const MAX_ITEMS = 6;

export interface WidgetItem {
  title: string;
  color: string;
  meta: string;
  done: boolean;
  isAppt: boolean;
}

export interface WidgetDayData {
  dayLabel: string;
  dateLabel: string;
  offset: number;
  canPrev: boolean;
  items: WidgetItem[];
  moreCount: number;
  total: number;
}

interface RawTask {
  title: string;
  dueDate: string;
  priority: string;
  status: string;
}

interface RawAppt {
  title: string;
  date: string;
  time: string;
}

export async function getOffset(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(OFFSET_KEY);
    const n = v ? parseInt(v, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function setOffset(o: number): Promise<void> {
  try {
    await AsyncStorage.setItem(OFFSET_KEY, String(o));
  } catch {}
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildWidgetData(
  tasks: RawTask[],
  appointments: RawAppt[],
  offset: number
): WidgetDayData {
  const target = new Date();
  target.setDate(target.getDate() + offset);

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  const dayTasks = (tasks ?? [])
    .filter(t => {
      const d = new Date(t.dueDate);
      return !isNaN(d.getTime()) && sameDay(d, target);
    })
    .sort((a, b) => {
      const doneDiff = (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0);
      if (doneDiff !== 0) return doneDiff;
      return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
    });

  const dayAppts = (appointments ?? [])
    .filter(a => {
      const d = new Date(a.date);
      return !isNaN(d.getTime()) && sameDay(d, target);
    })
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const apptItems: WidgetItem[] = dayAppts.map(a => ({
    title: a.title,
    color: APPT_COLOR,
    meta: a.time || '',
    done: false,
    isAppt: true,
  }));

  const taskItems: WidgetItem[] = dayTasks.map(t => ({
    title: t.title,
    color: PRIORITY_COLORS[t.priority] ?? '#9E9E9E',
    meta: '',
    done: t.status === 'done',
    isAppt: false,
  }));

  const all = [...apptItems, ...taskItems];
  const items = all.slice(0, MAX_ITEMS);
  const moreCount = Math.max(0, all.length - MAX_ITEMS);

  let dayLabel: string;
  if (offset === 0) dayLabel = "Aujourd'hui";
  else if (offset === 1) dayLabel = 'Demain';
  else if (offset === 2) dayLabel = 'Après-demain';
  else dayLabel = cap(target.toLocaleDateString('fr-FR', { weekday: 'long' }));

  const dateLabel = target.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  return {
    dayLabel,
    dateLabel,
    offset,
    canPrev: offset > 0,
    items,
    moreCount,
    total: all.length,
  };
}

export async function getWidgetDataFromStorage(offset: number): Promise<WidgetDayData> {
  let tasks: RawTask[] = [];
  let appts: RawAppt[] = [];
  try {
    const [t, a] = await AsyncStorage.multiGet([TASKS_KEY, APPTS_KEY]);
    if (t[1]) tasks = JSON.parse(t[1]);
    if (a[1]) appts = JSON.parse(a[1]);
  } catch {}
  return buildWidgetData(tasks, appts, offset);
}
