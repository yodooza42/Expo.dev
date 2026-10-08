type StoryTimelinePoint = {
  km: number;
  ms: number;
};

type StationaryInterval = {
  startMs: number;
  endMs: number;
};

const MIN_STATIONARY_DURATION_MS = 5 * 60_000;
const MAX_STATIONARY_SPEED_KMH = 1;
const STORY_STATIONARY_DURATION_MS = 1_000;

/**
 * Add a story-only time axis that caps long periods with almost no distance
 * progress. The original elapsed time and distance remain untouched.
 */
export function compressStoryStationaryTime<T extends StoryTimelinePoint>(
  points: readonly T[],
): Array<T & { storyMs: number }> {
  const identityTimeline = () => points.map(point => ({ ...point, storyMs: point.ms }));
  if (points.length < 2) return identityTimeline();

  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    if (!Number.isFinite(point.km) || !Number.isFinite(point.ms)) return identityTimeline();
    if (i > 0 && point.ms < points[i - 1]!.ms) return identityTimeline();
  }

  const stationaryIntervals: StationaryInterval[] = [];
  let stationaryStartIndex: number | null = null;

  const finishStationaryInterval = (endIndex: number) => {
    if (stationaryStartIndex == null || endIndex <= stationaryStartIndex) return;

    const start = points[stationaryStartIndex]!;
    const end = points[endIndex]!;
    const durationMs = end.ms - start.ms;
    const distanceKm = end.km - start.km;
    const averageSpeedKmh = durationMs > 0
      ? (distanceKm * 3_600_000) / durationMs
      : Number.POSITIVE_INFINITY;

    if (
      durationMs >= MIN_STATIONARY_DURATION_MS
      && distanceKm >= 0
      && averageSpeedKmh <= MAX_STATIONARY_SPEED_KMH
    ) {
      stationaryIntervals.push({ startMs: start.ms, endMs: end.ms });
    }
  };

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]!;
    const current = points[i]!;
    const durationMs = current.ms - previous.ms;
    const distanceKm = current.km - previous.km;
    const intervalSpeedKmh = durationMs > 0
      ? (distanceKm * 3_600_000) / durationMs
      : Number.POSITIVE_INFINITY;
    const nearlyStationary = durationMs > 0
      && distanceKm >= 0
      && intervalSpeedKmh <= MAX_STATIONARY_SPEED_KMH;

    if (nearlyStationary) {
      if (stationaryStartIndex == null) stationaryStartIndex = i - 1;
      continue;
    }

    finishStationaryInterval(i - 1);
    stationaryStartIndex = null;
  }
  finishStationaryInterval(points.length - 1);

  if (stationaryIntervals.length === 0) return identityTimeline();

  let intervalIndex = 0;
  let removedMs = 0;
  return points.map(point => {
    while (
      intervalIndex < stationaryIntervals.length
      && point.ms >= stationaryIntervals[intervalIndex]!.endMs
    ) {
      const interval = stationaryIntervals[intervalIndex]!;
      removedMs += (interval.endMs - interval.startMs) - STORY_STATIONARY_DURATION_MS;
      intervalIndex++;
    }

    const interval = stationaryIntervals[intervalIndex];
    if (interval && point.ms > interval.startMs && point.ms < interval.endMs) {
      const intervalDuration = interval.endMs - interval.startMs;
      const progress = (point.ms - interval.startMs) / intervalDuration;
      const compressedStart = interval.startMs - removedMs;
      return {
        ...point,
        storyMs: compressedStart + progress * STORY_STATIONARY_DURATION_MS,
      };
    }

    return { ...point, storyMs: point.ms - removedMs };
  });
}
