import React, { useEffect, useRef } from 'react';
import type { ActivityMapProps } from '@/utils/activityMapHtml';

export default function ActivityMapView({ html, onTripPress, onPointPress }: ActivityMapProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== ref.current?.contentWindow || typeof event.data !== 'string') return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'trip' && typeof message.id === 'string') onTripPress?.(message.id);
        if (message.type === 'point' && Number.isInteger(message.index) && message.index >= 0) onPointPress?.(message.index);
      } catch { /* Ignore unrelated frame messages. */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onTripPress, onPointPress]);
  return React.createElement('iframe', {
    ref, srcDoc: html, title: 'Carte des activités', sandbox: 'allow-scripts allow-same-origin',
    style: { width: '100%', height: '100%', border: 'none', flex: 1 },
  });
}
