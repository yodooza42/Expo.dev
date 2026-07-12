/**
 * Widget Task Handler — AllInOneWidget
 *
 * Actions custom (→ handler JS, pas d'intent Android direct) :
 *   NAVIGATE_TO        → ouvre yoann2:///navigate-to via Linking
 *   NAVIGATE_HOME      → navigation Google Maps vers le lieu "Maison" (categoryId=home)
 *   OPEN_FUEL          → ouvre yoann2:///(tabs)/trips via Linking
 *   REFRESH            → rafraîchit le widget avec animation
 *   MANUAL_TRIP_START  → démarre un trajet manuel
 *   MANUAL_TRIP_PAUSE  → met en pause le trajet
 *   MANUAL_TRIP_RESUME → reprend le trajet
 *   MANUAL_TRIP_END    → termine et sauvegarde le trajet
 *
 * Actions natives gérées directement par Android (pas de handler JS) :
 *   OPEN_APP           → ouvre l'app (écran courant)
 *   OPEN_URI + uri     → ouvre l'URI directement (ex : cercle Marie)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import React from 'react';
import { Linking, Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import type { RoutePoint, Trip } from '@/types/trips';
import { reverseGeocode } from '@/utils/geocoding';
import { haversineKm } from '@/utils/haversine';
import { genId } from '@/utils/ids';
import {
  dateKey,
  getTripDistKm,
  loadDayPoints,
  resetTripTracking,
  pauseManualTracking,
  startManualTracking,
  stopTracking,
} from '@/utils/locationTracking';
import {
  pauseCarPlayer,
  resumeCarPlayer,
  setTripStatus,
  startCarPlaylist,
  stopCarPlayer,
} from '@/utils/carPlayer';
import { loadPlaylist } from '@/utils/playlistStorage';
import {
  clearManualTripState,
  getManualTripState,
  getManualTripStatus,
  saveManualTripState,
} from '@/utils/manualTripStorage';
import { addConsumption } from '@/utils/consumptionStorage';
import { getNavShortcuts } from '@/utils/navigationShortcuts';
import { matchRouteOSRM, computeRouteDistanceKm } from '@/utils/osrmMatching';
import { findNearestPlace, getKnownPlaces } from '@/utils/placesStorage';
import { simplifyRoute } from '@/utils/routeSimplification';
import { saveTrip } from '@/utils/tripStorage';
import { AllInOneWidget } from './AllInOneWidget';
import { getWidgetDataFromStorage } from './data';

// ─── Constantes ──────────────────────────────────────────────────────────────

const WIDGET_NAME       = 'TodoWidget';
const SPIN_FRAMES       = 8;
const SPIN_INTERVAL_MS  = 250;
const GPS_TIMEOUT_MS    = 10_000;
const BATTERY_KEY       = '@yoann2_battery_opt_prompted';

// ─── Verrou universel anti-PendingIntent storm ───────────────────────────────
//
// Principe : chaque action widget a une clé AsyncStorage unique et stable
// (@yoann2_lock_{ACTION}). Android identifie les PendingIntents par
// requestCode + action — des clés stables garantissent que Android REMPLACE
// l'ancien intent au lieu de l'accumuler dans sa queue de livraison.
//
// Une seule fonction gère tout : table de durées par action, 1 écriture AS
// par appui autorisé.

const LOCK_PREFIX = '@yoann2_lock_';

/** Durée du verrou en ms par action. */
const LOCK_MS: Record<string, number> = {
  // Navigation / deep-links : 30 s
  NAVIGATE_HOME:       30_000,
  NAVIGATE_TO:         30_000,
  OPEN_FUEL:           30_000,
  ADD_TRANSACTION:     30_000,
  // Rafraîchissement : 3 s (animation = 2 s)
  REFRESH:              3_000,
  // Trajet : 1 min entre chaque action PLAY / PAUSE / RESUME / STOP
  MANUAL_TRIP_START:   60_000,
  MANUAL_TRIP_PAUSE:   60_000,
  MANUAL_TRIP_RESUME:  60_000,
  MANUAL_TRIP_END:     60_000,
  // Consommation : 5 min par type
  ADD_COFFEE:         300_000,
  ADD_CIGARETTE:      300_000,
};

