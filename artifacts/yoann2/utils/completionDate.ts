/** Completion dates are local calendar days, stored as DD/MM/YYYY like existing tasks. */
export function formatCompletionDate(date = new Date()): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export function parseCompletionDate(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd), month = Number(mm), year = Number(yyyy);
  if (year < 1900) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function completionDateError(value: string, now = new Date()): string | undefined {
  if (!value.trim()) return undefined; // Unknown legacy date or automatic date on completion.
  const date = parseCompletionDate(value);
  if (!date) return 'Saisis une date valide au format JJ/MM/AAAA.';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date > today) return 'La date de fin ne peut pas être dans le futur.';
  return undefined;
}

export function resolveCompletionDate(
  previous: { status: string; completedAt?: string } | undefined,
  updates: { status?: string; completedAt?: string },
  now = new Date(),
): string | undefined {
  const status = updates.status ?? previous?.status;
  if (status !== 'done') return undefined;
  if (updates.completedAt?.trim() && !completionDateError(updates.completedAt, now)) {
    return updates.completedAt.trim();
  }
  // Ordinary edits must never move a historical completion to today.
  if (previous?.status === 'done') return previous.completedAt;
  return formatCompletionDate(now);
}
