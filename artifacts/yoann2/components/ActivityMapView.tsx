import React, { useState } from 'react';
import { Text, View } from 'react-native';
import WebView from 'react-native-webview';
import { useColors } from '@/hooks/useColors';
import type { ActivityMapProps } from '@/utils/activityMapHtml';

export default function ActivityMapView({ html, onTripPress, onPointPress }: ActivityMapProps) {
  const colors = useColors();
  const [failed, setFailed] = useState(false);
  return <View style={{ flex: 1 }}>
    <WebView source={{ html }} originWhitelist={['*']} javaScriptEnabled
      style={{ flex: 1, backgroundColor: colors.background }}
      onError={() => setFailed(true)}
      onMessage={event => {
        try {
          const message = JSON.parse(event.nativeEvent.data);
          if (message.type === 'trip' && typeof message.id === 'string') onTripPress?.(message.id);
          if (message.type === 'point' && Number.isInteger(message.index) && message.index >= 0) onPointPress?.(message.index);
        } catch { /* Ignore unrelated WebView messages. */ }
      }} />
    {failed && <Text style={{ color: colors.foreground, padding: 12 }}>Carte indisponible. Les activités restent accessibles dans la liste.</Text>}
  </View>;
}
