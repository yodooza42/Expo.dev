import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { buildWidgetData } from './data';
import { TodoWidget } from './TodoWidget';
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
    const settings = await getWidgetSettings();
    const data = buildWidgetData(tasks ?? [], appointments ?? [], settings, null);
    await requestWidgetUpdate({
      widgetName: 'TodoWidget',
      renderWidget: () => <TodoWidget {...data} />,
      widgetNotFound: () => {},
    });
  } catch {}
}
