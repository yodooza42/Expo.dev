import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import React from 'react';
import { Platform } from 'react-native';
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

const SPIN_FRAMES   = 8;
const SPIN_INTERVAL = 250;
const SPIN_TOTAL    = 720;

const BATTERY_OPT_PROMPTED_KEY = '@yoann2_battery_opt_prompted';

async function maybeSuggestBatteryOptimization(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const already = await AsyncStorage.getItem(BATTERY_OPT_PROMPTED_KEY);
    if (already === '1') return;
    await AsyncStorage.setItem(BATTERY_OPT_PROMPTED_KEY, '1');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Trajet GPS — action recommandée',
        body: 'Pour éviter les coupures GPS, exemptez Yoann2.0 de l\'optimisation batterie. Appuyez pour ouvrir le réglage.',
        data: { action: 'battery_optimization' },
      },
      trigger: null,
    });
  } catch {}
}

async function renderAllInOneWidget(
  renderWidget: WidgetTaskHandlerProps['renderWidget'],
  tripStatus: 'idle' | 'active' | 'paused',
): Promise<void> {
  const [data, shortcuts] = await Promise.all([
    getWidgetDataFromStorage(),
    getNavShortcuts(),
  ]);
  renderWidget(
    <AllInOneWidget
      {...data}
      shortcuts={shortcuts.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }))}
      tripStatus={tripStatus}
    />
  );
}

// ── START ──────────────────────────────────────────────────────────────────────

async function handleManualTripStart(
  renderWidget: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  await maybeSuggestBatteryOptimization();

  resetTripTracking();

  try {
    const loc = await Promise.race<Location.LocationObject | null>([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 12_000)),
    ]);

    const now = Date.now();
    await saveManualTripState({
      active: true,
      paused: false,
      startTime: now,
      startLat: loc?.coords.latitude ?? 0,
      startLon: loc?.coords.longitude ?? 0,
      segments: [{ start: now }],
    });

    await startManualTracking();
  } catch {
    // ignore — trip state saved, GPS best-effort
  }
  await renderAllInOneWidget(renderWidget, 'active');
}

// ── PAUSE ──────────────────────────────────────────────────────────────────────

async function handleManualTripPause(
  renderWidget: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  const state = await getManualTripState();
  if (!state || !state.active || state.paused) {
    const status = await getManualTripStatus();
    await renderAllInOneWidget(renderWidget, status);
    return;
  }

  // Arrêt GPS immédiat
  await stopTracking().catch(() => {});

  // Clore le segment courant
  const now = Date.now();
  const segments = state.segments.map((s, i) =>
    i === state.segments.length - 1 && !s.end ? { ...s, end: now } : s
  );

  await saveManualTripState({ ...state, paused: true, segments });
  // stopTracking() ci-dessus a arrêté le foreground service → notification disparaît automatiquement

  await renderAllInOneWidget(renderWidget, 'paused');
}

// ── RESUME ─────────────────────────────────────────────────────────────────────

async function handleManualTripResume(
  renderWidget: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  const state = await getManualTripState();
  if (!state || !state.active || !state.paused) {
    const status = await getManualTripStatus();
    await renderAllInOneWidget(renderWidget, status);
    return;
  }

  const now = Date.now();
  const segments = [...state.segments, { start: now }];

  await saveManualTripState({ ...state, paused: false, segments });
  await startManualTracking();

  await renderAllInOneWidget(renderWidget, 'active');
}

// ── END ────────────────────────────────────────────────────────────────────────

