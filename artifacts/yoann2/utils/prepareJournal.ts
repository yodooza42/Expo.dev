import type { JournalGenerationRequest, JournalVideoPayload } from '@/types/projectJournal';
import { JOURNAL_LIMITS } from '@/utils/projectJournal';
import { prepareStoryPhoto } from '@/utils/storyPhoto';

export async function prepareJournal(
  request: JournalGenerationRequest, jobId: string, isCurrent: () => boolean,
  onProgress: (completed: number, total: number) => void,
): Promise<JournalVideoPayload> {
  const entries: JournalVideoPayload['entries'] = [];
  let completed = 0, bytes = 0;
  const total = request.entries.reduce((n, entry) => n + entry.photos.length, 0);
  if (total > JOURNAL_LIMITS.photos || request.entries.length > JOURNAL_LIMITS.entries)
    throw new Error('La sélection dépasse la capacité du carnet. Réduis la période ou décoche des photos.');
  for (const entry of request.entries) {
    const photos: JournalVideoPayload['entries'][number]['photos'] = [];
    for (const [index, photo] of entry.photos.entries()) {
      if (!isCurrent()) throw new Error('Préparation annulée.');
      let img: string;
      try { img = await prepareStoryPhoto(photo.uri, isCurrent); }
      catch (error) {
        throw new Error(`${entry.title} · photo ${index + 1} : ${error instanceof Error ? error.message : 'Photo illisible.'}`);
      }
      if (!isCurrent()) throw new Error('Préparation annulée.');
      bytes += img.length;
      if (bytes > JOURNAL_LIMITS.encodedBytes)
        throw new Error('Les photos sont trop volumineuses pour un seul carnet. Décoche quelques photos ou réduis la période.');
      photos.push({ id: photo.id, img, caption: photo.caption });
      onProgress(++completed, total);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    entries.push({ ...entry, photos });
  }
  if (!isCurrent()) throw new Error('Préparation annulée.');
  return { ...request, entries, jobId };
}