/**
 * Tente d'acquérir le verrou pour l'action donnée.
 * → false  si la même action a été exécutée il y a moins de LOCK_MS[action]
 * → true   si autorisé (le verrou est posé)
 */
async function acquireLock(action: string): Promise<boolean> {
  const ms  = LOCK_MS[action] ?? 5_000;
  const key = LOCK_PREFIX + action;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const ts = parseInt(raw, 10);
      if (!isNaN(ts) && Date.now() - ts < ms) {
        await widgetLog('lock:debounced', `${action} il y a ${Date.now() - ts}ms`);
        return false;
      }
    }
    await AsyncStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    return true; // erreur storage → on laisse passer
  }
}

// Cooldown asymétrique STOP → PLAY : 5 min après arrêt de trajet.
// Distinct du verrou générique : STOP écrit la clé, START la lit.
const TRIP_END_KEY = '@yoann2_trip_end_ts';
const TRIP_END_MS  = 300_000;

async function isTripEndCooldown(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(TRIP_END_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (!isNaN(ts) && Date.now() - ts < TRIP_END_MS) {
      await widgetLog('lock:end-cooldown', `${Math.round((Date.now() - ts) / 1000)}s post-stop`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Debug logging ────────────────────────────────────────────────────────────

const WIDGET_LOG_KEY = '@yoann2_widget_debug_log';

async function widgetLog(tag: string, data: unknown): Promise<void> {
  try {
    const entry = { t: new Date().toISOString(), tag, data: String(data) };
    const raw = await AsyncStorage.getItem(WIDGET_LOG_KEY).catch(() => null);
    const prev: unknown[] = raw ? (JSON.parse(raw) as unknown[]) : [];
    const next = [...prev.slice(-19), entry]; // garder les 20 derniers
    await AsyncStorage.setItem(WIDGET_LOG_KEY, JSON.stringify(next));
  } catch {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Rend le widget AllInOne avec l'état courant du trajet. */
async function renderWidget(
  doRender: WidgetTaskHandlerProps['renderWidget'],
  tripStatus?: 'idle' | 'active' | 'paused',
): Promise<void> {
  await widgetLog('renderWidget:start', `tripStatus=${tripStatus ?? 'auto'}`);
  try {
    const [data, shortcuts, status] = await Promise.all([
      getWidgetDataFromStorage(),
      getNavShortcuts(),
      tripStatus !== undefined ? Promise.resolve(tripStatus) : getManualTripStatus(),
    ]);
    await widgetLog('renderWidget:data', `tasks=${data.tasks.length} shortcuts=${shortcuts.length} status=${status}`);
    doRender(
      <AllInOneWidget
        {...data}
        shortcuts={shortcuts.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }))}
        tripStatus={status}
      />,
    );
    await widgetLog('renderWidget:done', 'ok');
  } catch (err) {
    await widgetLog('renderWidget:error', `${String(err)} | ${(err as any)?.stack?.slice(0, 300)}`);
    throw err;
  }
}

/** Rafraîchit tous les widgets de type TodoWidget (requestWidgetUpdate). */
async function refreshAllWidgets(tripStatus: 'idle' | 'active' | 'paused'): Promise<void> {
  const [data, shortcuts] = await Promise.all([getWidgetDataFromStorage(), getNavShortcuts()]);
  await requestWidgetUpdate({
    widgetName: WIDGET_NAME,
    renderWidget: () => (
      <AllInOneWidget
        {...data}
        shortcuts={shortcuts.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }))}
        tripStatus={tripStatus}
      />
    ),
    widgetNotFound: () => {},
  });
}