async function handleManualTripEnd(
  renderWidget: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  const manualState = await getManualTripState();

  // GPS en tout état de cause (la notification foreground disparaît avec le service)
  await stopTracking().catch(() => {});

  if (!manualState) {
    await clearManualTripState();
    await renderAllInOneWidget(renderWidget, 'idle');
    return;
  }

  const endTime = Date.now();

  // Clore le segment courant si le trajet n'était pas déjà en pause
  let segments = manualState.segments;
  if (!manualState.paused && segments.length > 0) {
    segments = segments.map((s, i) =>
      i === segments.length - 1 && !s.end ? { ...s, end: endTime } : s
    );
  }

  // Position de fin
  const endLoc = await Promise.race<Location.LocationObject | null>([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 12_000)),
  ]).catch(() => null);

  const endLat = endLoc?.coords.latitude ?? manualState.startLat;
  const endLon = endLoc?.coords.longitude ?? manualState.startLon;

  // Points GPS : filtrés sur les segments actifs uniquement (GPS coupé pendant pauses)
  const today = dateKey(new Date());
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
      p.timestamp >= s.start && p.timestamp <= (s.end ?? endTime)
    );
  });

  // Construction de la route (points GPS + fix départ/arrivée)
  let routePoints: RoutePoint[] = rawPts.map(p => ({ lat: p.lat, lng: p.lng }));
  if (routePoints.length === 0 || routePoints[0]!.lat !== manualState.startLat) {
    routePoints = [{ lat: manualState.startLat, lng: manualState.startLon }, ...routePoints];
  }
  if (routePoints.length <= 1 || routePoints[routePoints.length - 1]!.lat !== endLat) {
    routePoints = [...routePoints, { lat: endLat, lng: endLon }];
  }

  // OSRM match → distance réelle sur la route
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
    // Fallback : somme haversine des points bruts (respecte les virages)
    distanceKm = rawPts.length >= 2
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

  // Géocodage start + end
  const [startPlace, endPlace] = await Promise.all([
    findNearestPlace(trip.startLat, trip.startLon).catch(() => null),
    findNearestPlace(trip.endLat, trip.endLon).catch(() => null),
  ]);

  if (startPlace) {
    trip.startAddress = startPlace.name;
    trip.startPlaceId = startPlace.id;
  } else {
    trip.startAddress = await reverseGeocode(trip.startLat, trip.startLon).catch(() => null) ?? undefined;
  }
  if (endPlace) {
    trip.endAddress = endPlace.name;
    trip.endPlaceId = endPlace.id;
  } else {
    trip.endAddress = await reverseGeocode(trip.endLat, trip.endLon).catch(() => null) ?? undefined;
  }

  await saveTrip(trip);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Trajet terminé — Yoann 2.0',
      body: `${trip.distanceKm.toFixed(1)} km · Tapez pour choisir le véhicule et la catégorie`,
      data: { url: '/(tabs)/trips', type: 'trip_completed' },
    },
    trigger: null,
  }).catch(() => {});

  resetTripTracking();
  await clearManualTripState();
  await renderAllInOneWidget(renderWidget, 'idle');
}

// ── Widget task handler ────────────────────────────────────────────────────────

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction, clickAction, renderWidget } = props;
  const widgetName = widgetInfo.widgetName;

  // — Single all-in-one widget (replaces both TodoWidget + NavigationWidget)
  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const tripStatus = await getManualTripStatus();
      await renderAllInOneWidget(renderWidget, tripStatus);
      break;
    }

    case 'WIDGET_CLICK': {
      const data = await getWidgetDataFromStorage();

      if (clickAction === 'REFRESH') {
        const tripStatus = await getManualTripStatus();
        renderWidget(<AllInOneWidget {...data} shortcuts={[]} tripStatus={tripStatus} spinAngle={0} />);

        for (let i = 1; i <= SPIN_FRAMES; i++) {
          await new Promise<void>(res => setTimeout(res, SPIN_INTERVAL));
          const angle = (i / SPIN_FRAMES) * SPIN_TOTAL;
          await requestWidgetUpdate({
            widgetName: 'TodoWidget',
            renderWidget: () => <AllInOneWidget {...data} shortcuts={[]} tripStatus={tripStatus} spinAngle={angle} />,
            widgetNotFound: () => {},
          });
        }

        await requestWidgetUpdate({
          widgetName: 'TodoWidget',
          renderWidget: () => <AllInOneWidget {...data} shortcuts={[]} tripStatus={tripStatus} spinAngle={0} />,
          widgetNotFound: () => {},
        });
      } else if (clickAction === 'MANUAL_TRIP_START') {
        await handleManualTripStart(renderWidget);
      } else if (clickAction === 'MANUAL_TRIP_PAUSE') {
        await handleManualTripPause(renderWidget);
      } else if (clickAction === 'MANUAL_TRIP_RESUME') {
        await handleManualTripResume(renderWidget);
      } else if (clickAction === 'MANUAL_TRIP_END') {
        await handleManualTripEnd(renderWidget);
      } else {
        const tripStatus = await getManualTripStatus();
        await renderAllInOneWidget(renderWidget, tripStatus);
      }
      break;
    }

    default:
      break;
  }
}
