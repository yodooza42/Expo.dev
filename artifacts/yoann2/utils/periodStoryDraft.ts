import type {
  FamilyEvent,
  PeriodStoryChapter,
  PeriodStoryConflict,
  PeriodStoryDraft,
  StoryDraftChoices,
  StoryTiming,
  StoryTimingChapter,
} from '@/types/periodStory';
import type { RoutePoint, Trip, TripPhoto } from '@/types/trips';

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

const PHOTO_PAUSE_SEC = 2;
const OPENING_SEC = 3;
const RECAP_SEC = 3;
const STORY_SEC_PER_TRIP_HOUR = 3;

export const EMPTY_STORY_CHOICES: StoryDraftChoices = {
  excludedTripIds: [],
  excludedPhotoKeys: [],
  photoCaptions: {},
  tripChapterOverrides: {},
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isValidDate(value: Date): boolean {
  return Object.prototype.toString.call(value) === '[object Date]' &&
    !Number.isNaN(value.getTime());
}

/**
 * Format a Date as a local calendar date.  Deliberately does not use
 * toISOString(), whose UTC conversion changes the day around midnight.
 */
export function localDateKey(date: Date): string {
  if (!isValidDate(date)) {
    throw new RangeError('Une date locale valide est nécessaire.');
  }
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Parse exactly YYYY-MM-DD as a local midnight.  The round-trip check rejects
 * impossible dates such as 2024-02-30 instead of allowing Date to normalise
 * them into March.
 */
export function parseLocalDate(value: string): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // setFullYear avoids Date's special 1900 offset for years 0..99.
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function localMidnight(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, monthIndex, day);
  return date;
}

function localDayEnd(date: Date): Date {
  const end = new Date(date.getTime());
  end.setHours(23, 59, 59, 999);
  return end;
}

export function monthRange(date: Date): { from: Date; to: Date } {
  if (!isValidDate(date)) {
    throw new RangeError('Une date locale valide est nécessaire.');
  }
  return {
    from: localMidnight(date.getFullYear(), date.getMonth(), 1),
    to: localDayEnd(localMidnight(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}

/** The last calendar month completed at the local time represented by now. */
export function lastCompletedMonth(now: Date = new Date()): { from: Date; to: Date } {
  if (!isValidDate(now)) {
    throw new RangeError('Une date locale valide est nécessaire.');
  }
  const firstCurrentMonth = localMidnight(now.getFullYear(), now.getMonth(), 1);
  const previousMonth = new Date(firstCurrentMonth.getTime());
  previousMonth.setDate(previousMonth.getDate() - 1);
  return monthRange(previousMonth);
}

export function periodKey(from: Date, to: Date): string {
  return `${localDateKey(from)}_${localDateKey(to)}`;
}

function isWholeMonth(from: Date, to: Date): boolean {
  if (
    from.getFullYear() !== to.getFullYear() ||
    from.getMonth() !== to.getMonth() ||
    from.getDate() !== 1
  ) {
    return false;
  }
  const lastDay = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  return to.getDate() === lastDay;
}

export function monthStoryTitle(from: Date, to: Date): string {
  if (!isWholeMonth(from, to)) return 'Nos souvenirs';
  const month = MONTHS_FR[from.getMonth()];
  const article = /^[aeiouyàâäéèêëîïôöùûüœ]/i.test(month) ? 'd’' : 'de ';
  return `Notre mois ${article}${month}`;
}

function localTripDateKey(trip: Trip): string | null {
  if (!Number.isFinite(trip.startTime)) return null;
  const date = new Date(trip.startTime);
  return isValidDate(date) ? localDateKey(date) : null;
}

function validEvent(event: FamilyEvent): boolean {
  if (!event || typeof event.id !== 'string' || event.id.length === 0) return false;
  if (typeof event.title !== 'string') return false;
  const from = parseLocalDate(event.startDate);
  const to = parseLocalDate(event.endDate);
  return !!from && !!to && localDateKey(from) <= localDateKey(to) &&
    Array.isArray(event.includedTripIds) &&
    Array.isArray(event.excludedTripIds);
}

/**
 * Return whether a trip belongs to an event.  Date membership is inclusive
 * and is based on the trip's local START day.  Explicit corrections are
 * applied after the automatic date candidate: exclusion always wins.
 */
export function eventMatchesTrip(event: FamilyEvent, trip: Trip): boolean {
  if (!validEvent(event) || !trip || typeof trip.id !== 'string') return false;
  if (event.excludedTripIds.includes(trip.id)) return false;
  if (event.includedTripIds.includes(trip.id)) return true;
  const tripDate = localTripDateKey(trip);
  if (!tripDate) return false;
  return tripDate >= event.startDate && tripDate <= event.endDate;
}

/** The key is intentionally independent of a photo URI, which can be remapped by a gallery. */
export function photoKey(tripId: string, photo: TripPhoto): string {
  return JSON.stringify([tripId, photo.id]);
}

function validRoute(route: Trip['route']): route is RoutePoint[] {
  return !!route &&
    route.length >= 2 &&
    route.every(point =>
      !!point &&
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lng) &&
      Math.abs(point.lat) < 85 &&
      Math.abs(point.lng) <= 180,
    );
}

function clonePhoto(photo: TripPhoto): TripPhoto {
  return { ...photo };
}

function cloneTrip(trip: Trip, photos?: TripPhoto[]): Trip {
  return {
    ...trip,
    route: trip.route?.map(point => ({ ...point })),
    photos: (photos ?? trip.photos?.map(clonePhoto) ?? []),
    intermediates: trip.intermediates?.map(stop => ({ ...stop })),
    walkParticipants: trip.walkParticipants ? [...trip.walkParticipants] : undefined,
  };
}

function inferRouteIndex(trip: Trip, photo: TripPhoto): number | undefined {
  const route = trip.route;
  if (!validRoute(route)) return undefined;

  if (Number.isFinite(photo.takenAt)) {
    const timestamped = route
      .map((point, index) => ({ index, t: point.t }))
      .filter((point): point is { index: number; t: number } => Number.isFinite(point.t));
    if (timestamped.length > 0) {
      let closest = timestamped[0]!;
      let distance = Math.abs(closest.t - photo.takenAt);
      for (const candidate of timestamped.slice(1)) {
        const candidateDistance = Math.abs(candidate.t - photo.takenAt);
        if (candidateDistance < distance ||
            (candidateDistance === distance && candidate.index < closest.index)) {
          closest = candidate;
          distance = candidateDistance;
        }
      }
      return closest.index;
    }

    if (Number.isFinite(trip.startTime) && Number.isFinite(trip.endTime) &&
        trip.endTime >= trip.startTime) {
      const progress = Math.max(0, Math.min(1,
        (photo.takenAt - trip.startTime) / Math.max(1, trip.endTime - trip.startTime),
      ));
      return Math.round(progress * (route.length - 1));
    }
  }

  // A gallery item with no trustworthy timestamp is still renderable.  The
  // renderer needs a concrete anchor and treats the final point as the safe
  // neutral fallback; this does not claim the photo was taken there.
  return route.length - 1;
}

function copiedPhoto(trip: Trip, photo: TripPhoto): TripPhoto {
  const copy = clonePhoto(photo);
  const routeLength = trip.route?.length ?? 0;
  const existingIndex = copy.routeIndex;
  const existingIndexValid = typeof existingIndex === 'number' &&
    Number.isInteger(existingIndex) &&
    existingIndex >= 0 && existingIndex < routeLength;
  if (!existingIndexValid) {
    const inferred = inferRouteIndex(trip, copy);
    // validRoute was checked before this helper, so the fallback is always
    // available for a selected photo.
    copy.routeIndex = inferred ?? Math.max(0, routeLength - 1);
  }
  return copy;
}

function compareTrips(a: Trip, b: Trip): number {
  return a.startTime - b.startTime || a.id.localeCompare(b.id);
}

function compareChapter(a: PeriodStoryChapter, b: PeriodStoryChapter): number {
  return a.startTime - b.startTime || a.id.localeCompare(b.id);
}

function neutralDayTitle(dateKey: string): string {
  const date = parseLocalDate(dateKey)!;
  return `Journée du ${date.getDate()} ${MONTHS_FR[date.getMonth()]}`;
}

function normalizedRange(from: Date, to: Date): { fromKey: string; toKey: string } {
  const fromKey = localDateKey(from);
  const toKey = localDateKey(to);
  return fromKey <= toKey
    ? { fromKey, toKey }
    : { fromKey: toKey, toKey: fromKey };
}

function validChoices(choices: StoryDraftChoices): StoryDraftChoices {
  return {
    excludedTripIds: Array.isArray(choices?.excludedTripIds) ? choices.excludedTripIds : [],
    excludedPhotoKeys: Array.isArray(choices?.excludedPhotoKeys) ? choices.excludedPhotoKeys : [],
    photoCaptions: choices?.photoCaptions && typeof choices.photoCaptions === 'object'
      ? choices.photoCaptions
      : {},
    tripChapterOverrides: choices?.tripChapterOverrides &&
      typeof choices.tripChapterOverrides === 'object'
      ? choices.tripChapterOverrides
      : {},
  };
}

function validEventList(events: FamilyEvent[]): FamilyEvent[] {
  if (!Array.isArray(events)) return [];
  // Membership suggestions in the event editor work before the title is typed;
  // only named, saved events can become chapters in the exported draft.
  return events.filter(event => validEvent(event) && event.title.trim().length > 0);
}

export interface BuildPeriodStoryDraftInput {
  trips: Trip[];
  events: FamilyEvent[];
  choices?: StoryDraftChoices;
  from: Date;
  to: Date;
}

/**
 * Build a completely detached draft.  Nothing in this function writes to
 * trip storage: route/photo copies are made before route indexes are inferred
 * or photos are filtered.
 */
export function buildPeriodStoryDraft({
  trips,
  events,
  choices,
  from,
  to,
}: BuildPeriodStoryDraftInput): PeriodStoryDraft {
  const { fromKey, toKey } = normalizedRange(from, to);
  const safeChoices = validChoices(choices ?? EMPTY_STORY_CHOICES);
  const excludedTrips = new Set(safeChoices.excludedTripIds);
  const excludedPhotos = new Set(safeChoices.excludedPhotoKeys);
  const safeEvents = validEventList(events);

  // Trip ids are the identity of a source trip.  Keep the first occurrence so
  // malformed duplicate snapshots cannot make a trip appear twice in a story.
  const candidates: Trip[] = [];
  const seenTripIds = new Set<string>();
  for (const trip of Array.isArray(trips) ? trips : []) {
    if (!trip || typeof trip.id !== 'string' || seenTripIds.has(trip.id)) continue;
    if (trip.vehicle === 'ignored') continue;
    const dateKey = localTripDateKey(trip);
    if (!dateKey || dateKey < fromKey || dateKey > toKey) continue;
    seenTripIds.add(trip.id);
    candidates.push(trip);
  }

  const unavailableTrips: Trip[] = [];
  for (const trip of candidates) {
    if (!validRoute(trip.route)) unavailableTrips.push(cloneTrip(trip));
  }

  const selectedSources = candidates.filter(trip =>
    validRoute(trip.route) && !excludedTrips.has(trip.id),
  );
  selectedSources.sort(compareTrips);

  const chaptersById = new Map<string, PeriodStoryChapter>();
  const conflicts: PeriodStoryConflict[] = [];
  const seenPhotoUris = new Set<string>();
  const seenPhotoIds = new Set<string>();
  let photoCount = 0;
  let omittedPhotoCount = 0;

  // Explicitly excluded trips are still part of the period's candidate set;
  // their photos are counted as omitted, which makes the recovery UI explain
  // where the story's omitted-photo total came from.
  for (const trip of candidates) {
    if (excludedTrips.has(trip.id) || !validRoute(trip.route)) {
      omittedPhotoCount += trip.photos?.length ?? 0;
    }
  }

  for (const sourceTrip of selectedSources) {
    const matchingEvents = safeEvents.filter(event => eventMatchesTrip(event, sourceTrip));
    const override = safeChoices.tripChapterOverrides[sourceTrip.id];
    const overrideIsDay = override === 'day';
    const validOverride = !!override &&
      !overrideIsDay &&
      matchingEvents.some(event => event.id === override);
    if (matchingEvents.length >= 2 && !overrideIsDay && !validOverride) {
      conflicts.push({
        tripId: sourceTrip.id,
        eventIds: matchingEvents.map(event => event.id),
      });
    }

    const chosenEvent = validOverride
      ? matchingEvents.find(event => event.id === override)
      : overrideIsDay
        ? undefined
        : matchingEvents[0];
    const dateKey = localTripDateKey(sourceTrip)!;
    const chapterId = chosenEvent ? `event:${chosenEvent.id}` : `day:${dateKey}`;
    const chapterTitle = chosenEvent?.title ?? neutralDayTitle(dateKey);

    const keptPhotos: TripPhoto[] = [];
    for (const photo of sourceTrip.photos ?? []) {
      const key = photoKey(sourceTrip.id, photo);
      if (typeof photo.uri !== 'string' || photo.uri.trim().length === 0 ||
          excludedPhotos.has(key)) {
        omittedPhotoCount++;
        continue;
      }
      const uriDuplicate = seenPhotoUris.has(photo.uri);
      const idDuplicate = typeof photo.id === 'string' && photo.id.length > 0 &&
        seenPhotoIds.has(photo.id);
      if (uriDuplicate || idDuplicate) {
        omittedPhotoCount++;
        continue;
      }
      seenPhotoUris.add(photo.uri);
      if (typeof photo.id === 'string' && photo.id.length > 0) seenPhotoIds.add(photo.id);
      const copy = copiedPhoto(sourceTrip, photo);
      if (Object.prototype.hasOwnProperty.call(safeChoices.photoCaptions, key)) {
        copy.note = safeChoices.photoCaptions[key]?.trim() || undefined;
      }
      keptPhotos.push(copy);
      photoCount++;
    }

    const trip = cloneTrip(sourceTrip, keptPhotos);
    let chapter = chaptersById.get(chapterId);
    if (!chapter) {
      chapter = {
        id: chapterId,
        title: chapterTitle,
        ...(chosenEvent ? { eventId: chosenEvent.id } : {}),
        trips: [],
        startTime: sourceTrip.startTime,
        endTime: sourceTrip.endTime,
      };
      chaptersById.set(chapterId, chapter);
    }
    chapter.trips.push(trip);
    chapter.startTime = Math.min(chapter.startTime, trip.startTime);
    chapter.endTime = Math.max(chapter.endTime, trip.endTime);
  }

  const chapters = Array.from(chaptersById.values());
  for (const chapter of chapters) chapter.trips.sort(compareTrips);
  chapters.sort(compareChapter);

  return {
    title: monthStoryTitle(from, to),
    chapters,
    // Chapter order is meaningful to the renderer.  Do not re-sort this
    // flattened list globally: an event can contain trips before and after a
    // neutral day chapter and must remain one contiguous chapter in the video.
    trips: chapters.flatMap(chapter => chapter.trips),
    conflicts,
    unavailableTrips,
    photoCount,
    omittedPhotoCount,
  };
}

function routeDurationSec(trip: Trip): number {
  const durationMs = trip.endTime - trip.startTime;
  if (Number.isFinite(durationMs) && durationMs >= 0) {
    // The cursor speed is tied to elapsed trip time, not distance: a one-hour
    // walk and a one-hour drive each receive three seconds in Auto.
    return Math.max(1, (durationMs / 3_600_000) * STORY_SEC_PER_TRIP_HOUR);
  }
  return STORY_SEC_PER_TRIP_HOUR;
}

/**
 * Allocate animation time. Auto keeps every route readable. A requested
 * duration is a target for the complete video, including photo pauses; the
 * short modes deliberately accelerate routes to fit that target.
 */
export function getStoryTiming(
  chapters: PeriodStoryChapter[],
  requestedTotalSec?: number,
): StoryTiming {
  const safeChapters = Array.isArray(chapters) ? chapters : [];
  const automaticDurations = safeChapters.map(chapter => Math.max(
    3,
    chapter.trips.reduce((sum, trip) => sum + routeDurationSec(trip), 0),
  ));
  const automaticBase = automaticDurations.reduce((sum, duration) => sum + duration, 0);
  const photoCount = safeChapters.reduce(
    (sum, chapter) => sum + chapter.trips.reduce(
      (tripSum, trip) => tripSum + (trip.photos?.length ?? 0),
      0,
    ),
    0,
  );
  const automaticPhotoPauseSec = photoCount * PHOTO_PAUSE_SEC;
  const hasRequestedTotal = Number.isFinite(requestedTotalSec) && (requestedTotalSec ?? 0) > 0;
  let photoPausePerPhotoSec = PHOTO_PAUSE_SEC;
  let baseDurationSec = OPENING_SEC + RECAP_SEC + automaticBase;
  if (hasRequestedTotal) {
    const targetTotalSec = Math.max(OPENING_SEC + RECAP_SEC, Math.ceil(requestedTotalSec!));
    // Preserve a minimal animation window even if an unusually large number
    // of photos is selected for a short export. The normal 1/2 min case keeps
    // the full two-second pause for every photo.
    const minimumAnimationSec = safeChapters.length > 0 ? 1 : 0;
    const availableForPhotoPauses = Math.max(
      0,
      targetTotalSec - OPENING_SEC - RECAP_SEC - minimumAnimationSec,
    );
    photoPausePerPhotoSec = photoCount > 0
      ? Math.min(PHOTO_PAUSE_SEC, availableForPhotoPauses / photoCount)
      : PHOTO_PAUSE_SEC;
    baseDurationSec = safeChapters.length === 0
      ? OPENING_SEC + RECAP_SEC
      : Math.max(
        OPENING_SEC + RECAP_SEC + minimumAnimationSec,
        targetTotalSec - photoCount * photoPausePerPhotoSec,
      );
  }
  baseDurationSec = Math.ceil(baseDurationSec);
  const targetAnimationSec = Math.max(0, baseDurationSec - OPENING_SEC - RECAP_SEC);
  const scale = automaticBase > 0 ? targetAnimationSec / automaticBase : 0;

  const timingChapters: StoryTimingChapter[] = safeChapters.map((chapter, index) => ({
    id: chapter.id,
    title: chapter.title,
    tripIds: chapter.trips.map(trip => trip.id),
    durationSec: automaticDurations[index]! * scale,
  }));
  // Correct floating point residue on the final chapter.  This guarantees
  // that chapter animation time is exactly baseDurationSec - 6 seconds,
  // including for a requested duration that had to be rounded up.
  if (timingChapters.length > 0) {
    const allocated = timingChapters
      .slice(0, -1)
      .reduce((sum, chapter) => sum + chapter.durationSec, 0);
    timingChapters[timingChapters.length - 1]!.durationSec =
      Math.max(0, targetAnimationSec - allocated);
  }
  const photoPauseSec = hasRequestedTotal
    ? photoCount * photoPausePerPhotoSec
    : automaticPhotoPauseSec;

  return {
    baseDurationSec,
    photoPauseSec,
    photoPausePerPhotoSec,
    totalDurationSec: baseDurationSec + photoPauseSec,
    openingSec: OPENING_SEC,
    recapSec: RECAP_SEC,
    chapters: timingChapters,
  };
}
