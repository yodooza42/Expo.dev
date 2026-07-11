/**
 * Notification de trajet persistante via @notifee/react-native.
 *
 * Contrairement à expo-notifications (dismissable sur Android 13+),
 * notifee + asForegroundService + ongoing = notification IMPOSSIBLE
 * à swiper, même sur One UI 7 / Android 15.
 *
 * Architecture :
 *  - expo-location gère le GPS (son propre FGS avec notification minimale)
 *  - notifee gère l'affichage du trajet (FGS séparé, contenu riche)
 *  - Les deux FGS coexistent sur Android — chacun avec son propre Service.
 *
 * Règle Android 12+ : startTripNotification() doit être appelé dans les
 * ~10 s qui suivent l'appui widget (fenêtre d'exemption FGS background).
 */

import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
} from '@notifee/react-native';

export const TRIP_CHANNEL_ID       = 'yoann2_trip_active';
export const TRIP_NOTIFICATION_ID  = 'yoann2_trip_ongoing';
const UPDATE_THROTTLE_MS = 15_000;

let _lastUpdateTs = 0;
let _lastBody     = '';

async function ensureChannel(): Promise<string> {
  return notifee.createChannel({
    id:         TRIP_CHANNEL_ID,
    name:       'Trajet en cours',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    vibration:  false,
    sound:      '',
    badge:      false,
  });
}

/**
 * Démarre (ou reprend) la notification de trajet persistante.
 * @param distKm Distance déjà parcourue (0 pour un départ frais, >0 pour une reprise).
 */
export async function startTripNotification(distKm = 0): Promise<void> {
  _lastUpdateTs = 0;
  _lastBody     = '';

  await notifee.requestPermission().catch(() => {});
  const channelId = await ensureChannel();

  await notifee.displayNotification({
    id:    TRIP_NOTIFICATION_ID,
    title: '<b>Trajet en cours</b> — Yoann2.0',
    body:  distKm > 0 ? `${distKm.toFixed(2)} km · Reprise` : '0.00 km · Démarrage…',
    android: {
      channelId,
      category:         AndroidCategory.NAVIGATION,
      color:            '#FFC107',
      colorized:        true,
      ongoing:          true,
      autoCancel:       false,
      asForegroundService: true,
      smallIcon:        'ic_launcher',
      pressAction: { id: 'default', launchActivity: 'default' },
    },
  });
}

/**
 * Met à jour la notification avec distance + durée active.
 * Throttlé à 15 s ; ignoré si le texte n'a pas changé.
 * Sûr à appeler depuis la tâche GPS en background.
 */
export async function updateActiveTripNotification(
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

  const body = `${distKm.toFixed(2)} km · ${duration}`;
  if (body === _lastBody) return;

  try {
    const channelId = await ensureChannel();
    await notifee.displayNotification({
      id:    TRIP_NOTIFICATION_ID,
      title: '<b>Trajet en cours</b> — Yoann2.0',
      body,
      android: {
        channelId,
        category:         AndroidCategory.NAVIGATION,
        color:            '#FFC107',
        colorized:        true,
        ongoing:          true,
        autoCancel:       false,
        asForegroundService: true,
        smallIcon:        'ic_launcher',
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
    _lastUpdateTs = now;
    _lastBody     = body;
  } catch {}
}

/**
 * Passe la notification en mode "en pause".
 */
export async function pauseTripNotification(distKm: number): Promise<void> {
  _lastUpdateTs = 0;
  _lastBody     = '';
  try {
    const channelId = await ensureChannel();
    await notifee.displayNotification({
      id:    TRIP_NOTIFICATION_ID,
      title: '<b>Trajet en pause</b> — Yoann2.0',
      body:  `${distKm.toFixed(2)} km · Appuie sur ▶ pour reprendre`,
      android: {
        channelId,
        category:         AndroidCategory.NAVIGATION,
        color:            '#888888',
        colorized:        true,
        ongoing:          true,
        autoCancel:       false,
        asForegroundService: true,
        smallIcon:        'ic_launcher',
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  } catch {}
}

/**
 * Arrête le foreground service notifee et supprime la notification.
 * Appeler à la fin du trajet ou en cas d'erreur critique.
 */
export async function stopTripNotification(): Promise<void> {
  _lastUpdateTs = 0;
  _lastBody     = '';
  try { await notifee.stopForegroundService(); } catch {}
  try { await notifee.cancelNotification(TRIP_NOTIFICATION_ID); } catch {}
}
