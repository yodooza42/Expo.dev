import type { Project, Task } from '@/types';
import type { JournalChoices, JournalEntry, JournalGenerationRequest } from '@/types/projectJournal';
import { parseCompletionDate } from '@/utils/completionDate';

export const JOURNAL_LIMITS = { entries: 80, photos: 60, seconds: 600, encodedBytes: 24 * 1024 * 1024 };
export function journalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseJournalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-');
  return parseCompletionDate(`${day}/${month}/${year}`);
}
export function journalPhotoId(entryId: string, uri: string): string {
  let hash = 2166136261;
  for (let i = 0; i < uri.length; i++) hash = Math.imul(hash ^ uri.charCodeAt(i), 16777619);
  return `${entryId}:${(hash >>> 0).toString(36)}`;
}
export const journalPace = (pace: JournalChoices['pace']) => pace === 'calm' ? 6 : pace === 'quick' ? 3 : 4.5;
export function journalDuration(entries: JournalEntry[], secondsPerPhoto: number): number {
  return 8 + entries.reduce((sum, entry) => sum
    + Math.max(entry.photos.length ? 3 : 4, Math.min(16, 2 + Math.ceil((entry.title.length + entry.caption.length) / 24)))
    + entry.photos.reduce((seconds, photo) => seconds + Math.max(secondsPerPhoto, Math.min(16, 2 + Math.ceil(photo.caption.length / 24))), 0), 0);
}
export function initialJournalChoices(projects: Project[], projectId?: string): JournalChoices {
  const now = new Date();
  return {
    title: 'Carnet de bord', from: journalDateKey(new Date(now.getFullYear(), 0, 1)), to: journalDateKey(now),
    projectIds: projectId ? [projectId] : projects.filter(p => !p.archived).map(p => p.id),
    excludedEntryIds: [], excludedPhotoIds: [], captions: {}, photoCaptions: {}, pace: 'normal',
  };
}
/** Discard malformed saved choices, never silently substitute an invalid range. */
export function validateJournalChoices(value: unknown): value is JournalChoices {
  if (!value || typeof value !== 'object') return false;
  const v = value as JournalChoices;
  return typeof v.title === 'string' && v.title.length <= 80
    && !!parseJournalDate(v.from) && !!parseJournalDate(v.to) && v.from <= v.to
    && ['projectIds', 'excludedEntryIds', 'excludedPhotoIds'].every(key =>
      Array.isArray(v[key as keyof JournalChoices]) && (v[key as keyof JournalChoices] as unknown[]).every(x => typeof x === 'string'))
    && [v.captions, v.photoCaptions].every(record => !!record && typeof record === 'object' && !Array.isArray(record)
      && Object.values(record).every(text => typeof text === 'string' && text.length <= 280))
    && ['calm', 'normal', 'quick'].includes(v.pace);
}
export function buildProjectJournal(projects: Project[], tasks: Task[], choices: JournalChoices) {
  const selectedProjects = projects.filter(p => choices.projectIds.includes(p.id));
  const projectById = new Map(selectedProjects.map(p => [p.id, p]));
  const candidates: JournalEntry[] = [];
  const undated: Array<{ id: string; kind: 'task' | 'project'; title: string; photoCount: number }> = [];
  function add(item: Task | Project, kind: 'task' | 'project', project: Project) {
    if (item.status !== 'done') return;
    const title = 'title' in item ? item.title : item.name;
    const date = item.completedAt ? parseCompletionDate(item.completedAt) : null;
    if (!date) { undated.push({ id: item.id, kind, title, photoCount: item.photos.length }); return; }
    const dateKey = journalDateKey(date);
    if (dateKey < choices.from || dateKey > choices.to) return;
    const id = `${kind}:${item.id}`;
    const defaultCaption = ('notes' in item ? item.notes?.trim() : '') || item.description || '';
    candidates.push({
      id, sourceId: item.id, kind, title, project: project.name, dateKey,
      dateLabel: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
      caption: choices.captions[id] ?? defaultCaption.slice(0, 280),
      photos: [...new Set(item.photos)].map(uri => {
        const photoId = journalPhotoId(id, uri);
        return { id: photoId, uri, caption: choices.photoCaptions[photoId] ?? '' };
      }),
    });
  }
  tasks.forEach(task => {
    const project = projectById.get(task.projectId);
    if (project) add(task, 'task', project);
  });
  selectedProjects.forEach(project => add(project, 'project', project));
  candidates.sort((a, b) => a.dateKey.localeCompare(b.dateKey)
    || a.project.localeCompare(b.project, 'fr') || a.id.localeCompare(b.id));
  const entries = candidates.filter(e => !choices.excludedEntryIds.includes(e.id)).map(e => ({
    ...e, photos: e.photos.filter(photo => !choices.excludedPhotoIds.includes(photo.id)),
  }));
  const photoCount = entries.reduce((sum, entry) => sum + entry.photos.length, 0);
  const availablePhotos = candidates.reduce((sum, entry) => sum + entry.photos.length, 0);
  const undatedPhotos = undated.reduce((sum, item) => sum + item.photoCount, 0);
  const excludedPhotos = availablePhotos - photoCount;
  const secondsPerPhoto = journalPace(choices.pace);
  const duration = journalDuration(entries, secondsPerPhoto);
  let error = '';
  if (!parseJournalDate(choices.from) || !parseJournalDate(choices.to) || choices.from > choices.to)
    error = 'Choisis une période valide : la fin doit suivre le début.';
  else if (!selectedProjects.length) error = 'Sélectionne au moins un projet.';
  else if (!choices.title.trim()) error = 'Donne un titre à ton carnet.';
  else if (!entries.length) error = 'Aucun élément terminé retenu dans cette période.';
  else if (entries.length > JOURNAL_LIMITS.entries || photoCount > JOURNAL_LIMITS.photos || duration > JOURNAL_LIMITS.seconds)
    error = `Ce carnet est trop long. Garde au maximum ${JOURNAL_LIMITS.entries} étapes, ${JOURNAL_LIMITS.photos} photos et 10 minutes ; réduis la période ou la sélection.`;
  const request: JournalGenerationRequest = {
    journal: true, title: choices.title.trim(),
    periodLabel: `${parseJournalDate(choices.from)?.toLocaleDateString('fr-FR') ?? choices.from} — ${parseJournalDate(choices.to)?.toLocaleDateString('fr-FR') ?? choices.to}`,
    projectNames: selectedProjects.map(p => p.name), entryCount: entries.length,
    photoCount, secondsPerPhoto, entries,
  };
  return { candidates, entries, undated, photoCount, availablePhotos, excludedPhotos, undatedPhotos, duration, error, request };
}
