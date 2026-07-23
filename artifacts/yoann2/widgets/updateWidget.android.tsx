import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { getManualTripState } from '@/utils/manualTripStorage';
import { getKnownPlaces } from '@/utils/placesStorage';

import { AllInOneWidget } from './AllInOneWidget';
import { buildWidgetData } from './data';
import { getWidgetSettings } from './widgetSettings';

interface RawTaskLike {
  id?: string;
  title: string;
  dueDate?: string;
  priority: string;
  status: string;
}

interface RawApptLike {
  title: string;
  date: string;
  time?: string;
}

export async function updateTodoWidget(
  tasks?: RawTaskLike[],
  appointments?: RawApptLike[]
): Promise<void> {
  try {
    const [settings, mr, ab, shortcuts, tripState, tripDistRaw] = await Promise.all([
      getWidgetSettings(),
      AsyncStorage.getItem('@marie_planning_v1'),
      AsyncStorage.getItem('@anna_badges_v1'),
      getKnownPlaces(),
      getManualTripState(),
      AsyncStorage.getItem('@yoann2_trip_dist_km'),
    ]);
    const mariePlanning = mr ? (JSON.parse(mr) as Record<string, 'PB' | 'PD'>)             : {};
    const annaBadges    = ab ? (JSON.parse(ab) as Record<string, 'Isabelle' | 'Evelyne'>) : {};

    const tripStatus: 'idle' | 'selecting' | 'active' | 'paused' =
      !tripState         ? 'idle'
      : tripState.selecting ? 'selecting'
      : tripState.paused    ? 'paused'
      : 'active';

    const tripDistKm = tripDistRaw ? parseFloat(tripDistRaw) || 0 : 0;

    const now = Date.now();
    let tripElapsedMs = 0;
    if (tripState && tripState.segments.length > 0) {
      for (const seg of tripState.segments) {
        tripElapsedMs += Math.max(0, (seg.end ?? now) - seg.start);
      }
    }

    const data = buildWidgetData(tasks ?? [], appointments ?? [], settings, null, mariePlanning, annaBadges);
    await requestWidgetUpdate({
      widgetName: 'TodoWidget',
      renderWidget: () => (
        <AllInOneWidget
          {...data}
          shortcuts={shortcuts.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }))}
          tripStatus={tripStatus}
          tripMode={tripState?.tripMode ?? null}
          tripDistKm={tripDistKm}
          tripElapsedMs={tripElapsedMs}
        />
      ),
      widgetNotFound: () => {},
    });
  } catch {}
}
