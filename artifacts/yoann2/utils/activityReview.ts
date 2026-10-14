import type { ActivityFeeling, ActivityKind, ActivityMoment, Trip, TripPhoto } from '@/types/trips';

export interface MomentDraft extends ActivityMoment { photo?: TripPhoto }
export interface ActivityReviewDraft {
  kind: ActivityKind;
  participants: string[];
  title: string;
  feeling?: ActivityFeeling;
  favorite: boolean;
  note: string;
  moments: MomentDraft[];
  originalPhotoIds: string[];
}

export const ACTIVITY_FEELINGS = [
  { key: 'relaxed', label: 'Tranquille' },
  { key: 'sporty', label: 'Sportif' },
  { key: 'hard', label: 'Difficile' },
] as const;

/** Replace only photos owned by edited moments, never unrelated gallery attachments. */
export function activityReviewPatch(current: Trip, draft: ActivityReviewDraft): Partial<Trip> {
  const ownedIds = new Set([...draft.originalPhotoIds, ...draft.moments.flatMap(moment => moment.photo ? [moment.photo.id] : [])]);
  const photos = (current.photos ?? []).filter(photo => !ownedIds.has(photo.id));
  const moments = draft.moments.map(({ photo, ...moment }) => {
    if (photo) photos.push({ ...photo, note: moment.note || undefined, routeIndex: moment.routeIndex });
    return { ...moment, photoId: photo?.id };
  });
  return {
    activityType: draft.kind, walkParticipants: [...draft.participants],
    activityTitle: draft.title.trim() || undefined, activityFeeling: draft.feeling,
    activityFavorite: draft.favorite, note: draft.note.trim() || undefined,
    activityMoments: moments, photos, activityReview: 'completed',
  };
}
