import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useColors } from '@/hooks/useColors';
import type { ActivityKind } from '@/types/trips';
import { ACTIVITIES } from '@/utils/activities';

export function ActivityTypePicker({
  visible, current, busy, onClose, onPick,
}: {
  visible: boolean;
  current: ActivityKind | null;
  busy: boolean;
  onClose: () => void;
  onPick: (kind: ActivityKind) => void;
}) {
  const colors = useColors();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Type d’activité">
      <View style={styles.chips}>
        {ACTIVITIES.map(activity => {
          const selected = activity.key === current;
          return (
            <Pressable
              key={activity.key}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: busy }}
              accessibilityLabel={activity.label}
              onPress={() => onPick(activity.key)}
              style={({ pressed }) => [styles.chip, {
                backgroundColor: selected ? activity.color + '22' : colors.muted,
                borderColor: selected ? activity.color : colors.border,
                opacity: busy || pressed ? 0.6 : 1,
              }]}
            >
              <MaterialCommunityIcons name={activity.icon} size={20} color={activity.color} />
              <Text style={[styles.label, { color: selected ? activity.color : colors.foreground }]}>{activity.label}</Text>
              {selected && <MaterialCommunityIcons name="check" size={16} color={activity.color} />}
            </Pressable>
          );
        })}
      </View>
      {busy && <ActivityIndicator color={colors.primary} accessibilityLabel="Enregistrement du type d’activité" />}
      <Pressable disabled={busy} onPress={onClose} style={[styles.close, { backgroundColor: colors.muted, opacity: busy ? 0.6 : 1 }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Fermer</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, flexBasis: '45%', flexGrow: 1, minHeight: 48, borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  label: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  close: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
});
