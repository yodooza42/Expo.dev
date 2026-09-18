/**
 * Generates a unique ID: timestamp + 9-char random suffix.
 * Used everywhere an entity needs a local ID (projects, tasks, trips, …).
 */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}
