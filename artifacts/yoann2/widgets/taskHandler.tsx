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
  compactStoredLocationHistory,
  getTripDistKm,
  loadDayPoints,
  resetTripTracking,
  pauseManualTracking,
  startManualTracking,
  stopTracking,
  TRIP_MODE_KEY,
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
import { simplifyRoute, EPSILON_DEG_WALK } from '@/utils/routeSimplification';
import { getVehicleSettings, saveTrip } from '@/utils/tripStorage';
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
  // Sélection de mode : 10 s (protection double-tap)
  SELECT_MODE_VOITURE: 10_000,
  SELECT_MODE_MOTO:    10_000,
  SELECT_MODE_BALADE:  10_000,
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

/** Calcule les champs de trajet en cours (mode/distance/durée) pour un statut donné. */
async function computeTripFields(
  status: 'idle' | 'selecting' | 'active' | 'paused',
): Promise<{ tripMode: 'voiture' | 'moto' | 'balade' | null; tripDistKm: number; tripElapsedMs: number }> {
  let tripMode: 'voiture' | 'moto' | 'balade' | null = null;
  let tripDistKm = 0;
  let tripElapsedMs = 0;

  if (status === 'active' || status === 'paused') {
    const tripState = await getManualTripState();
    if (tripState) {
      tripMode = tripState.tripMode ?? null;
      const distRaw = await AsyncStorage.getItem('@yoann2_trip_dist_km').catch(() => null);
      tripDistKm = distRaw ? (parseFloat(distRaw) || 0) : getTripDistKm();
      const now = Date.now();
      for (const seg of tripState.segments) {
        tripElapsedMs += (seg.end ?? now) - seg.start;
      }
    }
  }

  return { tripMode, tripDistKm, tripElapsedMs };
}

/** Rend le widget AllInOne avec l'état courant du trajet. */
async function renderWidget(
  doRender: WidgetTaskHandlerProps['renderWidget'],
  tripStatus?: 'idle' | 'selecting' | 'active' | 'paused',
): Promise<void> {
  await widgetLog('renderWidget:start', `tripStatus=${tripStatus ?? 'auto'}`);
  try {
    const [data, shortcuts, status] = await Promise.all([
      getWidgetDataFromStorage(),
      getNavShortcuts(),
      tripStatus !== undefined ? Promise.resolve(tripStatus) : getManualTripStatus(),
    ]);

    const { tripMode, tripDistKm, tripElapsedMs } = await computeTripFields(status);

    await widgetLog('renderWidget:data', `tasks=${data.tasks.length} shortcuts=${shortcuts.length} status=${status}`);
    doRender(
      <AllInOneWidget
        {...data}
        shortcuts={shortcuts.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }))}
        tripStatus={status}
        tripMode={tripMode}
        tripDistKm={tripDistKm}
        tripElapsedMs={tripElapsedMs}
      />,
    );
    await widgetLog('renderWidget:done', 'ok');
  } catch (err) {
    await widgetLog('renderWidget:error', `${String(err)} | ${(err as any)?.stack?.slice(0, 300)}`);
    throw err;
  }
}

/** Rafraîchit tous les widgets de type TodoWidget (requestWidgetUpdate). */
async function refreshAllWidgets(tripStatus: 'idle' | 'selecting' | 'active' | 'paused'): Promise<void> {
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
  // Un long trajet peut avoir laissé une journée GPS volumineuse. Compacter
  // avant d'écrire le nouvel état évite un échec AsyncStorage silencieux.
  await compactStoredLocationHistory();
  // Guard état : déjà actif → re-rendre sans réinitialiser
  const existingState = await getManualTripState();
  if (existingState?.active) {
    const trackingRegistered = await Location.hasStartedLocationUpdatesAsync(
      'background-location-task',
    ).catch(() => false);
    if (trackingRegistered) {
      await renderWidget(doRender, existingState.paused ? 'paused' : 'active');
      return;
    }
    // État laissé par un ancien trajet dont le service GPS a déjà disparu.
    // On le remet à zéro pour permettre un nouveau démarrage propre.
    await clearManualTripState();
    await AsyncStorage.removeItem(TRIP_MODE_KEY).catch(() => {});
    resetTripTracking();
  }
  // Guard état : déjà en sélection → re-rendre sans réinitialiser
  if (existingState?.selecting) {
    await renderWidget(doRender, 'selecting');
    return;
  }

  // Passer en mode "sélection" : l'utilisateur doit choisir Voiture / Moto / Balade
  const saved = await saveManualTripState({
    active: false,
    selecting: true,
    paused: false,
    startTime: 0,
    startLat: 0,
    startLon: 0,
    segments: [],
  });
  if (!saved) {
    await widgetLog('trip:start:state_save_failed', 'impossible de persister la sélection');
    await renderWidget(doRender, 'idle');
    return;
  }

  await renderWidget(doRender, 'selecting');
}