/** Récupère la position GPS courante avec timeout. Retourne null si indisponible. */
async function getCurrentPosition(): Promise<Location.LocationObject | null> {
  return Promise.race<Location.LocationObject | null>([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise<null>(resolve => setTimeout(() => resolve(null), GPS_TIMEOUT_MS)),
  ]).catch(() => null);
}

/** Affiche une notification si l'optimisation batterie n'a pas encore été suggérée. */
async function maybeSuggestBatteryOptimization(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const already = await AsyncStorage.getItem(BATTERY_KEY);
    if (already === '1') return;
    await AsyncStorage.setItem(BATTERY_KEY, '1');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Trajet GPS — action recommandée',
        body: "Pour éviter les coupures GPS, exemptez Yoann2.0 de l'optimisation batterie.",
        data: { action: 'battery_optimization' },
      },
      trigger: null,
    });
  } catch {}
}

// ─── Actions de navigation ────────────────────────────────────────────────────

async function handleNavigateTo(): Promise<void> {
  await Linking.openURL('yoann2:///navigate-to').catch(() => {
    Linking.openURL('yoann2://').catch(() => {});
  });
}

async function handleOpenFuel(): Promise<void> {
  await Linking.openURL('yoann2:///fuel-log?add=1').catch(() => {
    Linking.openURL('yoann2://').catch(() => {});
  });
}

async function handleNavigateHome(): Promise<void> {
  const places = await getKnownPlaces();
  const home   = places.find(p => p.categoryId === 'home');
  if (!home) {
    await Linking.openURL('yoann2:///navigate-to').catch(() => {});
    return;
  }
  const wazeUrl   = `waze://?ll=${home.lat},${home.lng}&navigate=yes`;
  const gmapsNative = `google.navigation:q=${home.lat},${home.lng}&mode=d`;
  const gmapsWeb    = `https://maps.google.com/?daddr=${home.lat},${home.lng}&directionsmode=driving`;
  if (await Linking.canOpenURL(wazeUrl)) {
    await Linking.openURL(wazeUrl).catch(() => {});
  } else if (await Linking.canOpenURL(gmapsNative)) {
    await Linking.openURL(gmapsNative).catch(() => {});
  } else {
    await Linking.openURL(gmapsWeb).catch(() => {});
  }
}

// ─── Trajet manuel ───────────────────────────────────────────────────────────
// La notification persistante est la notification du foreground service GPS
// produite par startLocationUpdatesAsync (non-dismissable sur Android).
// sticky:true via expo-notifications EST dismissable sur Android 13+ → on n'utilise
// plus postTripNotification, on s'appuie uniquement sur le foreground service.

async function handleTripStart(
  doRender: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  // Guard état : déjà actif → re-rendre sans réinitialiser
  const existingState = await getManualTripState();
  if (existingState?.active) {
    await renderWidget(doRender, existingState.paused ? 'paused' : 'active');
    return;
  }

  resetTripTracking();
  const now = Date.now();

  await saveManualTripState({
    active: true,
    paused: false,
    startTime: now,
    startLat: 0,
    startLon: 0,
    segments: [{ start: now }],
  });

  // CRITIQUE : démarrer les deux FGS IMMÉDIATEMENT dans la fenêtre d'exemption
  // Android 12+ (~10 s après l'appui widget). L'ordre : GPS d'abord, puis notifee.
  try {
    await startManualTracking();
  } catch (err) {
    await widgetLog('trip:start:fgs_error', String(err));
  }
  setTripStatus(true);
  loadPlaylist().then(tracks => {
    if (tracks.length) startCarPlaylist(tracks, 0);
  }).catch(() => {});
  Linking.openURL('yoann2:///(tabs)/player').catch(() => {});

  await maybeSuggestBatteryOptimization();
  await renderWidget(doRender, 'active');

  // Position de départ récupérée APRÈS coup — le service tourne déjà, le
  // timing n'a plus d'importance. Patch de l'état si le trajet est toujours actif.
  const loc = await getCurrentPosition();
  if (loc) {
    const st = await getManualTripState();
    if (st?.active && st.startLat === 0 && st.startLon === 0) {
      await saveManualTripState({
        ...st,
        startLat: loc.coords.latitude,
        startLon: loc.coords.longitude,
      });
    }
  }
}

