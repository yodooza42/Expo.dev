/**
 * Session de trajet — pilote la notification du Foreground Service GPS
 * (expo-location) pour afficher km et durée.
 *
 * Stratégie : plutôt qu'un FGS notifee séparé (instable sur Samsung One UI 7 /
 * Android 15 à cause des restrictions shortService/dataSync), on réutilise la
 * notification du FGS expo-location, déjà non-swipeable parce que liée au
 * service de localisation actif. On la met à jour via startLocationUpdatesAsync
 * avec les mêmes options GPS mais un titre/corps différent.
 *
 * TRIP_AUDIO_OPTIONS est conservé pour l'UI des paramètres widget
 * (la préférence est mémorisée, l'audio sera réintégré via un module
 * New-Arch compatible dans une prochaine version).
 */

import { patchLocationFgsNotification } from '@/utils/locationTracking';
import type { TripAudioPreset } from '@/widgets/widgetSettings';

// ─── Options audio (UI uniquement — pas d'audio actif dans cette version) ────

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
 * Met à jour la notification FGS GPS pour afficher le trajet en cours.
 */
export async function startTripSession(distKm = 0): Promise<void> {
  const title = distKm > 0
    ? `Trajet · ${distKm.toFixed(2)} km · Reprise`
    : 'Trajet en cours';
  await patchLocationFgsNotification(title, '00:00', true);
}

/**
 * Met à jour les métadonnées (distance + durée active) dans la notification.
 * Délègue à patchLocationFgsNotification (throttlé à 15 s).
 */
export async function updateTripMetadata(
  distKm: number,
  activeMs: number,
): Promise<void> {
  await patchLocationFgsNotification(
    `Trajet · ${distKm.toFixed(2)} km`,
    formatDuration(activeMs),
  );
}

/**
 * Passe la notification en mode "en pause".
 */
export async function pauseTripSession(distKm: number): Promise<void> {
  await patchLocationFgsNotification(
    `En pause · ${distKm.toFixed(2)} km`,
    'Appuie sur ▶ pour reprendre',
    true,
  );
}

/**
 * Fin du trajet — restaure la notification FGS GPS par défaut.
 */
export async function stopTripSession(): Promise<void> {
  await patchLocationFgsNotification('Yoann2.0', 'GPS actif en arrière-plan', true);
}
