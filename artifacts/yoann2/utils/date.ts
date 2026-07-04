/**
 * French locale date/time helpers.
 * All functions accept Date, timestamp (number), or ISO string.
 *
 * For YYYY-MM-DD strings, pass `new Date(str + 'T12:00:00')` to avoid
 * timezone-related off-by-one day issues.
 */

function toDate(d: Date | number | string): Date {
  if (d instanceof Date) return d;
  return new Date(d);
}

/** "14:30" */
export function fmtHHMM(d: Date | number | string): string {
  return toDate(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** "15/01/2025" */
export function fmtDateSlash(d: Date | number | string): string {
  return toDate(d).toLocaleDateString('fr-FR');
}

/** "15 jan. 2025" */
export function fmtDateShort(d: Date | number | string): string {
  return toDate(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "15 janvier 2025" */
export function fmtDateLong(d: Date | number | string): string {
  return toDate(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "lundi 15 janvier 2025" */
export function fmtDateFull(d: Date | number | string): string {
  return toDate(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** "lundi 15 janvier" (sans année — labels de journée dans map/trips) */
export function fmtDayLong(d: Date | number | string): string {
  return toDate(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "15 jan." */
export function fmtDayShort(d: Date | number | string): string {
  return toDate(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** "janvier 2025" */
export function fmtMonthYear(d: Date | number | string): string {
  return toDate(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

/** "jan." */
export function fmtMonthShort(d: Date | number | string): string {
  return toDate(d).toLocaleDateString('fr-FR', { month: 'short' });
}

/** "lun. 15 jan." */
export function fmtWeekdayShort(d: Date | number | string): string {
  return toDate(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
