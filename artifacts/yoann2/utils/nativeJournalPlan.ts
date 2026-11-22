import type { JournalPhotoAsset } from '@/utils/prepareJournal';
import {
  JOURNAL_LIMITS,
  journalComparisonPhotoDuration,
  journalEntryDuration,
  journalIntroDuration,
  journalOutroDuration,
  journalRecapDuration,
} from '@/utils/projectJournal';
import { journalPhotoDuration } from '@/utils/journalPhotoTiming';
import type { JournalVideoPayload } from '@/types/projectJournal';

export type NativeJournalScene = {
  kind: 'intro' | 'entry' | 'photo' | 'recap' | 'comparison' | 'outro';
  title: string;
  subtitle: string;
  dateLabel: string;
  caption: string;
  photoUri?: string;
  photoFallbackUris?: string[];
  photoSourceKey?: string;
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

function resolvePhotoSources(
  photo: { img: string; assetKey?: string },
  assetsByKey: Map<string, JournalPhotoAsset>,
): { uris: string[]; sourceKey: string } {
  const asset = photo.assetKey ? assetsByKey.get(photo.assetKey) : undefined;
  const sourceUri = asset?.uri ?? photo.img;
  if (!sourceUri) throw new Error('Une photo du carnet est introuvable.');
  const uris = [...new Set((asset?.nativeCandidates?.length ? asset.nativeCandidates : [sourceUri])
    .filter(uri => typeof uri === 'string' && uri.length > 0))];
  if (!uris.length) throw new Error('Une photo du carnet est introuvable.');
  return { uris, sourceKey: asset?.key ?? sourceUri };
}

function photoSourceFields(
  photo: { img: string; assetKey?: string },
  assetsByKey: Map<string, JournalPhotoAsset>,
) {
  const { uris, sourceKey } = resolvePhotoSources(photo, assetsByKey);
  return { photoUri: uris[0], ...(uris.length > 1 ? { photoFallbackUris: uris.slice(1) } : {}), photoSourceKey: sourceKey };
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
    durationSec: journalIntroDuration(payload, payload.secondsPerPhoto),
  });

  for (const entry of payload.entries) {
    if (entry.recapTasks?.length) {
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
          durationSec: journalRecapDuration(entry, page, payload.secondsPerPhoto),
        });
      }
      entry.photos.forEach((photo, index) => add({
        kind: 'photo',
        title: entry.title,
        subtitle: entry.project,
        dateLabel: photo.dateTimeLabel || entry.dateLabel,
        caption: photo.caption,
        ...photoSourceFields(photo, assetsByKey),
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
      durationSec: journalEntryDuration(entry, payload.secondsPerPhoto),
    });
    entry.photos.forEach(photo => add({
      kind: 'photo',
      title: entry.title,
      subtitle: entry.project,
      dateLabel: photo.dateTimeLabel || entry.dateLabel,
      caption: photo.caption,
      ...photoSourceFields(photo, assetsByKey),
      durationSec: journalPhotoDuration(photo.caption, payload.secondsPerPhoto),
    }));
  }

  const comparisonPhotos = [
    ...(payload.finalComparisonImages?.before ?? []),
    ...(payload.finalComparisonImages?.after ?? []),
  ];
  if (comparisonPhotos.length) {
    const projectName = payload.finalComparisonImages?.projectName ?? '';
    comparisonPhotos.forEach((photo, index) => {
      const side = index < (payload.finalComparisonImages?.before.length ?? 0) ? 'Avant' : 'Après';
      const dateLabel = photo.dateTimeLabel || photo.dateLabel;
      add({
        kind: 'comparison',
        title: `${projectName} · ${side}`,
        subtitle: side,
        dateLabel,
        caption: dateLabel,
        ...photoSourceFields(photo, assetsByKey),
        durationSec: journalComparisonPhotoDuration(projectName, side, dateLabel, payload.secondsPerPhoto),
      });
    });
  }

  add({
    kind: 'outro',
    title: payload.title,
    subtitle: payload.periodLabel,
    dateLabel: '',
    caption: `${payload.entryCount} étapes · ${payload.photoCount} photos`,
    durationSec: journalOutroDuration(payload, payload.secondsPerPhoto),
  });

  const duration = scenes.reduce((sum, scene) => sum + scene.durationSec, 0);
  if (duration > JOURNAL_LIMITS.seconds) {
    throw new Error(`Ce carnet dépasse ${JOURNAL_LIMITS.seconds / 60} minutes.`);
  }

  const timelinePhotos = scenes.filter(scene => scene.kind === 'photo' && scene.photoUri);
  const timelinePhotoKeys = new Set(timelinePhotos.map(scene => scene.photoSourceKey ?? scene.photoUri!));
  const newComparisonPhotos = new Set(scenes
    .filter(scene => scene.kind === 'comparison' && scene.photoUri)
    .map(scene => scene.photoSourceKey ?? scene.photoUri!)
    .filter(key => !timelinePhotoKeys.has(key)));
  const seenPhotos = timelinePhotos.length + newComparisonPhotos.size;
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
