import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/hooks/useColors';

interface Props {
  label: string;
  value: number | string;
  icon: string;
  accent?: string;
}

export function StatCard({ label, value, icon, accent }: Props) {
  const colors = useColors();
  const accentColor = accent ?? colors.primary;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: accentColor + '20' }]}>
        <MaterialCommunityIcons name={icon as any} size={22} color={accentColor} />
      </View>
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'flex-start',
    gap: 6,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    lineHeight: 28,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
