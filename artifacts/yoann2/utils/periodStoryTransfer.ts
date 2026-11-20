/** A small, ordered buffer: the video is written to disk, never joined in JS memory. */
export type StoryVideoChunk = {
  index: number;
  /** Older renderers know this up front; journal streaming announces it at the end. */
  total?: number;
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
  readonly mime: 'video/mp4' | 'video/webm';
  private next = 0;
  private expectedTotal: number | null;
  private byteCount = 0;
  private pending = new Map<number, Uint8Array>();

  constructor(
    first: StoryVideoChunk,
    private write: (bytes: Uint8Array) => void,
    private maxBytes = Number.POSITIVE_INFINITY,
  ) {
    const totalIsValid = first.total === undefined ||
      (Number.isInteger(first.total) && first.total >= 1 && first.total <= 100_000);
    if (!totalIsValid ||
        !['video/mp4', 'video/webm'].includes(first.mime)) {
      throw new Error('Format vidéo invalide.');
    }
    this.expectedTotal = first.total ?? null;
    this.mime = first.mime as 'video/mp4' | 'video/webm';
  }

  get written(): number { return this.next; }
  get total(): number | null { return this.expectedTotal; }
  get writtenBytes(): number { return this.byteCount; }
  get complete(): boolean { return this.expectedTotal !== null && this.next === this.expectedTotal; }

  /** Returns false for a duplicate: duplicates must not reset the watchdog. */
  accept(chunk: StoryVideoChunk): boolean {
    if ((this.expectedTotal !== null && chunk.total !== this.expectedTotal) ||
        (this.expectedTotal === null && chunk.total !== undefined) || chunk.mime !== this.mime ||
        !Number.isInteger(chunk.index) || chunk.index < 0 ||
        (this.expectedTotal !== null && chunk.index >= this.expectedTotal) ||
        typeof chunk.data !== 'string') {
      throw new Error('Transfert vidéo incohérent.');
    }
    if (chunk.index < this.next || this.pending.has(chunk.index)) return false;
    if (this.expectedTotal === null && chunk.index !== this.next) {
      throw new Error('Des fragments de la vidéo sont manquants.');
    }
    if (this.pending.size >= 8 && chunk.index !== this.next) {
      throw new Error('Des fragments de la vidéo sont manquants.');
    }
    this.pending.set(chunk.index, decodeStoryChunk(chunk.data));
    while (this.pending.has(this.next)) {
      const bytes = this.pending.get(this.next)!;
      if (this.byteCount + bytes.byteLength > this.maxBytes) {
        throw new Error('La vidéo dépasse 96 Mo. Réduisez le nombre de photos ou la durée.');
      }
      this.write(bytes);
      this.byteCount += bytes.byteLength;
      this.pending.delete(this.next++);
    }
    return true;
  }

  /** Final metadata closes a streaming transfer whose chunk count was unknown. */
  finish(total: number, bytes: number): void {
    if (!Number.isInteger(total) || total < 1 || total > 100_000 ||
        !Number.isSafeInteger(bytes) || bytes < 1 || bytes > this.maxBytes) {
      if (bytes > this.maxBytes) {
        throw new Error('La vidéo dépasse 96 Mo. Réduisez le nombre de photos ou la durée.');
      }
      throw new Error('Transfert vidéo incomplet.');
    }
    if (this.expectedTotal !== null && this.expectedTotal !== total) {
      throw new Error('Transfert vidéo incomplet.');
    }
    if (this.next !== total || this.pending.size !== 0 || this.byteCount !== bytes) {
      throw new Error('Transfert vidéo incomplet.');
    }
    this.expectedTotal = total;
  }

  clear(): void { this.pending.clear(); }
}