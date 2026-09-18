/** A small, ordered buffer: the video is written to disk, never joined in JS memory. */
export type StoryVideoChunk = {
  index: number;
  total: number;
  mime: string;
  data: string;
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function decodeStoryChunk(data: string): Uint8Array {
  if (!data.length || data.length > 200_000 || data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error('Fragment vidéo invalide.');
  }
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array(data.length / 4 * 3 - padding);
  let at = 0;
  for (let i = 0; i < data.length; i += 4) {
    const bits = (ALPHABET.indexOf(data[i]) << 18) |
      (ALPHABET.indexOf(data[i + 1]) << 12) |
      ((data[i + 2] === '=' ? 0 : ALPHABET.indexOf(data[i + 2])) << 6) |
      (data[i + 3] === '=' ? 0 : ALPHABET.indexOf(data[i + 3]));
    if (at < bytes.length) bytes[at++] = (bits >> 16) & 255;
    if (at < bytes.length) bytes[at++] = (bits >> 8) & 255;
    if (at < bytes.length) bytes[at++] = bits & 255;
  }
  return bytes;
}

export class PeriodStoryTransfer {
  readonly total: number;
  readonly mime: 'video/mp4' | 'video/webm';
  private next = 0;
  private pending = new Map<number, Uint8Array>();

  constructor(first: StoryVideoChunk, private write: (bytes: Uint8Array) => void) {
    if (!Number.isInteger(first.total) || first.total < 1 || first.total > 100_000 ||
        !['video/mp4', 'video/webm'].includes(first.mime)) {
      throw new Error('Format vidéo invalide.');
    }
    this.total = first.total;
    this.mime = first.mime as 'video/mp4' | 'video/webm';
  }

  get written(): number { return this.next; }
  get complete(): boolean { return this.next === this.total; }

  /** Returns false for a duplicate: duplicates must not reset the watchdog. */
  accept(chunk: StoryVideoChunk): boolean {
    if (chunk.total !== this.total || chunk.mime !== this.mime ||
        !Number.isInteger(chunk.index) || chunk.index < 0 || chunk.index >= this.total ||
        typeof chunk.data !== 'string') {
      throw new Error('Transfert vidéo incohérent.');
    }
    if (chunk.index < this.next || this.pending.has(chunk.index)) return false;
    if (this.pending.size >= 8 && chunk.index !== this.next) {
      throw new Error('Des fragments de la vidéo sont manquants.');
    }
    this.pending.set(chunk.index, decodeStoryChunk(chunk.data));
    while (this.pending.has(this.next)) {
      const bytes = this.pending.get(this.next)!;
      this.write(bytes);
      this.pending.delete(this.next++);
    }
    return true;
  }

  clear(): void { this.pending.clear(); }
}