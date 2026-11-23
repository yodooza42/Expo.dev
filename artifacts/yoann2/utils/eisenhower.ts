export type EisenhowerQuadrant = 'do_now' | 'schedule' | 'delegate' | 'eliminate';

export function eisenhowerFromLevels(urgency: number, importance: number): EisenhowerQuadrant {
  const isUrgent = urgency >= 2;
  const isImportant = importance >= 2;
  if (isUrgent && isImportant) return 'do_now';
  if (!isUrgent && isImportant) return 'schedule';
  if (isUrgent && !isImportant) return 'delegate';
  return 'eliminate';
}

/** Stored ratings are on a five-point scale; levels 1–2 are low, 3–4 medium, and 5 high. */
export function eisenhowerFromScores(urgency: number, importance: number): EisenhowerQuadrant {
  return eisenhowerFromLevels(urgency >= 3 ? 2 : 1, importance >= 3 ? 2 : 1);
}

export function eisenhowerScoreFromLevel(level: number): number {
  return Math.round((level / 3) * 5);
}

export function normalizeTaskEisenhower<T extends {
  urgency: number;
  importance: number;
  eisenhower: EisenhowerQuadrant;
}>(task: T): T {
  const eisenhower = eisenhowerFromScores(task.urgency, task.importance);
  return task.eisenhower === eisenhower ? task : { ...task, eisenhower };
}
