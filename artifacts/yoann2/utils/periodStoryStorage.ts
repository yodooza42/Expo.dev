import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FamilyEvent, StoryDraftChoices } from '@/types/periodStory';

export const FAMILY_EVENTS_STORAGE_KEY = '@yoann2_family_events';
const PERIOD_CHOICES_STORAGE_PREFIX = '@yoann2_period_story_choices:';

export const EMPTY_STORY_CHOICES: StoryDraftChoices = {
  excludedTripIds: [],
  excludedPhotoKeys: [],
  photoCaptions: {},
  tripChapterOverrides: {},
};

let storageQueue: Promise<void> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(operation, operation);
  storageQueue = result.then(() => undefined, () => undefined);
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function storageFailure(action: string, error: unknown): Error {
  return new Error(`${action}: ${errorMessage(error)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${label} invalide.`);
  }
  return [...value];
}

function validateEvent(value: unknown): FamilyEvent {
  if (!isRecord(value) ||
      typeof value.id !== 'string' || value.id.length === 0 ||
      typeof value.title !== 'string' || value.title.length === 0 ||
      typeof value.startDate !== 'string' ||
      typeof value.endDate !== 'string') {
    throw new Error('Événement familial invalide.');
  }
  // Keep date validation local and strict without importing draft helpers into
  // the storage layer (storage remains easy to load in a VM test).
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(value.startDate) || !datePattern.test(value.endDate)) {
    throw new Error('Dates d’événement invalides.');
  }
  const start = new Date(`${value.startDate}T00:00:00`);
  const end = new Date(`${value.endDate}T00:00:00`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}` !== value.startDate ||
    `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}` !== value.endDate ||
    value.startDate > value.endDate
  ) {
    throw new Error('Dates d’événement invalides.');
  }
  return {
    id: value.id,
    title: value.title,
    startDate: value.startDate,
    endDate: value.endDate,
    includedTripIds: stringArray(value.includedTripIds, 'Trajets inclus'),
    excludedTripIds: stringArray(value.excludedTripIds, 'Trajets exclus'),
  };
}

function validateEvents(value: unknown): FamilyEvent[] {
  if (!Array.isArray(value)) throw new Error('Événements familiaux invalides.');
  const result = value.map(validateEvent);
  const ids = new Set<string>();
  for (const event of result) {
    if (ids.has(event.id)) throw new Error('Identifiants d’événements dupliqués.');
    ids.add(event.id);
  }
  return result;
}

function cloneEvent(event: FamilyEvent): FamilyEvent {
  return {
    ...event,
    includedTripIds: [...event.includedTripIds],
    excludedTripIds: [...event.excludedTripIds],
  };
}

function validateChoices(value: unknown): StoryDraftChoices {
  if (!isRecord(value)) throw new Error('Choix de story invalides.');
  const excludedTripIds = stringArray(value.excludedTripIds, 'Trajets exclus');
  const excludedPhotoKeys = stringArray(value.excludedPhotoKeys, 'Photos exclues');
  const rawPhotoCaptions = value.photoCaptions ?? {};
  if (!isRecord(rawPhotoCaptions) ||
      Object.entries(rawPhotoCaptions).some(
        ([photoKey, caption]) =>
          photoKey.length === 0 || typeof caption !== 'string' || caption.length > 120,
      )) {
    throw new Error('Commentaires de photos invalides.');
  }
  const photoCaptions: Record<string, string> = {};
  for (const [photoKey, caption] of Object.entries(rawPhotoCaptions)) {
    if (typeof caption !== 'string') throw new Error('Commentaires de photos invalides.');
    photoCaptions[photoKey] = caption;
  }
  if (!isRecord(value.tripChapterOverrides) ||
      Object.entries(value.tripChapterOverrides).some(
        ([tripId, chapter]) =>
          tripId.length === 0 || typeof chapter !== 'string' || chapter.length === 0,
      )) {
    throw new Error('Remplacements de chapitres invalides.');
  }
  const tripChapterOverrides: Record<string, string> = {};
  for (const [tripId, chapter] of Object.entries(value.tripChapterOverrides)) {
    // The validation above guarantees this branch for persisted data; keep
    // the guard local as Object.entries intentionally returns unknown values.
    if (typeof chapter !== 'string') throw new Error('Remplacements de chapitres invalides.');
    tripChapterOverrides[tripId] = chapter;
  }
  return { excludedTripIds, excludedPhotoKeys, photoCaptions, tripChapterOverrides };
}

function cloneChoices(choices: StoryDraftChoices): StoryDraftChoices {
  return {
    excludedTripIds: [...choices.excludedTripIds],
    excludedPhotoKeys: [...choices.excludedPhotoKeys],
    photoCaptions: { ...choices.photoCaptions },
    tripChapterOverrides: { ...choices.tripChapterOverrides },
  };
}

function choicesKey(key: string): string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('Clé de période invalide.');
  }
  return `${PERIOD_CHOICES_STORAGE_PREFIX}${key}`;
}

async function readEvents(): Promise<FamilyEvent[]> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(FAMILY_EVENTS_STORAGE_KEY);
  } catch (error) {
    throw storageFailure('Impossible de lire les événements familiaux', error);
  }
  if (raw === null) return [];
  try {
    return validateEvents(JSON.parse(raw));
  } catch (error) {
    throw storageFailure('Les événements familiaux persistés sont invalides', error);
  }
}

async function writeEvents(events: FamilyEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      FAMILY_EVENTS_STORAGE_KEY,
      JSON.stringify(events.map(cloneEvent)),
    );
  } catch (error) {
    throw storageFailure('Impossible d’enregistrer les événements familiaux', error);
  }
}

export function loadFamilyEvents(): Promise<FamilyEvent[]> {
  return enqueue(async () => (await readEvents()).map(cloneEvent));
}

export async function saveFamilyEvent(event: FamilyEvent): Promise<void> {
  const validated = validateEvent(event);
  await enqueue(async () => {
    const events = await readEvents();
    const index = events.findIndex(candidate => candidate.id === validated.id);
    const copy = cloneEvent(validated);
    if (index === -1) events.push(copy);
    else events[index] = copy;
    await writeEvents(events);
  });
}

export async function deleteFamilyEvent(id: string): Promise<void> {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Identifiant d’événement invalide.');
  }
  await enqueue(async () => {
    const events = await readEvents();
    await writeEvents(events.filter(event => event.id !== id));
  });
}

export function loadPeriodChoices(key: string): Promise<StoryDraftChoices> {
  const storageKey = choicesKey(key);
  return enqueue(async () => {
    let raw: string | null;
    try {
      raw = await AsyncStorage.getItem(storageKey);
    } catch (error) {
      throw storageFailure('Impossible de lire les choix de story', error);
    }
    if (raw === null) return cloneChoices(EMPTY_STORY_CHOICES);
    let choices: StoryDraftChoices;
    try {
      choices = validateChoices(JSON.parse(raw));
    } catch (error) {
      throw storageFailure('Les choix de story persistés sont invalides', error);
    }
    // Clean only the period being opened, never scan all saved periods.
    // A deleted event must not leave an invisible assignment in the editor.
    const eventIds = new Set((await readEvents()).map(event => event.id));
    let changed = false;
    for (const [tripId, chapterId] of Object.entries(choices.tripChapterOverrides)) {
      if (chapterId !== 'day' && !eventIds.has(chapterId)) {
        delete choices.tripChapterOverrides[tripId];
        changed = true;
      }
    }
    if (changed) {
      try { await AsyncStorage.setItem(storageKey, JSON.stringify(choices)); }
      catch (error) { throw storageFailure('Impossible d’actualiser les chapitres du brouillon', error); }
    }
    return cloneChoices(choices);
  });
}

export async function savePeriodChoices(key: string, choices: StoryDraftChoices): Promise<void> {
  const storageKey = choicesKey(key);
  const validated = validateChoices(choices);
  await enqueue(async () => {
    try {
      // Choices contain ids and chapter metadata only.  In particular, never
      // serialise TripPhoto objects or gallery/image bytes in this snapshot.
      await AsyncStorage.setItem(storageKey, JSON.stringify(validated));
    } catch (error) {
      throw storageFailure('Impossible d’enregistrer les choix de story', error);
    }
  });
}
