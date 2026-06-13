import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';

export default function NewAppointmentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { appointments, addAppointment, updateAppointment, deleteAppointment } = useApp();

  const existing = params.id ? appointments.find(a => a.id === params.id) : null;
  const isEditing = !!existing;

  function parseFrDate(s: string): string {
    const parts = s.split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).toISOString();
    }
    return new Date().toISOString();
  }

  function toFrDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR');
  }

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [date, setDate] = useState(existing ? toFrDate(existing.date) : '');
  const [time, setTime] = useState(existing?.time ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  function validate() {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Le titre est obligatoire';
    if (!date.trim()) e.date = 'La date est obligatoire';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    const data = {
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      date: parseFrDate(date),
      time: time.trim(),
      category: 'Rendez-vous',
    };
    if (isEditing && existing) {
      updateAppointment(existing.id, data);
    } else {
      addAppointment(data);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  function handleDelete() {
    if (!existing) return;
    Alert.alert(
      'Supprimer le rendez-vous',
      `Supprimer "${existing.title}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            deleteAppointment(existing.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBar, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {isEditing ? 'Modifier le RDV' : 'Nouveau rendez-vous'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {isEditing && (
            <Pressable onPress={handleDelete} hitSlop={8}>
              <MaterialCommunityIcons name="delete-outline" size={22} color={colors.destructive} />
            </Pressable>
          )}
          <Pressable onPress={handleSave} style={[styles.saveBtn, { backgroundColor: '#7C3AED' }]}>
            <Text style={styles.saveBtnTxt}>Enregistrer</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.form, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.categoryBadge, { backgroundColor: '#7C3AED20', borderColor: '#7C3AED' }]}>
          <MaterialCommunityIcons name="calendar-clock" size={16} color="#7C3AED" />
          <Text style={[styles.categoryLabel, { color: '#7C3AED' }]}>Rendez-vous</Text>
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Titre *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Rendez-vous chez le médecin…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: errors.title ? colors.destructive : colors.border }]}
          />
          {errors.title && <Text style={[styles.error, { color: colors.destructive }]}>{errors.title}</Text>}
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Date *</Text>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="JJ/MM/AAAA"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: errors.date ? colors.destructive : colors.border }]}
            />
            {errors.date && <Text style={[styles.error, { color: colors.destructive }]}>{errors.date}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Heure</Text>
            <TextInput
              value={time}
              onChangeText={setTime}
              placeholder="HH:MM"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
            />
          </View>
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Lieu</Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Cabinet médical, salle 3…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          />
        </View>

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Notes sur le rendez-vous…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={4}
            style={[styles.input, styles.textarea, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveBtnTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  form: { paddingHorizontal: 16, paddingTop: 20, gap: 18 },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  error: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
  row: { flexDirection: 'row', gap: 10 },
});
