/**
 * Session de trajet — notification FGS via @notifee/react-native.
 *
 * RNTP retiré (incompatible New Architecture / Bridgeless, RN 0.81+).
 * La notification ongoing avec asForegroundService:true est non-swipeable
 * sur Android tant que le Foreground Service tourne.
 *
 * TRIP_AUDIO_OPTIONS est conservé pour l'UI des paramètres widget
 * (la préférence est mémorisée, l'audio sera réintégré via un module
 * New-Arch compatible dans une prochaine version).
 */

import notifee, {
  AndroidForegroundServiceType,
  AndroidImportance,
  AndroidVisibility,
} from '@notifee/react-native';

import type { TripAudioPreset } from '@/widgets/widgetSettings';

// Enregistrement du handler FGS au niveau module :
// - exécuté dans le contexte headless (widget task handler) ET dans l'app principale
// - la promesse ne se résout jamais → le service tourne jusqu'à stopForegroundService()
notifee.registerForegroundService(() => new Promise<void>(() => {}));

// ─── Options audio (UI uniquement — pas d'audio actif dans cette version) ────

export const TRIP_AUDIO_OPTIONS: { id: TripAudioPreset; label: string; hint: string }[] = [
  { id: 'sine_220', label: '220 Hz',      hint: 'Sinusoïde grave (défaut)' },
  { id: 'sine_110', label: '110 Hz',      hint: 'Très grave' },
  { id: 'sine_440', label: '440 Hz',      hint: 'Sinusoïde médium (La)' },
  { id: 'noise',    label: 'Bruit blanc', hint: 'Spectre large' },
];

// ─── Constantes notification ──────────────────────────────────────────────────

const TRIP_NOTIF_ID  = 'trip-active';
const TRIP_CHANNEL   = 'trip';          // canal créé dans _layout.tsx via expo-notifications

const UPDATE_THROTTLE_MS = 15_000;
let _lastUpdateTs = 0;

function androidBase() {
  return {
    channelId:            TRIP_CHANNEL,
    importance:           AndroidImportance.HIGH,
    ongoing:              true,
    asForegroundService:  true,
    foregroundServiceTypes: [
      AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
    ],
    visibility:           AndroidVisibility.PUBLIC,
    pressAction:          { id: 'default', launchActivity: 'default' } as const,
  };
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Démarre (ou reprend) la session de trajet.
 * Affiche la notification FGS non-swipeable.
 */
export async function startTripSession(distKm = 0): Promise<void> {
  try {
    _lastUpdateTs = 0;
    await notifee.displayNotification({
      id:    TRIP_NOTIF_ID,
      title: distKm > 0
        ? `Trajet · ${distKm.toFixed(2)} km · Reprise`
        : 'Trajet · Démarrage…',
      body: '00:00',
      android: androidBase(),
    });
  } catch {}
}

/**
 * Met à jour les métadonnées (distance + durée active) dans la notification.
 * Throttlé à 15 s.
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
    await notifee.displayNotification({
      id:    TRIP_NOTIF_ID,
      title: `Trajet · ${distKm.toFixed(2)} km`,
      body:  duration,
      android: androidBase(),
    });
    _lastUpdateTs = now;
  } catch {}
}

/**
 * Passe la notification en mode "en pause" (FGS reste actif).
 */
export async function pauseTripSession(distKm: number): Promise<void> {
  _lastUpdateTs = 0;
  try {
    await notifee.displayNotification({
      id:    TRIP_NOTIF_ID,
      title: `En pause · ${distKm.toFixed(2)} km`,
      body:  'Appuie sur ▶ pour reprendre',
      android: androidBase(),
    });
  } catch {}
}

/**
 * Stoppe le Foreground Service et supprime la notification.
 */
export async function stopTripSession(): Promise<void> {
  _lastUpdateTs = 0;
  try { await notifee.stopForegroundService(); } catch {}
}
