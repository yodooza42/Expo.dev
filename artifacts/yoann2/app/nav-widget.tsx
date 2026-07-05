import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
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
import type { Appointment } from '@/types';
import type { KnownPlace } from '@/types/places';
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
  upsertNavShortcut,
} from '@/utils/navigationShortcuts';
import { getKnownPlaces } from '@/utils/placesStorage';

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizeStr(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface EditShortcut {
  shortcut: NavShortcut | null;
  slotIndex: number;
}

interface CardColors {
  card: string;
  border: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ShortcutCard({ shortcut, loading, colors, onPress, onLongPress }: {
  shortcut: NavShortcut;
  loading: boolean;
  colors: CardColors;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const ready = shortcut.lat != null && shortcut.lng != null;
  return (
    <Pressable
      style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {loading
        ? <ActivityIndicator size="small" color={colors.primary} />
        : <MaterialCommunityIcons name={(ready ? getShortcutMdi(shortcut.icon) : 'map-marker-question') as any} size={22} color={ready ? colors.primary : colors.mutedForeground} />}
      <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={2}>{shortcut.name}</Text>
      {!ready && <Text style={[styles.cardSub, { color: '#F44336' }]}>Adresse à configurer</Text>}
    </Pressable>
  );
}

function RdvCard({ appt, colors }: { appt: Appointment; colors: CardColors }) {
  const [loading, setLoading] = useState(false);
  return (
    <Pressable
      style={({ pressed }) => [styles.card, { backgroundColor: '#7C3AED20', borderColor: '#7C3AED', opacity: pressed ? 0.75 : 1 }]}
      onPress={async () => { setLoading(true); await openNavigation(appt.addressLat!, appt.addressLng!); setLoading(false); }}
    >
      {loading ? <ActivityIndicator size="small" color="#7C3AED" /> : <MaterialCommunityIcons name="calendar-clock" size={22} color="#7C3AED" />}
      <Text style={[styles.cardName, { color: '#7C3AED' }]} numberOfLines={2}>{appt.title}</Text>
      {appt.time ? <Text style={[styles.cardSub, { color: '#9D71FA' }]}>{appt.time}</Text> : null}
    </Pressable>
  );
}

function AddSlotCard({ colors, canAdd, onPress }: { colors: CardColors; canAdd: boolean; onPress: () => void }) {
  if (!canAdd) return <View style={[styles.card, styles.cardEmpty, { borderColor: colors.border + '44' }]} />;
  return (
    <Pressable
      style={({ pressed }) => [styles.card, styles.cardEmpty, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
      onPress={onPress}
    >
      <MaterialCommunityIcons name="plus-circle-outline" size={22} color={colors.mutedForeground} />
      <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>Ajouter</Text>
    </Pressable>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function NavWidgetScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
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

  // Free search
  const [searchAddress, setSearchAddress] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  // Known places autocomplete
  const [knownPlaces, setKnownPlaces] = useState<KnownPlace[]>([]);
  const [placeNavLoading, setPlaceNavLoading] = useState<string | null>(null);

  const matchedPlaces = useMemo<KnownPlace[]>(() => {
    const q = normalizeStr(searchAddress.trim());
    if (q.length < 2) return [];
    return knownPlaces
      .filter(p => normalizeStr(p.name).includes(q) || (p.address && normalizeStr(p.address).includes(q)))
      .slice(0, 3);
  }, [searchAddress, knownPlaces]);

  // Edit modal
  const [editing, setEditing] = useState<EditShortcut | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editIcon, setEditIcon] = useState<string | undefined>(undefined);
  const [editGeocoding, setEditGeocoding] = useState(false);
  const [editError, setEditError] = useState('');
  const nameRef = useRef<TextInput>(null);

  const reload = useCallback(async () => { setShortcuts(await getNavShortcuts()); }, []);
  const reloadPlaces = useCallback(async () => { setKnownPlaces(await getKnownPlaces()); }, []);

  useEffect(() => { reload(); reloadPlaces(); }, [reload, reloadPlaces]);

  // ── Free search ──────────────────────────────────────────────────────────────

  async function handleFreeSearch() {
    if (!searchAddress.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchLoading(true);
    try {
      const coords = await geocodeAddress(searchAddress);
      if (!coords) { Alert.alert('Adresse introuvable', "Vérifiez l'adresse et réessayez."); return; }
      await openNavigation(coords.lat, coords.lng);
      setSearchAddress('');
    } finally { setSearchLoading(false); }
  }

  async function handleNavigateToPlace(place: KnownPlace) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlaceNavLoading(place.id);
    try { await openNavigation(place.lat, place.lng); setSearchAddress(''); }
    finally { setPlaceNavLoading(null); }
  }

  // ── Shortcut press ───────────────────────────────────────────────────────────

  async function handleShortcutPress(s: NavShortcut) {
    if (s.lat == null || s.lng == null) { openEditModal({ shortcut: s, slotIndex: -1 }); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoadingId(s.id);
    try { await openNavigation(s.lat, s.lng); } finally { setLoadingId(null); }
  }

  // ── Edit modal ───────────────────────────────────────────────────────────────

  function openEditModal(target: EditShortcut) {
    setEditing(target);
    setEditName(target.shortcut?.name ?? '');
    setEditAddress(target.shortcut?.address ?? '');
    setEditIcon(target.shortcut?.icon);
    setEditError('');
    setTimeout(() => nameRef.current?.focus(), 150);
  }

  function closeEditModal() {
    setEditing(null); setEditName(''); setEditAddress(''); setEditIcon(undefined); setEditError('');
  }

  async function handleSaveShortcut() {
    if (!editName.trim() || !editAddress.trim()) { setEditError('Nom et adresse requis.'); return; }
    setEditGeocoding(true); setEditError('');
    try {
      const coords = await geocodeAddress(editAddress);
      if (!coords) { setEditError('Adresse introuvable — vérifiez et réessayez.'); return; }
      const existing = editing?.shortcut;
      const updated: NavShortcut = existing
        ? { ...existing, name: editName.trim(), address: editAddress.trim(), lat: coords.lat, lng: coords.lng, icon: editIcon }
        : { ...createShortcut(editName.trim(), editAddress.trim(), coords.lat, coords.lng), icon: editIcon };
      await upsertNavShortcut(updated);
      await reload();
      closeEditModal();
    } finally { setEditGeocoding(false); }
  }

  async function handleDeleteShortcut(id: string) {
    Alert.alert('Supprimer le raccourci ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await deleteNavShortcut(id); await reload(); } },
    ]);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const slots: (NavShortcut | null)[] = Array.from({ length: MAX_SHORTCUTS }, (_, i) => shortcuts[i] ?? null);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Widget Navigation</Text>
        <Pressable
          onPress={() => router.push('/known-places' as any)}
          hitSlop={8}
          style={[styles.headerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="map-marker-multiple-outline" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>

        {/* ── Itinéraire libre ── */}
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

          {matchedPlaces.length > 0 && (
            <View style={styles.suggestionsContainer}>
              {matchedPlaces.map((place, idx) => (
                <View key={place.id}>
                  {idx > 0 && <View style={[styles.suggestionDivider, { backgroundColor: colors.border }]} />}
                  <View style={styles.suggestionRow}>
                    <View style={[styles.suggestionIcon, { backgroundColor: colors.primary + '20' }]}>
                      <MaterialCommunityIcons name="map-marker" size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.suggestionName, { color: colors.foreground }]} numberOfLines={1}>{place.name}</Text>
                      {place.address ? <Text style={[styles.suggestionAddress, { color: colors.mutedForeground }]} numberOfLines={1}>{place.address}</Text> : null}
                    </View>
                    <Pressable
                      style={[styles.suggestionGoBtn, { backgroundColor: colors.primary, opacity: placeNavLoading === place.id ? 0.6 : 1 }]}
                      onPress={() => handleNavigateToPlace(place)}
                      disabled={placeNavLoading !== null}
                      hitSlop={6}
                    >
                      {placeNavLoading === place.id
                        ? <ActivityIndicator size="small" color="#121212" />
                        : <MaterialCommunityIcons name="navigation-variant" size={16} color="#121212" />}
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Raccourcis widget ── */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>RACCOURCIS WIDGET ({shortcuts.length}/{MAX_SHORTCUTS})</Text>
        <View style={styles.grid}>
          {todayAppt && <RdvCard appt={todayAppt} colors={colors} />}
          {slots.slice(0, todayAppt ? MAX_SHORTCUTS - 1 : MAX_SHORTCUTS).map((slot, idx) =>
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
              <AddSlotCard key={`empty-${idx}`} colors={colors} canAdd={shortcuts.length < MAX_SHORTCUTS} onPress={() => openEditModal({ shortcut: null, slotIndex: idx })} />
            ),
          )}
        </View>
        <Text style={[styles.hintText, { color: colors.mutedForeground, textAlign: 'center', marginTop: 4 }]}>
          Appui long sur un raccourci pour modifier ou supprimer
        </Text>

      </ScrollView>

      {/* ── Edit modal ── */}
      <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={closeEditModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 20 }]}>
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
              <Pressable
                onPress={() => setEditIcon(undefined)}
                style={[styles.iconPickerBtn, { backgroundColor: !editIcon ? colors.primary + '30' : colors.background, borderColor: !editIcon ? colors.primary : colors.border }]}
              >
                <MaterialCommunityIcons name="navigation-variant" size={22} color={!editIcon ? colors.primary : colors.mutedForeground} />
              </Pressable>
              {SHORTCUT_ICONS.map(ic => (
                <Pressable
                  key={ic.key}
                  onPress={() => setEditIcon(ic.key)}
                  style={[styles.iconPickerBtn, { backgroundColor: editIcon === ic.key ? colors.primary + '30' : colors.background, borderColor: editIcon === ic.key ? colors.primary : colors.border }]}
                >
                  <MaterialCommunityIcons name={ic.mdi as any} size={22} color={editIcon === ic.key ? colors.primary : colors.mutedForeground} />
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

            {editError ? <Text style={[styles.errorText, { color: '#F44336' }]}>{editError}</Text> : null}

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
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', flex: 1 },
  headerBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 16 },
  section: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  sectionLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  sectionHeader: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginTop: 4 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: {
    flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular',
  },
  goBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  hintText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  suggestionsContainer: { marginTop: 10, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'transparent' },
  suggestionDivider: { height: 1, marginHorizontal: 12 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 10 },
  suggestionIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  suggestionName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  suggestionAddress: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  suggestionGoBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '30%', minHeight: 80, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center', padding: 10, gap: 4,
  },
  cardEmpty: { borderStyle: 'dashed' },
  cardName: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  cardSub: { fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  modalSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth,
    padding: 20, gap: 10,
  },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalBtn: { flex: 1, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 12, alignItems: 'center' },
  modalBtnPrimary: { borderWidth: 0 },
  modalBtnText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  fieldInput: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular',
  },
  fieldInputTall: { minHeight: 70, textAlignVertical: 'top' },
  errorText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  iconPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconPickerBtn: { width: 42, height: 42, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
