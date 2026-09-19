import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image as RNImage,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import Svg, {
  Circle,
  Defs,
  Line as SvgLine,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { BottomSheet } from '@/components/BottomSheet';
import { TripMapView } from '@/components/TripMapView';
import { useColors } from '@/hooks/useColors';
import type { KnownPlace, PlaceCategory, WalkRoute } from '@/types/places';
import type { RoutePoint, Trip, TripPhoto, Vehicle, WalkParticipant } from '@/types/trips';
import { simplifyRoute, EPSILON_DEG_WALK } from '@/utils/routeSimplification';
import {
  getAddressUsage,
  getKnownPlaces,
  getPlaceCategories,
  getWalkRoutes,
  incrementAddressUsage,
  sortSuggestionsByUsage,
} from '@/utils/placesStorage';
import { tripEvents } from '@/utils/tripEvents';
import { getTrips, getVehicleSettings, updateTrip } from '@/utils/tripStorage';
import { fmtDayLong, fmtHHMM } from '@/utils/date';
import { haversineKm } from '@/utils/haversine';
import { computeRouteDistanceKm } from '@/utils/osrmMatching';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadMultiDayPoints } from '@/utils/locationTracking';
import type { LocationPoint } from '@/utils/locationTracking';
import { buildStoryHtml } from '@/utils/storyGenerator';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}`;
}

// ── Edit-address modal ─────────────────────────────────────────────────────────

// ── Thème visuel de la carte (Story) ───────────────────────────────────────────
type StoryTheme = 'dark' | 'light' | 'satellite';
const STORY_THEMES: { key: StoryTheme; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { key: 'dark',      label: 'Sombre',    icon: 'weather-night' },
  { key: 'light',     label: 'Clair',     icon: 'weather-sunny' },
  { key: 'satellite', label: 'Satellite', icon: 'satellite-variant' },
];

function EditAddressModal({
  visible,
  label,
  initialValue,
  suggestions,
  knownPlaces,
  colors,
  onCancel,
  onSave,
  onChipUsed,
}: {
  visible: boolean;
  label: string;
  initialValue: string;
  suggestions: string[];
  knownPlaces: KnownPlace[];
  colors: ReturnType<typeof useColors>;
  onCancel: () => void;
  onSave: (value: string) => void;
  onChipUsed: (name: string) => void;
}) {
  const [text, setText] = useState(initialValue);
  const inputRef = useRef<TextInput>(null);
  const normalizedQuery = text.trim().toLowerCase();
  const filteredSuggestions = suggestions
    .filter(name => {
      const place = knownPlaces.find(p => p.name === name);
      const searchable = `${name} ${place?.address ?? ''}`.toLowerCase();
      return !normalizedQuery || searchable.includes(normalizedQuery);
    })
    .slice(0, 8);

  useEffect(() => {
    if (visible) {
      setText(initialValue);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [visible, initialValue]);

  function handleSave() {
    Keyboard.dismiss();
    onSave(text.trim());
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior="padding" style={editStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onCancel} />
        <Pressable style={[editStyles.sheet, { backgroundColor: colors.card }]}>
          <Text style={[editStyles.title, { color: colors.foreground }]}>
            Modifier le lieu
          </Text>
          <Text style={[editStyles.sublabel, { color: colors.mutedForeground }]}>
            {label}
          </Text>
          <View
            style={[
              editStyles.inputRow,
              {
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
          >
            <MaterialCommunityIcons name="magnify" size={19} color={colors.mutedForeground} />
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder="Rechercher un lieu enregistré…"
              placeholderTextColor={colors.mutedForeground}
              style={[editStyles.input, { color: colors.foreground }]}
              returnKeyType="done"
              onSubmitEditing={handleSave}
              autoCorrect={false}
              autoCapitalize="sentences"
            />
          </View>
          {filteredSuggestions.length > 0 && (
            <ScrollView
              style={editStyles.suggestionsList}
              contentContainerStyle={editStyles.suggestionsContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {filteredSuggestions.map(name => {
                const place = knownPlaces.find(p => p.name === name);
                const address = place?.address ?? (place ? `${place.lat}, ${place.lng}` : '');
                const selected = text.trim() === name;
                return (
                <Pressable
                  key={place?.id ?? name}
                  onPress={() => { setText(name); onChipUsed(name); inputRef.current?.focus(); }}
                  style={({ pressed }) => [
                    editStyles.suggestionRow,
                    {
                      backgroundColor: selected ? colors.primary + '22' : colors.muted,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <MaterialCommunityIcons name="map-marker" size={17} color={selected ? colors.primary : colors.mutedForeground} />
                  <View style={editStyles.suggestionInfo}>
                    <Text style={[editStyles.suggestionName, { color: colors.foreground }]} numberOfLines={1}>
                      {name}
                    </Text>
                    {!!address && (
                      <Text style={[editStyles.suggestionAddress, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {address}
                      </Text>
                    )}
                  </View>
                  {selected && <MaterialCommunityIcons name="check" size={18} color={colors.primary} />}
                </Pressable>
                );
              })}
            </ScrollView>
          )}
          {normalizedQuery.length > 0 && filteredSuggestions.length === 0 && (
            <Text style={[editStyles.noSuggestion, { color: colors.mutedForeground }]}>
              Aucun lieu enregistré correspondant. Vous pouvez tout de même saisir un lieu libre.
            </Text>
          )}
          <View style={editStyles.actions}>
            <Pressable
              onPress={onCancel}
              style={[editStyles.btn, { backgroundColor: colors.muted }]}
            >
              <Text style={[editStyles.btnText, { color: colors.mutedForeground }]}>Annuler</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={[editStyles.btn, { backgroundColor: colors.primary }]}
            >
              <Text style={[editStyles.btnText, { color: '#000' }]}>Enregistrer</Text>
            </Pressable>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const editStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  title: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  sublabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 48,
    gap: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  suggestionsList: {
    maxHeight: 190,
    borderRadius: 10,
  },
  suggestionsContent: {
    gap: 6,
    paddingVertical: 2,
  },
  suggestionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  suggestionInfo: { flex: 1, gap: 2 },
  suggestionName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  suggestionAddress: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  noSuggestion: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  btnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});

// ── WalkParticipantPickerModal ────────────────────────────────────────────────
function WalkParticipantPickerModal({
  visible, allParticipants, selectedIds, colors, onClose, onToggle,
}: {
  visible: boolean;
  allParticipants: WalkParticipant[];
  selectedIds: string[];
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onToggle: (id: string) => void;
}) {
  const humans = allParticipants.filter(p => p.type === 'human');
  const dogs   = allParticipants.filter(p => p.type === 'dog');
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Participants">
          {allParticipants.length === 0 ? (
            <Text style={[routePickerStyles.empty, { color: colors.mutedForeground }]}>
              Aucun participant — ajoute-en dans Véhicules & entretien.
            </Text>
          ) : (
            <View style={routePickerStyles.chips}>
              {humans.map(p => {
                const active = selectedIds.includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => { Haptics.selectionAsync(); onToggle(p.id); }}
                    style={[routePickerStyles.chip, { backgroundColor: active ? '#2196F322' : colors.muted, borderColor: active ? '#2196F3' : colors.border }]}
                  >
                    <Text style={{ fontSize: 12 }}>👤</Text>
                    <Text style={[routePickerStyles.chipText, { color: active ? '#2196F3' : colors.foreground }]}>{p.name}</Text>
                  </Pressable>
                );
              })}
              {dogs.map(p => {
                const active = selectedIds.includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => { Haptics.selectionAsync(); onToggle(p.id); }}
                    style={[routePickerStyles.chip, { backgroundColor: active ? '#FFC10722' : colors.muted, borderColor: active ? '#FFC107' : colors.border }]}
                  >
                    <Text style={{ fontSize: 12 }}>🐕</Text>
                    <Text style={[routePickerStyles.chipText, { color: active ? '#FFC107' : colors.foreground }]}>{p.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Pressable onPress={onClose} style={[routePickerStyles.cancelBtn, { backgroundColor: colors.muted }]}>
            <Text style={[routePickerStyles.cancelText, { color: colors.mutedForeground }]}>Fermer</Text>
          </Pressable>
    </BottomSheet>
  );
}

// ── WalkRoutePickerModal ──────────────────────────────────────────────────────
function WalkRoutePickerModal({
  visible, routes, currentId, colors, onClose, onPick,
}: {
  visible: boolean;
  routes: WalkRoute[];
  currentId?: string;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onPick: (id: string | undefined) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Parcours">
          {routes.length === 0 ? (
            <Text style={[routePickerStyles.empty, { color: colors.mutedForeground }]}>
              Aucun parcours — ajoute-en dans Lieux connus.
            </Text>
          ) : (
            <View style={routePickerStyles.chips}>
              {routes.map(r => {
                const selected = r.id === currentId;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => { Haptics.selectionAsync(); onPick(selected ? undefined : r.id); }}
                    style={[
                      routePickerStyles.chip,
                      { backgroundColor: selected ? '#4CAF5022' : colors.muted, borderColor: selected ? '#4CAF50' : colors.border },
                    ]}
                  >
                    <MaterialCommunityIcons name="walk" size={13} color={selected ? '#4CAF50' : colors.mutedForeground} />
                    <Text style={[routePickerStyles.chipText, { color: selected ? '#4CAF50' : colors.foreground }]}>{r.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Pressable onPress={onClose} style={[routePickerStyles.cancelBtn, { backgroundColor: colors.muted }]}>
            <Text style={[routePickerStyles.cancelText, { color: colors.mutedForeground }]}>Fermer</Text>
          </Pressable>
    </BottomSheet>
  );
}

const routePickerStyles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 16 },
  title: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  empty: { fontSize: 13, fontFamily: 'Inter_400Regular', fontStyle: 'italic' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  cancelBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  cancelText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TripMapScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, backLabel, participantName } = useLocalSearchParams<{ id: string; backLabel?: string; participantName?: string }>();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [osrmRoute, setOsrmRoute] = useState<{ lat: number; lng: number }[] | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [placeCategories, setPlaceCategories] = useState<PlaceCategory[]>([]);
  const [knownPlaces, setKnownPlaces] = useState<KnownPlace[]>([]);
  const [walkRoutes, setWalkRoutes] = useState<WalkRoute[]>([]);

  const [walkParticipantIds, setWalkParticipantIds] = useState<string[]>([]);

  const [editingField, setEditingField] = useState<'start' | 'end' | null>(null);
  const [addressUsage, setAddressUsage] = useState<Record<string, number>>({});
  const [pickingRoute, setPickingRoute] = useState(false);
  const [pickingParticipants, setPickingParticipants] = useState(false);

  const [dtPickerStep, setDtPickerStep] = useState<'date' | 'startTime' | 'endTime' | null>(null);
  const [draftStart, setDraftStart] = useState<Date>(new Date());
  const [draftEnd, setDraftEnd] = useState<Date>(new Date());

  const [storyDuration, setStoryDuration] = useState<10 | 20 | 30 | 60>(20);
  const [storyTheme, setStoryTheme] = useState<StoryTheme>('dark');
  const [tripLocPts, setTripLocPts] = useState<LocationPoint[]>([]);
  const [speedUnitPace, setSpeedUnitPace] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartRefreshKey, setChartRefreshKey] = useState(0);

  const [regenGpsLoading, setRegenGpsLoading] = useState(false);

  const [scrubTs, setScrubTs] = useState<number | null>(null);
  const [storyModalVisible, setStoryModalVisible] = useState(false);

  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryAssets, setGalleryAssets] = useState<MediaLibrary.Asset[]>([]);
  const [gallerySelected, setGallerySelected] = useState<Set<string>>(new Set());
  const [photoSelectMode, setPhotoSelectMode] = useState(false);
  const [repositioningPhotoId, setRepositioningPhotoId] = useState<string | null>(null);
  const [photoNoteEditId, setPhotoNoteEditId] = useState<string | null>(null);
  const [photoNoteDraft, setPhotoNoteDraft] = useState('');
  const [noteEditing, setNoteEditing] = useState(false);
  const [tripNoteDraft, setTripNoteDraft] = useState('');

  // ── Swipe entre trajets ────────────────────────────────────────────────────
  const [sortedTripIds, setSortedTripIds] = useState<string[]>([]);
  const swipeStateRef = useRef({ ids: [] as string[], idx: -1 });

  useEffect(() => {
    getTrips().then(trips => {
      const ids = [...trips]
        .sort((a, b) => b.startTime - a.startTime)
        .map(t => t.id);
      setSortedTripIds(ids);
      swipeStateRef.current = { ids, idx: ids.indexOf(id ?? '') };
    });
  }, [id]);

  const swipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 15 && Math.abs(gs.dx) > Math.abs(gs.dy) * 2,
      onPanResponderRelease: (_, gs) => {
        const { ids, idx } = swipeStateRef.current;
        const THRESHOLD = 60;
        if (gs.dx < -THRESHOLD && idx < ids.length - 1) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.replace(`/trip-map?id=${ids[idx + 1]}&backLabel=${encodeURIComponent(backLabel ?? 'Retour')}`);
        } else if (gs.dx > THRESHOLD && idx > 0) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.replace(`/trip-map?id=${ids[idx - 1]}&backLabel=${encodeURIComponent(backLabel ?? 'Retour')}`);
        }
      },
    })
  ).current;

  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [storyProgress, setStoryProgress]         = useState(0);
  const storyChunksRef = useRef<{ mime: string; chunks: string[]; total: number }>({ mime: 'video/mp4', chunks: [], total: 0 });
  const storyWebViewRef = useRef<WebView>(null);
  const storyHtml = useRef(buildStoryHtml()).current;
  const captureViewRef = useRef<View>(null);
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleStoryWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(event.nativeEvent.data) as Record<string, unknown>; } catch { return; }
    if (msg.type === 'story_progress') {
      setStoryProgress(msg.p as number ?? 0);
      return;
    }
    if (msg.type === 'story_theme_fallback') {
      Alert.alert(
        'Thème satellite indisponible',
        "Impossible de récupérer l'imagerie satellite (réseau ou délai dépassé). La story a été générée avec le thème Sombre à la place.",
      );
      return;
    }
    if (msg.type === 'story_chunk') {
      const idx   = msg.index as number ?? 0;
      const total = msg.total as number ?? 1;
      const mime  = msg.mime  as string ?? 'video/mp4';
      const data  = msg.data  as string ?? '';
      if (idx === 0) {
        storyChunksRef.current = { mime, chunks: new Array(total).fill(''), total };
      }
      storyChunksRef.current.chunks[idx] = data;
      const received = storyChunksRef.current.chunks.filter(s => s !== '').length;
      if (received === storyChunksRef.current.total) {
        const { mime: m, chunks } = storyChunksRef.current;
        const ext = m === 'video/mp4' ? 'mp4' : 'webm';
        const path = `${FileSystem.cacheDirectory ?? ''}story_${Date.now()}.${ext}`;
        const b64 = chunks.join('');
        void (async () => {
          try {
            await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
            setIsGeneratingStory(false);
            await Sharing.shareAsync(path, { mimeType: m, dialogTitle: 'Partager la story' });
          } catch {
            setIsGeneratingStory(false);
            Alert.alert('Erreur', 'Impossible de générer la story.');
          }
        })();
      }
    }
  }, []);

  const handleScreenshot = useCallback(async () => {
    if (isCapturing || !captureViewRef.current) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsCapturing(true);
    setScreenshotMode(true);
    await new Promise(r => setTimeout(r, 1200));
    try {
      const uri = await captureRef(captureViewRef, { format: 'png', quality: 1 });
      setScreenshotMode(false);
      setIsCapturing(false);
      Alert.alert(
        'Screenshot prêt',
        '',
        [
          {
            text: 'Partager',
            onPress: () => void Sharing.shareAsync(uri, { mimeType: 'image/jpeg' }),
          },
          {
            text: 'Sauvegarder dans la galerie',
            onPress: async () => {
              const { status } = await MediaLibrary.requestPermissionsAsync();
              if (status === 'granted') {
                await MediaLibrary.saveToLibraryAsync(uri);
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } else {
                Alert.alert('Permission refusée', 'Autorise l\'accès à la galerie dans les paramètres.');
              }
            },
          },
          { text: 'Annuler', style: 'cancel' },
        ]
      );
    } catch {
      setScreenshotMode(false);
      setIsCapturing(false);
    }
  }, [isCapturing]);

  const handleChartScrub = useCallback((pt: LocationPoint | null) => {
    setScrubTs(pt ? pt.timestamp : null);
  }, []);

  const parseExifDate = (raw?: string): number | null => {
    if (!raw) return null;
    // EXIF DateTimeOriginal format: "YYYY:MM:DD HH:MM:SS"
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(raw);
    if (!m) return null;
    const [, y, mo, d, h, mi, s] = m;
    const t = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime();
    return Number.isFinite(t) ? t : null;
  };

  /**
   * Déduit automatiquement la position d'une photo sur le tracé à partir de son heure de
   * prise de vue (EXIF/asset) : on la compare aux horodatages GPS réels des points du
   * tracé quand ils existent (trace brute), sinon on interpole uniformément entre le
   * début et la fin du trajet (tracé OSRM/manuel, sans horodatage par point).
   * Retourne `undefined` si l'heure de la photo tombe hors de la fenêtre du trajet.
   */
  const computeRouteIndexFromTime = useCallback((t: Trip, takenAt: number): number | undefined => {
    const route = t.route;
    if (!route || route.length < 2) return undefined;
    const margin = 5 * 60 * 1000; // tolère 5 min hors bornes (imprécision d'horloge photo/GPS)
    if (takenAt < t.startTime - margin || takenAt > t.endTime + margin) return undefined;
    const hasTimestamps = route.some(p => p.t != null);
    if (hasTimestamps) {
      let bestIdx = 0, bestDiff = Infinity;
      route.forEach((p, i) => {
        if (p.t == null) return;
        const diff = Math.abs(p.t - takenAt);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      });
      return bestIdx;
    }
    const dur = t.endTime - t.startTime;
    if (dur <= 0) return undefined;
    const frac = Math.max(0, Math.min(1, (takenAt - t.startTime) / dur));
    return Math.round(frac * (route.length - 1));
  }, []);

  /** Ouvre la galerie et ajoute la/les photo(s) choisies ; leur position sur le trajet est
   *  déduite automatiquement de leur heure de prise de vue (EXIF), sauf `forceRouteIndex`
   *  fourni explicitement (repositionnement manuel). */
  const handleAddPhotos = useCallback(async (forceRouteIndex?: number) => {
    if (!trip || addingPhotos) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Autorise l\'accès à la galerie dans les paramètres.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: forceRouteIndex == null,
      exif: true,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    setAddingPhotos(true);
    try {
      const newPhotos: TripPhoto[] = [];
      for (const asset of result.assets) {
        let takenAt = parseExifDate(asset.exif?.['DateTimeOriginal'] as string | undefined)
          ?? parseExifDate(asset.exif?.['DateTime'] as string | undefined);
        if (takenAt == null && asset.assetId) {
          try {
            const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
            if (info.creationTime) takenAt = info.creationTime;
          } catch {}
        }
        takenAt = takenAt ?? Date.now();
        const routeIndex = forceRouteIndex ?? computeRouteIndexFromTime(trip, takenAt);
        newPhotos.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          uri: asset.uri,
          takenAt,
          routeIndex,
        });
      }
      const merged = [...(trip.photos ?? []), ...newPhotos]
        .sort((a, b) => (a.routeIndex ?? Infinity) - (b.routeIndex ?? Infinity) || a.takenAt - b.takenAt);
      setTrip({ ...trip, photos: merged });
      await updateTrip(trip.id, { photos: merged });
      if (forceRouteIndex != null && newPhotos.length > 0) {
        setPhotoNoteEditId(newPhotos[newPhotos.length - 1]!.id);
        setPhotoNoteDraft('');
      }
    } finally {
      setAddingPhotos(false);
    }
  }, [trip, addingPhotos, computeRouteIndexFromTime]);

  /** Ouvre un sélecteur maison listant en priorité les photos prises pendant le trajet
   *  (déduites de leur date de création vs. la fenêtre horaire du trajet), impossible à
   *  obtenir depuis le sélecteur système d'Android qui n'a aucune notion du trajet. */
  const openGalleryPicker = useCallback(async () => {
    if (!trip) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      // Accès restreint ou refusé : repli sur le sélecteur système classique.
      void handleAddPhotos();
      return;
    }
    setGalleryLoading(true);
    setGallerySelected(new Set());
    try {
      const margin = 30 * 60 * 1000; // ±30 min autour du trajet pour couvrir les photos prises juste avant/après
      const { assets } = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        createdAfter: trip.startTime - margin,
        createdBefore: trip.endTime + margin,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        first: 120,
      });
      if (assets.length === 0) {
        // Rien trouvé dans la fenêtre du trajet : autant ouvrir directement la galerie complète.
        void handleAddPhotos();
        return;
      }
      setGalleryAssets(assets);
      setGalleryPickerOpen(true);
    } catch {
      void handleAddPhotos();
    } finally {
      setGalleryLoading(false);
    }
  }, [trip, handleAddPhotos]);

  const toggleGallerySelect = useCallback((id: string) => {
    setGallerySelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const confirmGallerySelection = useCallback(async () => {
    if (!trip || gallerySelected.size === 0) { setGalleryPickerOpen(false); return; }
    setAddingPhotos(true);
    try {
      const chosen = galleryAssets.filter(a => gallerySelected.has(a.id));
      const newPhotos: TripPhoto[] = chosen.map(a => {
        const takenAt = a.creationTime || Date.now();
        return {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          uri: a.uri,
          takenAt,
          routeIndex: computeRouteIndexFromTime(trip, takenAt),
        };
      });
      const merged = [...(trip.photos ?? []), ...newPhotos]
        .sort((a, b) => (a.routeIndex ?? Infinity) - (b.routeIndex ?? Infinity) || a.takenAt - b.takenAt);
      setTrip({ ...trip, photos: merged });
      await updateTrip(trip.id, { photos: merged });
      setGalleryPickerOpen(false);
      setGallerySelected(new Set());
    } finally {
      setAddingPhotos(false);
    }
  }, [trip, galleryAssets, gallerySelected, computeRouteIndexFromTime]);

  const handleRemovePhoto = useCallback(async (photoId: string) => {
    if (!trip) return;
    const remaining = (trip.photos ?? []).filter(p => p.id !== photoId);
    setTrip({ ...trip, photos: remaining });
    await updateTrip(trip.id, { photos: remaining });
  }, [trip]);

  const handleSavePhotoNote = useCallback(async () => {
    if (!trip || !photoNoteEditId) return;
    const next = (trip.photos ?? []).map(p => p.id === photoNoteEditId ? { ...p, note: photoNoteDraft.trim() || undefined } : p);
    setTrip({ ...trip, photos: next });
    await updateTrip(trip.id, { photos: next });
    setPhotoNoteEditId(null);
    setPhotoNoteDraft('');
  }, [trip, photoNoteEditId, photoNoteDraft]);

  const handleMapPointSelected = useCallback(async (idx: number) => {
    setPhotoSelectMode(false);
    if (repositioningPhotoId && trip) {
      const next = (trip.photos ?? []).map(p => p.id === repositioningPhotoId ? { ...p, routeIndex: idx } : p)
        .sort((a, b) => (a.routeIndex ?? Infinity) - (b.routeIndex ?? Infinity) || a.takenAt - b.takenAt);
      setTrip({ ...trip, photos: next });
      await updateTrip(trip.id, { photos: next });
      setRepositioningPhotoId(null);
      return;
    }
    void handleAddPhotos(idx);
  }, [handleAddPhotos, repositioningPhotoId, trip]);

  const handleSaveTripNote = useCallback(async () => {
    if (!trip) return;
    const next = tripNoteDraft.trim() || undefined;
    setTrip({ ...trip, note: next });
    await updateTrip(trip.id, { note: next });
    setNoteEditing(false);
  }, [trip, tripNoteDraft]);

  const scrubMapPoint = useMemo(() => {
    if (!scrubTs || tripLocPts.length === 0) return undefined;
    let best = tripLocPts[0]!;
    let bestD = Math.abs(best.timestamp - scrubTs);
    for (const p of tripLocPts) {
      const d = Math.abs(p.timestamp - scrubTs);
      if (d < bestD) { best = p; bestD = d; }
    }
    return { lat: best.lat, lng: best.lng };
  }, [scrubTs, tripLocPts]);

  /** Encode une photo de galerie en data URI base64 pour que le WebView puisse la dessiner. */
  const photoToDataUri = useCallback(async (uri: string): Promise<string | null> => {
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const ext = (uri.split('.').pop() || 'jpg').toLowerCase().split('?')[0];
      const mime = ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
      return `data:${mime};base64,${b64}`;
    } catch {
      return null;
    }
  }, []);

  const handleGenerateStory = useCallback(async (durationOverride?: number) => {
    if (!trip || isGeneratingStory) return;

    // Route : tracé stocké ou tracé GPS déjà chargé dans tripLocPts
    const route: Array<{ lat: number; lng: number }> =
      trip.route && trip.route.length >= 2
        ? trip.route
        : tripLocPts.length >= 2
          ? tripLocPts.map(p => ({ lat: p.lat, lng: p.lng }))
          : [];

    if (route.length < 2) {
      Alert.alert('Story', 'Tracé GPS insuffisant pour générer une story.');
      return;
    }

    // Photos ancrées sur le tracé (comme la Story Période) : encodées en data URI
    const anchoredPhotos = (trip.photos ?? []).filter(p => p.routeIndex != null && route.length > 1);
    const photos = (await Promise.all(anchoredPhotos.map(async p => {
      const dataUri = await photoToDataUri(p.uri);
      if (!dataUri) return null;
      return { img: dataUri, note: p.note, frac: (p.routeIndex! / (route.length - 1)) };
    }))).filter((p): p is { img: string; note: string | undefined; frac: number } => p != null);

    setIsGeneratingStory(true);
    setStoryProgress(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Réutilise tripLocPts (déjà filtré + samplé — mêmes données que les charts affichés)
    let rawCumDist = 0;
    const t0ms = tripLocPts.length > 0 ? tripLocPts[0]!.timestamp : 0;
    const rawChartPts: Array<{ km: number; ms: number; spd: number; alt: number | null }> = [];
    for (let i = 0; i < tripLocPts.length; i++) {
      if (i > 0) rawCumDist += haversineKm(tripLocPts[i - 1]!.lat, tripLocPts[i - 1]!.lng, tripLocPts[i]!.lat, tripLocPts[i]!.lng);
      rawChartPts.push({
        km: rawCumDist,
        ms: tripLocPts[i]!.timestamp - t0ms,
        spd: tripLocPts[i]!.speedKmh ?? 0,
        alt: tripLocPts[i]!.altitudeM ?? null,
      });
    }
    const distScale = rawCumDist > 0 ? trip.distanceKm / rawCumDist : 1;
    const chartPts = rawChartPts.map(p => ({ ...p, km: parseFloat((p.km * distScale).toFixed(3)) }));

    const maxSpeed = Math.max(...tripLocPts.map(p => p.speedKmh ?? 0), 1);
    const alts = tripLocPts.map(p => p.altitudeM).filter((a): a is number => a != null);
    const minAlt = alts.length > 0 ? Math.min(...alts) : 0;
    const maxAlt = alts.length > 0 ? Math.max(...alts) : 0;
    let gainM = 0;
    for (let i = 1; i < tripLocPts.length; i++) {
      const a = tripLocPts[i]!.altitudeM, b = tripLocPts[i - 1]!.altitudeM;
      if (a != null && b != null && a - b >= ALT_GAIN_THRESHOLD_M) gainM += a - b;
    }

    const durationSec = Math.round((trip.endTime - trip.startTime) / 1000);
    const startDate = new Date(trip.startTime);
    const DAYS   = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const MONTHS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
    const dateLabel = `${DAYS[startDate.getDay()]} ${startDate.getDate()} ${MONTHS[startDate.getMonth()]}`;
    const fmtH = (d: Date) => `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
    const timeLabel = `${fmtH(startDate)} → ${fmtH(new Date(trip.endTime))}`;

    const veh = vehicles.find(v => v.id === trip.vehicle);
    const vehicleColor = veh?.type === 'walk' ? '#4CAF50'
      : veh?.type === 'moto' || trip.vehicle === 'moto' ? '#FF9800'
      : '#2196F3';
    const vehicleEmoji = veh?.type === 'moto' || trip.vehicle === 'moto' ? '🏍'
      : veh?.type === 'walk' ? '🚶' : '🚗';

    const isWalk = veh?.type === 'walk';
    const walkStoryParticipants = isWalk
      ? (trip.walkParticipants ?? [])
          .map(id => veh?.walkParticipants?.find(p => p.id === id)?.name)
          .filter((name): name is string => !!name)
      : [];
    const walkStorySpot = isWalk && trip.walkRouteId
      ? walkRoutes.find(r => r.id === trip.walkRouteId)?.name
      : undefined;
    const opts = {
      color: vehicleColor,
      vehicleEmoji,
      dateLabel,
      timeLabel,
      distKm: parseFloat(trip.distanceKm.toFixed(1)),
      durationSec,
      maxSpeed,
      gainM: Math.round(gainM),
      minAlt,
      maxAlt,
      hasAlt: alts.length > 0,
      points: chartPts,
      route,
      videoDurationSec: durationOverride ?? storyDuration,
      showPace: isWalk && speedUnitPace,
      isWalk,
      walkParticipants: walkStoryParticipants,
      walkSpotName: walkStorySpot,
      photos,
      theme: storyTheme,
    };

    storyWebViewRef.current?.injectJavaScript(`(function(){window.generateStory(${JSON.stringify(opts)});})();true;`);
  }, [trip, vehicles, walkRoutes, isGeneratingStory, storyDuration, storyTheme, tripLocPts, photoToDataUri, speedUnitPace]);

  function handleOpenDtPicker() {
    if (!trip) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDraftStart(new Date(trip.startTime));
    setDraftEnd(new Date(trip.endTime));
    setDtPickerStep('date');
  }

  function handleDateChange(_: unknown, selected?: Date) {
    if (!selected) { setDtPickerStep(null); return; }
    const newStart = new Date(draftStart);
    newStart.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    const newEnd = new Date(draftEnd);
    newEnd.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    setDraftStart(newStart);
    setDraftEnd(newEnd);
    setDtPickerStep('startTime');
  }

  function handleStartTimeChange(_: unknown, selected?: Date) {
    if (!selected) { setDtPickerStep(null); return; }
    const newStart = new Date(draftStart);
    newStart.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setDraftStart(newStart);
    setDtPickerStep('endTime');
  }

  async function handleEndTimeChange(_: unknown, selected?: Date) {
    setDtPickerStep(null);
    if (!selected || !trip) return;
    const newEnd = new Date(draftEnd);
    newEnd.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    const newStartTs = draftStart.getTime();
    const newEndTs   = newEnd.getTime();
    const updated: Trip = { ...trip, startTime: newStartTs, endTime: newEndTs };
    setTrip(updated);
    await updateTrip(trip.id, { startTime: newStartTs, endTime: newEndTs });
    tripEvents.emitTripUpdated();
  }

  useEffect(() => {
    getPlaceCategories().then(setPlaceCategories).catch(() => {});
    getKnownPlaces().then(setKnownPlaces).catch(() => {});
    getAddressUsage().then(setAddressUsage).catch(() => {});
    getWalkRoutes().then(setWalkRoutes).catch(() => {});
    AsyncStorage.getItem('@yoann2_speed_unit_walk').then(v => {
      if (v === 'pace') setSpeedUnitPace(true);
    }).catch(() => {});
  }, []);

  const handleToggleSpeedUnit = useCallback(() => {
    setSpeedUnitPace(prev => {
      const next = !prev;
      AsyncStorage.setItem('@yoann2_speed_unit_walk', next ? 'pace' : 'kmh').catch(() => {});
      return next;
    });
  }, []);

  useEffect(() => {
    if (!trip) return;
    setChartLoading(true);
    setTripLocPts([]);
    void (async () => {
      try {
        const gpsPoints = await loadMultiDayPoints(trip.startTime, trip.endTime);
        const tripPoints = filterGpsOutliers(
          gpsPoints.filter(p => p.timestamp >= trip.startTime && p.timestamp <= trip.endTime)
        );
        if (tripPoints.length < 2) { setChartLoading(false); return; }
        const step = Math.max(1, Math.floor(tripPoints.length / 200));
        const sampled = tripPoints.filter((_, i) => i % step === 0 || i === tripPoints.length - 1);
        setTripLocPts(sampled);
      } catch { /* no GPS data */ }
      setChartLoading(false);
    })();
  }, [trip?.id, chartRefreshKey]);

  // ── Injection de données test (vitesse + altitude) ────────────────────────
  const handleInjectTestData = useCallback(async () => {
    if (!trip) return;
    const SPEED_PROFILE  = [0, 15, 40, 75, 100, 115, 105, 90, 65, 45, 30, 15, 0];
    const ALT_PROFILE    = [195, 200, 210, 220, 225, 222, 215, 205, 195, 185, 180, 177, 175];
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const durationMs = trip.endTime - trip.startTime;
    const intervalMs = 8_000;
    const count = Math.max(10, Math.floor(durationMs / intervalMs));
    const startLat = trip.startLat ?? 45.730;
    const endLat   = trip.endLat   ?? 45.764;
    const startLng = trip.startLon ?? 4.940;
    const endLng   = trip.endLon   ?? 4.828;
    const points = Array.from({ length: count }, (_, i) => {
      const t = i / Math.max(1, count - 1);
      const pi = t * (SPEED_PROFILE.length - 1);
      const lo = Math.floor(pi), hi = Math.min(lo + 1, SPEED_PROFILE.length - 1);
      const ft = pi - lo;
      return {
        lat: lerp(startLat, endLat, t) + (Math.random() - 0.5) * 0.0002,
        lng: lerp(startLng, endLng, t) + (Math.random() - 0.5) * 0.0002,
        timestamp: trip.startTime + i * intervalMs,
        speedKmh: Math.max(0, Math.round(lerp(SPEED_PROFILE[lo]!, SPEED_PROFILE[hi]!, ft) + (Math.random() - 0.5) * 6)),
        altitudeM: Math.round(lerp(ALT_PROFILE[lo]!, ALT_PROFILE[hi]!, ft) + (Math.random() - 0.5) * 3),
        activity: 'car' as const,
      };
    });
    const dayKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
    const key = '@yoann2_location_' + dayKey(trip.startTime);
    const raw = await AsyncStorage.getItem(key);
    const existing = raw ? JSON.parse(raw) as typeof points : [];
    const filtered = existing.filter((p: { timestamp: number }) => p.timestamp < trip.startTime || p.timestamp > trip.endTime);
    await AsyncStorage.setItem(key, JSON.stringify([...filtered, ...points]));
    setChartRefreshKey(k => k + 1);
  }, [trip]);

  function fetchOsrmRoute(t: Trip) {
    if (!t.startLat || !t.startLon || !t.endLat || !t.endLon) return;
    setLoadingRoute(true);
    setOsrmRoute(null);
    const url = `https://router.project-osrm.org/route/v1/driving/${t.startLon},${t.startLat};${t.endLon},${t.endLat}?overview=full&geometries=geojson`;
    fetch(url)
      .then(r => r.json())
      .then((data: { routes?: Array<{ geometry: { coordinates: [number, number][] } }> }) => {
        const coords = data.routes?.[0]?.geometry?.coordinates;
        if (coords && coords.length >= 2) {
          const pts: RoutePoint[] = simplifyRoute(coords.map(([lng, lat]) => ({ lat, lng })));
          setOsrmRoute(pts);
          updateTrip(t.id, { route: pts }).catch(() => {});
        } else {
          setOsrmRoute([{ lat: t.startLat!, lng: t.startLon! }, { lat: t.endLat!, lng: t.endLon! }]);
        }
      })
      .catch(() => {
        setOsrmRoute([{ lat: t.startLat!, lng: t.startLon! }, { lat: t.endLat!, lng: t.endLon! }]);
      })
      .finally(() => setLoadingRoute(false));
  }

  useEffect(() => {
    Promise.all([getTrips(), getVehicleSettings()]).then(([trips, v]) => {
      const found = trips.find(t => t.id === id) ?? null;
      setTrip(found);
      setTripNoteDraft(found?.note ?? '');
      setVehicles(v);
      setWalkParticipantIds(found?.walkParticipants ?? []);
      setLoading(false);

      if (
        found &&
        found.source === 'manual' &&
        (!found.route || found.route.length < 2) &&
        found.startLat && found.startLon && found.endLat && found.endLon
      ) {
        fetchOsrmRoute(found);
      }
    });
  }, [id]);

  async function handleSaveAddress(value: string) {
    if (!trip || !editingField) return;

    const isStart = editingField === 'start';
    const addressField = isStart ? 'startAddress' : 'endAddress';
    const placeIdField = isStart ? 'startPlaceId' : 'endPlaceId';
    const latField    = isStart ? 'startLat'     : 'endLat';
    const lonField    = isStart ? 'startLon'      : 'endLon';

    // Look up matching known place to get GPS coordinates
    const matchedPlace = value ? knownPlaces.find(p => p.name === value) : undefined;

    const coordsChanged =
      matchedPlace &&
      (matchedPlace.lat !== trip[latField] || matchedPlace.lng !== trip[lonField]);

    const patch: Partial<Trip> = {
      [addressField]: value || undefined,
      [placeIdField]: matchedPlace?.id ?? undefined,
      ...(coordsChanged ? { [latField]: matchedPlace.lat, [lonField]: matchedPlace.lng } : {}),
    };

    const updated: Trip = { ...trip, ...patch };
    setTrip(updated);
    setEditingField(null);
    await updateTrip(trip.id, patch);
    tripEvents.emitTripUpdated();

    // Re-fetch OSRM route if coordinates changed on a manual trip
    if (coordsChanged && trip.source === 'manual') {
      fetchOsrmRoute(updated);
    }

    if (value) {
      await incrementAddressUsage(value);
      setAddressUsage(prev => ({ ...prev, [value]: (prev[value] ?? 0) + 1 }));
    }
  }

  async function handleChipUsed(name: string) {
    await incrementAddressUsage(name);
    setAddressUsage(prev => ({ ...prev, [name]: (prev[name] ?? 0) + 1 }));
  }

  const isWalkTrip = !!trip && vehicles.some(v => v.id === trip.vehicle && v.type === 'walk');

  const handleRegenGpsRoute = useCallback(async () => {
    if (!trip || regenGpsLoading) return;
    setRegenGpsLoading(true);
    try {
      const gpsPoints = await loadMultiDayPoints(trip.startTime, trip.endTime);
      const filtered = filterGpsOutliers(
        gpsPoints.filter(p => p.timestamp >= trip.startTime && p.timestamp <= trip.endTime)
      );
      if (filtered.length < 2) {
        Alert.alert('Tracé GPS', 'Pas assez de points GPS pour ce trajet.');
        return;
      }
      const gpsRoute = filtered.map(p => ({ lat: p.lat, lng: p.lng }));
      const newRoute: RoutePoint[] = simplifyRoute(
        gpsRoute,
        isWalkTrip ? EPSILON_DEG_WALK : undefined,
      );
      const patch: Partial<Trip> = {
        route: newRoute,
        routeSource: 'gps',
        distanceKm: Math.round(computeRouteDistanceKm(gpsRoute) * 100) / 100,
        pointCount: filtered.length,
      };
      setTrip(prev => prev ? { ...prev, ...patch } : prev);
      await updateTrip(trip.id, patch);
      tripEvents.emitTripUpdated();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Erreur', 'Impossible de régénérer le tracé.');
    } finally {
      setRegenGpsLoading(false);
    }
  }, [trip, regenGpsLoading, isWalkTrip]);

  async function handlePickWalkRoute(routeId: string | undefined) {
    if (!trip) return;
    setPickingRoute(false);
    const patch: Partial<Trip> = { walkRouteId: routeId };
    setTrip({ ...trip, ...patch });
    await updateTrip(trip.id, patch);
    tripEvents.emitTripUpdated();
  }

  async function handleToggleParticipant(participantId: string) {
    if (!trip) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = walkParticipantIds.includes(participantId)
      ? walkParticipantIds.filter(x => x !== participantId)
      : [...walkParticipantIds, participantId];
    setWalkParticipantIds(next);
    const patch: Partial<Trip> = { walkParticipants: next.length > 0 ? next : undefined };
    setTrip({ ...trip, ...patch });
    await updateTrip(trip.id, patch);
    tripEvents.emitTripUpdated();
  }

  const USABLE_H = SCREEN_H - insets.top - insets.bottom;
  const MAP_H = insets.top + Math.round(USABLE_H * 0.32);
  const MAP_W = SCREEN_W;

  const editingLabel = editingField === 'start' ? 'Lieu de départ' : "Lieu d'arrivée";
  const editingInitial = editingField === 'start'
    ? (trip?.startAddress ?? '')
    : (trip?.endAddress ?? '');

  const walkRouteName = isWalkTrip && trip?.walkRouteId
    ? walkRoutes.find(r => r.id === trip.walkRouteId)?.name
    : undefined;

  const walkVehicle = isWalkTrip ? vehicles.find(v => v.id === trip!.vehicle) : null;

  // Intermediate stop positions for map waypoint dots
  const intermediateWaypoints = useMemo(() => {
    if (!trip?.intermediates?.length) return [];
    return trip.intermediates
      .map(int => knownPlaces.find(p => p.id === int.placeId))
      .filter((p): p is NonNullable<typeof p> => p != null)
      .map(p => ({ lat: p.lat, lng: p.lng }));
  }, [trip?.intermediates, knownPlaces]);
  const allWalkParticipants: WalkParticipant[] = walkVehicle?.walkParticipants ?? [];

  const vehColor = (() => {
    const veh = vehicles.find(v => v.id === trip?.vehicle);
    return veh?.type === 'walk' ? '#4CAF50'
      : veh?.type === 'moto' || trip?.vehicle === 'moto' ? '#FF9800'
      : '#2196F3';
  })();

  const hasAltData = tripLocPts.some(p => p.altitudeM != null);

  return (
    <View ref={captureViewRef} collapsable={false} style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Back button */}
      {!screenshotMode && (
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, backLabel ? styles.backBtnLabelled : undefined, { top: insets.top + 10 }]}
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color="#fff" />
          {backLabel ? <Text style={styles.backBtnLabel}>{backLabel}</Text> : null}
        </Pressable>
      )}

      {/* Chevrons de navigation entre trajets */}
      {!screenshotMode && (() => {
        const { ids, idx } = swipeStateRef.current;
        const hasPrev = idx > 0;
        const hasNext = idx < ids.length - 1;
        return (
          <>
            {hasPrev && (
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.replace(`/trip-map?id=${ids[idx - 1]}&backLabel=${encodeURIComponent(backLabel ?? 'Retour')}`);
                }}
                style={{
                  position: 'absolute', left: 8, top: insets.top + 60, zIndex: 20,
                  backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20,
                  width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons name="chevron-left" size={22} color="#fff" />
              </Pressable>
            )}
            {hasNext && (
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.replace(`/trip-map?id=${ids[idx + 1]}&backLabel=${encodeURIComponent(backLabel ?? 'Retour')}`);
                }}
                style={{
                  position: 'absolute', right: 8, top: insets.top + 60, zIndex: 20,
                  backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20,
                  width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons name="chevron-right" size={22} color="#fff" />
              </Pressable>
            )}
          </>
        );
      })()}

      {/* Map — 40% fixed height — swipe horizontal pour naviguer entre trajets */}
      <View style={{ width: MAP_W, height: MAP_H, overflow: 'hidden' }} {...swipePan.panHandlers}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color="#FFC107" /></View>
        ) : (() => {
          // Priorité : tracé stocké → OSRM (>2 pts) → GPS bruts → droite départ/arrivée
          const displayRoute =
            trip?.route && trip.route.length >= 2 ? trip.route :
            osrmRoute && osrmRoute.length > 2 ? osrmRoute :
            tripLocPts.length >= 2 ? tripLocPts.map(p => ({ lat: p.lat, lng: p.lng })) :
            osrmRoute;
          if (!displayRoute || displayRoute.length < 2) {
            return loadingRoute ? (
              <View style={styles.center}>
                <ActivityIndicator color="#FFC107" />
                <Text style={styles.noRoute}>Calcul de l'itinéraire…</Text>
              </View>
            ) : (
              <View style={styles.center}>
                <MaterialCommunityIcons name="map-marker-off-outline" size={48} color="#555" />
                <Text style={styles.noRoute}>Tracé GPS non disponible</Text>
              </View>
            );
          }
          return (
            <TripMapView
              route={displayRoute}
              width={MAP_W}
              height={MAP_H}
              lineColor={trip?.source === 'manual' ? '#2196F3' : '#FFC107'}
              waypoints={intermediateWaypoints.length > 0 ? intermediateWaypoints : undefined}
              scrubPoint={scrubMapPoint}
              photoMarkerIndices={trip?.photos?.map(p => p.routeIndex).filter((i): i is number => i != null)}
              selectMode={photoSelectMode}
              onSelectPoint={handleMapPointSelected}
            />
          );
        })()}
        {photoSelectMode && (
          <View style={{
            position: 'absolute', left: 0, right: 0, top: 0, zIndex: 25,
            backgroundColor: 'rgba(0,0,0,0.7)', paddingVertical: 8, paddingHorizontal: 12,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <Text style={{ color: '#fff', fontSize: 12, flex: 1 }}>Touche le point du tracé où placer cette photo</Text>
            <Pressable onPress={() => { setPhotoSelectMode(false); setRepositioningPhotoId(null); }} hitSlop={8}>
              <Text style={{ color: '#FFC107', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Annuler</Text>
            </Pressable>
          </View>
        )}
        {!screenshotMode && !photoSelectMode && (
          <Pressable
            onPress={() => setPhotoModalOpen(true)}
            style={{
              position: 'absolute', left: 8, bottom: 8, zIndex: 15,
              width: 48, height: 48, borderRadius: 10, overflow: 'hidden',
              backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
            }}
          >
            {trip?.photos && trip.photos.length > 0 ? (
              <>
                <RNImage source={{ uri: trip.photos[0]!.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                {trip.photos.length > 1 && (
                  <View style={{
                    position: 'absolute', right: 2, bottom: 2, backgroundColor: 'rgba(0,0,0,0.7)',
                    borderRadius: 8, paddingHorizontal: 4, minWidth: 16, alignItems: 'center',
                  }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{trip.photos.length}</Text>
                  </View>
                )}
              </>
            ) : (
              <MaterialCommunityIcons name="camera-plus-outline" size={22} color="#fff" />
            )}
          </Pressable>
        )}
      </View>

      {/* Fixed info + charts panel — no scroll */}
      {trip && (
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          {/* Note de trajet — remplace le libellé date dans la Story Période */}
          {!screenshotMode && (
            noteEditing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <TextInput
                  value={tripNoteDraft}
                  onChangeText={setTripNoteDraft}
                  placeholder="Note du trajet (ex. balade au bord de la mer)"
                  placeholderTextColor={colors.mutedForeground}
                  style={{ flex: 1, fontSize: 13, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 4 }}
                  autoFocus
                  onSubmitEditing={handleSaveTripNote}
                  returnKeyType="done"
                />
                <Pressable onPress={handleSaveTripNote} hitSlop={8}>
                  <MaterialCommunityIcons name="check" size={18} color="#4CAF50" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => { setTripNoteDraft(trip.note ?? ''); setNoteEditing(true); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}
              >
                <MaterialCommunityIcons name="notebook-outline" size={13} color={colors.mutedForeground} />
                <Text style={{ fontSize: 12, color: trip.note ? colors.foreground : colors.mutedForeground, flex: 1, fontStyle: trip.note ? 'normal' : 'italic' }} numberOfLines={1}>
                  {trip.note || 'Ajouter une note de trajet'}
                </Text>
                <MaterialCommunityIcons name="pencil-outline" size={13} color={colors.mutedForeground} />
              </Pressable>
            )
          )}
          {/* Legend */}
          {(trip.route || osrmRoute) && (
            <View style={[styles.legendRow, { marginBottom: 4 }]}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Départ</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: trip.source === 'manual' ? '#2196F3' : '#FFC107' }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Arrivée</Text>
              </View>
              {trip.intermediates && trip.intermediates.length > 0 && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#FFC107' }]} />
                  <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Étape</Text>
                </View>
              )}
              {!screenshotMode && (
                <Text style={[styles.legendText, { color: trip.routeSource === 'osrm' ? '#4CAF50' : colors.mutedForeground }]}>
                  {trip.source === 'manual'
                    ? 'Itinéraire estimé (OSRM)'
                    : trip.routeSource === 'osrm'
                      ? `Tracé routier OSRM · ${trip.route?.length ?? 0} pts`
                      : `${trip.route?.length ?? 0} pts (tracé GPS simplifié)`}
                </Text>
              )}
              {/* Story + Screenshot — mêmes dimensions que la ligne légende */}
              {!screenshotMode && tripLocPts.length >= 2 && (
                <View style={{ flexDirection: 'row', marginLeft: 'auto', gap: 5, alignItems: 'center' }}>
                  <Pressable
                    onPress={handleScreenshot}
                    disabled={isCapturing}
                    style={[styles.legendActionBtn, { backgroundColor: '#2196F3' }, isCapturing && { opacity: 0.5 }]}
                  >
                    <MaterialCommunityIcons name="camera-outline" size={14} color="#fff" />
                  </Pressable>
                  <Pressable
                    onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStoryModalVisible(true); }}
                    disabled={isGeneratingStory}
                    style={[styles.legendActionBtn, { borderWidth: 1, borderColor: vehColor + '80' }, isGeneratingStory && { opacity: 0.5 }]}
                  >
                    <MaterialCommunityIcons name="instagram" size={14} color={vehColor} />
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* Address banner */}
          {isWalkTrip ? (
            <View style={[styles.addrBannerCol, { borderBottomColor: colors.border }]}>
              <View style={[styles.walkTopRow, { alignItems: 'flex-start' }]}>
                {/* LEFT: Participants button + noms en dessous */}
                {allWalkParticipants.length > 0 && !screenshotMode && (
                  <View style={{ gap: 3 }}>
                    <Pressable
                      onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPickingParticipants(true); }}
                      style={[styles.walkRouteChip, {
                        backgroundColor: walkParticipantIds.length > 0 ? '#2196F318' : colors.muted,
                        borderWidth: 1,
                        borderColor: walkParticipantIds.length > 0 ? '#2196F360' : colors.border,
                      }]}
                    >
                      <MaterialCommunityIcons name="account-group-outline" size={14} color={walkParticipantIds.length > 0 ? '#2196F3' : colors.mutedForeground} />
                      <Text style={[styles.walkRouteChipText, { color: walkParticipantIds.length > 0 ? '#2196F3' : colors.mutedForeground }]}>Participants</Text>
                    </Pressable>
                    {walkParticipantIds.length > 0 && (
                      <Text style={[styles.walkParticipantsLabel, { color: colors.mutedForeground, marginLeft: 2 }]}>
                        {walkParticipantIds.map(pid => allWalkParticipants.find(p => p.id === pid)?.name).filter((n): n is string => !!n).join(' · ')}
                      </Text>
                    )}
                  </View>
                )}
                {/* RIGHT: Route chip + pencil */}
                <Pressable
                  onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPickingRoute(true); }}
                  style={({ pressed }) => [styles.walkRoutePressable, { flex: 1, justifyContent: 'flex-end', opacity: pressed ? 0.65 : 1 }]}
                >
                  {walkRouteName ? (
                    <View style={styles.walkRouteChip}>
                      <MaterialCommunityIcons name="walk" size={14} color="#4CAF50" />
                      <Text style={[styles.walkRouteChipText, { color: '#4CAF50' }]}>{walkRouteName}</Text>
                    </View>
                  ) : (
                    <View style={[styles.walkRouteChip, { backgroundColor: colors.muted }]}>
                      <MaterialCommunityIcons name="walk" size={14} color={colors.mutedForeground} />
                      <Text style={[styles.walkRouteChipText, { color: colors.mutedForeground }]}>Aucun parcours</Text>
                    </View>
                  )}
                  {!screenshotMode && (
                    <MaterialCommunityIcons name="pencil-outline" size={13} color={colors.mutedForeground} />
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={[styles.addrBanner, { borderBottomColor: colors.border }]}>
              <AddressBadge address={trip.startAddress} placeId={trip.startPlaceId} dotColor="#4CAF50" categories={placeCategories} places={knownPlaces} colors={colors} hideEdit={screenshotMode} onPress={() => setEditingField('start')} />
              <MaterialCommunityIcons name="arrow-right" size={13} color={colors.mutedForeground} />
              {trip.intermediates && trip.intermediates.length > 0 ? (
                <>
                  <Text style={[styles.legendText, { color: '#FFC107', fontFamily: 'Inter_500Medium' }]}>
                    {trip.intermediates.length === 1
                      ? trip.intermediates[0]!.name
                      : `${trip.intermediates.length} étapes`}
                  </Text>
                  <MaterialCommunityIcons name="arrow-right" size={13} color={colors.mutedForeground} />
                </>
              ) : null}
              <AddressBadge address={trip.endAddress} placeId={trip.endPlaceId} dotColor="#FFC107" categories={placeCategories} places={knownPlaces} colors={colors} hideEdit={screenshotMode} onPress={() => setEditingField('end')} />
            </View>
          )}

          {/* Date + vehicle row */}
          <View style={[styles.dtRow, { marginTop: 4, marginBottom: 0 }]}>
            {/* Regen GPS — disponible pour les balades et les trajets véhicule. */}
            {tripLocPts.length >= 2 && !screenshotMode && (
              <Pressable
                onPress={handleRegenGpsRoute}
                disabled={regenGpsLoading}
                hitSlop={8}
                style={({ pressed }) => [{ opacity: pressed || regenGpsLoading ? 0.5 : 1 }]}
              >
                {regenGpsLoading
                  ? <ActivityIndicator size={14} color="#2196F3" />
                  : <MaterialCommunityIcons name="map-marker-path" size={18} color="#2196F3" />}
              </Pressable>
            )}
            <Pressable onPress={handleOpenDtPicker} style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.65 : 1 }]} hitSlop={6}>
              <Text style={[styles.dateText, { color: colors.foreground }]}>{fmtDayLong(trip.startTime)}</Text>
              <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{fmtHHMM(trip.startTime)} → {fmtHHMM(trip.endTime)}</Text>
            </Pressable>
            {!screenshotMode && trip.vehicle && trip.vehicle !== 'ignored' && (() => {
              const veh = vehicles.find(v => v.id === trip.vehicle);
              const color = veh?.type === 'walk' ? '#4CAF50' : veh?.type === 'moto' || trip.vehicle === 'moto' ? '#FF9800' : '#2196F3';
              const icon = veh?.type === 'walk' ? 'walk' : veh?.type === 'moto' || trip.vehicle === 'moto' ? 'motorbike' : 'car';
              const name = veh?.name ?? (trip.vehicle === 'moto' ? 'Moto' : 'Voiture');
              return (
                <View style={[styles.vehicleChip, { backgroundColor: color + '18', borderColor: color + '60' }]}>
                  <MaterialCommunityIcons name={icon as any} size={14} color={color} />
                  <Text style={[styles.vehicleChipText, { color }]}>{name}</Text>
                </View>
              );
            })()}
            {!screenshotMode && (
              <Pressable onPress={handleOpenDtPicker} hitSlop={6}>
                <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>

          {/* Stats row */}
          <View style={[styles.statsRow, { marginTop: 4, marginBottom: 4 }]}>
            <StatItem icon="map-marker-distance" value={`${trip.distanceKm.toFixed(1)} km`} color="#FFC107" />
            <StatItem icon="clock-outline" value={fmtDuration(trip.endTime - trip.startTime)} color={colors.mutedForeground} />
            {!screenshotMode && (
              <StatItem
                icon={trip.source === 'manual' ? 'pencil-outline' : trip.routeSource === 'osrm' ? 'road-variant' : 'navigation-variant-outline'}
                value={trip.source === 'manual' ? 'Trajet manuel' : trip.routeSource === 'osrm' ? 'Tracé routier' : `${trip.pointCount} pts GPS`}
                color={trip.routeSource === 'osrm' ? '#4CAF50' : colors.mutedForeground}
              />
            )}
          </View>

          {!!participantName && (
            <View style={[styles.participantChip, { marginBottom: 4 }]}>
              <MaterialCommunityIcons name="account-outline" size={13} color="#4CAF50" />
              <Text style={[styles.participantChipText, { color: colors.mutedForeground }]}>Avec {participantName}</Text>
            </View>
          )}

          {/* Charts — extraits de map.native.tsx, hauteur fixe H=84, stats inclus */}
          {chartLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <ActivityIndicator size="small" color="#2196F3" />
            </View>
          ) : tripLocPts.length < 2 ? (
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 16 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Aucune donnée GPS</Text>
              <Pressable
                onPress={handleInjectTestData}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#2196F315', borderWidth: 1, borderColor: '#2196F340' }}
              >
                <MaterialCommunityIcons name="flask-outline" size={14} color="#2196F3" />
                <Text style={{ fontSize: 12, color: '#2196F3', fontFamily: 'Inter_500Medium' }}>Injecter données test</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <TripSpeedChart points={tripLocPts} color={vehColor} onScrub={handleChartScrub} externalScrubTs={scrubTs} isWalk={isWalkTrip} speedUnitPace={speedUnitPace} onToggleUnit={handleToggleSpeedUnit} />
              {hasAltData && <TripAltitudeChart points={tripLocPts} color={vehColor} onScrub={handleChartScrub} externalScrubTs={scrubTs} />}
            </>
          )}
        </View>
      )}

      {/* Story progress */}
      {!screenshotMode && trip && isGeneratingStory && (
        <View style={[styles.storyProgressRow, { backgroundColor: colors.card }]}>
          <Text style={styles.storyProgressLabel}>Génération story… {storyProgress}%</Text>
          <View style={styles.storyProgressTrack}>
            <View style={[styles.storyProgressFill, { width: `${storyProgress}%` as `${number}%`, backgroundColor: vehColor }]} />
          </View>
        </View>
      )}


      {/* Photos du trajet */}
      <Modal visible={photoModalOpen} transparent animationType="slide" onRequestClose={() => setPhotoModalOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setPhotoModalOpen(false)}>
          <Pressable style={[photoModalStyles.card, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]} onStartShouldSetResponder={() => true}>
            <View style={photoModalStyles.header}>
              <Text style={[photoModalStyles.title, { color: colors.foreground }]}>Photos du trajet</Text>
              <Pressable onPress={() => setPhotoModalOpen(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
              {(trip?.photos ?? []).map(photo => (
                <Pressable
                  key={photo.id}
                  style={photoModalStyles.thumbWrap}
                  onPress={() => { setPhotoNoteEditId(photo.id); setPhotoNoteDraft(photo.note ?? ''); }}
                >
                  <RNImage source={{ uri: photo.uri }} style={photoModalStyles.thumb} resizeMode="cover" />
                  {photo.routeIndex == null && (
                    <View style={photoModalStyles.noPosBadge}>
                      <MaterialCommunityIcons name="map-marker-off-outline" size={11} color="#fff" />
                    </View>
                  )}
                  <Text style={[photoModalStyles.thumbDate, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {new Date(photo.takenAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {!!photo.note && (
                    <Text style={[photoModalStyles.thumbNote, { color: colors.foreground }]} numberOfLines={1}>{photo.note}</Text>
                  )}
                  <Pressable
                    onPress={() => handleRemovePhoto(photo.id)}
                    style={photoModalStyles.thumbDelete}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="close-circle" size={20} color="#fff" />
                  </Pressable>
                </Pressable>
              ))}
              <Pressable
                onPress={() => openGalleryPicker()}
                disabled={addingPhotos || galleryLoading}
                style={[photoModalStyles.addBtn, { borderColor: colors.border }]}
              >
                {addingPhotos ? (
                  <ActivityIndicator size="small" color="#FFC107" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="image-plus" size={26} color={colors.mutedForeground} />
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>Ajouter</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
            {(trip?.photos ?? []).length === 0 && (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 8 }}>
                Ajoute des photos de ce trajet depuis ta galerie — elles ne seront pas dupliquées, seulement référencées.
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sélecteur maison : photos de la galerie prises pendant la fenêtre horaire du trajet,
          mises en avant en premier — le picker système d'Android n'a aucune notion du trajet. */}
      <Modal visible={galleryPickerOpen} transparent animationType="slide" onRequestClose={() => setGalleryPickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setGalleryPickerOpen(false)}>
          <Pressable
            style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '80%', paddingBottom: insets.bottom + 16 }}
            onStartShouldSetResponder={() => true}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: 'Inter_700Bold' }}>Photos de ce trajet</Text>
              <Pressable onPress={() => setGalleryPickerOpen(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 12 }}>
              Photos prises pendant ce trajet (± 30 min), triées par heure. Touche pour sélectionner.
            </Text>
            <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {galleryAssets.map(a => {
                const sel = gallerySelected.has(a.id);
                return (
                  <Pressable key={a.id} onPress={() => toggleGallerySelect(a.id)} style={{ width: 96, height: 96, borderRadius: 10, overflow: 'hidden' }}>
                    <RNImage source={{ uri: a.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    <View style={{
                      position: 'absolute', inset: 0, borderWidth: sel ? 3 : 0, borderColor: '#2196F3',
                      backgroundColor: sel ? 'rgba(33,150,243,0.22)' : 'transparent', borderRadius: 10,
                    }} />
                    <View style={{
                      position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10,
                      backgroundColor: sel ? '#2196F3' : 'rgba(0,0,0,0.45)', borderWidth: sel ? 0 : 1.5, borderColor: '#fff',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {sel && <MaterialCommunityIcons name="check" size={13} color="#fff" />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => { setGalleryPickerOpen(false); void handleAddPhotos(); }}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: colors.muted }}
              >
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 13 }}>Parcourir toute la galerie</Text>
              </Pressable>
              <Pressable
                onPress={confirmGallerySelection}
                disabled={gallerySelected.size === 0 || addingPhotos}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: gallerySelected.size === 0 ? colors.muted : '#2196F3' }}
              >
                {addingPhotos ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: gallerySelected.size === 0 ? colors.mutedForeground : '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                    Ajouter{gallerySelected.size > 0 ? ` (${gallerySelected.size})` : ''}
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Date / time pickers */}
      {dtPickerStep === 'date' && <DateTimePicker value={draftStart} mode="date" display="calendar" maximumDate={new Date()} onChange={handleDateChange} />}
      {dtPickerStep === 'startTime' && <DateTimePicker value={draftStart} mode="time" display="clock" is24Hour onChange={handleStartTimeChange} />}
      {dtPickerStep === 'endTime' && <DateTimePicker value={draftEnd} mode="time" display="clock" is24Hour onChange={handleEndTimeChange} />}

      {/* Modal durée story */}
      <Modal visible={storyModalVisible} transparent animationType="fade">
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' }]}
          onPress={() => setStoryModalVisible(false)}
        >
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: 280 }} onStartShouldSetResponder={() => true}>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 8, letterSpacing: 0.5 }}>
              THÈME DE LA CARTE
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {STORY_THEMES.map(th => (
                <Pressable
                  key={th.key}
                  onPress={() => { void Haptics.selectionAsync(); setStoryTheme(th.key); }}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    paddingVertical: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    backgroundColor: storyTheme === th.key ? vehColor + '22' : colors.muted,
                    borderColor: storyTheme === th.key ? vehColor : colors.border,
                  }}
                >
                  <MaterialCommunityIcons name={th.icon} size={13} color={storyTheme === th.key ? vehColor : colors.mutedForeground} />
                  <Text style={{ color: storyTheme === th.key ? vehColor : colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 12 }}>
                    {th.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {storyTheme === 'satellite' && (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 14, fontStyle: 'italic' }}>
                Nécessite une connexion internet. En cas d'échec, repli automatique sur Sombre.
              </Text>
            )}
            <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 14, textAlign: 'center' }}>
              Durée de la story
            </Text>
            {([10, 20, 30, 60] as const).map(s => (
              <Pressable
                key={s}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setStoryModalVisible(false);
                  setStoryDuration(s);
                  handleGenerateStory(s);
                }}
                style={({ pressed }) => [{
                  flexDirection: 'row' as const,
                  alignItems: 'center' as const,
                  justifyContent: 'space-between' as const,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  marginBottom: 4,
                  backgroundColor: storyDuration === s ? vehColor + '22' : colors.muted,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <Text style={{ color: storyDuration === s ? vehColor : colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 15 }}>
                  {s === 60 ? '1 min' : `${s} s`}
                </Text>
                {storyDuration === s && <MaterialCommunityIcons name="check" size={16} color={vehColor} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Note d'une photo */}
      <Modal visible={photoNoteEditId !== null} transparent animationType="fade" onRequestClose={() => setPhotoNoteEditId(null)}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' }]}
          onPress={() => setPhotoNoteEditId(null)}
        >
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: 280 }} onStartShouldSetResponder={() => true}>
            <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: 'Inter_700Bold', marginBottom: 12 }}>
              Note de la photo
            </Text>
            <TextInput
              value={photoNoteDraft}
              onChangeText={setPhotoNoteDraft}
              placeholder="ex. Anna dort comme un bébé"
              placeholderTextColor={colors.mutedForeground}
              style={{ fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, marginBottom: 14 }}
              multiline
              autoFocus
            />
            <Pressable
              onPress={() => {
                if (!photoNoteEditId) return;
                setRepositioningPhotoId(photoNoteEditId);
                setPhotoNoteEditId(null);
                setPhotoModalOpen(false);
                setPhotoSelectMode(true);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}
            >
              <MaterialCommunityIcons name="map-marker-radius-outline" size={15} color="#2196F3" />
              <Text style={{ color: '#2196F3', fontSize: 13, fontFamily: 'Inter_500Medium' }}>Repositionner sur la carte</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => setPhotoNoteEditId(null)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: colors.muted }}
              >
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_500Medium' }}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={handleSavePhotoNote}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#2196F3' }}
              >
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Enregistrer</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <WalkRoutePickerModal visible={pickingRoute} routes={walkRoutes} currentId={trip?.walkRouteId} colors={colors} onClose={() => setPickingRoute(false)} onPick={handlePickWalkRoute} />
      <WalkParticipantPickerModal visible={pickingParticipants} allParticipants={allWalkParticipants} selectedIds={walkParticipantIds} colors={colors} onClose={() => setPickingParticipants(false)} onToggle={handleToggleParticipant} />
      <EditAddressModal
        visible={editingField !== null}
        label={editingLabel}
        initialValue={editingInitial}
        suggestions={sortSuggestionsByUsage(knownPlaces.map(p => p.name), [], addressUsage)}
        knownPlaces={knownPlaces}
        colors={colors}
        onCancel={() => setEditingField(null)}
        onSave={handleSaveAddress}
        onChipUsed={handleChipUsed}
      />

      <WebView ref={storyWebViewRef} source={{ html: storyHtml }} onMessage={handleStoryWebViewMessage} javaScriptEnabled mediaPlaybackRequiresUserAction={false} style={styles.storyWebView} />
    </View>
  );
}

