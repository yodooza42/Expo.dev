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
  loadDayPoints,
  resetTripTracking,
  startManualTracking,
  stopTracking,
} from '@/utils/locationTracking';
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

// ─── Anti PendingIntent storm ─────────────────────────────────────────────────
// Samsung One UI re-livre les anciens PendingIntents en rafale lors d'un appui
// widget. Ce verrou global rejette tout second appel trip dans les 5 secondes
// qui suivent le premier pour absorber ces re-livraisons parasites.
const TRIP_LOCK_KEY    = '@yoann2_trip_lock';
const TRIP_LOCK_MS     = 5_000;

async function acquireTripLock(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(TRIP_LOCK_KEY);
    if (raw) {
      const ts = parseInt(raw, 10);
      if (!isNaN(ts) && Date.now() - ts < TRIP_LOCK_MS) {
        await widgetLog('trip:debounced', `${Date.now() - ts}ms since last`);
        return false;
      }
    }
    await AsyncStorage.setItem(TRIP_LOCK_KEY, String(Date.now()));
    return true;
  } catch {
    return true; // En cas d'erreur storage, on laisse passer
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
  // Guard 1 : déjà actif → on re-rend simplement, on ne réinitialise pas
  const existingState = await getManualTripState();
  if (existingState?.active) {
    await renderWidget(doRender, existingState.paused ? 'paused' : 'active');
    return;
  }
  // Guard 2 : verrou anti-storm PendingIntent Samsung
  if (!await acquireTripLock()) {
    await renderWidget(doRender, 'idle');
    return;
  }

  await maybeSuggestBatteryOptimization();
  resetTripTracking();

  const loc = await getCurrentPosition();
  const now = Date.now();

  await saveManualTripState({
    active: true,
    paused: false,
    startTime: now,
    startLat: loc?.coords.latitude ?? 0,
    startLon: loc?.coords.longitude ?? 0,
    segments: [{ start: now }],
  });

  // Await pour que la notification foreground service GPS apparaisse avant de rendre
  await startManualTracking().catch(() => {});
  await renderWidget(doRender, 'active');
}

async function handleTripPause(
  doRender: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  if (!await acquireTripLock()) {
    await renderWidget(doRender);
    return;
  }

  const state = await getManualTripState();

  if (!state || !state.active || state.paused) {
    await renderWidget(doRender);
    return;
  }

  await stopTracking().catch(() => {});

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
  if (!await acquireTripLock()) {
    await renderWidget(doRender);
    return;
  }

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

  await startManualTracking().catch(() => {});
  await renderWidget(doRender, 'active');
}

async function handleTripEnd(
  doRender: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  if (!await acquireTripLock()) {
    await renderWidget(doRender);
    return;
  }

  stopTracking().catch(() => {});

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
        switch (clickAction) {
          case 'NAVIGATE_HOME':
            await handleNavigateHome();
            break;

          case 'NAVIGATE_TO':
            await handleNavigateTo();
            break;

          case 'OPEN_FUEL':
            await handleOpenFuel();
            break;

          case 'REFRESH':
            await handleRefresh(doRender);
            break;

          case 'MANUAL_TRIP_START':
            await handleTripStart(doRender);
            break;

          case 'MANUAL_TRIP_PAUSE':
            await handleTripPause(doRender);
            break;

          case 'MANUAL_TRIP_RESUME':
            await handleTripResume(doRender);
            break;

          case 'MANUAL_TRIP_END':
            await handleTripEnd(doRender);
            break;

          case 'ADD_COFFEE':
            await addConsumption('coffee');
            // Re-rendre le widget pour invalider les anciens PendingIntents
            // (évite qu'Android re-livre l'intent lors du prochain réveil d'écran)
            await renderWidget(doRender);
            break;

          case 'ADD_CIGARETTE':
            await addConsumption('cigarette');
            await renderWidget(doRender);
            break;

          case 'ADD_TRANSACTION':
            await Linking.openURL('yoann2:///(tabs)/expenses?add=1').catch(() => {
              Linking.openURL('yoann2://').catch(() => {});
            });
            break;

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
