/**
 * Session de trajet — pilote la notification MediaSession via expo-video.
 *
 * Stratégie : on joue un fichier silence.mp3 en boucle via expo-video
 * (audioSession.ts). La notification MediaSession Android est non-swipeable
 * tant que la lecture est active, et affiche title="Trajet · X.XX km" +
 * artist="MM:SS". Cela remplace les approches FGS notifee (shortService/
 * dataSync tué par Samsung One UI 7) et expo-location FGS notification
 * (délai d'apparition, swipeable selon les versions).
 *
 * Dépendances : audioSession.ts (expo-video) — pas de dépendance circulaire.
 */

import { startAudioSession, updateAudioSession, stopAudioSession } from '@/utils/audioSession';
import type { TripAudioPreset } from '@/widgets/widgetSettings';

// ─── Options audio (UI uniquement — conservé pour les préférences widget) ────

export const TRIP_AUDIO_OPTIONS: { id: TripAudioPreset; label: string; hint: string }[] = [
  { id: 'sine_220', label: '220 Hz',      hint: 'Sinusoïde grave (défaut)' },
  { id: 'sine_110', label: '110 Hz',      hint: 'Très grave' },
  { id: 'sine_440', label: '440 Hz',      hint: 'Sinusoïde médium (La)' },
  { id: 'noise',    label: 'Bruit blanc', hint: 'Spectre large' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(activeMs: number): string {
  const hh = Math.floor(activeMs / 3_600_000);
  const mm = Math.floor((activeMs % 3_600_000) / 60_000);
  const ss = Math.floor((activeMs % 60_000) / 1_000);
  return hh > 0
    ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Démarre (ou reprend) la session de trajet.
 * Lance la lecture du silence → notification MediaSession immédiate et non-swipeable.
 */
export async function startTripSession(distKm = 0): Promise<void> {
  const title = distKm > 0
    ? `Trajet · ${distKm.toFixed(2)} km · Reprise`
    : 'Trajet en cours';
  startAudioSession(title, '00:00');
}

/**
 * Met à jour les métadonnées (distance + durée active) dans la notification.
 * Throttlé à 15 s par audioSession.
 */
export async function updateTripMetadata(
  distKm: number,
  activeMs: number,
): Promise<void> {
  updateAudioSession(`Trajet · ${distKm.toFixed(2)} km`, formatDuration(activeMs));
}

/**
 * Passe la notification en mode "en pause".
 */
export async function pauseTripSession(distKm: number): Promise<void> {
  updateAudioSession(`En pause · ${distKm.toFixed(2)} km`, '▶ Reprendre', true);
}

/**
 * Fin du trajet — arrête la session audio et libère le player.
 */
export async function stopTripSession(): Promise<void> {
  stopAudioSession();
}
