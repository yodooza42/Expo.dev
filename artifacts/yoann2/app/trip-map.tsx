import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { TripMapView } from '@/components/TripMapView';
import { useColors } from '@/hooks/useColors';
import type { KnownPlace, PlaceCategory } from '@/types/places';
import type { RoutePoint, Trip, Vehicle } from '@/types/trips';
import { simplifyRoute } from '@/utils/routeSimplification';
import {
  getAddressUsage,
  getKnownPlaces,
  getPlaceCategories,
  incrementAddressUsage,
  sortSuggestionsByUsage,
} from '@/utils/placesStorage';
import { tripEvents } from '@/utils/tripEvents';
import { getTrips, getVehicleSettings, updateTrip } from '@/utils/tripStorage';
import { fmtDayLong, fmtHHMM } from '@/utils/date';

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

  const [editingField, setEditingField] = useState<'start' | 'end' | null>(null);
  const [addressUsage, setAddressUsage] = useState<Record<string, number>>({});

  const [dtPickerStep, setDtPickerStep] = useState<'date' | 'startTime' | 'endTime' | null>(null);
  const [draftStart, setDraftStart] = useState<Date>(new Date());
  const [draftEnd, setDraftEnd] = useState<Date>(new Date());

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

  const MAP_H = SCREEN_H * 0.62;
  const MAP_W = SCREEN_W;

  const editingLabel = editingField === 'start' ? 'Lieu de départ' : "Lieu d'arrivée";
  const editingInitial = editingField === 'start'
    ? (trip?.startAddress ?? '')
    : (trip?.endAddress ?? '');

  const hasAnyAddress = !!(trip?.startAddress || trip?.endAddress);

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
          {/* Address banner — always shown so the user can always edit */}
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

          <Pressable
            onPress={handleOpenDtPicker}
            style={({ pressed }) => [styles.dtRow, pressed && { opacity: 0.65 }]}
            hitSlop={6}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateText, { color: colors.foreground }]}>
                {fmtDayLong(trip.startTime)}
              </Text>
              <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
                {fmtHHMM(trip.startTime)} → {fmtHHMM(trip.endTime)}
              </Text>
            </View>
            <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.mutedForeground} />
          </Pressable>

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
              const color = veh?.type === 'moto' || trip.vehicle === 'moto' ? '#FF9800' : '#2196F3';
              const icon = veh?.type === 'moto' || trip.vehicle === 'moto' ? 'motorbike' : 'car';
              return <StatItem icon={icon} value={name} color={color} />;
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
  addrBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  addrBadgeText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
});
