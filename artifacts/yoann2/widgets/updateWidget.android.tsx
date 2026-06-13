import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { buildWidgetData, type WidgetData } from './data';
import { TodoWidget } from './TodoWidget';

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
    const data: WidgetData = buildWidgetData(tasks ?? [], appointments ?? []);
    await requestWidgetUpdate({
      widgetName: 'TodoWidget',
      renderWidget: () => <TodoWidget {...data} />,
      widgetNotFound: () => {},
    });
  } catch {}
}
