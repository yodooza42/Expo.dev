import type { JournalGenerationRequest, JournalVideoPayload } from '@/types/projectJournal';
import { JOURNAL_LIMITS } from '@/utils/projectJournal';
import { formatJournalPhotoDateTime } from '@/utils/journalPhotoTimestamp';

export type JournalPhotoAsset = {
  key: string;
  uri: string;
  title: string;
  index: number;
  /** Resolved file/content URIs tried by the native renderer, including recovery alternatives. */
  nativeCandidates?: string[];
};
export type PreparedJournal = { payload: JournalVideoPayload; assets: JournalPhotoAsset[] };

/**
 * Keep the initial WebView payload to metadata. Photo files are resolved,
 * resized, and sent only when the renderer is about to display them.
 */
export function prepareJournal(
  request: JournalGenerationRequest, jobId: string, isCurrent: () => boolean,
): PreparedJournal {
  if (request.photoCount > JOURNAL_LIMITS.photos || request.entries.length > JOURNAL_LIMITS.entries)
    throw new Error('La sélection dépasse la capacité du carnet. Réduis la période ou décoche des photos.');
  if (!isCurrent()) throw new Error('Préparation annulée.');
  const assets: JournalPhotoAsset[] = [];
  const keysByUri = new Map<string, string>();
  const dateTimeLabelFor = (takenAt?: number) => formatJournalPhotoDateTime(takenAt);
  const assetKeyFor = (uri: string, title: string, index: number) => {
    const existing = keysByUri.get(uri);
    if (existing) return existing;
    const key = `journal-photo-${assets.length}`;
    keysByUri.set(uri, key);
    assets.push({ key, uri, title, index });
    return key;
  };
  const entries: JournalVideoPayload['entries'] = request.entries.map(entry => ({
    ...entry,
    photos: entry.photos.map((photo, index) => ({
      id: photo.id, img: '', assetKey: assetKeyFor(photo.uri, entry.title, index), caption: photo.caption,
      ...(photo.takenAt !== undefined ? { takenAt: photo.takenAt } : {}),
      ...(dateTimeLabelFor(photo.takenAt) ? { dateTimeLabel: dateTimeLabelFor(photo.takenAt) } : {}),
    })),
  }));
  const finalComparisonImages = request.finalComparison ? {
    projectName: request.finalComparison.projectName,
    before: request.finalComparison.before.map((photo, index) => ({
      id: photo.id, img: '', assetKey: assetKeyFor(photo.uri, `${request.finalComparison!.projectName} · Avant`, index),
      dateLabel: photo.dateLabel,
      ...(photo.takenAt !== undefined ? { takenAt: photo.takenAt } : {}),
      ...(dateTimeLabelFor(photo.takenAt) ? { dateTimeLabel: dateTimeLabelFor(photo.takenAt) } : {}),
    })),
    after: request.finalComparison.after.map((photo, index) => ({
      id: photo.id, img: '', assetKey: assetKeyFor(photo.uri, `${request.finalComparison!.projectName} · Après`, index),
      dateLabel: photo.dateLabel,
      ...(photo.takenAt !== undefined ? { takenAt: photo.takenAt } : {}),
      ...(dateTimeLabelFor(photo.takenAt) ? { dateTimeLabel: dateTimeLabelFor(photo.takenAt) } : {}),
    })),
  } : undefined;
  const { finalComparison: _comparison, ...payload } = request;
  return {
    payload: { ...payload, ...(finalComparisonImages ? { finalComparisonImages } : {}), entries, jobId },
    assets,
  };
}
