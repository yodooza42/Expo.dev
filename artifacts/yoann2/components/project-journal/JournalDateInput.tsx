import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { journalDateKey, parseJournalDate } from '@/utils/projectJournal';

export function JournalDateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return <View style={{ flex: 1, gap: 8 }}>
    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{label}</Text>
    {Platform.OS === 'web' ? React.createElement('input', {
      type: 'date', 'aria-label': label, value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
      style: { width: '100%', boxSizing: 'border-box', minWidth: 0, borderRadius: 10, padding: 12,
        border: `1px solid ${c.border}`, backgroundColor: c.card, color: c.foreground, colorScheme: 'dark', fontSize: 14 },
    }) : <Pressable onPress={() => setOpen(true)} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 14 }}>
      <Text style={{ color: c.foreground }}>{parseJournalDate(value)?.toLocaleDateString('fr-FR') ?? 'Choisir'}</Text>
    </Pressable>}
    {open && <DateTimePicker value={parseJournalDate(value) ?? new Date()} mode="date" onChange={(_, date) => {
      setOpen(false); if (date) onChange(journalDateKey(date));
    }} />}
  </View>;
}
