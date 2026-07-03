import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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

import { useColors } from '@/hooks/useColors';
import {
  DEFAULT_PLACE_CATEGORIES,
  PLACE_ICONS,
  type KnownPlace,
  type PlaceCategory,
} from '@/types/places';
import { forwardGeocode } from '@/utils/nominatim';
import {
  deletePlaceCategory,
  deleteKnownPlace,
  getKnownPlaces,
  getPlaceCategories,
  savePlaceCategory,
  saveKnownPlace,
} from '@/utils/placesStorage';

const COLOR_PALETTE = [
  '#FFC107', '#FF9800', '#FF5722', '#F44336', '#E91E63',
  '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#03A9F4',
  '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39',
  '#795548', '#9E9E9E', '#607D8B',
];

// ── Modals ────────────────────────────────────────────────────────────────────

function PlaceModal({
  visible,
  initial,
  categories,
  colors,
  onSave,
  onClose,
}: {
  visible: boolean;
  initial: Partial<KnownPlace> | null;
  categories: PlaceCategory[];
  colors: ReturnType<typeof useColors>;
  onSave: (p: KnownPlace) => void;
  onClose: () => void;
}) {
  const [name, setName]               = useState('');
  const [catId, setCatId]             = useState('');
  const [radius, setRadius]           = useState('200');
  const [address, setAddress]         = useState('');
  const [geocoding, setGeocoding]     = useState(false);
  const [resolvedLat, setResolvedLat] = useState<number | null>(null);
  const [resolvedLng, setResolvedLng] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setCatId(initial?.categoryId ?? categories[0]?.id ?? '');
      setRadius(String(initial?.radiusM ?? 200));
      setAddress(initial?.address ?? '');
      const hasCoords = initial?.lat !== undefined && initial.lat !== 0;
      setResolvedLat(hasCoords ? initial!.lat! : null);
      setResolvedLng(hasCoords ? initial!.lng! : null);
      setGeocoding(false);
    }
  }, [visible, initial, categories]);

  async function handleGeocode() {
    const q = address.trim();
    if (!q) return;
    setGeocoding(true);
    const result = await forwardGeocode(q);
    setGeocoding(false);
    if (result) {
      setResolvedLat(result.lat);
      setResolvedLng(result.lng);
      if (!address.trim() || address === initial?.address) {
        setAddress(result.displayName);
      }
    } else {
      Alert.alert('Adresse introuvable', 'Essayez une formulation plus précise (ex: "14 rue de la Paix, Paris").');
    }
  }

  const canSave = !!name.trim() && resolvedLat !== null;

  function handleSave() {
    if (!canSave || resolvedLat === null || resolvedLng === null) return;
    const r = parseInt(radius, 10);
    onSave({
      id:         initial?.id ?? Date.now().toString(),
      name:       name.trim(),
      categoryId: catId,
      lat:        resolvedLat,
      lng:        resolvedLng,
      radiusM:    isNaN(r) || r < 50 ? 200 : r,
      address:    address.trim() || undefined,
      createdAt:  initial?.createdAt ?? Date.now(),
    });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
            {initial?.id ? 'Modifier le lieu' : 'Nouveau lieu'}
          </Text>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Nom</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ex : Domicile, Leclerc…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            autoFocus
            returnKeyType="done"
          />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Adresse</Text>
          <View style={styles.geocodeRow}>
            <TextInput
              value={address}
              onChangeText={t => { setAddress(t); setResolvedLat(null); setResolvedLng(null); }}
              placeholder="Ex: 14 rue de la Paix, Paris"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.geocodeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              returnKeyType="search"
              onSubmitEditing={handleGeocode}
            />
            <Pressable
              onPress={handleGeocode}
              disabled={geocoding || !address.trim()}
              style={[styles.geocodeBtn, { backgroundColor: colors.primary, opacity: address.trim() ? 1 : 0.4 }]}
            >
              {geocoding
                ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                : <MaterialCommunityIcons name="map-search" size={18} color={colors.primaryForeground} />
              }
            </Pressable>
          </View>
          {resolvedLat !== null && (
            <Text style={[styles.coordHint, { color: '#4CAF50' }]}>
              ✓ {resolvedLat.toFixed(5)}, {resolvedLng?.toFixed(5)}
            </Text>
          )}
          {resolvedLat === null && !(initial?.lat) && (
            <Text style={[styles.coordHint, { color: colors.mutedForeground }]}>
              Saisissez une adresse puis appuyez sur 🔍 pour localiser
            </Text>
          )}

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Catégorie</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {categories.map(cat => {
                const sel = catId === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setCatId(cat.id)}
                    style={[
                      styles.catChip,
                      {
                        borderColor: sel ? cat.color : colors.border,
                        backgroundColor: sel ? cat.color + '22' : colors.background,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name={cat.icon as any} size={14} color={sel ? cat.color : colors.mutedForeground} />
                    <Text style={[styles.catChipTxt, { color: sel ? cat.color : colors.mutedForeground }]}>{cat.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Rayon de détection (mètres)</Text>
          <TextInput
            value={radius}
            onChangeText={setRadius}
            keyboardType="number-pad"
            placeholder="200"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />

          <View style={styles.sheetBtns}>
            <Pressable onPress={onClose} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={[styles.cancelTxt, { color: colors.mutedForeground }]}>Annuler</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: canSave ? 1 : 0.4 }]}
              disabled={!canSave}
            >
              <Text style={[styles.saveTxt, { color: colors.primaryForeground }]}>Enregistrer</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CategoryModal({
  visible,
  initial,
  colors,
  onSave,
  onClose,
}: {
  visible: boolean;
  initial: Partial<PlaceCategory> | null;
  colors: ReturnType<typeof useColors>;
  onSave: (c: PlaceCategory) => void;
  onClose: () => void;
}) {
  const [name, setName]   = useState('');
  const [icon, setIcon]   = useState('map-marker');
  const [color, setColor] = useState('#FFC107');

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setIcon(initial?.icon ?? 'map-marker');
      setColor(initial?.color ?? '#FFC107');
    }
  }, [visible, initial]);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      id:    initial?.id ?? ('cat_' + Date.now()),
      name:  trimmed,
      icon,
      color,
    });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
            {initial?.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          </Text>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Nom</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ex : Restaurants, Amis…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            autoFocus
            returnKeyType="done"
          />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Icône</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {PLACE_ICONS.map(ic => {
                const sel = icon === ic;
                return (
                  <Pressable
                    key={ic}
                    onPress={() => setIcon(ic)}
                    style={[
                      styles.iconOption,
                      {
                        borderColor: sel ? color : colors.border,
                        backgroundColor: sel ? color + '22' : colors.background,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name={ic as any} size={20} color={sel ? color : colors.mutedForeground} />
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Couleur</Text>
          <View style={styles.colorGrid}>
            {COLOR_PALETTE.map(c => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[
                  styles.colorDot,
                  { backgroundColor: c, borderWidth: color === c ? 3 : 1, borderColor: color === c ? '#fff' : c },
                ]}
              />
            ))}
          </View>

          <View style={styles.sheetBtns}>
            <Pressable onPress={onClose} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={[styles.cancelTxt, { color: colors.mutedForeground }]}>Annuler</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: name.trim() ? 1 : 0.4 }]}
              disabled={!name.trim()}
            >
              <Text style={[styles.saveTxt, { color: colors.primaryForeground }]}>Enregistrer</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function KnownPlacesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [categories, setCategories] = useState<PlaceCategory[]>([]);
  const [places, setPlaces]         = useState<KnownPlace[]>([]);
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());

  const [placeModal, setPlaceModal]   = useState(false);
  const [catModal, setCatModal]       = useState(false);
  const [editPlace, setEditPlace]     = useState<Partial<KnownPlace> | null>(null);
  const [editCat, setEditCat]         = useState<Partial<PlaceCategory> | null>(null);

  const load = useCallback(async () => {
    const [cats, pls] = await Promise.all([getPlaceCategories(), getKnownPlaces()]);
    setCategories(cats);
    setPlaces(pls);
    setExpanded(new Set(cats.map(c => c.id)));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSavePlace(p: KnownPlace) {
    await saveKnownPlace(p);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPlaceModal(false);
    load();
  }

  async function handleSaveCat(c: PlaceCategory) {
    await savePlaceCategory(c);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCatModal(false);
    load();
  }

  function handleDeletePlace(p: KnownPlace) {
    Alert.alert('Supprimer ce lieu ?', p.name, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          await deleteKnownPlace(p.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          load();
        },
      },
    ]);
  }

  function handleDeleteCat(c: PlaceCategory) {
    if (c.isSystem) return;
    Alert.alert(
      'Supprimer cette catégorie ?',
      'Les lieux de cette catégorie seront rattachés à la première catégorie.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            await deletePlaceCategory(c.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            load();
          },
        },
      ],
    );
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Lieux connus</Text>
        <Pressable
          onPress={() => { setEditCat(null); setCatModal(true); }}
          hitSlop={10}
          style={[styles.addCatBtn, { borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="shape-plus" size={16} color={colors.mutedForeground} />
          <Text style={[styles.addCatTxt, { color: colors.mutedForeground }]}>Catégorie</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {categories.map(cat => {
          const catPlaces = places.filter(p => p.categoryId === cat.id);
          const open = expanded.has(cat.id);
          return (
            <View key={cat.id} style={[styles.catSection, { borderColor: colors.border }]}>
              <Pressable
                onPress={() => toggleExpand(cat.id)}
                style={styles.catHeader}
              >
                <View style={[styles.catIconWrap, { backgroundColor: cat.color + '22' }]}>
                  <MaterialCommunityIcons name={cat.icon as any} size={18} color={cat.color} />
                </View>
                <Text style={[styles.catName, { color: colors.foreground }]}>{cat.name}</Text>
                <Text style={[styles.catCount, { color: colors.mutedForeground }]}>{catPlaces.length}</Text>
                <MaterialCommunityIcons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={colors.mutedForeground}
                />
                {!cat.isSystem && (
                  <>
                    <Pressable
                      hitSlop={8}
                      onPress={() => { setEditCat(cat); setCatModal(true); }}
                      style={{ padding: 4 }}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.mutedForeground} />
                    </Pressable>
                    <Pressable hitSlop={8} onPress={() => handleDeleteCat(cat)} style={{ padding: 4 }}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  </>
                )}
              </Pressable>

              {open && (
                <View>
                  {catPlaces.length === 0 && (
                    <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Aucun lieu dans cette catégorie</Text>
                  )}
                  {catPlaces.map(place => (
                    <View
                      key={place.id}
                      style={[styles.placeRow, { borderTopColor: colors.border }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.placeName, { color: colors.foreground }]}>{place.name}</Text>
                        {!!place.address && (
                          <Text style={[styles.placeAddr, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {place.address}
                          </Text>
                        )}
                        <Text style={[styles.placeCoords, { color: colors.mutedForeground }]}>
                          {place.lat.toFixed(5)}, {place.lng.toFixed(5)} · {place.radiusM} m
                        </Text>
                      </View>
                      <Pressable
                        hitSlop={8}
                        onPress={() => { setEditPlace(place); setPlaceModal(true); }}
                        style={{ padding: 6 }}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.mutedForeground} />
                      </Pressable>
                      <Pressable hitSlop={8} onPress={() => handleDeletePlace(place)} style={{ padding: 6 }}>
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* FAB — add place */}
      <Pressable
        onPress={() => { setEditPlace(null); setPlaceModal(true); }}
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 24 }]}
      >
        <MaterialCommunityIcons name="map-marker-plus" size={22} color={colors.primaryForeground} />
        <Text style={[styles.fabTxt, { color: colors.primaryForeground }]}>Ajouter un lieu</Text>
      </Pressable>

      <PlaceModal
        visible={placeModal}
        initial={editPlace}
        categories={categories}
        colors={colors}
        onSave={handleSavePlace}
        onClose={() => setPlaceModal(false)}
      />
      <CategoryModal
        visible={catModal}
        initial={editCat}
        colors={colors}
        onSave={handleSaveCat}
        onClose={() => setCatModal(false)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  addCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  addCatTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  content: { paddingHorizontal: 16, gap: 10 },

  catSection: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  catIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catName: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  catCount: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginRight: 2,
  },

  emptyTxt: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontStyle: 'italic',
  },

  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  placeName: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 1,
  },
  placeAddr: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginBottom: 1,
  },
  placeCoords: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },

  fab: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 28,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabTxt: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  // ── Sheet ────────────────────────────────────────────────────────────────────
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 4,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginBottom: 4,
  },
  geocodeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  geocodeInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  geocodeBtn: {
    width: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coordHint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginBottom: 4,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  catChipTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  iconOption: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },

  sheetBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelTxt: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  saveBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveTxt: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
