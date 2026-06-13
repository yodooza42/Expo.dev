import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { buildWidgetData, getOffset, type WidgetDayData } from './data';
import { TodoWidget } from './TodoWidget';

interface RawTaskLike {
  title: string;
  dueDate: string;
  priority: string;
  status: string;
}

interface RawApptLike {
  title: string;
  date: string;
  time: string;
}

export async function updateTodoWidget(
  tasks?: RawTaskLike[],
  appointments?: RawApptLike[]
): Promise<void> {
  try {
    const offset = await getOffset();
    const data: WidgetDayData = buildWidgetData(tasks ?? [], appointments ?? [], offset);
    await requestWidgetUpdate({
      widgetName: 'TodoWidget',
      renderWidget: () => <TodoWidget {...data} />,
      widgetNotFound: () => {},
    });
  } catch {}
}