// Rejette les points GPS où la vitesse implicite dépasse 250 km/h (outlier téléportation)
function filterGpsOutliers(pts: LocationPoint[]): LocationPoint[] {
  if (pts.length === 0) return pts;
  const result: LocationPoint[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const prev = result[result.length - 1]!;
    const curr = pts[i]!;
    const dtH = (curr.timestamp - prev.timestamp) / 3_600_000;
    if (dtH <= 0) continue;
    const dKm = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
    if (dKm / dtH < 250) result.push(curr);
  }
  return result;
}

const ALT_GAIN_THRESHOLD_M = 5; // ignorer les fluctuations GPS < 5m (bruit altitude)

/** Convertit une vitesse en km/h → allure formatée "m:ss /km" */
function formatPace(speedKmh: number): string {
  if (speedKmh < 0.1) return '--:--';
  const totalSec = Math.round(3600 / speedKmh);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Formate une durée en ms → "mm:ss" ou "h:mm:ss" pour l'axe X */
function fmtAxisTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function StatItem({ icon, value, color }: { icon: string; value: string; color: string }) {
  return (
    <View style={styles.statItem}>
      <MaterialCommunityIcons name={icon as any} size={16} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function fmtChartDur(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h${String(m % 60).padStart(2, '0')}`;
  return `${m}min`;
}

function TripSpeedChart({
  points,
  color,
  onScrub,
  externalScrubTs,
  isWalk = false,
  speedUnitPace = false,
  onToggleUnit,
}: {
  points: LocationPoint[];
  color: string;
  onScrub: (pt: LocationPoint | null) => void;
  externalScrubTs?: number | null;
  isWalk?: boolean;
  speedUnitPace?: boolean;
  onToggleUnit?: () => void;
}) {
  const colors = useColors();
  const [scrubX, setScrubX] = useState<number | null>(null);

  // En mode balade, l'unité allure n'a de sens que si isWalk est vrai
  const showPace = isWalk && speedUnitPace;

  const chartData = useMemo(() => {
    const pts = filterGpsOutliers(points.filter(p => p.speedKmh != null && (p.speedKmh as number) >= 0));
    if (pts.length < 2) return null;

    let cumDist = 0;
    const t0 = pts[0]!.timestamp;
    const data: Array<{ km: number; ms: number; spd: number; lat: number; lng: number; ts: number }> = [];
    data.push({ km: 0, ms: 0, spd: pts[0]!.speedKmh ?? 0, lat: pts[0]!.lat, lng: pts[0]!.lng, ts: pts[0]!.timestamp });
    for (let i = 1; i < pts.length; i++) {
      cumDist += haversineKm(pts[i - 1]!.lat, pts[i - 1]!.lng, pts[i]!.lat, pts[i]!.lng);
      data.push({
        km: cumDist,
        ms: pts[i]!.timestamp - t0,
        spd: pts[i]!.speedKmh ?? 0,
        lat: pts[i]!.lat, lng: pts[i]!.lng,
        ts: pts[i]!.timestamp,
      });
    }

    const rawMaxSpd = Math.max(...data.map(d => d.spd), 0.1);
    const spdScale = Math.ceil(rawMaxSpd / 10) * 10; // pour l'axe Y seulement
    const totalKm = Math.max(cumDist, 0.001);
    const totalMs = Math.max(pts[pts.length - 1]!.timestamp - t0, 1);
    const durationMs = totalMs;

    // Moyenne vitesse sur les points en mouvement (> 0.5 km/h) — plus représentatif pour balades
    const movingPts = data.filter(d => d.spd > 0.5);
    const avgSpdMoving = movingPts.length > 0
      ? movingPts.reduce((s, d) => s + d.spd, 0) / movingPts.length
      : data.reduce((s, d) => s + d.spd, 0) / data.length;

    // Allure : min/km — meilleure allure = vitesse la plus haute
    const minPace = rawMaxSpd > 0.5 ? 60 / rawMaxSpd : 0;
    const maxPaceVal = movingPts.length > 0 ? Math.max(...movingPts.map(d => 60 / d.spd)) : 30;
    const avgPace = avgSpdMoving > 0.5 ? 60 / avgSpdMoving : 0;

    return { data, spdScale, rawMaxSpd, avgSpdMoving, totalKm, totalMs, durationMs, minPace, maxPaceVal, avgPace };
  }, [points]);

  const findNearest = useCallback((x: number, cData: typeof chartData, timeAxis: boolean) => {
    if (!cData) return null;
    const { data, totalKm, totalMs } = cData;
    const W = Dimensions.get('window').width - 32;
    const PL = 30; const PR = 8; const cW = W - PL - PR;
    const frac = Math.max(0, Math.min(1, (x - PL) / cW));
    if (timeAxis) {
      const targetMs = frac * totalMs;
      let best = data[0]!;
      let bestD = Math.abs(best.ms - targetMs);
      for (const d of data) {
        const dd = Math.abs(d.ms - targetMs);
        if (dd < bestD) { best = d; bestD = dd; }
      }
      return best;
    } else {
      const targetKm = frac * totalKm;
      let best = data[0]!;
      let bestD = Math.abs(best.km - targetKm);
      for (const d of data) {
        const dd = Math.abs(d.km - targetKm);
        if (dd < bestD) { best = d; bestD = dd; }
      }
      return best;
    }
  }, []);

  if (!chartData) return null;
  const { data, spdScale, rawMaxSpd, avgSpdMoving, totalKm, totalMs, durationMs, minPace, maxPaceVal, avgPace } = chartData;

  // L'axe X est en temps pour les balades, en distance sinon
  const timeAxis = isWalk;

  const W = Dimensions.get('window').width - 32;
  const H = 84;
  const PL = 30; const PR = 8; const PT = 8; const PB = 16;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  // Position X selon l'axe choisi
  const xOf = (d: { km: number; ms: number }) =>
    PL + (timeAxis ? d.ms / totalMs : d.km / totalKm) * cW;

  // Position Y selon le mode d'unité
  const yOfSpd = (spd: number) => PT + (1 - spd / spdScale) * cH;
  const paceSpan = Math.max(maxPaceVal - minPace, 1);
  const yOfPace = (pace: number) => PT + (pace - minPace) / paceSpan * cH;

  // Construction du chemin SVG
  let linePath = '';
  let areaPath = '';
  if (showPace) {
    // Mode allure : on crée des segments avec gaps aux pauses (vitesse < 0.5)
    let inSeg = false;
    let segPts: string[] = [];
    const flushSeg = () => {
      if (segPts.length < 2) { segPts = []; inSeg = false; return; }
      const first = segPts[0]!;
      const last = segPts[segPts.length - 1]!;
      linePath += (linePath ? ' ' : '') + `M ${first} ` + segPts.slice(1).map(p => `L ${p}`).join(' ');
      // Aire sous la courbe pour ce segment
      areaPath += (areaPath ? ' ' : '') + `M ${first} ` + segPts.slice(1).map(p => `L ${p}`).join(' ') +
        ` L ${last.split(',')[0]},${(PT + cH).toFixed(1)} L ${first.split(',')[0]},${(PT + cH).toFixed(1)} Z`;
      segPts = [];
      inSeg = false;
    };
    for (const d of data) {
      if (d.spd < 0.5) { flushSeg(); continue; }
      const pace = 60 / d.spd;
      const x = xOf(d).toFixed(1);
      const y = yOfPace(pace).toFixed(1);
      segPts.push(`${x},${y}`);
      inSeg = true;
    }
    if (inSeg) flushSeg();
  } else {
    // Mode vitesse : chemin continu
    const pts2 = data.map(d => `${xOf(d).toFixed(1)},${yOfSpd(d.spd).toFixed(1)}`);
    linePath = `M ${pts2.join(' L ')}`;
    const xEnd = xOf(data[data.length - 1]!).toFixed(1);
    const xStart = xOf(data[0]!).toFixed(1);
    areaPath = `${linePath} L ${xEnd},${(PT + cH).toFixed(1)} L ${xStart},${(PT + cH).toFixed(1)} Z`;
  }

  const scrubPt = scrubX !== null ? findNearest(scrubX, chartData, timeAxis) : null;
  const externalScrubPt = externalScrubTs != null && scrubX === null
    ? (() => {
        let best = data[0]!;
        let bestD = Math.abs(best.ts - externalScrubTs);
        for (const d of data) {
          const dd = Math.abs(d.ts - externalScrubTs);
          if (dd < bestD) { best = d; bestD = dd; }
        }
        return best;
      })()
    : null;
  const activeScrubPt = scrubPt ?? externalScrubPt;
  const activeScrubX2 = activeScrubPt ? xOf(activeScrubPt) : 0;
  const activeScrubY2 = activeScrubPt
    ? (showPace && activeScrubPt.spd >= 0.5 ? yOfPace(60 / activeScrubPt.spd) : yOfSpd(activeScrubPt.spd))
    : 0;

  // Ligne de moyenne
  const avgY = showPace ? (avgPace > 0 ? yOfPace(avgPace) : -1) : yOfSpd(avgSpdMoving);

  // Valeurs de l'axe Y pour les étiquettes
  const yTopLabel = showPace ? formatPace(rawMaxSpd) : String(spdScale);
  const yUnit = showPace ? '/km' : 'km/h';

  // Étiquette axe X
  const xEndLabel = timeAxis ? fmtAxisTime(totalMs) : `${totalKm.toFixed(1)} km`;

  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 6, paddingBottom: 4 }}>
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={e => {
          const x = e.nativeEvent.locationX;
          setScrubX(x);
          const nearest = findNearest(x, chartData, timeAxis);
          onScrub(nearest ? (points.find(p => p.timestamp === nearest.ts) ?? null) : null);
        }}
        onResponderMove={e => {
          const x = e.nativeEvent.locationX;
          setScrubX(x);
          const nearest = findNearest(x, chartData, timeAxis);
          onScrub(nearest ? (points.find(p => p.timestamp === nearest.ts) ?? null) : null);
        }}
        onResponderRelease={() => { setScrubX(null); onScrub(null); }}
        onResponderTerminate={() => { setScrubX(null); onScrub(null); }}
      >
        <Svg width={W} height={H}>
          <Defs>
            <LinearGradient id="spd_grad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.45" />
              <Stop offset="1" stopColor={color} stopOpacity="0.04" />
            </LinearGradient>
          </Defs>
          {!!areaPath && <Path d={areaPath} fill="url(#spd_grad)" />}
          {!!linePath && <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />}
          {avgY > 0 && <SvgLine x1={PL} y1={avgY} x2={W - PR} y2={avgY} stroke="#FFFFFF55" strokeWidth={1} strokeDasharray="3 4" />}
          {activeScrubPt !== null && (
            <>
              <SvgLine x1={activeScrubX2} y1={PT} x2={activeScrubX2} y2={PT + cH} stroke="#FFFFFFCC" strokeWidth={1.5} />
              <Circle cx={activeScrubX2} cy={activeScrubY2} r={5} fill="#FFFFFF" stroke={color} strokeWidth={2} />
            </>
          )}
          <SvgText x={PL - 3} y={PT + 5} textAnchor="end" fontSize={8} fill="#666">{yTopLabel}</SvgText>
          <SvgText x={PL - 3} y={PT + cH + 1} textAnchor="end" fontSize={8} fill="#666">{showPace ? formatPace(0.5) : '0'}</SvgText>
          <SvgText x={PL - 3} y={PT + cH / 2 + 3} textAnchor="end" fontSize={7} fill="#444">{yUnit}</SvgText>
          <SvgText x={PL + 1} y={H - 2} textAnchor="start" fontSize={8} fill="#666">0</SvgText>
          <SvgText x={W - PR} y={H - 2} textAnchor="end" fontSize={8} fill="#666">{xEndLabel}</SvgText>
        </Svg>
      </View>
      {activeScrubPt ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 2, paddingTop: 2 }}>
          <Text style={{ color, fontFamily: 'Inter_700Bold', fontSize: 18, lineHeight: 22 }}>
            {showPace
              ? (activeScrubPt.spd >= 0.5 ? `${formatPace(activeScrubPt.spd)} /km` : '—')
              : `${activeScrubPt.spd.toFixed(1)} km/h`}
          </Text>
          <Text style={{ color: '#555', fontSize: 12 }}>·</Text>
          <Text style={{ color: '#888', fontFamily: 'Inter_400Regular', fontSize: 12 }}>
            {timeAxis ? fmtAxisTime(activeScrubPt.ms) : `${activeScrubPt.km.toFixed(2)} km`}
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={isWalk ? onToggleUnit : undefined}
          style={{ flexDirection: 'row', gap: 20, paddingHorizontal: 2, paddingTop: 2 }}
        >
          <View>
            <Text style={{ color: '#555', fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 }}>MOY</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>
              {showPace ? `${formatPace(avgSpdMoving)} /km` : `${avgSpdMoving.toFixed(1)} km/h`}
            </Text>
          </View>
          <View>
            <Text style={{ color: '#555', fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {showPace ? 'MEILLEURE' : 'MAX'}
            </Text>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>
              {showPace ? `${formatPace(rawMaxSpd)} /km` : `${rawMaxSpd.toFixed(1)} km/h`}
            </Text>
          </View>
          <View>
            <Text style={{ color: '#555', fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 }}>DURÉE</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{fmtChartDur(durationMs)}</Text>
          </View>
          {isWalk && (
            <View style={{ marginLeft: 'auto', justifyContent: 'center' }}>
              <Text style={{ color: '#555', fontSize: 10, fontFamily: 'Inter_400Regular', borderWidth: 1, borderColor: '#FFFFFF33', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                {showPace ? 'km/h' : 'min/km'}
              </Text>
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
}

function TripAltitudeChart({
  points,
  color,
  onScrub,
  externalScrubTs,
}: {
  points: LocationPoint[];
  color: string;
  onScrub: (pt: LocationPoint | null) => void;
  externalScrubTs?: number | null;
}) {
  const colors = useColors();
  const [scrubX, setScrubX] = useState<number | null>(null);

  const chartData = useMemo(() => {
    const pts = filterGpsOutliers(points.filter(p => p.altitudeM != null));
    if (pts.length < 2) return null;
    let cumDist = 0;
    const data: Array<{ km: number; alt: number; lat: number; lng: number; ts: number }> = [];
    data.push({ km: 0, alt: pts[0]!.altitudeM!, lat: pts[0]!.lat, lng: pts[0]!.lng, ts: pts[0]!.timestamp });
    for (let i = 1; i < pts.length; i++) {
      cumDist += haversineKm(pts[i - 1]!.lat, pts[i - 1]!.lng, pts[i]!.lat, pts[i]!.lng);
      data.push({ km: cumDist, alt: pts[i]!.altitudeM!, lat: pts[i]!.lat, lng: pts[i]!.lng, ts: pts[i]!.timestamp });
    }
    const alts = data.map(d => d.alt);
    const minAlt = Math.min(...alts);
    const maxAlt = Math.max(...alts);
    const totalKm = Math.max(cumDist, 0.001);
    let gainM = 0;
    for (let i = 1; i < data.length; i++) {
      const delta = data[i]!.alt - data[i - 1]!.alt;
      if (delta >= ALT_GAIN_THRESHOLD_M) gainM += delta;
    }
    return { data, minAlt, maxAlt, totalKm, gainM: Math.round(gainM) };
  }, [points]);

  const findNearest = useCallback((x: number, cData: typeof chartData) => {
    if (!cData) return null;
    const { data, totalKm } = cData;
    const W = Dimensions.get('window').width - 32;
    const PL = 34; const PR = 8; const cW = W - PL - PR;
    const frac = Math.max(0, Math.min(1, (x - PL) / cW));
    const targetKm = frac * totalKm;
    let best = data[0]!;
    let bestD = Math.abs(best.km - targetKm);
    for (const d of data) {
      const dd = Math.abs(d.km - targetKm);
      if (dd < bestD) { best = d; bestD = dd; }
    }
    return best;
  }, []);

  if (!chartData) return null;
  const { data, minAlt, maxAlt, totalKm, gainM } = chartData;

  const W = Dimensions.get('window').width - 32;
  const H = 84;
  const PL = 34; const PR = 8; const PT = 8; const PB = 16;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  const span = Math.max(maxAlt - minAlt, 1);
  const mx = (km: number) => PL + (km / totalKm) * cW;
  const my = (alt: number) => PT + (1 - (alt - minAlt) / span) * cH;

  const pts2 = data.map(d => `${mx(d.km).toFixed(1)},${my(d.alt).toFixed(1)}`);
  const linePath = `M ${pts2.join(' L ')}`;
  const areaPath = `${linePath} L ${mx(totalKm).toFixed(1)},${(PT + cH).toFixed(1)} L ${PL},${(PT + cH).toFixed(1)} Z`;

  const scrubPt = scrubX !== null ? findNearest(scrubX, chartData) : null;
  const externalScrubPt = externalScrubTs != null && scrubX === null
    ? (() => {
        let best = data[0]!;
        let bestD = Math.abs(best.ts - externalScrubTs);
        for (const d of data) {
          const dd = Math.abs(d.ts - externalScrubTs);
          if (dd < bestD) { best = d; bestD = dd; }
        }
        return best;
      })()
    : null;
  const activeScrubPt = scrubPt ?? externalScrubPt;

  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 6, paddingBottom: 4 }}>
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={e => {
          const x = e.nativeEvent.locationX;
          setScrubX(x);
          const nearest = findNearest(x, chartData);
          onScrub(nearest ? (points.find(p => p.timestamp === nearest.ts) ?? null) : null);
        }}
        onResponderMove={e => {
          const x = e.nativeEvent.locationX;
          setScrubX(x);
          const nearest = findNearest(x, chartData);
          onScrub(nearest ? (points.find(p => p.timestamp === nearest.ts) ?? null) : null);
        }}
        onResponderRelease={() => { setScrubX(null); onScrub(null); }}
        onResponderTerminate={() => { setScrubX(null); onScrub(null); }}
      >
        <Svg width={W} height={H}>
          <Defs>
            <LinearGradient id="alt_grad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#9E9E9E" stopOpacity="0.5" />
              <Stop offset="1" stopColor="#9E9E9E" stopOpacity="0.06" />
            </LinearGradient>
          </Defs>
          <Path d={areaPath} fill="url(#alt_grad)" />
          <Path d={linePath} stroke="#AAAAAA" strokeWidth={2} fill="none" strokeLinejoin="round" />
          {activeScrubPt !== null && (
            <>
              <SvgLine x1={mx(activeScrubPt.km)} y1={PT} x2={mx(activeScrubPt.km)} y2={PT + cH} stroke="#FFFFFFCC" strokeWidth={1.5} />
              <Circle cx={mx(activeScrubPt.km)} cy={my(activeScrubPt.alt)} r={5} fill="#FFFFFF" stroke="#AAAAAA" strokeWidth={2} />
            </>
          )}
          <SvgText x={PL - 3} y={PT + 5} textAnchor="end" fontSize={8} fill="#666">{maxAlt} m</SvgText>
          <SvgText x={PL - 3} y={PT + cH + 1} textAnchor="end" fontSize={8} fill="#666">{minAlt} m</SvgText>
          <SvgText x={PL + 1} y={H - 2} textAnchor="start" fontSize={8} fill="#666">0</SvgText>
          <SvgText x={W - PR} y={H - 2} textAnchor="end" fontSize={8} fill="#666">{totalKm.toFixed(1)} km</SvgText>
        </Svg>
      </View>
      {activeScrubPt ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 2, paddingTop: 2 }}>
          <Text style={{ color: '#AAAAAA', fontFamily: 'Inter_700Bold', fontSize: 18, lineHeight: 22 }}>
            {activeScrubPt.alt} m
          </Text>
          <Text style={{ color: '#555', fontSize: 12 }}>·</Text>
          <Text style={{ color: '#888', fontFamily: 'Inter_400Regular', fontSize: 12 }}>
            {activeScrubPt.km.toFixed(2)} km
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 20, paddingHorizontal: 2, paddingTop: 2 }}>
          <View>
            <Text style={{ color: '#555', fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 }}>MIN</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{minAlt} m</Text>
          </View>
          <View>
            <Text style={{ color: '#555', fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 }}>MAX</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{maxAlt} m</Text>
          </View>
          <View>
            <Text style={{ color: '#555', fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 }}>DÉNIVELÉ +</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>+{gainM} m</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function AddressBadge({
  address,
  placeId,
  dotColor,
  categories,
  places,
  colors,
  hideEdit,
  onPress,
}: {
  address?: string;
  placeId?: string;
  dotColor: string;
  categories: PlaceCategory[];
  places: Array<{ id: string; name: string; categoryId?: string }>;
  colors: ReturnType<typeof useColors>;
  hideEdit?: boolean;
  onPress: () => void;
}) {
  const place = placeId ? places.find(p => p.id === placeId) : null;
  const cat   = place?.categoryId ? categories.find(c => c.id === place.categoryId) : null;
  const icon  = (cat?.icon ?? (placeId ? 'map-marker' : 'map-marker-outline')) as string;
  const iconColor = cat?.color ?? dotColor;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.addrBadge, pressed && { opacity: 0.6 }]}
      hitSlop={6}
    >
      <MaterialCommunityIcons name={icon as any} size={14} color={iconColor} />
      <Text style={[styles.addrBadgeText, { color: colors.foreground }]} numberOfLines={1}>
        {address ?? '—'}
      </Text>
      {!hideEdit && <MaterialCommunityIcons name="pencil-outline" size={11} color={colors.mutedForeground} />}
    </Pressable>
  );
}

const photoModalStyles = StyleSheet.create({
  card: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  thumbWrap: {
    width: 92,
  },
  thumb: {
    width: 92,
    height: 92,
    borderRadius: 10,
    backgroundColor: '#00000010',
  },
  thumbDate: {
    fontSize: 10,
    marginTop: 3,
    textAlign: 'center',
  },
  thumbDelete: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
  },
  noPosBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    padding: 2,
  },
  thumbNote: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    marginTop: 1,
  },
  addBtn: {
    width: 92,
    height: 92,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnLabelled: {
    width: 'auto',
    borderRadius: 20,
    flexDirection: 'row',
    paddingRight: 14,
  },
  backBtnLabel: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  noRoute: { color: '#555', fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  card: {
    flex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 6,
  },
  dtRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateText: { fontSize: 17, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize' },
  timeText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 },
  participantChip: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  participantChipText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statValue: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  addrBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 6,
    marginBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addrBannerCol: {
    flexDirection: 'column',
    gap: 8,
    paddingBottom: 12,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  walkTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walkParticipantsLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginLeft: 2,
  },
  addrBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  addrBadgeText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
  walkRouteChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#4CAF5018', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  walkRouteChipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  walkRoutePressable: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendActionBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  vehicleChipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  tripStoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  tripStoryTxt: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  storyProgressRow: {
    paddingTop: 6,
    paddingBottom: 2,
    gap: 4,
  },
  storyProgressLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
  },
  storyProgressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#2A2A2A',
    overflow: 'hidden',
  },
  storyProgressFill: {
    height: 3,
    borderRadius: 2,
  },
  storyWebView: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 5,
    paddingBottom: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  bottomBarLeft: { flexDirection: 'row', gap: 6, flex: 1, alignItems: 'center' },
  bottomBarRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  speedChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#1E1E1E',
    minWidth: 34,
    alignItems: 'center',
  },
  speedChipActive: {
    backgroundColor: '#2196F320',
    borderWidth: 1,
    borderColor: '#2196F360',
  },
  speedChipText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: '#555' },
  speedChipTextActive: { color: '#2196F3' },
  screenshotBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
  },
  storyBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  storyBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
});
