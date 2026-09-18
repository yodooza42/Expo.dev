import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/hooks/useColors';
import type { Priority } from '@/types';

interface Props {
  priority: Priority;
  small?: boolean;
}

const LABELS: Record<Priority, string> = {
  low: 'Faible',
  medium: 'Moyenne',
  high: 'Haute',
  critical: 'Critique',
};

export function PriorityBadge({ priority, small = false }: Props) {
  const colors = useColors();

  const bgColor = {
    low: colors.priorityLow,
    medium: colors.priorityMedium,
    high: colors.priorityHigh,
    critical: colors.priorityCritical,
  }[priority];

  return (
    <View style={[styles.badge, { backgroundColor: bgColor + '30', borderColor: bgColor }, small && styles.small]}>
      <View style={[styles.dot, { backgroundColor: bgColor }]} />
      <Text style={[styles.label, { color: bgColor }, small && styles.smallLabel]}>
        {LABELS[priority]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
    alignSelf: 'flex-start',
  },
  small: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  smallLabel: {
    fontSize: 10,
  },
});
