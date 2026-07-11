/**
 * Session de trajet via react-native-track-player.
 *
 * Objectif : notification non-swipeable façon Spotify sur One UI / Android 14+.
 *
 * Mécanisme : une MediaSession Android en état STATE_PLAYING (ExoPlayer +
 * MediaStyle) empêche le swipe côté OS — exactement comme Spotify.
 * Le simple flag ongoing:true d'une notification classique ne suffit plus
 * sur Samsung One UI / Android 14+ (Google a retiré cette protection).
 *
 * Focus audio : DÉSACTIVÉ volontairement.
 * autoHandleInterruptions: false dans setupPlayer() mappe directement sur
 * handleAudioFocus=false dans ExoPlayer (MusicService.kt ligne 146) → on ne
 * demande JAMAIS requestAudioFocus. Spotify continue à plein volume, aucun
 * duck/pause provoqué par notre app.
 *
 * Ghost audio : sinusoïde 220 Hz à ~2.4 % d'amplitude, jouée en boucle à
 * 1 % du volume app. Totalement inaudible, mais non-silencieux : One UI ne
 * coupe pas les flux à 0 dB comme "optimisation batterie".
 *
 * Architecture FGS :
 *  - expo-location → FGS de type LOCATION (GPS, notification minimale)
 *  - RNTP MusicService → FGS de type MEDIA_PLAYBACK (MediaSession, notification
 *    MediaStyle non-swipeable)
 */

import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RepeatMode,
} from 'react-native-track-player';

import type { TripAudioPreset } from '@/widgets/widgetSettings';
import { getWidgetSettings } from '@/widgets/widgetSettings';

// ResourceObject = number dans RNTP 4.x (retour de require())
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AUDIO_FILES: Record<TripAudioPreset, number> = {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  sine_220: require('../assets/audio/trip_ghost.wav'),
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  sine_440: require('../assets/audio/trip_ghost_440.wav'),
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  sine_110: require('../assets/audio/trip_ghost_110.wav'),
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  noise:    require('../assets/audio/trip_ghost_noise.wav'),
};

export const TRIP_AUDIO_OPTIONS: { id: TripAudioPreset; label: string; hint: string }[] = [
  { id: 'sine_220', label: '220 Hz',       hint: 'Sinusoïde grave (défaut)' },
  { id: 'sine_110', label: '110 Hz',       hint: 'Sinusoïde très grave' },
  { id: 'sine_440', label: '440 Hz',       hint: 'Sinusoïde médium (La)' },
  { id: 'noise',    label: 'Bruit blanc',  hint: 'Variante si les sinus échouent' },
];
const UPDATE_THROTTLE_MS = 15_000;

let _initialized = false;
let _isRunning   = false;
let _lastUpdateTs = 0;

async function initPlayer(): Promise<void> {
  if (_initialized) return;
  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: false,
      autoUpdateMetadata:      true,
      minBuffer:               5,
      maxBuffer:               15,
      playBuffer:              1,
    });
  } catch {
    // setupPlayer() lance une exception si déjà initialisé — ignoré.
  }
  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
    },
    capabilities:        [Capability.Play, Capability.Pause, Capability.Stop],
    compactCapabilities: [],
    progressUpdateEventInterval: 60,
  });
  _initialized = true;
}

async function setMetadata(title: string, artist: string): Promise<void> {
  // NowPlayingMetadata.artwork n'accepte que string — l'icône app
  // est déjà affichée automatiquement par Android MediaStyle.
  await TrackPlayer.updateNowPlayingMetadata({
    title,
    artist,
    album: 'Yoann2.0',
  });
}

/**
 * Démarre (ou reprend après pause logique) la session de trajet.
 * Lance le ghost audio en boucle à 1 % volume et crée la MediaSession.
 *
 * @param distKm Distance déjà parcourue (0 pour un départ frais, >0 pour reprise).
 */
export async function startTripSession(distKm = 0): Promise<void> {
  await initPlayer();

  if (_isRunning) {
    // Ghost audio déjà en lecture (reprise après pause logique) :
    // on remet juste les métadonnées à jour.
    _lastUpdateTs = 0;
    await setMetadata(`Trajet · ${distKm.toFixed(2)} km`, '00:00').catch(() => {});
    return;
  }

  // Lit la préférence audio depuis les settings — safe fallback si AsyncStorage échoue.
  const { tripAudio } = await getWidgetSettings().catch(() => ({ tripAudio: 'sine_220' as TripAudioPreset }));
  const audioFile = AUDIO_FILES[tripAudio] ?? AUDIO_FILES.sine_220;

  await TrackPlayer.reset();
  // Asset bundlé (number). RNTP l'accepte en pratique mais AddTrack.url = string
  // ∩ (string|ResourceObject) = string dans les types. Cast nécessaire.
  await TrackPlayer.add([{
    url:      audioFile as unknown as string,
    title:    distKm > 0
      ? `Trajet · ${distKm.toFixed(2)} km · Reprise`
      : 'Trajet · Démarrage…',
    artist:   '00:00',
    album:    'Yoann2.0',
    duration: 2,
  }]);
  await TrackPlayer.setRepeatMode(RepeatMode.Track);
  await TrackPlayer.setVolume(0.01);
  await TrackPlayer.play();

  _isRunning    = true;
  _lastUpdateTs = 0;
}

/**
 * Met à jour les métadonnées (distance + durée active) dans la notification.
 * Throttlé à 15 s. Sûr à appeler depuis la tâche GPS en background.
 *
 * @param distKm   Distance totale parcourue.
 * @param activeMs Durée active (pauses exclues) en ms.
 */
export async function updateTripMetadata(
  distKm: number,
  activeMs: number,
): Promise<void> {
  const now = Date.now();
  if (now - _lastUpdateTs < UPDATE_THROTTLE_MS) return;

  const hh = Math.floor(activeMs / 3_600_000);
  const mm = Math.floor((activeMs % 3_600_000) / 60_000);
  const ss = Math.floor((activeMs % 60_000) / 1_000);
  const duration = hh > 0
    ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  try {
    await setMetadata(`Trajet · ${distKm.toFixed(2)} km`, duration);
    _lastUpdateTs = now;
  } catch {}
}

/**
 * Passe la notification en mode "en pause" SANS arrêter le ghost audio.
 * La MediaSession reste en STATE_PLAYING → la notification reste non-swipeable.
 *
 * @param distKm Distance parcourue au moment de la pause.
 */
export async function pauseTripSession(distKm: number): Promise<void> {
  _lastUpdateTs = 0;
  try {
    await setMetadata(
      `En pause · ${distKm.toFixed(2)} km`,
      'Appuie sur ▶ pour reprendre',
    );
  } catch {}
}

/**
 * Stoppe le player et supprime la notification MediaSession.
 * Appeler à la fin du trajet uniquement.
 */
export async function stopTripSession(): Promise<void> {
  _isRunning    = false;
  _lastUpdateTs = 0;
  try { await TrackPlayer.reset(); } catch {}
}
