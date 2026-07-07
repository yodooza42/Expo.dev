import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { getManualTripStatus } from '@/utils/manualTripStorage';
import { getNavShortcuts } from '@/utils/navigationShortcuts';
import type { TodayApptNav } from './NavigationWidget';
import { NavigationWidget } from './NavigationWidget';

export async function updateNavWidget(): Promise<void> {
  try {
    const [shortcuts, rawAppts, tripStatus] = await Promise.all([
      getNavShortcuts(),
      AsyncStorage.getItem('@yoann2_appointments')
        .then(r => (r ? (JSON.parse(r) as any[]) : []))
        .catch(() => [] as any[]),
      getManualTripStatus(),
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const raw = rawAppts.find((a: any) => {
      if (!a.addressLat || !a.addressLng) return false;
      try {
        const d = new Date(a.date);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return k === todayStr;
      } catch {
        return false;
      }
    });

    const todayAppt: TodayApptNav | null = raw
      ? { title: raw.title, time: raw.time ?? '', lat: raw.addressLat, lng: raw.addressLng }
      : null;

    await requestWidgetUpdate({
      widgetName: 'NavigationWidget',
      renderWidget: () => (
        <NavigationWidget
          shortcuts={shortcuts}
          todayAppt={todayAppt}
          tripStatus={tripStatus}
        />
      ),
      widgetNotFound: () => {},
    });
  } catch {}
}
