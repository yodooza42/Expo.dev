import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import type { FuelEntry } from '@/types/fuel';
import type { Appointment } from '@/types';
import { saveFuelEntry } from '@/utils/fuelStorage';
import {
  getGpsInterval,
  setGpsInterval,
  GPS_INTERVALS,
  restartTracking,
} from '@/utils/locationTracking';
import {
  MAX_SHORTCUTS,
  NavShortcut,
  SHORTCUT_ICONS,
  createShortcut,
  deleteNavShortcut,
  geocodeAddress,
  getNavShortcuts,
  getShortcutMdi,
  openNavigation,
  saveNavShortcuts,
  upsertNavShortcut,
} from '@/utils/navigationShortcuts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditShortcut {
  shortcut: NavShortcut | null; // null = new shortcut
  slotIndex: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NavigationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { appointments } = useApp();

  const todayAppt = useMemo<Appointment | null>(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return appointments.find(a => {
      if (!a.addressLat || !a.addressLng) return false;
      try {
        const d = new Date(a.date);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return k === todayStr;
      } catch { return false; }
    }) ?? null;
  }, [appointments]);

  const [shortcuts, setShortcuts] = useState<NavShortcut[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [gpsIntervalIdx, setGpsIntervalIdx] = useState(0);
  const router = useRouter();

  // Free search
  const [searchAddress, setSearchAddress] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  // Edit modal
  const [editing, setEditing] = useState<EditShortcut | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editIcon, setEditIcon] = useState<string | undefined>(undefined);
  const [editGeocoding, setEditGeocoding] = useState(false);
  const [editError, setEditError] = useState('');

  // Fuel log modal
  const [fuelOpen, setFuelOpen] = useState(false);
  const [fuelVehicle, setFuelVehicle] = useState<'car' | 'moto'>('car');
  const [fuelLiters, setFuelLiters] = useState('');
  const [fuelPrice, setFuelPrice] = useState('');

  async function handleSaveFuel() {
    const l = parseFloat(fuelLiters.replace(',', '.'));
    const p = parseFloat(fuelPrice.replace(',', '.'));
    if (isNaN(l) || isNaN(p) || l <= 0 || p <= 0) return;
    const entry: FuelEntry = {
      id: `fuel_${Date.now()}`,
      timestamp: Date.now(),
      vehicle: fuelVehicle,
      liters: l,
      pricePerLiter: p,
    };
    await saveFuelEntry(entry);
    setFuelLiters('');
    setFuelPrice('');
    setFuelOpen(false);
  }

  const nameRef = useRef<TextInput>(null);

  const { action } = useLocalSearchParams<{ action?: string }>();

  async function handleGpsIntervalChange(idx: number) {
    setGpsIntervalIdx(idx);
    await setGpsInterval(idx);
    await restartTracking();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const reload = useCallback(async () => {
    setShortcuts(await getNavShortcuts());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    getGpsInterval().then(interval => {
      const idx = GPS_INTERVALS.findIndex(g => g.label === interval.label);
      setGpsIntervalIdx(idx >= 0 ? idx : 0);
    });
  }, []);

  useEffect(() => {
    if (action === 'fuel') setFuelOpen(true);
  }, [action]);

  // ── Navigation ──────────────────────────────────────────────────────────────

  async function handleShortcutPress(s: NavShortcut) {
    if (s.lat == null || s.lng == null) {
      openEditModal({ shortcut: s, slotIndex: -1 });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoadingId(s.id);
    try {
      await openNavigation(s.lat, s.lng);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleFreeSearch() {
    if (!searchAddress.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchLoading(true);
    try {
      const coords = await geocodeAddress(searchAddress);
      if (!coords) {
        Alert.alert('Adresse introuvable', "Vérifiez l'adresse et réessayez.");
        return;
      }
      await openNavigation(coords.lat, coords.lng);
      setSearchAddress('');
    } finally {
      setSearchLoading(false);
    }
  }

  // ── Edit modal ──────────────────────────────────────────────────────────────

  function openEditModal(target: EditShortcut) {
    setEditing(target);
    setEditName(target.shortcut?.name ?? '');
    setEditAddress(target.shortcut?.address ?? '');
    setEditIcon(target.shortcut?.icon);
    setEditError('');
    setTimeout(() => nameRef.current?.focus(), 150);
  }

  function closeEditModal() {
    setEditing(null);
    setEditName('');
    setEditAddress('');
    setEditIcon(undefined);
    setEditError('');
  }

  async function handleSaveShortcut() {
    if (!editName.trim() || !editAddress.trim()) {
      setEditError('Nom et adresse requis.');
      return;
    }
    setEditGeocoding(true);
    setEditError('');
    try {
      const coords = await geocodeAddress(editAddress);
      if (!coords) {
        setEditError('Adresse introuvable — vérifiez et réessayez.');
        return;
      }
      const existing = editing?.shortcut;
      const updated: NavShortcut = existing
        ? { ...existing, name: editName.trim(), address: editAddress.trim(), lat: coords.lat, lng: coords.lng, icon: editIcon }
        : { ...createShortcut(editName.trim(), editAddress.trim(), coords.lat, coords.lng), icon: editIcon };

      await upsertNavShortcut(updated);
      await reload();
      closeEditModal();
    } finally {
      setEditGeocoding(false);
    }
  }

  async function handleDeleteShortcut(id: string) {
    Alert.alert('Supprimer le raccourci ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteNavShortcut(id);
          await reload();
        },
      },
    ]);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const slots: (NavShortcut | null)[] = Array.from({ length: MAX_SHORTCUTS }, (_, i) => shortcuts[i] ?? null);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <MaterialCommunityIcons name="navigation-variant" size={24} color={colors.primary} />
        <Text style={[styles.headerTitle, { color: colors.foreground, flex: 1 }]}>Y aller</Text>
        <Pressable
          onPress={() => setFuelOpen(true)}
          hitSlop={8}
          style={[styles.fuelBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="gas-station" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>

        {/* ── Free search ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ITINÉRAIRE LIBRE</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.searchInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Saisir une adresse…"
              placeholderTextColor={colors.mutedForeground}
              value={searchAddress}
              onChangeText={setSearchAddress}
              onSubmitEditing={handleFreeSearch}
              returnKeyType="go"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.goBtn, { backgroundColor: colors.primary, opacity: searchLoading ? 0.6 : 1 }]}
              onPress={handleFreeSearch}
              disabled={searchLoading}
            >
              {searchLoading
                ? <ActivityIndicator size="small" color="#121212" />
                : <MaterialCommunityIcons name="navigation-variant" size={20} color="#121212" />}
            </Pressable>
          </View>
          <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
            Ouvre Waze · fallback Google Maps · fallback web
          </Text>
        </View>

        {/* ── Saved shortcuts ── */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>RACCOURCIS ({shortcuts.length}/{MAX_SHORTCUTS})</Text>

        <View style={styles.grid}>
          {/* RDV du jour — position 0 quand actif, décale les autres */}
          {todayAppt && (
            <RdvCard appt={todayAppt} colors={colors} />
          )}

          {/* Raccourcis normaux — on en affiche MAX_SHORTCUTS-1 si RDV actif */}
          {slots
            .slice(0, todayAppt ? MAX_SHORTCUTS - 1 : MAX_SHORTCUTS)
            .map((slot, idx) =>
              slot ? (
                <ShortcutCard
                  key={slot.id}
                  shortcut={slot}
                  loading={loadingId === slot.id}
                  colors={colors}
                  onPress={() => handleShortcutPress(slot)}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Alert.alert(slot.name, slot.address, [
                      { text: 'Modifier', onPress: () => openEditModal({ shortcut: slot, slotIndex: idx }) },
                      { text: 'Supprimer', style: 'destructive', onPress: () => handleDeleteShortcut(slot.id) },
                      { text: 'Annuler', style: 'cancel' },
                    ]);
                  }}
                />
              ) : (
                <AddSlotCard
                  key={`empty-${idx}`}
                  colors={colors}
                  canAdd={shortcuts.length < MAX_SHORTCUTS}
                  onPress={() => openEditModal({ shortcut: null, slotIndex: idx })}
                />
              ),
            )}
        </View>
        <Text style={[styles.hintText, { color: colors.mutedForeground, textAlign: 'center', marginTop: 4 }]}>
          Appui long sur un raccourci pour modifier ou supprimer
        </Text>

        {/* ── Lieux connus ── */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 8 }]}>LIEUX</Text>
        <Pressable
          onPress={() => router.push('/known-places' as any)}
          style={({ pressed }) => [
            styles.settingsRow,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && { opacity: 0.75 },
          ]}
        >
          <View style={[styles.settingsRowIcon, { backgroundColor: colors.primary + '20' }]}>
            <MaterialCommunityIcons name="map-marker-multiple-outline" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingsRowLabel, { color: colors.foreground }]}>Lieux connus</Text>
            <Text style={[styles.settingsRowSub, { color: colors.mutedForeground }]}>Maison, Magasins, Spots balades…</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── Fréquence GPS ── */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground, marginTop: 8 }]}>LOCALISATION GPS</Text>
        <View style={[styles.settingsRow, { backgroundColor: colors.card, borderColor: colors.border }] }>
          <View style={[styles.settingsRowIcon, { backgroundColor: colors.primary + '20' }]}>
            <MaterialCommunityIcons name="map-marker-radius" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingsRowLabel, { color: colors.foreground }]}>Fréquence de rafraîchissement</Text>
            <Text style={[styles.settingsRowSub, { color: colors.mutedForeground }]}>Plus fréquent = plus précis, plus de batterie</Text>
          </View>
        </View>
        {GPS_INTERVALS.map((g, i) => (
          <Pressable
            key={g.label}
            onPress={() => handleGpsIntervalChange(i)}
            style={({ pressed }) => [
              styles.settingsRow,
              { backgroundColor: colors.card, borderColor: colors.border, paddingLeft: 52 },
              pressed && { opacity: 0.75 },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingsRowLabel, { color: colors.foreground }]}>{g.label}</Text>
            </View>
            {gpsIntervalIdx === i && (
              <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />
            )}
          </Pressable>
        ))}
      </ScrollView>

      {/* ── Edit modal ── */}
      <Modal
        visible={editing !== null}
        transparent
        animationType="slide"
        onRequestClose={closeEditModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editing?.shortcut ? 'Modifier le raccourci' : 'Nouveau raccourci'}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Nom</Text>
            <TextInput
              ref={nameRef}
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Ex : Maison, Travail…"
              placeholderTextColor={colors.mutedForeground}
              value={editName}
              onChangeText={setEditName}
              maxLength={20}
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Icône</Text>
            <View style={styles.iconPickerRow}>
              {/* Default — flèche navigation */}
              <Pressable
                onPress={() => setEditIcon(undefined)}
                style={[
                  styles.iconPickerBtn,
                  {
                    backgroundColor: !editIcon ? colors.primary + '30' : colors.background,
                    borderColor: !editIcon ? colors.primary : colors.border,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="navigation-variant"
                  size={22}
                  color={!editIcon ? colors.primary : colors.mutedForeground}
                />
              </Pressable>
              {SHORTCUT_ICONS.map(ic => (
                <Pressable
                  key={ic.key}
                  onPress={() => setEditIcon(ic.key)}
                  style={[
                    styles.iconPickerBtn,
                    {
                      backgroundColor: editIcon === ic.key ? colors.primary + '30' : colors.background,
                      borderColor: editIcon === ic.key ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={ic.mdi as any}
                    size={22}
                    color={editIcon === ic.key ? colors.primary : colors.mutedForeground}
                  />
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Adresse</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputTall, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Ex : 12 rue de la Paix, Paris"
              placeholderTextColor={colors.mutedForeground}
              value={editAddress}
              onChangeText={setEditAddress}
              multiline
              returnKeyType="done"
              onSubmitEditing={handleSaveShortcut}
            />

            {editError ? (
              <Text style={[styles.errorText, { color: '#F44336' }]}>{editError}</Text>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { borderColor: colors.border }]} onPress={closeEditModal}>
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.primary, opacity: editGeocoding ? 0.6 : 1 }]}
                onPress={handleSaveShortcut}
                disabled={editGeocoding}
              >
                {editGeocoding
                  ? <ActivityIndicator size="small" color="#121212" />
                  : <Text style={[styles.modalBtnText, { color: '#121212', fontFamily: 'Inter_600SemiBold' }]}>Enregistrer</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Fuel log modal ── */}
      <Modal visible={fuelOpen} transparent animationType="slide" onRequestClose={() => setFuelOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>⛽ Passage à la pompe</Text>

            {/* Vehicle selector */}
            <View style={styles.fuelVehicleRow}>
              <Pressable
                onPress={() => setFuelVehicle('car')}
                style={[styles.fuelVehicleBtn, {
                  backgroundColor: fuelVehicle === 'car' ? '#2196F322' : colors.muted,
                  borderColor: fuelVehicle === 'car' ? '#2196F3' : colors.border,
                  borderWidth: 1,
                }]}
              >
                <MaterialCommunityIcons name="car" size={18} color={fuelVehicle === 'car' ? '#2196F3' : colors.mutedForeground} />
                <Text style={[styles.fuelVehicleText, { color: fuelVehicle === 'car' ? '#2196F3' : colors.mutedForeground }]}>Voiture</Text>
              </Pressable>
              <Pressable
                onPress={() => setFuelVehicle('moto')}
                style={[styles.fuelVehicleBtn, {
                  backgroundColor: fuelVehicle === 'moto' ? '#FF980022' : colors.muted,
                  borderColor: fuelVehicle === 'moto' ? '#FF9800' : colors.border,
                  borderWidth: 1,
                }]}
              >
                <MaterialCommunityIcons name="motorbike" size={18} color={fuelVehicle === 'moto' ? '#FF9800' : colors.mutedForeground} />
                <Text style={[styles.fuelVehicleText, { color: fuelVehicle === 'moto' ? '#FF9800' : colors.mutedForeground }]}>Moto</Text>
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Litres</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Ex : 35.5"
              placeholderTextColor={colors.mutedForeground}
              value={fuelLiters}
              onChangeText={setFuelLiters}
              keyboardType="decimal-pad"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Prix / litre (€)</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Ex : 1.89"
              placeholderTextColor={colors.mutedForeground}
              value={fuelPrice}
              onChangeText={setFuelPrice}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={handleSaveFuel}
            />

            {fuelLiters.length > 0 && fuelPrice.length > 0 && (
              <Text style={[styles.fuelTotal, { color: colors.primary }]}>
                Total : {(parseFloat(fuelLiters.replace(',', '.') || '0') * parseFloat(fuelPrice.replace(',', '.') || '0')).toFixed(2)} €
              </Text>
            )}

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { borderColor: colors.border }]} onPress={() => setFuelOpen(false)}>
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, {
                  backgroundColor: colors.primary,
                  opacity: (parseFloat(fuelLiters) > 0 && parseFloat(fuelPrice) > 0) ? 1 : 0.4,
                }]}
                onPress={handleSaveFuel}
              >
                <Text style={[styles.modalBtnText, { color: '#121212', fontFamily: 'Inter_600SemiBold' }]}>Enregistrer</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface CardColors {
  card: string;
  border: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
}

function ShortcutCard({
  shortcut,
  loading,
  colors,
  onPress,
  onLongPress,
}: {
  shortcut: NavShortcut;
  loading: boolean;
  colors: CardColors;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const ready = shortcut.lat != null && shortcut.lng != null;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <MaterialCommunityIcons
          name={(ready ? getShortcutMdi(shortcut.icon) : 'map-marker-question') as any}
          size={22}
          color={ready ? colors.primary : colors.mutedForeground}
        />
      )}
      <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={2}>
        {shortcut.name}
      </Text>
      {!ready && (
        <Text style={[styles.cardSub, { color: '#F44336' }]}>Adresse à configurer</Text>
      )}
    </Pressable>
  );
}

function RdvCard({ appt, colors }: { appt: Appointment; colors: CardColors }) {
  const [loading, setLoading] = useState(false);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: '#7C3AED20', borderColor: '#7C3AED', opacity: pressed ? 0.75 : 1 },
      ]}
      onPress={async () => {
        setLoading(true);
        await openNavigation(appt.addressLat!, appt.addressLng!);
        setLoading(false);
      }}
    >
      {loading
        ? <ActivityIndicator size="small" color="#7C3AED" />
        : <MaterialCommunityIcons name="calendar-clock" size={22} color="#7C3AED" />}
      <Text style={[styles.cardName, { color: '#7C3AED' }]} numberOfLines={2}>
        {appt.title}
      </Text>
      {appt.time ? (
        <Text style={[styles.cardSub, { color: '#9D71FA' }]}>{appt.time}</Text>
      ) : null}
    </Pressable>
  );
}

