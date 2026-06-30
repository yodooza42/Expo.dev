import React from 'react';
import { requireNativeModule } from 'expo-modules-core';
import TaskManager from 'expo-task-manager';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { getWidgetDataFromStorage } from './data';
import { TodoWidget } from './TodoWidget';

const WidgetAlarm = (() => {
  try {
    return requireNativeModule<{
      scheduleAlarm: (intervalMs: number) => void;
      cancelAlarm: () => void;
    }>('WidgetAlarm');
  } catch {
    return null;
  }
})();

export const WIDGET_IMMINENT_REFRESH_TASK = 'WIDGET_IMMINENT_REFRESH';

const ALARM_INTERVAL_MS = 60_000; // 60 seconds (AlarmManager.setRepeating)

export async function scheduleImminentRefresh(): Promise<void> {
  WidgetAlarm?.scheduleAlarm(ALARM_INTERVAL_MS);
}

export async function cancelImminentRefresh(): Promise<void> {
  WidgetAlarm?.cancelAlarm();
}

TaskManager.defineTask(WIDGET_IMMINENT_REFRESH_TASK, async () => {
  const data = await getWidgetDataFromStorage();
  if (!data.hasImminentAppt) {
    await cancelImminentRefresh();
    return;
  }
  await requestWidgetUpdate({
    widgetName: 'TodoWidget',
    renderWidget: () => React.createElement(TodoWidget, data),
    widgetNotFound: () => {},
  });
});
