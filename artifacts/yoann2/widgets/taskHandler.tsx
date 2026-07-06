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
import { dateKey, loadDayPoints, startManualTracking, stopTracking } from '@/utils/locationTracking';
import {
  clearManualTripState,
  getManualTripState,
  isManualTripActive,
  saveManualTripState,
} from '@/utils/manualTripStorage';
import { getNavShortcuts } from '@/utils/navigationShortcuts';
import { matchRouteOSRM, computeRouteDistanceKm } from '@/utils/osrmMatching';
import { findNearestPlace } from '@/utils/placesStorage';
import { simplifyRoute } from '@/utils/routeSimplification';
import { saveTrip } from '@/utils/tripStorage';
import { getWidgetDataFromStorage } from './data';
import type { TodayApptNav } from './NavigationWidget';
import { NavigationWidget } from './NavigationWidget';
import { TodoWidget } from './TodoWidget';

const SPIN_FRAMES   = 8;    // frames
const SPIN_INTERVAL = 250;  // ms per frame  →  8 × 250 = 2 s
const SPIN_TOTAL    = 720;  // degrees  →  2 full rotations

const BATTERY_OPT_PROMPTED_KEY = '@yoann2_battery_opt_prompted';

// Sends a one-time notification asking the user to exempt the app from battery
// optimisation (Samsung One UI kills background foreground services otherwise).
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
  } catch {
    // best-effort
  }
}

async function renderNavWidget(
  renderWidget: WidgetTaskHandlerProps['renderWidget'],
  manualTripActive: boolean,
): Promise<void> {
  const [shortcuts, rawAppts] = await Promise.all([
    getNavShortcuts(),
    AsyncStorage.getItem('@yoann2_appointments')
      .then(r => (r ? (JSON.parse(r) as any[]) : []))
      .catch(() => [] as any[]),
  ]);
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayApptRaw = rawAppts.find((a: any) => {
    if (!a.addressLat || !a.addressLng) return false;
    try {
      const d = new Date(a.date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return k === todayStr;
    } catch { return false; }
  });
  const todayAppt: TodayApptNav | null = todayApptRaw
    ? { title: todayApptRaw.title, time: todayApptRaw.time ?? '', lat: todayApptRaw.addressLat, lng: todayApptRaw.addressLng }
    : null;
  renderWidget(<NavigationWidget shortcuts={shortcuts} todayAppt={todayAppt} manualTripActive={manualTripActive} />);
}

async function handleManualTripStart(
  renderWidget: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  // One-time battery optimisation prompt (Samsung One UI kills FG services).
  await maybeSuggestBatteryOptimization();

  try {
    // High accuracy (real GPS chip) + 12 s timeout to let the chip converge.
    const loc = await Promise.race<Location.LocationObject | null>([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 12_000)),
    ]);

    await saveManualTripState({
      active: true,
      startTime: Date.now(),
      startLat: loc?.coords.latitude ?? 0,
      startLon: loc?.coords.longitude ?? 0,
    });

    await startManualTracking();
  } catch {
    // ignore — trip state saved, GPS best-effort
  }
  await renderNavWidget(renderWidget, true);
}

async function handleManualTripEnd(
  renderWidget: WidgetTaskHandlerProps['renderWidget'],
): Promise<void> {
  const manualState = await getManualTripState();

  // Arrêt GPS en tout état de cause
  await stopTracking().catch(() => {});

  if (!manualState) {
    await clearManualTripState();
    await renderNavWidget(renderWidget, false);
    return;
  }

  const endTime = Date.now();

  // Position de fin — High accuracy + 12 s pour laisser la puce GPS converger.
  const endLoc = await Promise.race<Location.LocationObject | null>([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 12_000)),
  ]).catch(() => null);

  const endLat = endLoc?.coords.latitude ?? manualState.startLat;
  const endLon = endLoc?.coords.longitude ?? manualState.startLon;

  // Récupération des points GPS enregistrés entre Start et End
  const today = dateKey(new Date());
  const yesterday = dateKey(new Date(endTime - 86_400_000));
  const [todayPts, yesterdayPts] = await Promise.all([
    loadDayPoints(today),
    loadDayPoints(yesterday),
  ]);

  const rawPts = [...yesterdayPts, ...todayPts]
    .filter(p => p.timestamp >= manualState.startTime && p.timestamp <= endTime)
    .sort((a, b) => a.timestamp - b.timestamp);

  // Construction de la route (points GPS + fix de départ/arrivée)
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
    distanceKm = haversineKm(manualState.startLat, manualState.startLon, endLat, endLon);
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

  await clearManualTripState();
  await renderNavWidget(renderWidget, false);
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction, clickAction, renderWidget } = props;
  const widgetName = widgetInfo.widgetName;

  // ── NavigationWidget ────────────────────────────────────────────────────────
  if (widgetName === 'NavigationWidget') {
    switch (widgetAction) {
      case 'WIDGET_ADDED':
      case 'WIDGET_UPDATE':
      case 'WIDGET_RESIZED': {
        const manualTripActive = await isManualTripActive();
        await renderNavWidget(renderWidget, manualTripActive);
        break;
      }

      case 'WIDGET_CLICK': {
        if (clickAction === 'MANUAL_TRIP_START') {
          await handleManualTripStart(renderWidget);
        } else if (clickAction === 'MANUAL_TRIP_END') {
          await handleManualTripEnd(renderWidget);
        } else {
          const manualTripActive = await isManualTripActive();
          await renderNavWidget(renderWidget, manualTripActive);
        }
        break;
      }

      default:
        break;
    }
    return;
  }

  // ── TodoWidget (default) ────────────────────────────────────────────────────
  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const data = await getWidgetDataFromStorage();
      renderWidget(<TodoWidget {...data} />);
      break;
    }

    case 'WIDGET_CLICK': {
      const data = await getWidgetDataFromStorage();

      if (clickAction === 'REFRESH') {
        // Frame 0 — render immediately via the current task slot
        renderWidget(<TodoWidget {...data} spinAngle={0} />);

        // Frames 1–8 — push updates at SPIN_INTERVAL cadence
        for (let i = 1; i <= SPIN_FRAMES; i++) {
          await new Promise<void>(res => setTimeout(res, SPIN_INTERVAL));
          const angle = (i / SPIN_FRAMES) * SPIN_TOTAL;
          await requestWidgetUpdate({
            widgetName: 'TodoWidget',
            renderWidget: () => <TodoWidget {...data} spinAngle={angle} />,
            widgetNotFound: () => {},
          });
        }

        // Final frame — snap back to 0°
        await requestWidgetUpdate({
          widgetName: 'TodoWidget',
          renderWidget: () => <TodoWidget {...data} spinAngle={0} />,
          widgetNotFound: () => {},
        });
      } else {
        renderWidget(<TodoWidget {...data} />);
      }
      break;
    }

    default:
      break;
  }
}