function AddSlotCard({
  colors,
  canAdd,
  onPress,
}: {
  colors: CardColors;
  canAdd: boolean;
  onPress: () => void;
}) {
  if (!canAdd) {
    return <View style={[styles.card, styles.cardEmpty, { borderColor: colors.border + '44' }]} />;
  }
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        styles.cardEmpty,
        { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
      onPress={onPress}
    >
      <MaterialCommunityIcons name="plus-circle-outline" size={22} color={colors.mutedForeground} />
      <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>Ajouter</Text>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  scroll: { padding: 16, gap: 16 },
  section: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
  },
  sectionHeader: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  goBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '30%',
    minHeight: 80,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    gap: 4,
  },
  cardEmpty: {
    borderStyle: 'dashed',
  },
  cardName: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  cardSub: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  settingsRowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsRowLabel: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  settingsRowSub: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#00000066',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  fieldInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  fieldInputTall: { minHeight: 70, textAlignVertical: 'top' },
  errorText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnPrimary: { borderWidth: 0 },
  modalBtnText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  fuelBtn: {
    width: 34, height: 34, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  fuelVehicleRow: { flexDirection: 'row', gap: 10 },
  fuelVehicleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, borderRadius: 10, paddingVertical: 10,
  },
  fuelVehicleText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  fuelTotal: { fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'center', marginTop: 2 },
  iconPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconPickerBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
