/**
 * Widget Task Handler — AllInOneWidget
 *
 * Actions custom (→ handler JS, pas d'intent Android direct) :
 *   NAVIGATE_TO        → ouvre yoann2:///navigate-to via Linking
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
import { getNavShortcuts } from '@/utils/navigationShortcuts';
import { matchRouteOSRM, computeRouteDistanceKm } from '@/utils/osrmMatching';
import { findNearestPlace } from '@/utils/placesStorage';
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Rend le widget AllInOne avec l'état courant du trajet. */
async function renderWidget(
  doRender: WidgetTaskHandlerProps['renderWidget'],
  tripStatus?: 'idle' | 'active' | 'paused',
): Promise<void> {
  const [data, shortcuts, status] = await Promise.all([
    getWidgetDataFromStorage(),
    getNavShortcuts(),
    tripStatus !== undefined ? Promise.resolve(tripStatus) : getManualTripStatus(),
  ]);
  doRender(
    <AllInOneWidget
      {...data}
      shortcuts={shortcuts.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }))}
      tripStatus={status}
    />,
  );
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

/**
 * Ouvre la liste des destinations (Lieux connus) via deep link.
 * Fonctionne que l'app soit ouverte ou fermée.
 */
async function handleNavigateTo(): Promise<void> {
  await Linking.openURL('yoann2:///navigate-to').catch(() => {
    // Si le deep link échoue, on ouvre simplement l'app
    Linking.openURL('yoann2://').catch(() => {});
  });
}

/**
 * Ouvre l'onglet trajets (pour saisie carburant).
 */
async function handleOpenFuel(): Promise<void> {
  await Linking.openURL('yoann2:///(tabs)/trips').catch(() => {
    Linking.openURL('yoann2://').catch(() => {});
  });
}

// ─── Trajet manuel ───────────────────────────────────────────────────────────

async function handleTripStart(
  doRender: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
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

  // Démarrage GPS best-effort (non bloquant)
  startManualTracking().catch(() => {});

  // Notification de confirmation
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Trajet démarré — Yoann 2.0',
      body: 'Enregistrement GPS en cours. Appuyez sur ⏸ pour mettre en pause.',
      data: {},
    },
    trigger: null,
  }).catch(() => {});

  await renderWidget(doRender, 'active');
}

async function handleTripPause(
  doRender: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  const state = await getManualTripState();

  // Garde : si pas de trajet actif, juste rafraîchir
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
  const state = await getManualTripState();

  // Garde : si pas de trajet en pause, juste rafraîchir
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

  startManualTracking().catch(() => {});

  await renderWidget(doRender, 'active');
}

async function handleTripEnd(
  doRender: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  // Arrêt GPS immédiat — ne pas attendre
  stopTracking().catch(() => {});

  const manualState = await getManualTripState();

  if (!manualState) {
    await clearManualTripState();
    await renderWidget(doRender, 'idle');
    return;
  }

  const endTime = Date.now();

  // Clore le segment ouvert si le trajet n'était pas en pause
  let segments = manualState.segments;
  if (!manualState.paused && segments.length > 0) {
    segments = segments.map((s, i) =>
      i === segments.length - 1 && s.end == null ? { ...s, end: endTime } : s,
    );
  }

  // Mettre à jour le widget immédiatement (idle) — le reste est async
  await clearManualTripState();
  resetTripTracking();
  await renderWidget(doRender, 'idle');

  // --- Calcul du trajet en arrière-plan (ne bloque plus le widget) ---

  const endLoc = await getCurrentPosition();
  const endLat = endLoc?.coords.latitude  ?? manualState.startLat;
  const endLon = endLoc?.coords.longitude ?? manualState.startLon;

  // Points GPS filtrés sur les segments actifs
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

  // Construction de la route
  let routePoints: RoutePoint[] = rawPts.map(p => ({ lat: p.lat, lng: p.lng }));
  if (routePoints.length === 0 || routePoints[0]!.lat !== manualState.startLat) {
    routePoints = [{ lat: manualState.startLat, lng: manualState.startLon }, ...routePoints];
  }
  if (routePoints.length <= 1 || routePoints[routePoints.length - 1]!.lat !== endLat) {
    routePoints = [...routePoints, { lat: endLat, lng: endLon }];
  }

  // OSRM map-matching
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

  // Géocodage
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

  // Rendu initial (angle 0)
  doRender(
    <AllInOneWidget {...data} shortcuts={shortcutsMapped} tripStatus={tripStatus} spinAngle={0} />,
  );

  // Animation de rotation
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

  // Rendu final (angle 0, données fraîches)
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

  try {
    switch (widgetAction) {
      // Ajout / mise à jour / redimensionnement → afficher l'état courant
      case 'WIDGET_ADDED':
      case 'WIDGET_UPDATE':
      case 'WIDGET_RESIZED': {
        await renderWidget(doRender);
        break;
      }

      // Clic sur un bouton du widget
      case 'WIDGET_CLICK': {
        switch (clickAction) {
          case 'NAVIGATE_TO':
            // Ouvre la liste des destinations (Lieux connus → Waze)
            await handleNavigateTo();
            break;

          case 'OPEN_FUEL':
            // Ouvre l'onglet trajets pour saisie carburant
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

          default:
            // Action inconnue ou OPEN_APP / OPEN_URI natif → rafraîchir
            await renderWidget(doRender);
            break;
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // En cas d'erreur inattendue : tenter de rafraîchir le widget sans crash
    try {
      await renderWidget(doRender);
    } catch {}
  }
}
