/**
 * audioSession.ts — Notification de trajet via expo-video MediaSession.
 *
 * On joue un fichier silence.mp3 en boucle via expo-video pour maintenir
 * une MediaSession Android active. La notification MediaSession est :
 *   - Non-swipeable tant que la lecture est active (garantie Android).
 *   - Immédiate (apparaît dès play()).
 *   - Personnalisable : title = "Trajet · X.XX km", artist = "MM:SS".
 *
 * Le player est un singleton : il est créé à startAudioSession() et
 * libéré à stopAudioSession(). updateAudioSession() patche les métadonnées
 * en appelant replace() sur la source locale (quasi-instantané).
 */

import { createVideoPlayer } from 'expo-video';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SILENCE_ASSET: number = require('../assets/silence.mp3');

type VideoPlayerInstance = ReturnType<typeof createVideoPlayer>;

let _player: VideoPlayerInstance | null = null;
let _lastUpdateTs = 0;
const UPDATE_THROTTLE_MS = 15_000;

function buildSource(title: string, artist: string) {
  return { assetId: SILENCE_ASSET, metadata: { title, artist } };
}

function getOrCreatePlayer(title: string, artist: string): VideoPlayerInstance {
  if (_player) return _player;
  _player = createVideoPlayer(buildSource(title, artist));
  _player.loop = true;
  _player.showNowPlayingNotification = true;
  _player.staysActiveInBackground = true;
  _player.audioMixingMode = 'auto';
  _player.volume = 0.1;
  return _player;
}

/**
 * Démarre la session audio et affiche la notification MediaSession.
 * Crée le player si besoin, puis joue immédiatement.
 */
export function startAudioSession(title: string, artist: string): void {
  const p = getOrCreatePlayer(title, artist);
  p.replace(buildSource(title, artist));
  p.play();
  _lastUpdateTs = Date.now();
}

/**
 * Met à jour les métadonnées de la notification (throttlé à 15 s).
 * force=true pour les transitions importantes (pause, reprise).
 * No-op si la session n'est pas active.
 */
export function updateAudioSession(title: string, artist: string, force = false): void {
  if (!_player) return;
  const now = Date.now();
  if (!force && now - _lastUpdateTs < UPDATE_THROTTLE_MS) return;
  _player.replace(buildSource(title, artist));
  if (!_player.playing) _player.play();
  _lastUpdateTs = now;
}

/**
 * Arrête la session audio et libère le player natif.
 */
export function stopAudioSession(): void {
  if (!_player) return;
  _player.pause();
  _player.release();
  _player = null;
  _lastUpdateTs = 0;
}
