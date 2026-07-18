import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';

import { TripMapView } from '@/components/TripMapView';
import { useColors } from '@/hooks/useColors';
import type { KnownPlace, PlaceCategory, WalkRoute } from '@/types/places';
import type { RoutePoint, Trip, Vehicle, WalkParticipant } from '@/types/trips';
import { simplifyRoute } from '@/utils/routeSimplification';
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
import { loadMultiDayPoints } from '@/utils/locationTracking';
import { buildStoryHtml } from '@/utils/storyGenerator';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}`;
}

// ── Edit-address modal ─────────────────────────────────────────────────────────

const DEFAULT_SUGGESTIONS = ['Maison', 'Travail', 'Chez les parents', 'Gym', 'École'];

function EditAddressModal({
  visible,
  label,
  initialValue,
  suggestions,
  colors,
  onCancel,
  onSave,
  onChipUsed,
}: {
  visible: boolean;
  label: string;
  initialValue: string;
  suggestions: string[];
  colors: ReturnType<typeof useColors>;
  onCancel: () => void;
  onSave: (value: string) => void;
  onChipUsed: (name: string) => void;
}) {
  const [text, setText] = useState(initialValue);
  const inputRef = useRef<TextInput>(null);

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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={editStyles.overlay} onPress={onCancel}>
        <Pressable style={[editStyles.sheet, { backgroundColor: colors.card }]}>
          <Text style={[editStyles.title, { color: colors.foreground }]}>
            Modifier le lieu
          </Text>
          <Text style={[editStyles.sublabel, { color: colors.mutedForeground }]}>
            {label}
          </Text>
          {suggestions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={editStyles.chipsRow}
              keyboardShouldPersistTaps="handled"
            >
              {suggestions.map(s => (
                <Pressable
                  key={s}
                  onPress={() => { setText(s); onChipUsed(s); }}
                  style={[
                    editStyles.chip,
                    {
                      backgroundColor: text === s ? colors.primary : colors.muted,
                      borderColor: text === s ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      editStyles.chipText,
                      { color: text === s ? '#000' : colors.mutedForeground },
                    ]}
                  >
                    {s}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="Ex : Bureau, Chez les parents…"
            placeholderTextColor={colors.mutedForeground}
            style={[editStyles.input, {
              color: colors.foreground,
              borderColor: colors.border,
              backgroundColor: colors.background,
            }]}
            returnKeyType="done"
            onSubmitEditing={handleSave}
            autoCorrect={false}
          />
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
      </Pressable>
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
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  chipsRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
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
  const insets = useSafeAreaInsets();
  const humans = allParticipants.filter(p => p.type === 'human');
  const dogs   = allParticipants.filter(p => p.type === 'dog');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={editStyles.overlay} onPress={onClose}>
        <Pressable style={[routePickerStyles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
          <Text style={[routePickerStyles.title, { color: colors.foreground }]}>Participants</Text>
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
        </Pressable>
      </Pressable>
    </Modal>
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
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={editStyles.overlay} onPress={onClose}>
        <Pressable
          style={[routePickerStyles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}
        >
          <Text style={[routePickerStyles.title, { color: colors.foreground }]}>Parcours</Text>
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
        </Pressable>
      </Pressable>
    </Modal>
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

  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [storyProgress, setStoryProgress]         = useState(0);
  const storyChunksRef = useRef<{ mime: string; chunks: string[]; total: number }>({ mime: 'video/mp4', chunks: [], total: 0 });
  const storyWebViewRef = useRef<WebView>(null);
  const storyHtml = useRef(buildStoryHtml()).current;

  const handleStoryWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(event.nativeEvent.data) as Record<string, unknown>; } catch { return; }
    if (msg.type === 'story_progress') {
      setStoryProgress(msg.p as number ?? 0);
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

  const handleGenerateStory = useCallback(() => {
    if (!trip || isGeneratingStory) return;
    setIsGeneratingStory(true);
    setStoryProgress(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void (async () => {
      try {
        const gpsPoints = await loadMultiDayPoints(trip.startTime, trip.endTime);
        const tripPoints = gpsPoints.filter(p => p.timestamp >= trip.startTime && p.timestamp <= trip.endTime);

        const storedRoute = trip.route ?? [];
        const route: Array<{ lat: number; lng: number }> =
          storedRoute.length >= 2
            ? storedRoute
            : tripPoints.length >= 2
              ? tripPoints
                  .filter((_, i) => i % Math.max(1, Math.floor(tripPoints.length / 150)) === 0 || i === tripPoints.length - 1)
                  .map(p => ({ lat: p.lat, lng: p.lng }))
              : [];

        if (route.length < 2) {
          setIsGeneratingStory(false);
          Alert.alert('Story', 'Tracé GPS insuffisant pour générer une story.');
          return;
        }

        const step = Math.max(1, Math.floor(tripPoints.length / 100));
        const sampled = tripPoints.filter((_, i) => i % step === 0 || i === tripPoints.length - 1);

        let rawCumDist = 0;
        const rawChartPts: Array<{ km: number; spd: number; alt: number | null }> = [];
        for (let i = 0; i < sampled.length; i++) {
          if (i > 0) rawCumDist += haversineKm(sampled[i - 1]!.lat, sampled[i - 1]!.lng, sampled[i]!.lat, sampled[i]!.lng);
          rawChartPts.push({ km: rawCumDist, spd: sampled[i]!.speedKmh ?? 0, alt: sampled[i]!.altitudeM ?? null });
        }
        const distScale = rawCumDist > 0 ? trip.distanceKm / rawCumDist : 1;
        const chartPts = rawChartPts.map(p => ({ ...p, km: parseFloat((p.km * distScale).toFixed(3)) }));

        const speeds = tripPoints.map(p => p.speedKmh ?? 0);
        const maxSpeed = Math.max(...speeds, 1);
        const alts = tripPoints.map(p => p.altitudeM).filter((a): a is number => a != null);
        const minAlt = alts.length > 0 ? Math.min(...alts) : 0;
        const maxAlt = alts.length > 0 ? Math.max(...alts) : 0;
        let gainM = 0;
        for (let i = 1; i < tripPoints.length; i++) {
          const a = tripPoints[i]!.altitudeM, b = tripPoints[i - 1]!.altitudeM;
          if (a != null && b != null && a > b) gainM += a - b;
        }

        const durationMs = trip.endTime - trip.startTime;
        const durationLabel = `${Math.round(durationMs / 60000)} min`;
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

        const opts = {
          color: vehicleColor,
          vehicleEmoji,
          dateLabel,
          timeLabel,
          distKm: parseFloat(trip.distanceKm.toFixed(1)),
          durationLabel,
          maxSpeed,
          gainM: Math.round(gainM),
          minAlt,
          maxAlt,
          hasAlt: alts.length > 0,
          points: chartPts,
          route,
        };

        storyWebViewRef.current?.injectJavaScript(`(function(){window.generateStory(${JSON.stringify(opts)});})();true;`);
      } catch {
        setIsGeneratingStory(false);
        Alert.alert('Erreur', 'Impossible de générer la story.');
      }
    })();
  }, [trip, vehicles, isGeneratingStory]);

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
  }, []);

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

  const MAP_H = SCREEN_H * 0.62;
  const MAP_W = SCREEN_W;

  const editingLabel = editingField === 'start' ? 'Lieu de départ' : "Lieu d'arrivée";
  const editingInitial = editingField === 'start'
    ? (trip?.startAddress ?? '')
    : (trip?.endAddress ?? '');

  const hasAnyAddress = !!(trip?.startAddress || trip?.endAddress);

  const isWalkTrip = !!trip && vehicles.some(v => v.id === trip.vehicle && v.type === 'walk');
  const walkRouteName = isWalkTrip && trip?.walkRouteId
    ? walkRoutes.find(r => r.id === trip.walkRouteId)?.name
    : undefined;

  const walkVehicle = isWalkTrip ? vehicles.find(v => v.id === trip!.vehicle) : null;
  const allWalkParticipants: WalkParticipant[] = walkVehicle?.walkParticipants ?? [];
  const humanParticipants = allWalkParticipants.filter(p => p.type === 'human');
  const dogParticipants   = allWalkParticipants.filter(p => p.type === 'dog');

  return (
    <View style={[styles.root, { backgroundColor: '#121212' }]}>
      {/* Back button */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.backBtn, backLabel ? styles.backBtnLabelled : undefined, { top: insets.top + 10 }]}
      >
        <MaterialCommunityIcons name="chevron-left" size={26} color="#fff" />
        {backLabel ? (
          <Text style={styles.backBtnLabel}>{backLabel}</Text>
        ) : null}
      </Pressable>

      {/* Map area */}
      <View style={{ width: MAP_W, height: MAP_H, overflow: 'hidden' }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#FFC107" />
          </View>
        ) : (() => {
          const displayRoute = trip?.route && trip.route.length >= 2 ? trip.route : osrmRoute;
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
            />
          );
        })()}
      </View>

      {/* Info card */}
      {trip && (
        <View style={[styles.card, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          {/* Address banner / walk route chip */}
          {isWalkTrip ? (
            <View style={[styles.addrBannerCol, { borderBottomColor: colors.border }]}>
              {/* Row 1: parcours chip + participants button */}
              <View style={styles.walkTopRow}>
                {/* Parcours */}
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPickingRoute(true); }}
                  style={({ pressed }) => [styles.walkRoutePressable, { opacity: pressed ? 0.65 : 1, flex: 1 }]}
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
                  <MaterialCommunityIcons name="pencil-outline" size={13} color={colors.mutedForeground} />
                </Pressable>

                {/* Participants button */}
                {allWalkParticipants.length > 0 && (
                  <Pressable
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPickingParticipants(true); }}
                    style={[styles.walkRouteChip, {
                      backgroundColor: walkParticipantIds.length > 0 ? '#2196F318' : colors.muted,
                      borderWidth: 1,
                      borderColor: walkParticipantIds.length > 0 ? '#2196F360' : colors.border,
                    }]}
                  >
                    <MaterialCommunityIcons
                      name="account-group-outline"
                      size={14}
                      color={walkParticipantIds.length > 0 ? '#2196F3' : colors.mutedForeground}
                    />
                    <Text style={[styles.walkRouteChipText, { color: walkParticipantIds.length > 0 ? '#2196F3' : colors.mutedForeground }]}>
                      Participants
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Row 2: selected participant names */}
              {walkParticipantIds.length > 0 && (
                <Text style={[styles.walkParticipantsLabel, { color: colors.mutedForeground }]}>
                  {walkParticipantIds
                    .map(pid => allWalkParticipants.find(p => p.id === pid)?.name)
                    .filter((n): n is string => !!n)
                    .join(' · ')}
                </Text>
              )}
            </View>
          ) : (
            <View style={[styles.addrBanner, { borderBottomColor: colors.border }]}>
              <AddressBadge
                address={trip.startAddress}
                placeId={trip.startPlaceId}
                dotColor="#4CAF50"
                categories={placeCategories}
                places={knownPlaces}
                colors={colors}
                onPress={() => setEditingField('start')}
              />
              <MaterialCommunityIcons name="arrow-right" size={13} color={colors.mutedForeground} />
              <AddressBadge
                address={trip.endAddress}
                placeId={trip.endPlaceId}
                dotColor="#FFC107"
                categories={placeCategories}
                places={knownPlaces}
                colors={colors}
                onPress={() => setEditingField('end')}
              />
            </View>
          )}

          <View style={styles.dtRow}>
            <Pressable
              onPress={handleOpenDtPicker}
              style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.65 : 1 }]}
              hitSlop={6}
            >
              <Text style={[styles.dateText, { color: colors.foreground }]}>
                {fmtDayLong(trip.startTime)}
              </Text>
              <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
                {fmtHHMM(trip.startTime)} → {fmtHHMM(trip.endTime)}
              </Text>
            </Pressable>
            {(() => {
              const veh = vehicles.find(v => v.id === trip.vehicle);
              const vColor = veh?.type === 'walk' ? '#4CAF50'
                : veh?.type === 'moto' || trip.vehicle === 'moto' ? '#FF9800'
                : '#2196F3';
              return (
                <Pressable
                  onPress={handleGenerateStory}
                  disabled={isGeneratingStory}
                  style={[styles.tripStoryBtn, { borderColor: vColor, opacity: isGeneratingStory ? 0.5 : 1 }]}
                >
                  <MaterialCommunityIcons name="instagram" size={13} color={vColor} />
                  <Text style={[styles.tripStoryTxt, { color: vColor }]}>Story</Text>
                </Pressable>
              );
            })()}
            <Pressable onPress={handleOpenDtPicker} hitSlop={6}>
              <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.mutedForeground} />
            </Pressable>
          </View>
          {isGeneratingStory && (() => {
            const veh = vehicles.find(v => v.id === trip.vehicle);
            const vColor = veh?.type === 'walk' ? '#4CAF50'
              : veh?.type === 'moto' || trip.vehicle === 'moto' ? '#FF9800'
              : '#2196F3';
            return (
              <View style={styles.storyProgressRow}>
                <Text style={styles.storyProgressLabel}>Génération… {storyProgress}%</Text>
                <View style={styles.storyProgressTrack}>
                  <View style={[styles.storyProgressFill, { width: `${storyProgress}%` as `${number}%`, backgroundColor: vColor }]} />
                </View>
              </View>
            );
          })()}

          <View style={styles.statsRow}>
            <StatItem
              icon="map-marker-distance"
              value={`${trip.distanceKm.toFixed(1)} km`}
              color="#FFC107"
            />
            <StatItem
              icon="clock-outline"
              value={fmtDuration(trip.endTime - trip.startTime)}
              color={colors.mutedForeground}
            />
            <StatItem
              icon={
                trip.source === 'manual'
                  ? 'pencil-outline'
                  : trip.routeSource === 'osrm'
                    ? 'road-variant'
                    : 'navigation-variant-outline'
              }
              value={
                trip.source === 'manual'
                  ? 'Trajet manuel'
                  : trip.routeSource === 'osrm'
                    ? 'Tracé routier'
                    : `${trip.pointCount} pts GPS`
              }
              color={
                trip.routeSource === 'osrm' ? '#4CAF50' : colors.mutedForeground
              }
            />
            {trip.vehicle && trip.vehicle !== 'ignored' && (() => {
              const veh = vehicles.find(v => v.id === trip.vehicle);
              const name = veh?.name ?? (trip.vehicle === 'moto' ? 'Moto' : 'Voiture');
              const color = veh?.type === 'walk' ? '#4CAF50'
                : veh?.type === 'moto' || trip.vehicle === 'moto' ? '#FF9800'
                : '#2196F3';
              const icon = veh?.type === 'walk' ? 'walk'
                : veh?.type === 'moto' || trip.vehicle === 'moto' ? 'motorbike'
                : 'car';
              return (
                <View style={[styles.vehicleChip, { backgroundColor: color + '18', borderColor: color + '60' }]}>
                  <MaterialCommunityIcons name={icon as any} size={14} color={color} />
                  <Text style={[styles.vehicleChipText, { color }]}>{name}</Text>
                </View>
              );
            })()}
          </View>

          {!!participantName && (
            <View style={styles.participantChip}>
              <MaterialCommunityIcons name="account-outline" size={13} color="#4CAF50" />
              <Text style={[styles.participantChipText, { color: colors.mutedForeground }]}>Avec {participantName}</Text>
            </View>
          )}

          {(trip.route || osrmRoute) && (
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Départ</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: trip.source === 'manual' ? '#2196F3' : '#FFC107' }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Arrivée</Text>
              </View>
              <Text style={[styles.legendText, { color: trip.routeSource === 'osrm' ? '#4CAF50' : colors.mutedForeground }]}>
                {trip.source === 'manual'
                  ? 'Itinéraire estimé (OSRM)'
                  : trip.routeSource === 'osrm'
                    ? `Tracé routier OSRM · ${trip.route?.length ?? 0} pts`
                    : `${trip.route?.length ?? 0} pts (tracé GPS simplifié)`}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Date / time pickers */}
      {dtPickerStep === 'date' && (
        <DateTimePicker
          value={draftStart}
          mode="date"
          display="calendar"
          maximumDate={new Date()}
          onChange={handleDateChange}
        />
      )}
      {dtPickerStep === 'startTime' && (
        <DateTimePicker
          value={draftStart}
          mode="time"
          display="clock"
          is24Hour
          onChange={handleStartTimeChange}
        />
      )}
      {dtPickerStep === 'endTime' && (
        <DateTimePicker
          value={draftEnd}
          mode="time"
          display="clock"
          is24Hour
          onChange={handleEndTimeChange}
        />
      )}

      {/* Walk route picker */}
      <WalkRoutePickerModal
        visible={pickingRoute}
        routes={walkRoutes}
        currentId={trip?.walkRouteId}
        colors={colors}
        onClose={() => setPickingRoute(false)}
        onPick={handlePickWalkRoute}
      />

      {/* Walk participant picker */}
      <WalkParticipantPickerModal
        visible={pickingParticipants}
        allParticipants={allWalkParticipants}
        selectedIds={walkParticipantIds}
        colors={colors}
        onClose={() => setPickingParticipants(false)}
        onToggle={handleToggleParticipant}
      />

      {/* Edit-address modal */}
      <EditAddressModal
        visible={editingField !== null}
        label={editingLabel}
        initialValue={editingInitial}
        suggestions={sortSuggestionsByUsage(
          knownPlaces.map(p => p.name),
          DEFAULT_SUGGESTIONS,
          addressUsage,
        )}
        colors={colors}
        onCancel={() => setEditingField(null)}
        onSave={handleSaveAddress}
        onChipUsed={handleChipUsed}
      />

      {/* Hidden WebView for story generation */}
      <WebView
        ref={storyWebViewRef}
        source={{ html: storyHtml }}
        onMessage={handleStoryWebViewMessage}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        style={styles.storyWebView}
      />
    </View>
  );
}

function StatItem({ icon, value, color }: { icon: string; value: string; color: string }) {
  return (
    <View style={styles.statItem}>
      <MaterialCommunityIcons name={icon as any} size={16} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
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
  onPress,
}: {
  address?: string;
  placeId?: string;
  dotColor: string;
  categories: PlaceCategory[];
  places: Array<{ id: string; name: string; categoryId?: string }>;
  colors: ReturnType<typeof useColors>;
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
      <MaterialCommunityIcons name="pencil-outline" size={11} color={colors.mutedForeground} />
    </Pressable>
  );
}

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
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
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
    paddingBottom: 12,
    marginBottom: 4,
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
});
