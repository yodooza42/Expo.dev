/** Shared weights are serialized into the WebView, never native function source. */
export const JOURNAL_PHOTO_TIMING = {
  minimum: 1, base: 0.8, word: 0.1, character: 0.035, pause: 0.12, normalPace: 4.5,
};

/** A local reading-time estimate, not a semantic analysis of the sentence. */
export function journalPhotoDuration(caption: string, secondsPerPhoto = 4.5): number {
  const weights = JOURNAL_PHOTO_TIMING;
  const text = (caption || '').trim();
  if (!text) return weights.minimum;
  const words = text.split(/\s+/u).length;
  const characters = (text.match(/[\p{L}\p{N}]/gu) || []).length;
  const pauses = (text.match(/[,;:.!?…]/gu) || []).length;
  const pace = Number.isFinite(secondsPerPhoto) && secondsPerPhoto > 0 ? secondsPerPhoto / weights.normalPace : 1;
  const seconds = (weights.base + words * weights.word + characters * weights.character + pauses * weights.pause) * pace;
  return Math.max(weights.minimum, Math.round(seconds * 10) / 10);
}
