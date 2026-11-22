export function formatJournalPhotoDateTime(takenAt?: number): string | undefined {
  if (typeof takenAt !== 'number' || !Number.isFinite(takenAt) || takenAt <= 0) return undefined;
  const date = new Date(takenAt);
  if (!Number.isFinite(date.getTime())) return undefined;

  const day = date.getDate();
  const month = date.toLocaleDateString('fr-FR', { month: 'long' });
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} - ${hours}h${minutes}`;
}
