/**
 * Pure helpers for the Yoann2.0 folder layout. No I/O here so the rules stay
 * identical on every device: only paths relative to the Yoann2.0 folder are
 * ever stored in app data or in backups.
 */

export const LIBRARY_FOLDER_NAME = 'Yoann2.0';
export const PHOTOS_DIR = 'Photos';
export const TRASH_DIR = 'Corbeille';
export const CATALOGUE_DIR = 'Catalogue';
export const BACKUPS_DIR = 'Sauvegardes';
export const JOURNAL_DIR = 'Journal';
export const MARKER_FILE = 'yoann2.json';

/** Stable photo reference stored in projects, tasks and trips. */
export const PHOTO_REF_PREFIX = 'y2p:';

export function isLibraryRef(uri: string | undefined | null): boolean {
  return typeof uri === 'string' && uri.startsWith(PHOTO_REF_PREFIX);
}

export function refId(ref: string): string {
  return ref.slice(PHOTO_REF_PREFIX.length);
}

export function makeRef(id: string): string {
  return PHOTO_REF_PREFIX + id;
}

/** Folder or file name safe for Android shared storage and for a PC copy. */
export function safeName(name: string | undefined | null, fallback = 'Sans nom'): string {
  const cleaned = (name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 60)
    .trim();
  return cleaned || fallback;
}

export function joinRel(...parts: string[]): string {
  return parts.filter(Boolean).join('/');
}

export function relDir(rel: string): string {
  const index = rel.lastIndexOf('/');
  return index === -1 ? '' : rel.slice(0, index);
}

export function relName(rel: string): string {
  return rel.slice(rel.lastIndexOf('/') + 1);
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Local date/time stamp: AAAA-MM-JJ_HH-MM-SS. */
export function fileStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export function photoFileName(id: string, takenAtOrImport: number, extension: string): string {
  return `${fileStamp(takenAtOrImport)}_${id}.${extension}`;
}

/** Recover the stable photo id from a file name produced by `photoFileName`. */
export function idFromPhotoFileName(name: string): string | null {
  const match = name.match(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_([a-z0-9]+)\.[a-z0-9]+$/i);
  return match ? match[1]! : null;
}

export function monthStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** "JJ HHhMM - titre" for a trip folder. */
export function tripFolderName(startTime: number, title: string | undefined): string {
  const d = new Date(startTime);
  return safeName(`${pad(d.getDate())} ${pad(d.getHours())}h${pad(d.getMinutes())} - ${safeName(title, 'Trajet')}`);
}

export type ImageKind = { extension: string; mime: string };

/** Detect the real image type from its first bytes (content:// URIs have no extension). */
export function imageKindFromHeader(bytes: Uint8Array): ImageKind | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { extension: 'jpg', mime: 'image/jpeg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { extension: 'png', mime: 'image/png' };
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return { extension: 'gif', mime: 'image/gif' };
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return { extension: 'webp', mime: 'image/webp' };
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4).toLowerCase();
    if (brand.startsWith('avif')) return { extension: 'avif', mime: 'image/avif' };
    if (brand === 'mif1' || brand === 'msf1' || brand === 'heif') return { extension: 'heif', mime: 'image/heif' };
    return { extension: 'heic', mime: 'image/heic' };
  }
  return null;
}
