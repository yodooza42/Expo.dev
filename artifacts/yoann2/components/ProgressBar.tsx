import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useColors } from '@/hooks/useColors';

interface Props {
  progress: number;
  showLabel?: boolean;
  height?: number;
  color?: string;
}

export function ProgressBar({ progress, showLabel = false, height = 6, color }: Props) {
  const colors = useColors();
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(Math.max(0, Math.min(100, progress)), { duration: 800 });
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  const barColor = color ?? colors.primary;

  return (
    <View style={styles.container}>
      {showLabel && (
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{Math.round(progress)}%</Text>
      )}
      <View style={[styles.track, { height, backgroundColor: colors.border }]}>
        <Animated.View
          style={[styles.fill, barStyle, { height, backgroundColor: barColor, borderRadius: height / 2 }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    alignSelf: 'flex-end',
  },
  track: {
    width: '100%',
    borderRadius: 100,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
