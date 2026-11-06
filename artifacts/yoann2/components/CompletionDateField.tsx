import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { formatCompletionDate } from '@/utils/completionDate';

export function CompletionDateField({ value, onChange, error }: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Date réelle de fin</Text>
      <View style={styles.row}>
        <TextInput
          testID="completion-date-input"
          accessibilityLabel="Date réelle de fin"
          value={value}
          onChangeText={onChange}
          placeholder="JJ/MM/AAAA"
          placeholderTextColor={colors.mutedForeground}
          maxLength={10}
          autoCorrect={false}
          style={[styles.input, {
            backgroundColor: colors.card, color: colors.foreground,
            borderColor: error ? colors.destructive : colors.border,
          }]}
        />
        <Pressable
          testID="completion-date-today"
          onPress={() => onChange(formatCompletionDate())}
          style={[styles.today, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.label, { color: colors.primary }]}>Aujourd’hui</Text>
        </Pressable>
      </View>
      <Text style={[styles.help, { color: error ? colors.destructive : colors.mutedForeground }]}>
        {error ?? 'Corrige cette date si tu as terminé plus tôt. L’échéance reste inchangée.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
  today: { justifyContent: 'center', paddingHorizontal: 12, minHeight: 48, borderWidth: 1, borderRadius: 12 },
  help: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
});
