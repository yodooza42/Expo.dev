import type { Trip, TripPhoto } from '@/types/trips';

/**
 * A family event is deliberately date-only.  The dates are local calendar
 * dates, rather than ISO instants, so an event remains on the same day when
 * it is opened after a DST or timezone change.
 */
export interface FamilyEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  includedTripIds: string[];
  excludedTripIds: string[];
}

/**
 * Choices are the small, serialisable part of a draft.  Photo keys refer to
 * gallery metadata only; a draft never stores image bytes.
 */
export interface StoryDraftChoices {
  excludedTripIds: string[];
  excludedPhotoKeys: string[];
  /** Story-only captions keyed by photoKey; an empty value hides the original photo note. */
  photoCaptions: Record<string, string>;
  /** A value is a FamilyEvent id, or "day" for a neutral local-day chapter. */
  tripChapterOverrides: Record<string, string>;
}

export interface PeriodStoryChapter {
  id: string;
  title: string;
  eventId?: string;
  trips: Trip[];
  startTime: number;
  endTime: number;
}

export interface PeriodStoryConflict {
  tripId: string;
  eventIds: string[];
}

export interface PeriodStoryDraft {
  title: string;
  chapters: PeriodStoryChapter[];
  trips: Trip[];
  conflicts: PeriodStoryConflict[];
  unavailableTrips: Trip[];
  photoCount: number;
  omittedPhotoCount: number;
}

export interface StoryTimingChapter {
  id: string;
  title: string;
  tripIds: string[];
  durationSec: number;
}

export interface StoryTiming {
  /** Base video duration, including the opening and recap but excluding photo pauses. */
  baseDurationSec: number;
  /** Total time spent on photo pauses. */
  photoPauseSec: number;
  /** Pause duration used for each included photo. */
  photoPausePerPhotoSec: number;
  totalDurationSec: number;
  openingSec: number;
  recapSec: number;
  chapters: StoryTimingChapter[];
}

export type StoryPhoto = TripPhoto;