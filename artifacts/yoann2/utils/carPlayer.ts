/**
 * carPlayer.ts — Lecteur audio voiture (singleton).
 *
 * Joue de vraies pistes audio via expo-video.
 * showNowPlayingNotification = true → notification MediaSession Android
 * non-swipeable tant que la lecture est active (comportement OS garanti
 * pour du contenu audio réel, contrairement au silence).
 *
 * Architecture : singleton module-level (accessible depuis les tâches
 * background et les composants React via useCarPlayer hook).
 */

import { createVideoPlayer } from 'expo-video';

import type { Track } from '@/utils/playlistStorage';

type VideoPlayerInstance = ReturnType<typeof createVideoPlayer>;

export type CarPlayerState = {
  tracks: Track[];
  currentIndex: number;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
};

let _player: VideoPlayerInstance | null = null;
let _state: CarPlayerState = {
  tracks: [],
  currentIndex: 0,
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
};
const _listeners = new Set<() => void>();

// Statut GPS courant : modifie l'artiste affiché dans la notification MediaSession.
let _tripActive = false;

function notify(): void {
  _listeners.forEach(fn => fn());
}

function buildSource(track: Track) {
  return {
    uri: track.uri,
    metadata: {
      title: track.name,
      artist: _tripActive ? '🚗 GPS actif — Yoann2.0' : 'Yoann2.0',
    },
  };
}

/** Met à jour l'artiste affiché dans la notification MediaSession selon l'état du trajet GPS. */
function patchPlayerMetadata(): void {
  if (!_player) return;
  const track = _state.tracks[_state.currentIndex];
  if (!track) return;
  try {
    // expo-video expose `metadata` en tant que setter direct sur le player.
    (_player as any).metadata = {
      title: track.name,
      artist: _tripActive ? '🚗 GPS actif — Yoann2.0' : 'Yoann2.0',
    };
  } catch {}
}

function releasePlayer(): void {
  if (_player) {
    try { _player.pause(); } catch {}
    try { _player.release(); } catch {}
    _player = null;
  }
}

function attachListeners(p: VideoPlayerInstance): void {
  p.addListener('timeUpdate', ({ currentTime }) => {
    _state = {
      ..._state,
      positionMs: Math.round(currentTime * 1000),
      durationMs: Math.round(((_player?.duration) ?? 0) * 1000),
    };
    notify();
  });

  p.addListener('playingChange', ({ isPlaying }) => {
    _state = { ..._state, isPlaying };
    notify();

    if (!isPlaying) {
      const dur = _player?.duration ?? 0;
      const pos = _player?.currentTime ?? 0;
      if (dur > 0.5 && Math.abs(pos - dur) < 1.0) {
        const next = _state.currentIndex + 1;
        if (next < _state.tracks.length) {
          goToIndex(next);
        }
      }
    }
  });
}

function goToIndex(index: number): void {
  const track = _state.tracks[index];
  if (!track) return;

  releasePlayer();
  const p = createVideoPlayer(buildSource(track));
  p.loop = false;
  p.showNowPlayingNotification = true;
  p.staysActiveInBackground = true;
  p.volume = 1.0;
  attachListeners(p);
  _player = p;

  _state = {
    ..._state,
    currentIndex: index,
    isPlaying: true,
    positionMs: 0,
    durationMs: 0,
  };
  p.play();
  notify();
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

export function getCarPlayerState(): CarPlayerState {
  return _state;
}

export function getCarPlayer(): VideoPlayerInstance | null {
  return _player;
}

/** Charge une playlist et démarre la piste à l'index donné. */
export function startCarPlaylist(tracks: Track[], index = 0): void {
  if (!tracks.length) return;
  _state = { ..._state, tracks };
  goToIndex(index);
}

/** Met à jour la playlist sans interrompre la lecture en cours. */
export function setCarPlaylist(tracks: Track[]): void {
  _state = { ..._state, tracks };
  notify();
}

export function pauseCarPlayer(): void {
  _player?.pause();
  _state = { ..._state, isPlaying: false };
  notify();
}

export function resumeCarPlayer(): void {
  if (!_player) {
    if (_state.tracks.length) goToIndex(_state.currentIndex);
    return;
  }
  _player.play();
  _state = { ..._state, isPlaying: true };
  notify();
}

export function nextTrack(): void {
  const next = _state.currentIndex + 1;
  if (next < _state.tracks.length) goToIndex(next);
}

export function prevTrack(): void {
  if ((_player?.currentTime ?? 0) > 3) {
    _player?.seekBy(-(_player?.currentTime ?? 0));
    return;
  }
  const prev = _state.currentIndex - 1;
  if (prev >= 0) goToIndex(prev);
}

export function stopCarPlayer(): void {
  releasePlayer();
  _state = { ..._state, isPlaying: false, positionMs: 0 };
  notify();
}

/**
 * Signale l'état du trajet GPS au player.
 * Met à jour l'artiste affiché dans la notification MediaSession (non-swipeable).
 * active=true  → "🚗 GPS actif — Yoann2.0"
 * active=false → "Yoann2.0"
 */
export function setTripStatus(active: boolean): void {
  _tripActive = active;
  patchPlayerMetadata();
}

export function jumpToTrack(index: number): void {
  if (index >= 0 && index < _state.tracks.length) goToIndex(index);
}
