import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { getOffset, getWidgetDataFromStorage, setOffset } from './data';
import { TodoWidget } from './TodoWidget';

const MAX_OFFSET = 60;

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const offset = await getOffset();
      const data = await getWidgetDataFromStorage(offset);
      props.renderWidget(<TodoWidget {...data} />);
      break;
    }
    case 'WIDGET_CLICK': {
      // 'OPEN_APP' is handled natively by the library and does not reach here.
      let offset = await getOffset();
      if (props.clickAction === 'NEXT') offset = Math.min(offset + 1, MAX_OFFSET);
      else if (props.clickAction === 'PREV') offset = Math.max(offset - 1, 0);
      await setOffset(offset);
      const data = await getWidgetDataFromStorage(offset);
      props.renderWidget(<TodoWidget {...data} />);
      break;
    }
    default:
      break;
  }
}
