/**
 * tripSession.ts — Façade de compatibilité.
 *
 * La gestion audio du trajet est maintenant entièrement dans carPlayer.ts.
 * Le widget (taskHandler.tsx) appelle carPlayer directement.
 * Ce module reste présent pour compatibilité avec d'éventuels autres imports.
 */

import {
  pauseCarPlayer,
  resumeCarPlayer,
  startCarPlaylist,
  stopCarPlayer,
} from '@/utils/carPlayer';
import { loadPlaylist } from '@/utils/playlistStorage';
import type { TripAudioPreset } from '@/widgets/widgetSettings';

export const TRIP_AUDIO_OPTIONS: { id: TripAudioPreset; label: string; hint: string }[] = [
  { id: 'sine_220', label: '220 Hz',      hint: 'Sinusoïde grave (défaut)' },
  { id: 'sine_110', label: '110 Hz',      hint: 'Très grave' },
  { id: 'sine_440', label: '440 Hz',      hint: 'Sinusoïde médium (La)' },
  { id: 'noise',    label: 'Bruit blanc', hint: 'Spectre large' },
];

export async function startTripSession(_distKm = 0): Promise<void> {
  const tracks = await loadPlaylist().catch(() => []);
  if (tracks.length) startCarPlaylist(tracks, 0);
}

export async function updateTripMetadata(
  _distKm: number,
  _activeMs: number,
): Promise<void> {
  // No-op : la notification MediaSession affiche le nom de la piste.
}

export async function pauseTripSession(_distKm: number): Promise<void> {
  pauseCarPlayer();
}

export async function resumeTripSession(_distKm: number): Promise<void> {
  resumeCarPlayer();
}

export async function stopTripSession(): Promise<void> {
  stopCarPlayer();
}
