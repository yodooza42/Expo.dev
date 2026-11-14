import type { JournalGenerationRequest, JournalVideoPayload } from '@/types/projectJournal';
import { JOURNAL_LIMITS } from '@/utils/projectJournal';
import { prepareStoryPhoto } from '@/utils/storyPhoto';

export type JournalPhotoAsset = { key: string; dataUri: string };
export type SplitJournalPayload = { payload: JournalVideoPayload; assets: JournalPhotoAsset[] };

/**
 * Keep image data out of the large WebView initialization script. The same
 * prepared image is sent only once even when it appears in the comparison too.
 */
export function splitJournalPayloadImages(payload: JournalVideoPayload): SplitJournalPayload {
  const assets: JournalPhotoAsset[] = [];
  const keysByImage = new Map<string, string>();
  const split = (photo: { img: string; assetKey?: string }) => {
    const image = photo.img;
    if (!image) return;
    let key = keysByImage.get(image);
    if (!key) {
      key = `journal-photo-${assets.length}`;
      keysByImage.set(image, key);
      assets.push({ key, dataUri: image });
    }
    photo.assetKey = key;
    photo.img = '';
  };

  for (const entry of payload.entries) for (const photo of entry.photos) split(photo);
  for (const photo of payload.finalComparisonImages?.before ?? []) split(photo);
  for (const photo of payload.finalComparisonImages?.after ?? []) split(photo);
  return { payload, assets };
}

export async function prepareJournal(
  request: JournalGenerationRequest, jobId: string, isCurrent: () => boolean,
  onProgress: (completed: number, total: number) => void,
): Promise<JournalVideoPayload> {
  const photoSources = request.entries.flatMap(entry => entry.photos.map((photo, index) => ({
    uri: photo.uri, title: entry.title, index,
  })));
  if (request.finalComparison) {
    request.finalComparison.before.forEach((photo, index) => photoSources.push({
      uri: photo.uri, title: `${request.finalComparison!.projectName} · Avant`, index,
    }));
    request.finalComparison.after.forEach((photo, index) => photoSources.push({
      uri: photo.uri, title: `${request.finalComparison!.projectName} · Après`, index,
    }));
  }
  const uniqueSources = [...new Map(photoSources.map(source => [source.uri, source])).values()];
  const images = new Map<string, string>();
  let completed = 0, bytes = 0;
  const total = uniqueSources.length;
  if (total > JOURNAL_LIMITS.photos || request.entries.length > JOURNAL_LIMITS.entries)
    throw new Error('La sélection dépasse la capacité du carnet. Réduis la période ou décoche des photos.');
  for (const source of uniqueSources) {
    if (!isCurrent()) throw new Error('Préparation annulée.');
    try {
      const img = await prepareStoryPhoto(source.uri, isCurrent);
      if (!isCurrent()) throw new Error('Préparation annulée.');
      bytes += img.length;
      if (bytes > JOURNAL_LIMITS.encodedBytes)
        throw new Error('Les photos sont trop volumineuses pour un seul carnet. Décoche quelques photos ou réduis la période.');
      images.set(source.uri, img);
    } catch (error) {
      if (error instanceof Error && error.message === 'Préparation annulée.') throw error;
      throw new Error(`${source.title} · photo ${source.index + 1} : ${error instanceof Error ? error.message : 'Photo illisible.'}`);
    }
    onProgress(++completed, total);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (!isCurrent()) throw new Error('Préparation annulée.');
  const entries: JournalVideoPayload['entries'] = request.entries.map(entry => ({
    ...entry,
    photos: entry.photos.map(photo => ({ id: photo.id, img: images.get(photo.uri)!, caption: photo.caption })),
  }));
  const finalComparisonImages = request.finalComparison ? {
    projectName: request.finalComparison.projectName,
    before: request.finalComparison.before.map(photo => ({
      id: photo.id, img: images.get(photo.uri)!, dateLabel: photo.dateLabel,
    })),
    after: request.finalComparison.after.map(photo => ({
      id: photo.id, img: images.get(photo.uri)!, dateLabel: photo.dateLabel,
    })),
  } : undefined;
  const { finalComparison: _comparison, ...payload } = request;
  return { ...payload, ...(finalComparisonImages ? { finalComparisonImages } : {}), entries, jobId };
}
