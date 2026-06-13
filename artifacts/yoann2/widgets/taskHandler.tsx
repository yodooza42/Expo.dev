import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { getWidgetDataFromStorage, markTaskDone, setConfirmId } from './data';
import { TodoWidget } from './TodoWidget';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const clickAction: string = (props as any).clickAction ?? '';

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const data = await getWidgetDataFromStorage();
      props.renderWidget(<TodoWidget {...data} />);
      break;
    }

    case 'WIDGET_CLICK': {
      if (clickAction.startsWith('CHECK_')) {
        const idx = parseInt(clickAction.replace('CHECK_', ''), 10);
        const data = await getWidgetDataFromStorage();
        const task = data.tasks[idx];
        if (task) {
          await setConfirmId(task.id);
        }
        const newData = await getWidgetDataFromStorage();
        props.renderWidget(<TodoWidget {...newData} />);
      } else if (clickAction === 'CONFIRM') {
        const data = await getWidgetDataFromStorage();
        if (data.confirmTask) {
          await markTaskDone(data.confirmTask.id);
        }
        await setConfirmId(null);
        const newData = await getWidgetDataFromStorage();
        props.renderWidget(<TodoWidget {...newData} />);
      } else if (clickAction === 'CANCEL') {
        await setConfirmId(null);
        const data = await getWidgetDataFromStorage();
        props.renderWidget(<TodoWidget {...data} />);
      } else {
        const data = await getWidgetDataFromStorage();
        props.renderWidget(<TodoWidget {...data} />);
      }
      break;
    }

    default:
      break;
  }
}