async function handleTripPause(
  doRender: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  const state = await getManualTripState();

  if (!state || !state.active || state.paused) {
    await renderWidget(doRender);
    return;
  }

  // Passe le GPS en basse fréquence SANS arrêter le FGS expo-location.
  await pauseManualTracking().catch(() => {});
  setTripStatus(false);
  pauseCarPlayer();

  const now = Date.now();
  const segments = state.segments.map((s, i) =>
    i === state.segments.length - 1 && s.end == null ? { ...s, end: now } : s,
  );
  await saveManualTripState({ ...state, paused: true, segments });

  await renderWidget(doRender, 'paused');
}

async function handleTripResume(
  doRender: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  const state = await getManualTripState();

  if (!state || !state.active || !state.paused) {
    await renderWidget(doRender);
    return;
  }

  const now = Date.now();
  await saveManualTripState({
    ...state,
    paused: false,
    segments: [...state.segments, { start: now }],
  });

  try {
    await startManualTracking();
  } catch (err) {
    await widgetLog('trip:resume:fgs_error', String(err));
  }
  setTripStatus(true);
  resumeCarPlayer();
  await renderWidget(doRender, 'active');
}

async function handleTripEnd(
  doRender: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  stopTracking().catch(() => {});
  setTripStatus(false);
  stopCarPlayer();

  const manualState = await getManualTripState();

  if (!manualState) {
    await clearManualTripState();
    await renderWidget(doRender, 'idle');
    return;
  }

  const endTime = Date.now();

  let segments = manualState.segments;
  if (!manualState.paused && segments.length > 0) {
    segments = segments.map((s, i) =>
      i === segments.length - 1 && s.end == null ? { ...s, end: endTime } : s,
    );
  }

  await clearManualTripState();
  resetTripTracking();
  // Enregistre l'heure de fin pour le cooldown 5 min avant un nouveau PLAY
  await AsyncStorage.setItem(TRIP_END_KEY, String(Date.now())).catch(() => {});
  await renderWidget(doRender, 'idle');

  const endLoc = await getCurrentPosition();
  const endLat = endLoc?.coords.latitude  ?? manualState.startLat;
  const endLon = endLoc?.coords.longitude ?? manualState.startLon;

  const today     = dateKey(new Date());
  const yesterday = dateKey(new Date(endTime - 86_400_000));
  const [todayPts, yesterdayPts] = await Promise.all([
    loadDayPoints(today),
    loadDayPoints(yesterday),
  ]);

  const allPts = [...yesterdayPts, ...todayPts].sort((a, b) => a.timestamp - b.timestamp);
  const rawPts = allPts.filter(p => {
    if (segments.length === 0) {
      return p.timestamp >= manualState.startTime && p.timestamp <= endTime;
    }
    return segments.some(s =>
      p.timestamp >= s.start && p.timestamp <= (s.end ?? endTime),
    );
  });

  let routePoints: RoutePoint[] = rawPts.map(p => ({ lat: p.lat, lng: p.lng }));
  // Ne préfixer le point de départ que si on a des coordonnées valides
  // (évite d'injecter (0,0) quand le GPS a timeout au démarrage du trajet).
  const hasValidStart = manualState.startLat !== 0 || manualState.startLon !== 0;
  if (hasValidStart && (routePoints.length === 0 || routePoints[0]!.lat !== manualState.startLat)) {
    routePoints = [{ lat: manualState.startLat, lng: manualState.startLon }, ...routePoints];
  }
  if (routePoints.length <= 1 || routePoints[routePoints.length - 1]!.lat !== endLat) {
    routePoints = [...routePoints, { lat: endLat, lng: endLon }];
  }

  let osrmRoute: RoutePoint[] | null = null;
  let distanceKm: number;
  try {
    if (routePoints.length >= 2) {
      osrmRoute = await matchRouteOSRM(routePoints);
    }
  } catch {}

  if (osrmRoute && osrmRoute.length >= 2) {
    distanceKm = computeRouteDistanceKm(osrmRoute);
  } else {
    distanceKm =
      rawPts.length >= 2
        ? computeRouteDistanceKm(rawPts.map(p => ({ lat: p.lat, lng: p.lng })))
        : haversineKm(manualState.startLat, manualState.startLon, endLat, endLon);
  }

  const finalRoute = simplifyRoute(osrmRoute ?? routePoints);

  const trip: Trip = {
    id: genId(),
    startTime: manualState.startTime,
    endTime,
    distanceKm: Math.round(distanceKm * 100) / 100,
    pointCount: rawPts.length,
    vehicle: null,
    startLat: manualState.startLat,
    startLon: manualState.startLon,
    endLat,
    endLon,
    route: finalRoute,
    routeSource: osrmRoute ? 'osrm' : 'gps',
    source: 'manual',
  };

  const [startPlace, endPlace] = await Promise.all([
    findNearestPlace(trip.startLat, trip.startLon).catch(() => null),
    findNearestPlace(trip.endLat, trip.endLon).catch(() => null),
  ]);

  if (startPlace) {
    trip.startAddress = startPlace.name;
    trip.startPlaceId = startPlace.id;
  } else {
    trip.startAddress =
      (await reverseGeocode(trip.startLat, trip.startLon).catch(() => null)) ?? undefined;
  }
  if (endPlace) {
    trip.endAddress = endPlace.name;
    trip.endPlaceId = endPlace.id;
  } else {
    trip.endAddress =
      (await reverseGeocode(trip.endLat, trip.endLon).catch(() => null)) ?? undefined;
  }

  await saveTrip(trip);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Trajet terminé — Yoann 2.0',
      body: `${trip.distanceKm.toFixed(1)} km · Touchez pour sélectionner le véhicule`,
      data: { url: '/(tabs)/trips', type: 'trip_completed' },
    },
    trigger: null,
  }).catch(() => {});
}

