export type AlbumPhoto = {
  id: string;
  uri: string;
  takenAt?: number;
  addedAt: number;
};

export type AlbumMemory = {
  id: string;
  title: string;
  date: string;
  note: string;
  photoIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type LifeAlbum = {
  version: 1;
  profile: {
    name: string;
    birthDate: string | null;
    coverPhotoId: string | null;
  };
  photos: AlbumPhoto[];
  memories: AlbumMemory[];
};

export function emptyLifeAlbum(): LifeAlbum {
  return {
    version: 1,
    profile: { name: '', birthDate: null, coverPhotoId: null },
    photos: [],
    memories: [],
  };
}

export function isAlbumDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);
  return date.getFullYear() === year && date.getMonth() === month! - 1 && date.getDate() === day;
}

export function albumDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function albumAgeAt(birthDate: string | null, date: string): string | null {
  if (!birthDate || !isAlbumDate(birthDate) || !isAlbumDate(date) || date < birthDate) return null;
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
  const [year, month, day] = date.split('-').map(Number);
  let years = year! - birthYear!;
  if (month! < birthMonth! || (month === birthMonth && day! < birthDay!)) years--;
  if (years > 0) return `${years} ${years === 1 ? 'an' : 'ans'}`;

  let months = (year! - birthYear!) * 12 + month! - birthMonth!;
  if (day! < birthDay!) months--;
  if (months > 0) return `${months} mois`;
  const birth = new Date(birthYear!, birthMonth! - 1, birthDay!);
  const event = new Date(year!, month! - 1, day!);
  const days = Math.max(0, Math.round((event.getTime() - birth.getTime()) / 86_400_000));
  return `${days} ${days === 1 ? 'jour' : 'jours'}`;
}

export function chronologicalMemories(album: LifeAlbum): AlbumMemory[] {
  return [...album.memories].sort((a, b) =>
    a.date.localeCompare(b.date) || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
}

export function unassignedAlbumPhotos(album: LifeAlbum): AlbumPhoto[] {
  const assigned = new Set(album.memories.flatMap(memory => memory.photoIds));
  return album.photos.filter(photo => !assigned.has(photo.id));
}

export function makeAlbumId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function isLifeAlbum(value: unknown): value is LifeAlbum {
  if (!value || typeof value !== 'object') return false;
  const album = value as Partial<LifeAlbum>;
  if (album.version !== 1 || !album.profile || typeof album.profile.name !== 'string'
    || !(album.profile.birthDate === null || (typeof album.profile.birthDate === 'string' && isAlbumDate(album.profile.birthDate)))
    || !(album.profile.coverPhotoId === null || typeof album.profile.coverPhotoId === 'string')
    || !Array.isArray(album.photos) || !Array.isArray(album.memories)) return false;
  const photosValid = album.photos.every(photo => photo && typeof photo.id === 'string'
    && typeof photo.uri === 'string' && typeof photo.addedAt === 'number'
    && (photo.takenAt === undefined || typeof photo.takenAt === 'number'));
  const memoriesValid = album.memories.every(memory => memory && typeof memory.id === 'string'
    && typeof memory.title === 'string' && isAlbumDate(memory.date) && typeof memory.note === 'string'
    && Array.isArray(memory.photoIds) && memory.photoIds.every(id => typeof id === 'string')
    && typeof memory.createdAt === 'number' && typeof memory.updatedAt === 'number');
  return photosValid && memoriesValid;
}
