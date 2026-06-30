import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { buildWidgetData, getWidgetDataFromStorage } from './data';
import { TodoWidget } from './TodoWidget';
import { getWidgetSettings } from './widgetSettings';
import { scheduleImminentRefresh, cancelImminentRefresh } from './widgetRefreshScheduler';

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

async function _getWidgetData(tasks?: RawTaskLike[], appointments?: RawApptLike[]) {
  if (tasks === undefined && appointments === undefined) {
    return getWidgetDataFromStorage();
  }
  const [settings, mr, ab] = await Promise.all([
    getWidgetSettings(),
    AsyncStorage.getItem('@marie_planning_v1'),
    AsyncStorage.getItem('@anna_badges_v1'),
  ]);
  const mariePlanning = mr ? (JSON.parse(mr) as Record<string, 'PB' | 'PD'>)            : {};
  const annaBadges    = ab ? (JSON.parse(ab) as Record<string, 'Isabelle' | 'Evelyne'>) : {};
  return buildWidgetData(tasks ?? [], appointments ?? [], settings, null, mariePlanning, annaBadges);
}

export async function updateTodoWidget(
  tasks?: RawTaskLike[],
  appointments?: RawApptLike[]
): Promise<void> {
  try {
    const data = await _getWidgetData(tasks, appointments);
    await requestWidgetUpdate({
      widgetName: 'TodoWidget',
      renderWidget: () => <TodoWidget {...data} />,
      widgetNotFound: () => {},
    });
    if (data.hasImminentAppt) {
      await scheduleImminentRefresh();
    } else {
      await cancelImminentRefresh();
    }
  } catch {}
}