// ─── REFRESH avec animation ───────────────────────────────────────────────────

async function handleRefresh(
  doRender: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  // Le verrou REFRESH (3 s) est acquis dans le switch avant d'appeler cette
  // fonction — pas besoin de re-vérifier ici.
  const [data, shortcuts, tripStatus] = await Promise.all([
    getWidgetDataFromStorage(),
    getNavShortcuts(),
    getManualTripStatus(),
  ]);

  const shortcutsMapped = shortcuts.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }));

  doRender(
    <AllInOneWidget {...data} shortcuts={shortcutsMapped} tripStatus={tripStatus} spinAngle={0} />,
  );

  for (let i = 1; i <= SPIN_FRAMES; i++) {
    await new Promise<void>(res => setTimeout(res, SPIN_INTERVAL_MS));
    const angle = (i / SPIN_FRAMES) * 720;
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: () => (
        <AllInOneWidget {...data} shortcuts={shortcutsMapped} tripStatus={tripStatus} spinAngle={angle} />
      ),
      widgetNotFound: () => {},
    });
  }

  const [freshData, freshShortcuts, freshStatus] = await Promise.all([
    getWidgetDataFromStorage(),
    getNavShortcuts(),
    getManualTripStatus(),
  ]);
  const freshMapped = freshShortcuts.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }));
  await requestWidgetUpdate({
    widgetName: WIDGET_NAME,
    renderWidget: () => (
      <AllInOneWidget {...freshData} shortcuts={freshMapped} tripStatus={freshStatus} spinAngle={0} />
    ),
    widgetNotFound: () => {},
  });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetAction, clickAction, renderWidget: doRender } = props;

  await widgetLog('handler:called', `action=${widgetAction} click=${clickAction ?? '-'}`);

  try {
    switch (widgetAction) {
      case 'WIDGET_ADDED':
      case 'WIDGET_UPDATE':
      case 'WIDGET_RESIZED': {
        await renderWidget(doRender);
        break;
      }

      case 'WIDGET_CLICK': {
        // ── Stratégie universelle ────────────────────────────────────────────
        // 1. acquireLock(action) bloque les re-livraisons parasites Android.
        // 2. renderWidget() en fin de chaque case régénère les PendingIntents
        //    → Android remplace les anciens et ne peut plus les re-livrer
        //    au retour au premier plan depuis le launcher.
        // 3. Les handlers trip gardent leurs guards d'état (déjà actif, etc.)
        //    pour la cohérence logique indépendamment du lock.
        switch (clickAction) {
          case 'NAVIGATE_HOME': {
            if (await acquireLock('NAVIGATE_HOME')) await handleNavigateHome();
            await renderWidget(doRender);
            break;
          }
          case 'NAVIGATE_TO': {
            if (await acquireLock('NAVIGATE_TO')) await handleNavigateTo();
            await renderWidget(doRender);
            break;
          }
          case 'OPEN_FUEL': {
            if (await acquireLock('OPEN_FUEL')) await handleOpenFuel();
            await renderWidget(doRender);
            break;
          }
          case 'ADD_TRANSACTION': {
            if (await acquireLock('ADD_TRANSACTION')) {
              await Linking.openURL('yoann2:///(tabs)/expenses?add=1').catch(() => {
                Linking.openURL('yoann2://').catch(() => {});
              });
            }
            await renderWidget(doRender);
            break;
          }
          case 'ADD_COFFEE': {
            if (await acquireLock('ADD_COFFEE')) await addConsumption('coffee');
            await renderWidget(doRender);
            break;
          }
          case 'ADD_CIGARETTE': {
            if (await acquireLock('ADD_CIGARETTE')) await addConsumption('cigarette');
            await renderWidget(doRender);
            break;
          }
          case 'REFRESH': {
            if (!await acquireLock('REFRESH')) {
              await renderWidget(doRender);
              break;
            }
            await handleRefresh(doRender);
            break;
          }
          case 'MANUAL_TRIP_START': {
            if (!await acquireLock('MANUAL_TRIP_START') || await isTripEndCooldown()) {
              await renderWidget(doRender);
              break;
            }
            await handleTripStart(doRender);
            break;
          }
          case 'MANUAL_TRIP_PAUSE': {
            if (!await acquireLock('MANUAL_TRIP_PAUSE')) {
              await renderWidget(doRender);
              break;
            }
            await handleTripPause(doRender);
            break;
          }
          case 'MANUAL_TRIP_RESUME': {
            if (!await acquireLock('MANUAL_TRIP_RESUME')) {
              await renderWidget(doRender);
              break;
            }
            await handleTripResume(doRender);
            break;
          }
          case 'MANUAL_TRIP_END': {
            if (!await acquireLock('MANUAL_TRIP_END')) {
              await renderWidget(doRender);
              break;
            }
            await handleTripEnd(doRender);
            break;
          }
          default:
            await renderWidget(doRender);
            break;
        }
        break;
      }

      default:
        break;
    }

    await widgetLog('handler:success', widgetAction);
  } catch (err) {
    await widgetLog('handler:catch', `${String(err)} | ${(err as any)?.stack?.slice(0, 300)}`);
    try {
      await renderWidget(doRender);
    } catch (err2) {
      await widgetLog('handler:fallback:error', String(err2));
    }
  }
}
