import type { JournalPhotoAsset } from '@/utils/prepareJournal';
import { JOURNAL_LIMITS } from '@/utils/projectJournal';
import { journalPhotoDuration } from '@/utils/journalPhotoTiming';
import type { JournalVideoPayload } from '@/types/projectJournal';

export type NativeJournalScene = {
  kind: 'intro' | 'entry' | 'photo' | 'recap' | 'comparison' | 'outro';
  title: string;
  subtitle: string;
  dateLabel: string;
  caption: string;
  photoUri?: string;
  lines?: string[];
  durationSec: number;
};

export type NativeJournalPlan = {
  title: string;
  periodLabel: string;
  projectNames: string[];
  entryCount: number;
  photoCount: number;
  secondsPerPhoto: number;
  width: 720;
  height: 1280;
  fps: 15;
  maxBytes: number;
  scenes: NativeJournalScene[];
};

const titleDuration = (entry: JournalVideoPayload['entries'][number]) =>
  Math.max(entry.photos.length ? 3 : 4,
    Math.min(16, 2 + Math.ceil((entry.title.length + entry.caption.length) / 24)));

const recapDuration = (entry: JournalVideoPayload['entries'][number]) =>
  Math.max(8, Math.min(16, 4 + Math.ceil((entry.recapTasks?.length ?? 0) / 6) * 4
    + Math.ceil(entry.caption.length / 60)));

function resolvePhotoUri(
  photo: { img: string; assetKey?: string },
  assetsByKey: Map<string, JournalPhotoAsset>,
): string {
  const uri = photo.assetKey ? assetsByKey.get(photo.assetKey)?.uri : undefined;
  const resolved = uri ?? photo.img;
  if (!resolved) throw new Error('Une photo du carnet est introuvable.');
  return resolved;
}

/**
 * Converts the journal timeline into a small, validated native render plan.
 * It contains only metadata and source URIs; image bytes never cross the JS bridge.
 */
export function buildNativeJournalPlan(
  payload: JournalVideoPayload,
  assets: JournalPhotoAsset[],
): NativeJournalPlan {
  if (!payload || !Array.isArray(payload.entries)) {
    throw new Error('Données du carnet invalides.');
  }
  if (payload.entries.length > JOURNAL_LIMITS.entries || payload.photoCount > JOURNAL_LIMITS.photos) {
    throw new Error('La sélection dépasse la capacité du carnet.');
  }

  const assetsByKey = new Map(assets.map(asset => [asset.key, asset]));
  const scenes: NativeJournalScene[] = [];
  const add = (scene: NativeJournalScene) => {
    if (!(scene.durationSec > 0) || !Number.isFinite(scene.durationSec)) {
      throw new Error('La durée d’une étape du carnet est invalide.');
    }
    scenes.push(scene);
  };

  add({
    kind: 'intro',
    title: payload.title,
    subtitle: payload.periodLabel,
    dateLabel: '',
    caption: '',
    durationSec: 4,
  });

  for (const entry of payload.entries) {
    if (entry.recapTasks?.length) {
      const duration = recapDuration(entry);
      const pages = Math.ceil(entry.recapTasks.length / 6);
      for (let page = 0; page < pages; page++) {
        add({
          kind: 'recap',
          title: entry.title,
          subtitle: entry.project,
          dateLabel: entry.dateLabel,
          caption: entry.caption,
          lines: entry.recapTasks.slice(page * 6, page * 6 + 6)
            .map(task => `${task.dateLabel} · ${task.title}`),
          durationSec: duration,
        });
      }
      entry.photos.forEach((photo, index) => add({
        kind: 'photo',
        title: entry.title,
        subtitle: entry.project,
        dateLabel: entry.dateLabel,
        caption: photo.caption,
        photoUri: resolvePhotoUri(photo, assetsByKey),
        durationSec: journalPhotoDuration(photo.caption, payload.secondsPerPhoto)
          + (index === 0 ? 1 : 0),
      }));
      continue;
    }

    add({
      kind: 'entry',
      title: entry.title,
      subtitle: entry.project,
      dateLabel: entry.dateLabel,
      caption: entry.caption,
      durationSec: titleDuration(entry),
    });
    entry.photos.forEach(photo => add({
      kind: 'photo',
      title: entry.title,
      subtitle: entry.project,
      dateLabel: entry.dateLabel,
      caption: photo.caption,
      photoUri: resolvePhotoUri(photo, assetsByKey),
      durationSec: journalPhotoDuration(photo.caption, payload.secondsPerPhoto),
    }));
  }

  const comparisonPhotos = [
    ...(payload.finalComparisonImages?.before ?? []),
    ...(payload.finalComparisonImages?.after ?? []),
  ];
  if (comparisonPhotos.length) {
    const perPhotoDuration = 10 / comparisonPhotos.length;
    const projectName = payload.finalComparisonImages?.projectName ?? '';
    comparisonPhotos.forEach((photo, index) => {
      const side = index < (payload.finalComparisonImages?.before.length ?? 0) ? 'Avant' : 'Après';
      add({
        kind: 'comparison',
        title: `${projectName} · ${side}`,
        subtitle: side,
        dateLabel: photo.dateLabel,
        caption: photo.dateLabel,
        photoUri: resolvePhotoUri(photo, assetsByKey),
        durationSec: perPhotoDuration,
      });
    });
  }

  add({
    kind: 'outro',
    title: payload.title,
    subtitle: payload.periodLabel,
    dateLabel: '',
    caption: `${payload.entryCount} étapes · ${payload.photoCount} photos`,
    durationSec: 4,
  });

  const duration = scenes.reduce((sum, scene) => sum + scene.durationSec, 0);
  if (duration > JOURNAL_LIMITS.seconds) {
    throw new Error(`Ce carnet dépasse ${JOURNAL_LIMITS.seconds / 60} minutes.`);
  }

  const seenPhotos = scenes.filter(scene => scene.photoUri).length;
  if (seenPhotos !== payload.photoCount) {
    throw new Error('Le nombre de photos du carnet ne correspond pas à la sélection.');
  }

  return {
    title: payload.title,
    periodLabel: payload.periodLabel,
    projectNames: payload.projectNames,
    entryCount: payload.entryCount,
    photoCount: payload.photoCount,
    secondsPerPhoto: payload.secondsPerPhoto,
    width: 720,
    height: 1280,
    fps: 15,
    maxBytes: 96 * 1024 * 1024,
    scenes,
  };
}
