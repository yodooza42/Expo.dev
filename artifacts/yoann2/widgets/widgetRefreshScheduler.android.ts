import React from 'react';
import TaskManager from 'expo-task-manager';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { getWidgetDataFromStorage } from './data';
import { TodoWidget } from './TodoWidget';

export const WIDGET_IMMINENT_REFRESH_TASK = 'WIDGET_IMMINENT_REFRESH';

export async function scheduleImminentRefresh(): Promise<void> {
  // Native alarm module removed — widget refreshes via existing background task
}

export async function cancelImminentRefresh(): Promise<void> {
  // Native alarm module removed
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
