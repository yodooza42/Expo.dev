import type { JournalProjectPhoto, JournalProjectPhotoSelection, Project, Task } from '@/types';
import type { JournalChoices, JournalEntry, JournalGenerationRequest } from '@/types/projectJournal';
import { parseCompletionDate } from '@/utils/completionDate';

export const JOURNAL_LIMITS = { entries: 120, photos: 120, seconds: 900, encodedBytes: 48 * 1024 * 1024 };
export const JOURNAL_PHOTOS_PER_SLIDE = 4;
export const JOURNAL_PHOTO_APPEAR_INTERVAL = 0.5;
export const JOURNAL_FIRST_PHOTO_DELAY = 1;
export function normalizeJournalProjectPhotos(selection?: JournalProjectPhotoSelection): JournalProjectPhoto[] {
  if (!selection) return [];
  const photos = Array.isArray(selection) ? selection : [selection];
  return [...new Map(photos.map(photo => [photo.uri, photo])).values()].slice(0, 2);
}
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
export const journalRecapDuration = (entry: JournalEntry) => Math.max(8, Math.min(16,
  4 + Math.ceil((entry.recapTasks?.length ?? 0) / 6) * 4 + Math.ceil(entry.caption.trim().length / 60)));
const journalPhotoSlideDuration = (count: number, secondsPerPhoto: number, delay = 0) =>
  delay + Math.max(0, count - 1) * JOURNAL_PHOTO_APPEAR_INTERVAL + secondsPerPhoto;
const journalTitleDuration = (entry: JournalEntry) => Math.max(entry.photos.length ? 3 : 4,
  Math.min(16, 2 + Math.ceil((entry.title.length + entry.caption.length) / 24)));
