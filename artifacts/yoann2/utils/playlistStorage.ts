import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export type Track = {
  id: string;
  name: string;
  uri: string;
  durationMs?: number;
};

const PLAYLIST_KEY = '@yoann2_car_playlist';
const PLAYLIST_DIR = (FileSystem.documentDirectory ?? '') + 'playlist/';

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PLAYLIST_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PLAYLIST_DIR, { intermediates: true });
  }
}

export async function loadPlaylist(): Promise<Track[]> {
  try {
    const raw = await AsyncStorage.getItem(PLAYLIST_KEY);
    if (!raw) return [];
    const tracks: Track[] = JSON.parse(raw);
    const verified: Track[] = [];
    for (const t of tracks) {
      const info = await FileSystem.getInfoAsync(t.uri).catch(() => ({ exists: false }));
      if (info.exists) verified.push(t);
    }
    if (verified.length !== tracks.length) {
      await AsyncStorage.setItem(PLAYLIST_KEY, JSON.stringify(verified));
    }
    return verified;
  } catch {
    return [];
  }
}

export async function savePlaylist(tracks: Track[]): Promise<void> {
  await AsyncStorage.setItem(PLAYLIST_KEY, JSON.stringify(tracks));
}

export async function importTrack(sourceUri: string, displayName: string): Promise<Track> {
  await ensureDir();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const ext = displayName.includes('.') ? displayName.split('.').pop()!.toLowerCase() : 'mp3';
  const destUri = PLAYLIST_DIR + id + '.' + ext;
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  const name = displayName.replace(/\.[^.]+$/, '');
  return { id, name, uri: destUri };
}

export async function deleteTrackFile(track: Track): Promise<void> {
  try {
    await FileSystem.deleteAsync(track.uri, { idempotent: true });
  } catch {}
}
