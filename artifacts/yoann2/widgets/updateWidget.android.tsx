import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { getManualTripStatus } from '@/utils/manualTripStorage';
import { getNavShortcuts } from '@/utils/navigationShortcuts';

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
    const [settings, mr, ab, shortcuts, tripStatus] = await Promise.all([
      getWidgetSettings(),
      AsyncStorage.getItem('@marie_planning_v1'),
      AsyncStorage.getItem('@anna_badges_v1'),
      getNavShortcuts(),
      getManualTripStatus(),
    ]);
    const mariePlanning = mr ? (JSON.parse(mr) as Record<string, 'PB' | 'PD'>)             : {};
    const annaBadges    = ab ? (JSON.parse(ab) as Record<string, 'Isabelle' | 'Evelyne'>) : {};
    const data = buildWidgetData(tasks ?? [], appointments ?? [], settings, null, mariePlanning, annaBadges);
    await requestWidgetUpdate({
      widgetName: 'TodoWidget',
      renderWidget: () => (
        <AllInOneWidget
          {...data}
          shortcuts={shortcuts.map(s => ({ name: s.name, lat: s.lat, lng: s.lng }))}
          tripStatus={tripStatus}
        />
      ),
      widgetNotFound: () => {},
    });
  } catch {}
}