async function handleSelectMode(
  mode: 'voiture' | 'moto' | 'balade',
  doRender: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  const existingState = await getManualTripState();
  if (!existingState?.selecting) {
    await renderWidget(doRender);
    return;
  }

  resetTripTracking();
  const now = Date.now();

  const saved = await saveManualTripState({
    active: true,
    selecting: false,
    paused: false,
    startTime: now,
    startLat: 0,
    startLon: 0,
    segments: [{ start: now }],
    tripMode: mode,
  });
  if (!saved) {
    await AsyncStorage.removeItem(TRIP_MODE_KEY).catch(() => {});
    resetTripTracking();
    await widgetLog('trip:select_mode:state_save_failed', 'impossible de persister le trajet');
    await renderWidget(doRender, 'idle');
    return;
  }

  // CRITIQUE : démarrer le FGS IMMÉDIATEMENT dans la fenêtre d'exemption
  // Android 12+ (~10 s après l'appui widget).
  try {
    await startManualTracking(mode);
  } catch (err) {
    // Sur certains appareils (notamment Samsung/Android récent), Android
    // refuse le démarrage du FGS depuis le processus headless du widget,
    // même après un appui utilisateur. L'état du trajet est déjà persisté :
    // on le conserve, on ouvre l'app et PlayerScreen relancera le GPS au
    // premier plan, où le démarrage est autorisé.
    await widgetLog('trip:select_mode:fgs_deferred', String(err));
    setTripStatus(true);
    loadPlaylist().then(tracks => {
      if (tracks.length) startCarPlaylist(tracks, 0);
    }).catch(() => {});
    await renderWidget(doRender, 'active');
    await Linking.openURL('yoann2:///(tabs)/player').catch(() => {});
    return;
  }
  setTripStatus(true);
  loadPlaylist().then(tracks => {
    if (tracks.length) startCarPlaylist(tracks, 0);
  }).catch(() => {});
  Linking.openURL('yoann2:///(tabs)/player').catch(() => {});

  await maybeSuggestBatteryOptimization();
  await renderWidget(doRender, 'active');

  // Position de départ récupérée APRÈS coup
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
  // Attendre la fin du service avant un éventuel nouveau démarrage.
  await stopTracking().catch(() => {});
  setTripStatus(false);
  stopCarPlayer();

  const manualState = await getManualTripState();

  if (!manualState) {
    await AsyncStorage.removeItem(TRIP_MODE_KEY).catch(() => {});
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

  const savedMode = manualState.tripMode ?? null;

  await clearManualTripState();
  await AsyncStorage.removeItem(TRIP_MODE_KEY).catch(() => {});
  resetTripTracking();
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

  let routePoints: RoutePoint[] = rawPts.map(p => ({ lat: p.lat, lng: p.lng, t: p.timestamp }));
  // Ne préfixer le point de départ que si on a des coordonnées valides
  // (évite d'injecter (0,0) quand le GPS a timeout au démarrage du trajet).
  const hasValidStart = manualState.startLat !== 0 || manualState.startLon !== 0;
  if (hasValidStart && (routePoints.length === 0 || routePoints[0]!.lat !== manualState.startLat)) {
    routePoints = [{ lat: manualState.startLat, lng: manualState.startLon, t: manualState.startTime }, ...routePoints];
  }
  if (routePoints.length <= 1 || routePoints[routePoints.length - 1]!.lat !== endLat) {
    routePoints = [...routePoints, { lat: endLat, lng: endLon, t: endTime }];
  }

  // Balades : OSRM est un routeur voiture — il snaperait le tracé sur des routes
  // bitumées et ignorerait les sentiers. On utilise les points GPS directement.
  const isWalkMode = savedMode === 'balade';

  let osrmRoute: RoutePoint[] | null = null;
  try {
    if (!isWalkMode && routePoints.length >= 2) {
      osrmRoute = await matchRouteOSRM(routePoints);
    }
  } catch {}

  // Distance GPS brute (référence) : toujours calculée quand on a assez de points,
  // pour pouvoir détecter un map-matching OSRM aberrant (ex : retour court-circuité,
  // matching partiel) avant de lui faire confiance.
  const rawDistanceKm =
    rawPts.length >= 2
      ? computeRouteDistanceKm(rawPts.map(p => ({ lat: p.lat, lng: p.lng })))
      : haversineKm(manualState.startLat, manualState.startLon, endLat, endLon);

  // On ne fait confiance au tracé OSRM que s'il reste cohérent avec la distance
  // GPS réelle. Le service de map-matching peut silencieusement renvoyer un
  // tracé partiel/tronqué (ex : 11,8 km affichés pour un vrai trajet de 67,8 km) —
  // dans ce cas on retombe sur le tracé GPS brut, comme pour les balades.
  const osrmDistanceKm = osrmRoute ? computeRouteDistanceKm(osrmRoute) : null;
  const osrmIsPlausible =
    osrmDistanceKm != null &&
    rawPts.length >= 2 &&
    (rawDistanceKm < 0.3 ||
      (osrmDistanceKm >= rawDistanceKm * 0.7 && osrmDistanceKm <= rawDistanceKm * 1.4));

  const trustedOsrmRoute = osrmIsPlausible ? osrmRoute : null;
  const distanceKm = trustedOsrmRoute ? osrmDistanceKm! : rawDistanceKm;

  // Balades : epsilon fin (~4 m) pour conserver les courbes des sentiers.
  // Voiture/moto : epsilon standard (~15 m), OSRM en priorité si le matching est fiable.
  const finalRoute = isWalkMode
    ? simplifyRoute(routePoints, EPSILON_DEG_WALK)
    : simplifyRoute(trustedOsrmRoute ?? routePoints);

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
    routeSource: trustedOsrmRoute ? 'osrm' : 'gps',
    source: 'manual',
  };

  // Pré-assigne le véhicule selon le mode widget — évite le prompt "Quel véhicule?"
  if (savedMode === 'voiture') {
    trip.vehicle = 'car';
  } else if (savedMode === 'moto') {
    trip.vehicle = 'moto';
  } else if (savedMode === 'balade') {
    try {
      const vehicleSettings = await getVehicleSettings();
      const walkVehicle = vehicleSettings.find(v => v.type === 'walk');
      if (walkVehicle) trip.vehicle = walkVehicle.id;
    } catch {}
  }

  const [startPlace, endPlace] = await Promise.all([
    findNearestPlace(trip.startLat!, trip.startLon!).catch(() => null),
    findNearestPlace(trip.endLat!, trip.endLon!).catch(() => null),
  ]);

  if (startPlace) {
    trip.startAddress = startPlace.name;
    trip.startPlaceId = startPlace.id;
  } else {
    trip.startAddress =
      (await reverseGeocode(trip.startLat!, trip.startLon!).catch(() => null)) ?? undefined;
  }
  if (endPlace) {
    trip.endAddress = endPlace.name;
    trip.endPlaceId = endPlace.id;
  } else {
    trip.endAddress =
      (await reverseGeocode(trip.endLat!, trip.endLon!).catch(() => null)) ?? undefined;
  }

  await saveTrip(trip);

  // Ouvre directement la page du trajet balade pour choisir les participants
  if (savedMode === 'balade') {
    Linking.openURL(`yoann2:///trip-map?id=${trip.id}`).catch(() => {});
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Trajet terminé — Yoann 2.0',
      body: `${trip.distanceKm.toFixed(1)} km`,
      data: { url: `/trip-map?id=${trip.id}`, type: 'trip_completed' },
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
  const { tripMode, tripDistKm, tripElapsedMs } = await computeTripFields(tripStatus);

  const shortcutsMapped = shortcuts.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }));

  doRender(
    <AllInOneWidget
      {...data}
      shortcuts={shortcutsMapped}
      tripStatus={tripStatus}
      tripMode={tripMode}
      tripDistKm={tripDistKm}
      tripElapsedMs={tripElapsedMs}
      spinAngle={0}
    />,
  );

  for (let i = 1; i <= SPIN_FRAMES; i++) {
    await new Promise<void>(res => setTimeout(res, SPIN_INTERVAL_MS));
    const angle = (i / SPIN_FRAMES) * 720;
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: () => (
        <AllInOneWidget
          {...data}
          shortcuts={shortcutsMapped}
          tripStatus={tripStatus}
          tripMode={tripMode}
          tripDistKm={tripDistKm}
          tripElapsedMs={tripElapsedMs}
          spinAngle={angle}
        />
      ),
      widgetNotFound: () => {},
    });
  }

  const [freshData, freshShortcuts, freshStatus] = await Promise.all([
    getWidgetDataFromStorage(),
    getNavShortcuts(),
    getManualTripStatus(),
  ]);
  const freshTrip = await computeTripFields(freshStatus);
  const freshMapped = freshShortcuts.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }));
  await requestWidgetUpdate({
    widgetName: WIDGET_NAME,
    renderWidget: () => (
      <AllInOneWidget
        {...freshData}
        shortcuts={freshMapped}
        tripStatus={freshStatus}
        tripMode={freshTrip.tripMode}
        tripDistKm={freshTrip.tripDistKm}
        tripElapsedMs={freshTrip.tripElapsedMs}
        spinAngle={0}
      />
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
            if (!await acquireLock('MANUAL_TRIP_START')) {
              await renderWidget(doRender);
              break;
            }
            await handleTripStart(doRender);
            break;
          }
          case 'SELECT_MODE_VOITURE': {
            if (!await acquireLock('SELECT_MODE_VOITURE')) {
              await renderWidget(doRender);
              break;
            }
            await handleSelectMode('voiture', doRender);
            break;
          }
          case 'SELECT_MODE_MOTO': {
            if (!await acquireLock('SELECT_MODE_MOTO')) {
              await renderWidget(doRender);
              break;
            }
            await handleSelectMode('moto', doRender);
            break;
          }
          case 'SELECT_MODE_BALADE': {
            if (!await acquireLock('SELECT_MODE_BALADE')) {
              await renderWidget(doRender);
              break;
            }
            await handleSelectMode('balade', doRender);
            break;
          }
          case 'MANUAL_TRIP_PAUSE': {
            await handleTripPause(doRender);
            break;
          }
          case 'MANUAL_TRIP_RESUME': {
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
