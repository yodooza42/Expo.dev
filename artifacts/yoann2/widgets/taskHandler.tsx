import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { getWidgetDataFromStorage } from './data';
import { TodoWidget } from './TodoWidget';

const SPIN_FRAMES   = 8;    // frames
const SPIN_INTERVAL = 250;  // ms per frame  →  8 × 250 = 2 s
const SPIN_TOTAL    = 720;  // degrees  →  2 full rotations

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const data = await getWidgetDataFromStorage();
      props.renderWidget(<TodoWidget {...data} />);
      break;
    }

    case 'WIDGET_CLICK': {
      const data = await getWidgetDataFromStorage();

      if (props.clickAction === 'REFRESH') {
        // Frame 0 — render immediately via the current task slot
        props.renderWidget(<TodoWidget {...data} spinAngle={0} />);

        // Frames 1–8 — push updates at SPIN_INTERVAL cadence
        for (let i = 1; i <= SPIN_FRAMES; i++) {
          await new Promise<void>(res => setTimeout(res, SPIN_INTERVAL));
          const angle = (i / SPIN_FRAMES) * SPIN_TOTAL;
          await requestWidgetUpdate({
            widgetName: 'TodoWidget',
            renderWidget: () => <TodoWidget {...data} spinAngle={angle} />,
            widgetNotFound: () => {},
          });
        }

        // Final frame — snap back to 0°
        await requestWidgetUpdate({
          widgetName: 'TodoWidget',
          renderWidget: () => <TodoWidget {...data} spinAngle={0} />,
          widgetNotFound: () => {},
        });
      } else {
        props.renderWidget(<TodoWidget {...data} />);
      }
      break;
    }

    default:
      break;
  }
}
