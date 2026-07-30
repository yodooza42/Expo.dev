import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import { SubPageHeader } from '@/components/SubPageHeader';
import {
  cancelDepartureAlert,
  DepartureAlertInfo,
  getDepartureAlertInfo,
  scheduleDepartureAlert,
} from '@/utils/departureAlert';
import { updateTodoWidget } from '@/widgets/updateWidget';

async function geocodeAddress(query: string): Promise<{ lat: number; lng: number; display: string } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=fr`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'fr', 'User-Agent': 'Yoann2App/1.0' } });
    const data = await res.json();
    if (!data || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
  } catch {
    return null;
  }
}

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
  const [address, setAddress] = useState(existing?.address ?? '');
  const [addressLat, setAddressLat] = useState<number | undefined>(existing?.addressLat);
  const [addressLng, setAddressLng] = useState<number | undefined>(existing?.addressLng);
  const [geocoding, setGeocoding] = useState(false);
  const [date, setDate] = useState(existing ? toFrDate(existing.date) : '');
  const [time, setTime] = useState(existing?.time ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alertScheduling, setAlertScheduling] = useState(false);
  const [alertInfo, setAlertInfo] = useState<DepartureAlertInfo | null>(null);

  // Reload stored departure info every time the screen comes into focus
  // (covers the case where a morning recalculation ran while the user was away)
  useFocusEffect(
    useCallback(() => {
      if (!existing) return;
      getDepartureAlertInfo(existing.id).then(setAlertInfo);
    }, [existing?.id]),
  );

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  async function handleGeocode() {
    if (!address.trim()) return;
    setGeocoding(true);
    const result = await geocodeAddress(address.trim());
    setGeocoding(false);
    if (result) {
      setAddressLat(result.lat);
      setAddressLng(result.lng);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Alert.alert('Adresse introuvable', 'Essayez d\'être plus précis (ex: "12 rue de la Paix, Paris")');
    }
  }

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
      address: address.trim() || undefined,
      addressLat,
      addressLng,
      date: parseFrDate(date),
      time: time.trim(),
      category: 'Rendez-vous',
    };
    if (isEditing && existing) {
      updateAppointment(existing.id, data);
    } else {
      addAppointment(data);
    }
    updateTodoWidget().catch(() => {});
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

  async function handleScheduleAlert() {
    if (!existing || addressLat === undefined || addressLng === undefined) return;
    setAlertScheduling(true);
    const result = await scheduleDepartureAlert({
      id: existing.id,
      title: existing.title,
      date: existing.date,
      time,
      addressLat,
      addressLng,
    });
    setAlertScheduling(false);
    if (result.ok) {
      const dep = result.departureTime;
      const hh = String(dep.getHours()).padStart(2, '0');
      const mm = String(dep.getMinutes()).padStart(2, '0');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const routesSuffix = result.routeCount > 1
        ? ` (le plus long des ${result.routeCount} itinéraires)`
        : '';
      // Refresh the displayed departure info immediately
      if (existing) getDepartureAlertInfo(existing.id).then(setAlertInfo);
      Alert.alert(
        '⏰ Alerte programmée',
        `Départ conseillé à ${hh}:${mm} — trajet ~${result.travelMin} min${routesSuffix} + 10 min tampon.\n\nL'heure sera recalculée automatiquement à 6h, 7h, 8h, 9h et 10h le jour J.`,
      );
    } else {
      Alert.alert('Impossible de programmer l\'alerte', result.reason);
    }
  }

  async function handleCancelAlert() {
    if (!existing) return;
    await cancelDepartureAlert(existing.id);
    setAlertInfo(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Alerte annulée', 'L\'alerte départ a été supprimée.');
  }

  const geocoded = addressLat !== undefined && addressLng !== undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SubPageHeader
        title={isEditing ? 'Modifier le RDV' : 'Nouveau rendez-vous'}
        right={
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
        }
      />

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
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Adresse (navigation)</Text>
          <View style={styles.addressRow}>
            <TextInput
              value={address}
              onChangeText={v => { setAddress(v); setAddressLat(undefined); setAddressLng(undefined); }}
              placeholder="12 rue de la Paix, Paris"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, styles.addressInput, {
                backgroundColor: colors.card,
                color: colors.foreground,
                borderColor: geocoded ? '#4CAF50' : colors.border,
              }]}
              returnKeyType="search"
              onSubmitEditing={handleGeocode}
            />
            <Pressable
              onPress={handleGeocode}
              style={[styles.geocodeBtn, { backgroundColor: geocoded ? '#4CAF5022' : colors.card, borderColor: geocoded ? '#4CAF50' : colors.border }]}
              disabled={geocoding || !address.trim()}
            >
              {geocoding
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <MaterialCommunityIcons
                    name={geocoded ? 'check-circle' : 'map-search-outline'}
                    size={20}
                    color={geocoded ? '#4CAF50' : address.trim() ? colors.primary : colors.mutedForeground}
                  />
              }
            </Pressable>
          </View>
          {geocoded && (
            <Text style={[styles.geocodeHint, { color: '#4CAF50' }]}>
              ✓ {addressLat!.toFixed(5)}, {addressLng!.toFixed(5)}
            </Text>
          )}
          {!geocoded && address.trim().length > 0 && (
            <Text style={[styles.geocodeHint, { color: colors.mutedForeground }]}>
              Appuyez sur 🔍 pour géocoder (permet la navigation depuis le widget)
            </Text>
          )}

          {/* Departure alert — only available when editing an appointment with coords + time */}
          {isEditing && geocoded && time.trim().length > 0 && (
            <View style={styles.alertRow}>
              <Pressable
                onPress={handleScheduleAlert}
                disabled={alertScheduling}
                style={[styles.alertBtn, { backgroundColor: '#FF980020', borderColor: '#FF9800' }]}
              >
                {alertScheduling
                  ? <ActivityIndicator size="small" color="#FF9800" />
                  : <MaterialCommunityIcons name="bell-ring-outline" size={16} color="#FF9800" />}
                <Text style={[styles.alertBtnTxt, { color: '#FF9800' }]}>
                  {alertScheduling ? 'Calcul…' : '⏰ Alerte départ'}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleCancelAlert}
                style={[styles.alertBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
              >
                <MaterialCommunityIcons name="bell-off-outline" size={16} color={colors.mutedForeground} />
                <Text style={[styles.alertBtnTxt, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
            </View>
          )}

          {/* Stored departure info — shown whenever an alert is saved in AsyncStorage */}
          {isEditing && alertInfo && (() => {
            const dep = new Date(alertInfo.departureMs);
            const hh = String(dep.getHours()).padStart(2, '0');
            const mm = String(dep.getMinutes()).padStart(2, '0');
            const routesTxt = alertInfo.routeCount > 1
              ? `, ${alertInfo.routeCount} itinéraires`
              : '';
            const badgeColor   = alertInfo.recalcToday ? '#2196F3' : '#9E9E9E';
            const badgeLabel   = alertInfo.recalcToday ? '↺ Recalculé ce matin' : '📍 Calculé à la programmation';
            return (
              <View style={[styles.departureInfoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.departureInfoRow}>
                  <MaterialCommunityIcons name="clock-fast" size={16} color="#FF9800" />
                  <Text style={[styles.departureInfoText, { color: colors.foreground }]}>
                    Départ prévu à{' '}
                    <Text style={{ fontFamily: 'Inter_700Bold' }}>{hh}:{mm}</Text>
                    {' '}(trajet ~{alertInfo.travelMin} min{routesTxt})
                  </Text>
                </View>
                <View style={[styles.departureBadge, { backgroundColor: `${badgeColor}18`, borderColor: `${badgeColor}44` }]}>
                  <Text style={[styles.departureBadgeTxt, { color: badgeColor }]}>{badgeLabel}</Text>
                </View>
              </View>
            );
          })()}
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
  addressRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addressInput: { flex: 1 },
  geocodeBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  geocodeHint: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  error: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
  row: { flexDirection: 'row', gap: 10 },
  alertRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  alertBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 9,
  },
  alertBtnTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  departureInfoBox: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  departureInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  departureInfoText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    flexShrink: 1,
  },
  departureBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  departureBadgeTxt: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
});
