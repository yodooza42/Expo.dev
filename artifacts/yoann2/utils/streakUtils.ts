import type { Task } from '@/types';

export interface StreakResult {
  current: number;
  record: number;
  recurrence: 'daily' | 'weekly' | 'monthly';
}

function parseFrDate(s: string): Date | null {
  const parts = s.split('/');
  if (parts.length !== 3) return null;
  const d = Number(parts[0]), m = Number(parts[1]), y = Number(parts[2]);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function isConsecutive(date: Date, prev: Date, rec: 'daily' | 'weekly' | 'monthly'): boolean {
  if (rec === 'daily') {
    const diff = (date.getTime() - prev.getTime()) / 86_400_000;
    return diff >= 0.5 && diff <= 1.6;
  }
  if (rec === 'weekly') {
    const diff = (date.getTime() - prev.getTime()) / (7 * 86_400_000);
    return diff >= 0.5 && diff <= 1.6;
  }
  // monthly
  const mDiff =
    (date.getFullYear() - prev.getFullYear()) * 12 + (date.getMonth() - prev.getMonth());
  return mDiff === 1;
}

/**
 * Calcule la série en cours + le record pour une tâche récurrente.
 * Passer la tâche + la liste complète de toutes les tâches.
 */
export function computeStreak(task: Task, allTasks: Task[]): StreakResult | null {
  const recurrence =
    task.recurrence ??
    (task.recurrenceFromId
      ? (allTasks.find(t => t.id === task.recurrenceFromId)?.recurrence ?? null)
      : null);
  if (!recurrence) return null;

  const rootId = task.recurrenceFromId ?? task.id;
  const chain = allTasks.filter(t => t.id === rootId || t.recurrenceFromId === rootId);

  const dates = chain
    .filter(t => t.status === 'done' && !!t.completedAt)
    .map(t => parseFrDate(t.completedAt!))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) return { current: 0, record: 0, recurrence };

  let current = 1;
  let record = 1;
  for (let i = 1; i < dates.length; i++) {
    if (isConsecutive(dates[i]!, dates[i - 1]!, recurrence)) {
      current++;
      if (current > record) record = current;
    } else {
      current = 1;
    }
  }

  return { current, record, recurrence };
}

export function recurrenceLabel(rec: 'daily' | 'weekly' | 'monthly'): string {
  return rec === 'daily' ? 'jour' : rec === 'weekly' ? 'semaine' : 'mois';
}