export function journalDuration(entries: JournalEntry[], secondsPerPhoto: number, hasFinalComparison = false): number {
  return 8 + entries.reduce((sum, entry) => {
    const pages = Math.ceil(entry.photos.length / JOURNAL_PHOTOS_PER_SLIDE);
    if (entry.recapTasks?.length) return sum + Math.ceil(entry.recapTasks.length / 6) * journalRecapDuration(entry)
      + Array.from({ length: pages }, (_, page) => journalPhotoSlideDuration(
        Math.min(JOURNAL_PHOTOS_PER_SLIDE, entry.photos.length - page * JOURNAL_PHOTOS_PER_SLIDE), secondsPerPhoto,
      )).reduce((total, duration) => total + duration, 0);
    const firstPageCount = Math.min(JOURNAL_PHOTOS_PER_SLIDE, entry.photos.length);
    return sum + Math.max(journalTitleDuration(entry),
      firstPageCount ? journalPhotoSlideDuration(firstPageCount, secondsPerPhoto, JOURNAL_FIRST_PHOTO_DELAY) : 0)
      + Array.from({ length: Math.max(0, pages - 1) }, (_, page) => journalPhotoSlideDuration(
        Math.min(JOURNAL_PHOTOS_PER_SLIDE, entry.photos.length - (page + 1) * JOURNAL_PHOTOS_PER_SLIDE), secondsPerPhoto,
      )).reduce((total, duration) => total + duration, 0);
  }, 0) + (hasFinalComparison ? 10 : 0);
}
export function initialJournalChoices(projects: Project[], projectId?: string): JournalChoices {
  const now = new Date();
  return {
    title: 'Carnet de bord', from: journalDateKey(new Date(now.getFullYear(), 0, 1)), to: journalDateKey(now),
    projectIds: projectId ? [projectId] : projects.filter(p => !p.archived).map(p => p.id),
    excludedEntryIds: [], excludedPhotoIds: [], captions: {}, photoCaptions: {}, pace: 'normal', taskOrderByDate: {},
    beforeAfterByProjectId: {},
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
    && ['calm', 'normal', 'quick'].includes(v.pace)
    && (v.taskOrderByDate === undefined || (!!v.taskOrderByDate && typeof v.taskOrderByDate === 'object'
      && !Array.isArray(v.taskOrderByDate) && Object.entries(v.taskOrderByDate).every(([day, ids]) =>
        !!parseJournalDate(day) && Array.isArray(ids) && ids.every(id => typeof id === 'string' && id.startsWith('task:'))
        && new Set(ids).size === ids.length)))
    && (v.beforeAfterByProjectId === undefined || (!!v.beforeAfterByProjectId
      && typeof v.beforeAfterByProjectId === 'object' && !Array.isArray(v.beforeAfterByProjectId)
      && Object.values(v.beforeAfterByProjectId).every(selection => !!selection && typeof selection === 'object'
        && !Array.isArray(selection)
        && ['beforePhotoId', 'afterPhotoId'].every(key => selection[key as keyof typeof selection] === undefined
          || typeof selection[key as keyof typeof selection] === 'string')
        && ['beforePhotoIds', 'afterPhotoIds'].every(key => selection[key as keyof typeof selection] === undefined
          || (Array.isArray(selection[key as keyof typeof selection])
            && (selection[key as keyof typeof selection] as unknown[]).length <= 2
            && (selection[key as keyof typeof selection] as unknown[]).every(id => typeof id === 'string')
            && new Set(selection[key as keyof typeof selection] as unknown[]).size
              === (selection[key as keyof typeof selection] as unknown[]).length)))));
}
/** Only swap tasks from the same day; keep choices for currently hidden projects/days. */
export function moveJournalTask(choices: JournalChoices, candidates: JournalEntry[], id: string, direction: -1 | 1): JournalChoices {
  const entry = candidates.find(item => item.id === id && item.kind === 'task');
  if (!entry) return choices;
  const ids = candidates.filter(item => item.kind === 'task' && item.dateKey === entry.dateKey).map(item => item.id);
  const index = ids.indexOf(id), target = index + direction;
  if (target < 0 || target >= ids.length) return choices;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  const present = new Set(ids);
  let position = 0;
  const saved = choices.taskOrderByDate?.[entry.dateKey] ?? [];
  // Replace visible slots, retaining absent task IDs for a later selection.
  const order = saved.map(taskId => present.has(taskId) ? ids[position++]! : taskId);
  order.push(...ids.slice(position));
  return { ...choices, taskOrderByDate: { ...choices.taskOrderByDate, [entry.dateKey]: order } };
}

/** Resolve anchors from the actual montage, not the source ID tie-breaker. */
function attachJournalRecaps(items: JournalEntry[]): JournalEntry[] {
  const after = new Map<string, JournalEntry[]>();
  for (const recap of items.filter(item => item.recapTasks)) {
    const taskIds = new Set(recap.recapTasks!.map(task => task.id));
    const last = items.filter(item => item.kind === 'task' && taskIds.has(item.sourceId)).slice(-1)[0];
    if (last) after.set(last.id, [...(after.get(last.id) ?? []), { ...recap, afterTaskId: last.id }]);
  }
  return items.filter(item => !item.recapTasks).flatMap(item => [item, ...(after.get(item.id) ?? [])]);
}
export function buildProjectJournal(projects: Project[], tasks: Task[], choices: JournalChoices) {
  const selectedProjects = projects.filter(p => choices.projectIds.includes(p.id));
  const projectById = new Map(selectedProjects.map(p => [p.id, p]));
  const candidates: JournalEntry[] = [];
  const undated: Array<{ id: string; kind: 'task' | 'project'; title: string; photoCount: number; action: 'date' | 'subtask-date' | 'subtask' | 'photos' }> = [];
  function add(item: Task | Project, kind: 'task' | 'project', project: Project, options?: {
    entryId?: string; sourceId?: string; parentTaskTitle?: string; subTaskId?: string;
  }) {
    if (item.status !== 'done') return;
    const title = 'title' in item ? item.title : item.name;
    const date = item.completedAt ? parseCompletionDate(item.completedAt) : null;
    if (!date) { undated.push({ id: options?.sourceId ?? item.id, kind, title, photoCount: item.photos.length, action: 'date' }); return; }
    const dateKey = journalDateKey(date);
    if (dateKey < choices.from || dateKey > choices.to) return;
    const id = options?.entryId ?? `${kind}:${item.id}`;
    const defaultCaption = ('notes' in item ? item.notes?.trim() : '') || item.description || '';
    candidates.push({
      id, sourceId: options?.sourceId ?? item.id, kind, title, project: project.name, projectId: project.id, dateKey,
      dateLabel: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
      caption: choices.captions[id] ?? defaultCaption.slice(0, 280),
      ...(options?.parentTaskTitle ? { parentTaskTitle: options.parentTaskTitle } : {}),
      ...(options?.subTaskId ? { subTaskId: options.subTaskId } : {}),
      photos: [...new Set(item.photos)].map((uri, index) => {
        const photoId = journalPhotoId(id, uri);
        const takenAt = 'photoTakenAt' in item ? item.photoTakenAt?.[uri] : undefined;
        return { id: photoId, uri, caption: choices.photoCaptions[photoId] ?? '', takenAt, sourceOrder: index };
      }).sort((a, b) => {
        const aDate = typeof a.takenAt === 'number' && Number.isFinite(a.takenAt) && a.takenAt > 0 ? a.takenAt : undefined;
        const bDate = typeof b.takenAt === 'number' && Number.isFinite(b.takenAt) && b.takenAt > 0 ? b.takenAt : undefined;
        if (aDate !== undefined && bDate !== undefined) return aDate - bDate || a.sourceOrder - b.sourceOrder;
        if (aDate !== undefined) return -1;
        if (bDate !== undefined) return 1;
        return a.sourceOrder - b.sourceOrder;
      }).map(({ sourceOrder: _sourceOrder, ...photo }) => photo),
    });
  }
  tasks.forEach(task => {
    const project = projectById.get(task.projectId);
    if (!project) return;
    const doneSubTasks = task.subTasks?.filter(subTask => subTask.done) ?? [];
    const datedSubTasks = doneSubTasks.filter(subTask => !!subTask.completedAt && !!parseCompletionDate(subTask.completedAt));
    if (!datedSubTasks.length) { add(task, 'task', project); return; }

    const assignedPhotos = new Set<string>();
    for (const subTask of doneSubTasks) {
      const photos = (subTask.photoUris ?? []).filter(uri => task.photos.includes(uri));
      photos.forEach(uri => assignedPhotos.add(uri));
      if (!subTask.completedAt || !parseCompletionDate(subTask.completedAt)) {
        undated.push({ id: task.id, kind: 'task', title: `${task.title} · ${subTask.title}`, photoCount: photos.length, action: 'subtask-date' });
        continue;
      }
      add({ ...task, title: subTask.title, completedAt: subTask.completedAt, photos }, 'task', project, {
        entryId: `task:${task.id}:subtask:${subTask.id}`, sourceId: task.id,
        parentTaskTitle: task.title, subTaskId: subTask.id,
      });
    }
    for (const subTask of task.subTasks ?? []) {
      if (subTask.done) continue;
      const photos = (subTask.photoUris ?? []).filter(uri => task.photos.includes(uri));
      photos.forEach(uri => assignedPhotos.add(uri));
      if (photos.length) undated.push({
        id: task.id, kind: 'task', title: `${task.title} · ${subTask.title} (sous-tâche non terminée)`,
        photoCount: photos.length, action: 'subtask',
      });
    }
    const unassigned = task.photos.filter(uri => !assignedPhotos.has(uri));
    if (unassigned.length) undated.push({
      id: task.id, kind: 'task', title: `${task.title} · photos à associer`, photoCount: unassigned.length, action: 'photos',
    });
  });
  selectedProjects.forEach(project => {
    const children = tasks.filter(task => task.projectId === project.id);
    const ordered = [...children].sort((a, b) => {
      const ad = a.completedAt ? parseCompletionDate(a.completedAt) : null;
      const bd = b.completedAt ? parseCompletionDate(b.completedAt) : null;
      return (ad?.getTime() ?? 0) - (bd?.getTime() ?? 0) || a.id.localeCompare(b.id);
    });
    // The final task closes the story even when the project status has not yet been updated.
    // Never celebrate a partial/reopened project or guess a missing task completion date.
    const complete = children.length > 0 && children.every(task =>
      task.status === 'done' && !!task.completedAt && !!parseCompletionDate(task.completedAt));
    if (complete && project.status !== 'abandoned') {
      const last = ordered[ordered.length - 1]!;
      const before = candidates.length;
      add({ ...project, status: 'done', completedAt: last.completedAt }, 'project', project);
      const recap = candidates[before];
      if (recap) {
        recap.afterTaskId = `task:${last.id}`;
        recap.recapTasks = ordered.map(task => ({
          id: task.id, title: task.title,
          dateLabel: parseCompletionDate(task.completedAt!)!.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
        }));
        recap.caption = choices.captions[recap.id] ?? 'Une étape après l’autre, et voilà un projet mené à bien !';
      }
    } else {
      // Keep an explicitly dated project milestone/album, but never call it an all-tasks recap.
      add(project, 'project', project);
    }
  });
  candidates.sort((a, b) => a.dateKey.localeCompare(b.dateKey)
    || a.project.localeCompare(b.project, 'fr') || a.id.localeCompare(b.id));
  // Reorder only task slots within each day; project milestones retain their chronology.
  const days = new Map<string, JournalEntry[]>();
  for (const entry of candidates.filter(item => item.kind === 'task')) {
    days.set(entry.dateKey, [...(days.get(entry.dateKey) ?? []), entry]);
  }
  for (const [day, items] of days) {
    const ranks = new Map((choices.taskOrderByDate?.[day] ?? []).map((id, index) => [id, index]));
    items.sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity));
  }
  const positions = new Map<string, number>();
  const sorted = candidates.map(entry => {
    if (entry.kind !== 'task') return entry;
    const index = positions.get(entry.dateKey) ?? 0;
    positions.set(entry.dateKey, index + 1);
    return days.get(entry.dateKey)![index]!;
  });
  const orderedCandidates = attachJournalRecaps(sorted);
  candidates.splice(0, candidates.length, ...orderedCandidates);
  const entries = attachJournalRecaps(candidates.filter(e => !choices.excludedEntryIds.includes(e.id))).map(e => ({
    ...e, photos: e.photos.filter(photo => !choices.excludedPhotoIds.includes(photo.id)),
  }));
  let finalComparison: JournalGenerationRequest['finalComparison'];
  if (selectedProjects.length === 1) {
    const project = selectedProjects[0]!;
    const stored = choices.beforeAfterByProjectId?.[project.id];
    const projectCandidates = candidates.filter(entry => entry.projectId === project.id);
    const findCandidate = (photoId: string | undefined) => photoId
      ? projectCandidates.flatMap(entry => entry.photos.map(photo => ({ photo, dateLabel: entry.dateLabel })))
        .find(item => item.photo.id === photoId)
      : undefined;
    const resolveSide = (slot: 'before' | 'after') => {
      const idsKey = slot === 'before' ? 'beforePhotoIds' : 'afterPhotoIds';
      const legacyKey = slot === 'before' ? 'beforePhotoId' : 'afterPhotoId';
      const savedPhotos = normalizeJournalProjectPhotos(project.journalBeforeAfter?.[slot]);
      const ids = Array.isArray(stored?.[idsKey])
        ? stored[idsKey]!.slice(0, 2)
        : stored?.[legacyKey] ? [stored[legacyKey]!] : savedPhotos.map(photo => photo.photoId);
      return [...new Set(ids)].flatMap(id => {
        const candidate = findCandidate(id);
        if (candidate) return [{ id, uri: candidate.photo.uri, dateLabel: candidate.dateLabel }];
        const saved = savedPhotos.find(photo => photo.photoId === id);
        return saved ? [{ id, uri: saved.uri, dateLabel: saved.dateLabel }] : [];
      });
    };
    const before = resolveSide('before');
    const after = resolveSide('after');
    const usedBeforeUris = new Set(before.map(photo => photo.uri));
    const uniqueAfter = after.filter(photo => !usedBeforeUris.has(photo.uri));
    if (before.length && uniqueAfter.length) {
      finalComparison = { projectName: project.name, before, after: uniqueAfter };
    }
  }
  const selectedEntryPhotoCount = entries.reduce((sum, entry) => sum + entry.photos.length, 0);
  const entryPhotoUris = new Set(entries.flatMap(entry => entry.photos.map(photo => photo.uri)));
  const comparisonUris = finalComparison
    ? [...finalComparison.before, ...finalComparison.after].map(photo => photo.uri) : [];
  const additionalComparisonPhotos = new Set(comparisonUris.filter(uri => !entryPhotoUris.has(uri))).size;
  const photoCount = selectedEntryPhotoCount + additionalComparisonPhotos;
  const availablePhotos = candidates.reduce((sum, entry) => sum + entry.photos.length, 0);
  const undatedPhotos = undated.reduce((sum, item) => sum + item.photoCount, 0);
  const excludedPhotos = availablePhotos - selectedEntryPhotoCount;
  const secondsPerPhoto = journalPace(choices.pace);
  const duration = journalDuration(entries, secondsPerPhoto, !!finalComparison);
  let error = '';
  if (!parseJournalDate(choices.from) || !parseJournalDate(choices.to) || choices.from > choices.to)
    error = 'Choisis une période valide : la fin doit suivre le début.';
  else if (!selectedProjects.length) error = 'Sélectionne au moins un projet.';
  else if (!choices.title.trim()) error = 'Donne un titre à ton carnet.';
  else if (!entries.length) error = 'Aucun élément terminé retenu dans cette période.';
  else if (entries.length > JOURNAL_LIMITS.entries || photoCount > JOURNAL_LIMITS.photos || duration > JOURNAL_LIMITS.seconds)
    error = `Ce carnet est trop long. Garde au maximum ${JOURNAL_LIMITS.entries} étapes, ${JOURNAL_LIMITS.photos} photos et ${JOURNAL_LIMITS.seconds / 60} minutes ; réduis la période ou la sélection.`;
  const request: JournalGenerationRequest = {
    journal: true, title: choices.title.trim(),
    periodLabel: `${parseJournalDate(choices.from)?.toLocaleDateString('fr-FR') ?? choices.from} — ${parseJournalDate(choices.to)?.toLocaleDateString('fr-FR') ?? choices.to}`,
    projectNames: selectedProjects.map(p => p.name), entryCount: entries.length,
    photoCount, secondsPerPhoto, entries, ...(finalComparison ? { finalComparison } : {}),
  };
  return { candidates, entries, undated, photoCount, availablePhotos, excludedPhotos, undatedPhotos, duration, error, request };
}
