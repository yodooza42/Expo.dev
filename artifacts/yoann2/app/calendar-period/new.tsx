import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SubPageHeader } from '@/components/SubPageHeader';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { CalendarPeriodOwner } from '@/types';

const COLORS = ['#F59E0B', '#EC4899', '#7C3AED', '#2196F3', '#14B8A6', '#4CAF50', '#EF4444'];
const OWNERS: { key: CalendarPeriodOwner; label: string; icon: 'account-outline' | 'account-heart-outline' | 'account-multiple-outline' }[] = [
  { key: 'yoann', label: 'Yoann', icon: 'account-outline' },
  { key: 'marie', label: 'Marie', icon: 'account-heart-outline' },
  { key: 'both', label: 'Nous deux', icon: 'account-multiple-outline' },
];

function dateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function displayDate(value: string): string {
  const [y, m, d] = value.split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}

export default function CalendarPeriodScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { calendarPeriods, addCalendarPeriod, updateCalendarPeriod, deleteCalendarPeriod } = useApp();
  const existing = useMemo(() => calendarPeriods.find(p => p.id === params.id), [calendarPeriods, params.id]);
  const [name, setName] = useState(existing?.name ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? dateOnly(new Date()));
  const [endDate, setEndDate] = useState(existing?.endDate ?? dateOnly(new Date()));
  const [owner, setOwner] = useState<CalendarPeriodOwner>(existing?.owner ?? 'yoann');
  const [color, setColor] = useState(existing?.color ?? COLORS[0]!);
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);

  function save() {
    if (!name.trim()) return Alert.alert('Nom manquant', 'Donnez un nom à cette période.');
    if (endDate < startDate) return Alert.alert('Dates invalides', 'La fin doit être le même jour ou après le début.');
    const data = { name: name.trim(), startDate, endDate, owner, color };
    if (existing) updateCalendarPeriod(existing.id, data);
    else addCalendarPeriod(data);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  function remove() {
    if (!existing) return;
    Alert.alert('Supprimer la période', `Supprimer « ${existing.name} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => { deleteCalendarPeriod(existing.id); router.back(); } },
    ]);
  }

  const pickerValue = new Date(`${picker === 'start' ? startDate : endDate}T12:00:00`);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SubPageHeader
        title={existing ? 'Modifier la période' : 'Nouvelle période'}
        right={
          <View style={styles.headerActions}>
            {existing && <Pressable onPress={remove} hitSlop={8}><MaterialCommunityIcons name="delete-outline" size={22} color={colors.destructive} /></Pressable>}
            <Pressable onPress={save} style={[styles.save, { backgroundColor: color }]}><Text style={styles.saveText}>Enregistrer</Text></Pressable>
          </View>
        }
      />
      <ScrollView contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: color }]}>
          <MaterialCommunityIcons name="calendar-range" size={17} color={color} />
          <Text style={[styles.badgeText, { color }]}>Période du calendrier</Text>
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Nom *</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Vacances, congés, week-end…" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]} />
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Pour qui ?</Text>
          <View style={styles.choiceRow}>
            {OWNERS.map(item => (
              <Pressable key={item.key} onPress={() => setOwner(item.key)} style={[styles.ownerChoice, { backgroundColor: owner === item.key ? `${color}22` : colors.card, borderColor: owner === item.key ? color : colors.border }]}>
                <MaterialCommunityIcons name={item.icon} size={18} color={owner === item.key ? color : colors.mutedForeground} />
                <Text style={[styles.choiceText, { color: owner === item.key ? color : colors.foreground }]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.dateRow}>
          {(['start', 'end'] as const).map(kind => {
            const value = kind === 'start' ? startDate : endDate;
            return (
              <View key={kind} style={styles.dateField}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>{kind === 'start' ? 'Début' : 'Fin'}</Text>
                <Pressable onPress={() => setPicker(kind)} style={[styles.dateButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name={kind === 'start' ? 'calendar-start' : 'calendar-end'} size={18} color={color} />
                  <Text style={[styles.dateText, { color: colors.foreground }]}>{displayDate(value)}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        {picker && (
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
            onChange={(_, selected) => {
              setPicker(null);
              if (!selected) return;
              if (picker === 'start') setStartDate(dateOnly(selected));
              else setEndDate(dateOnly(selected));
            }}
          />
        )}

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Couleur de la bande</Text>
          <View style={styles.colorRow}>
            {COLORS.map(c => <Pressable key={c} onPress={() => setColor(c)} style={[styles.colorChoice, { backgroundColor: c }, color === c && styles.colorSelected]}><MaterialCommunityIcons name="check" size={16} color="#fff" style={{ opacity: color === c ? 1 : 0 }} /></Pressable>)}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  save: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  saveText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  form: { padding: 16, paddingTop: 22, gap: 20 },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  label: { fontFamily: 'Inter_500Medium', fontSize: 13, marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Inter_400Regular', fontSize: 15 },
  choiceRow: { flexDirection: 'row', gap: 8 },
  ownerChoice: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', gap: 4 },
  choiceText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1 },
  dateButton: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  dateText: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorChoice: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  colorSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.8, shadowRadius: 4, elevation: 3 },
});