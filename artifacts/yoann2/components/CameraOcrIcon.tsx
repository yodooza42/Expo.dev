import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

export function CameraOcrIcon({ size = 20, color = '#FFC107' }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name="camera" size={size} color={color} />
      <Text
        style={{
          position: 'absolute',
          fontSize: size * 0.28,
          fontFamily: 'Inter_700Bold',
          color: '#121212',
          lineHeight: size * 0.32,
          marginTop: size * 0.06,
        }}
      >
        $
      </Text>
    </View>
  );
}
