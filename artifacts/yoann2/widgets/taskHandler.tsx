import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { getWidgetDataFromStorage } from './data';
import { TodoWidget } from './TodoWidget';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    case 'WIDGET_CLICK': {
      const data = await getWidgetDataFromStorage();
      props.renderWidget(<TodoWidget {...data} />);
      break;
    }
    default:
      break;
  }
}
