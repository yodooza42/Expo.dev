import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { genId } from '@/utils/ids';
import type { KnownPlace } from '@/types/places';
import type { RoutePoint, Vehicle } from '@/types/trips';
import { findNearestPlace, getKnownPlaces } from '@/utils/placesStorage';
import { simplifyRoute } from '@/utils/routeSimplification';
import { getVehicleSettings, saveTrip, updateTrip } from '@/utils/tripStorage';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OsrmRoute {
  distance: number;
  duration: number;
}

interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function placeToGeoResult(p: KnownPlace): GeoResult {
  return {
    display_name: p.name,
    lat: p.lat.toString(),
    lon: p.lng.toString(),
  };
}

async function geocode(query: string): Promise<GeoResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=3&accept-language=fr`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Yoann2App/1.0' } });
  if (!res.ok) throw new Error('Geocoding error');
  return res.json() as Promise<GeoResult[]>;
}

async function fetchRoutes(
  startLat: number, startLon: number,
  endLat: number, endLon: number,
): Promise<OsrmRoute[]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?alternatives=true&overview=false&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OSRM error');
  const data = await res.json() as { routes?: Array<{ distance: number; duration: number }> };
  if (!data.routes?.length) throw new Error('Aucun itinéraire trouvé');
  return data.routes.map(r => ({ distance: r.distance, duration: r.duration }));
}

async function fetchOsrmGeometry(
  startLat: number, startLon: number,
  endLat: number, endLon: number,
): Promise<RoutePoint[] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as { routes?: Array<{ geometry: { coordinates: [number, number][] } }> };
    const coords = data.routes?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    return simplifyRoute(coords.map(([lng, lat]) => ({ lat, lng })));
  } catch {
    return null;
  }
}

function normalizeWalkTime(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  let h: number, m: number;
  if (digits.length <= 2) { h = parseInt(digits, 10); m = 0; }
  else { m = parseInt(digits.slice(-2), 10); h = parseInt(digits.slice(0, -2), 10); }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function normalizeDurationInput(raw: string): { h: number; m: number } | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  let h: number, m: number;
  if (digits.length <= 2) { h = parseInt(digits, 10); m = 0; }
  else { m = parseInt(digits.slice(-2), 10); h = parseInt(digits.slice(0, -2), 10); }
  if (m > 59) return null;
  return { h, m };
}

function getParisTime(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const h = parts.find(p => p.type === 'hour')?.value ?? '00';
  const mn = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${h.padStart(2, '0')}:${mn.padStart(2, '0')}`;
}

function fmtDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function fmtDur(s: number): string {
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function NewTripScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ vehicleType?: string }>();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [walkParticipantIds, setWalkParticipantIds] = useState<string[]>([]);
  const [knownPlaces, setKnownPlaces] = useState<KnownPlace[]>([]);

  // Walk-specific manual fields
  const [walkStartTime, setWalkStartTime] = useState(getParisTime);
  const [walkDuration, setWalkDuration] = useState('');
  const [walkDistanceKm, setWalkDistanceKm] = useState('');
  const [walkRoute, setWalkRoute] = useState('');

  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');

  const [startResult, setStartResult] = useState<GeoResult | null>(null);
  const [endResult, setEndResult] = useState<GeoResult | null>(null);
  const [startSuggestions, setStartSuggestions] = useState<GeoResult[]>([]);
  const [endSuggestions, setEndSuggestions] = useState<GeoResult[]>([]);

  const [routes, setRoutes] = useState<OsrmRoute[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);

  const [loading, setLoading] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tripDate, setTripDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split('T')[0]!;
  });

  useEffect(() => {
    Promise.all([getVehicleSettings(), getKnownPlaces()]).then(([v, p]) => {
      setVehicles(v);
      if (v.length > 0) {
        const walkVehicle = params.vehicleType === 'walk' ? v.find(v => v.type === 'walk') : undefined;
        setSelectedVehicleId((walkVehicle ?? v[0]!).id);
      }
      setKnownPlaces(p);
    });
  }, []);

  useEffect(() => {
    setWalkParticipantIds([]);
  }, [selectedVehicleId]);

  const searchStart = useCallback(async () => {
    if (startAddress.length < 3) return;
    setLoading(true);
    try {
      const results = await geocode(startAddress);
      setStartSuggestions(results);
    } catch {
      setStartSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [startAddress]);

  const searchEnd = useCallback(async () => {
    if (endAddress.length < 3) return;
    setLoading(true);
    try {
      const results = await geocode(endAddress);
      setEndSuggestions(results);
    } catch {
      setEndSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [endAddress]);

  async function fetchRoutesIfReady(start: GeoResult | null, end: GeoResult | null) {
    if (!start || !end) return;
    setLoadingRoutes(true);
    setRoutes([]);
    try {
      const r = await fetchRoutes(
        parseFloat(start.lat), parseFloat(start.lon),
        parseFloat(end.lat), parseFloat(end.lon),
      );
      setRoutes(r);
      setSelectedRouteIdx(0);
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de calculer l\'itinéraire');
    } finally {
      setLoadingRoutes(false);
    }
  }

  function selectStart(geo: GeoResult) {
    setStartResult(geo);
    setStartAddress(geo.display_name.split(',')[0] ?? geo.display_name);
    setStartSuggestions([]);
    fetchRoutesIfReady(geo, endResult);
  }

  function selectEnd(geo: GeoResult) {
    setEndResult(geo);
    setEndAddress(geo.display_name.split(',')[0] ?? geo.display_name);
    setEndSuggestions([]);
    fetchRoutesIfReady(startResult, geo);
  }

  function selectKnownPlaceStart(place: KnownPlace) {
    Haptics.selectionAsync();
    const geo = placeToGeoResult(place);
    selectStart(geo);
  }

  function selectKnownPlaceEnd(place: KnownPlace) {
    Haptics.selectionAsync();
    const geo = placeToGeoResult(place);
    selectEnd(geo);
  }

  async function handleSaveWalk() {
    const distKm = parseFloat(walkDistanceKm);
    if (isNaN(distKm) || distKm <= 0) {
      Alert.alert('Distance manquante', 'Indique la distance en km.');
      return;
    }

    const dur = normalizeDurationInput(walkDuration);
    if (!dur || (dur.h === 0 && dur.m === 0)) {
      Alert.alert('Durée manquante', 'Ex : 125 = 1h25, 45 = 45 min.');
      return;
    }

    const timeStr = normalizeWalkTime(walkStartTime) ?? walkStartTime;
    const timeParts = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    const startH  = timeParts ? parseInt(timeParts[1]!, 10) : 0;
    const startMn = timeParts ? parseInt(timeParts[2]!, 10) : 0;

    const [y, mo, d] = tripDate.split('-').map(Number);
    const startMs = new Date(y!, mo! - 1, d!, startH, startMn, 0, 0).getTime();
    const durationMs = (dur.h * 60 + dur.m) * 60_000;

    setSaving(true);
    try {
      await saveTrip({
        id: genId(),
        startTime: startMs,
        endTime: startMs + durationMs,
        distanceKm: distKm,
        vehicle: selectedVehicleId || null,
        walkParticipants: walkParticipantIds.length > 0 ? walkParticipantIds : undefined,
        pointCount: 0,
        source: 'manual',
        ...(walkRoute.trim() ? { startAddress: walkRoute.trim() } : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder la balade.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (selectedVehicle?.type === 'walk') {
      return handleSaveWalk();
    }

    if (!startResult || !endResult) {
      Alert.alert('Adresses manquantes', 'Veuillez sélectionner un départ et une arrivée.');
      return;
    }
    if (routes.length === 0) {
      Alert.alert('Itinéraire manquant', 'Veuillez calculer l\'itinéraire d\'abord.');
      return;
    }
    if (!selectedVehicleId) {
      Alert.alert('Véhicule manquant', 'Veuillez sélectionner un véhicule.');
      return;
    }

    const route = routes[selectedRouteIdx];
    if (!route) return;

    const distanceKm = route.distance / 1000;
    const durationMs = route.duration * 1000;
    const dateMs = new Date(tripDate).getTime();

    const startLat = parseFloat(startResult.lat);
    const startLon = parseFloat(startResult.lon);
    const endLat   = parseFloat(endResult.lat);
    const endLon   = parseFloat(endResult.lon);

    setSaving(true);
    try {
      const [startPlace, endPlace] = await Promise.all([
        findNearestPlace(startLat, startLon).catch(() => null),
        findNearestPlace(endLat, endLon).catch(() => null),
      ]);

      const tripId = genId();
      await saveTrip({
        id: tripId,
        startTime: dateMs,
        endTime: dateMs + durationMs,
        distanceKm,
        vehicle: selectedVehicleId || null,
        walkParticipants: walkParticipantIds.length > 0 ? walkParticipantIds : undefined,
        pointCount: 2,
        startLat,
        startLon,
        endLat,
        endLon,
        startAddress: startPlace?.name ?? startResult.display_name.split(',').slice(0, 2).join(','),
        startPlaceId: startPlace?.id,
        endAddress: endPlace?.name ?? endResult.display_name.split(',').slice(0, 2).join(','),
        endPlaceId: endPlace?.id,
        source: 'manual',
      });

      const geometry = await fetchOsrmGeometry(startLat, startLon, endLat, endLon);
      if (geometry) {
        await updateTrip(tripId, { route: geometry }).catch(() => {});
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder le trajet.');
    } finally {
      setSaving(false);
    }
  }

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const selectedRoute = routes[selectedRouteIdx];
  const isWalk = selectedVehicle?.type === 'walk';
  const walkDistNum = parseFloat(walkDistanceKm);
  const parsedDur = normalizeDurationInput(walkDuration);
  const walkDurMin = parsedDur ? parsedDur.h * 60 + parsedDur.m : 0;
  const parsedStart = normalizeWalkTime(walkStartTime);
  const walkEndTime = isWalk && parsedStart && walkDurMin > 0 ? (() => {
    const [hStr, mStr] = parsedStart.split(':');
    const startTotalMins = parseInt(hStr!, 10) * 60 + parseInt(mStr!, 10);
    const endMins = startTotalMins + walkDurMin;
    return `${String(Math.floor(endMins / 60) % 24).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;
  })() : null;
  const canSave = isWalk
    ? (!!selectedVehicleId && walkDistNum > 0 && walkDurMin > 0)
    : (!!startResult && !!endResult && routes.length > 0 && !!selectedVehicleId);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBack}>
          <MaterialCommunityIcons name="close" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{isWalk ? 'Balade' : 'Trajet manuel'}</Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSave || saving}
          style={[styles.saveBtn, { backgroundColor: canSave ? colors.primary : colors.muted, opacity: saving ? 0.6 : 1 }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#121212" />
          ) : (
            <Text style={[styles.saveBtnText, { color: canSave ? '#121212' : colors.mutedForeground }]}>Sauvegarder</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Date */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>DATE DU TRAJET</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
            value={tripDate}
            onChangeText={setTripDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numeric"
          />
        </View>

        {/* Vehicle selector */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>VÉHICULE</Text>
          <View style={styles.vehicleRow}>
            {vehicles.map(v => {
              const active = v.id === selectedVehicleId;
              const c = v.type === 'moto' ? '#FF9800' : v.type === 'walk' ? '#4CAF50' : '#2196F3';
              const icon = v.type === 'moto' ? 'motorbike' : v.type === 'walk' ? 'walk' : 'car';
              return (
                <Pressable
                  key={v.id}
                  onPress={() => { Haptics.selectionAsync(); setSelectedVehicleId(v.id); }}
                  style={[styles.vehicleChip, {
                    backgroundColor: active ? c + '22' : colors.muted,
                    borderColor: active ? c : colors.border,
                  }]}
                >
                  <MaterialCommunityIcons
                    name={icon as any}
                    size={16}
                    color={active ? c : colors.mutedForeground}
                  />
                  <Text style={[styles.vehicleChipText, { color: active ? c : colors.mutedForeground }]}>{v.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Walk participants */}
        {selectedVehicle?.type === 'walk' && (selectedVehicle.walkParticipants ?? []).length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>PARTICIPANTS</Text>
            {(selectedVehicle.walkParticipants ?? []).filter(p => p.type === 'human').length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={[styles.partGroupLabel, { color: colors.mutedForeground }]}>👤 HUMAINS</Text>
                <View style={styles.vehicleRow}>
                  {(selectedVehicle.walkParticipants ?? []).filter(p => p.type === 'human').map(p => {
                    const active = walkParticipantIds.includes(p.id);
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => { Haptics.selectionAsync(); setWalkParticipantIds(prev => active ? prev.filter(id => id !== p.id) : [...prev, p.id]); }}
                        style={[styles.vehicleChip, { backgroundColor: active ? '#2196F322' : colors.muted, borderColor: active ? '#2196F3' : colors.border }]}
                      >
                        <MaterialCommunityIcons name="account-outline" size={14} color={active ? '#2196F3' : colors.mutedForeground} />
                        <Text style={[styles.vehicleChipText, { color: active ? '#2196F3' : colors.mutedForeground }]}>{p.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
            {(selectedVehicle.walkParticipants ?? []).filter(p => p.type === 'dog').length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={[styles.partGroupLabel, { color: colors.mutedForeground }]}>🐕 CHIENS</Text>
                <View style={styles.vehicleRow}>
                  {(selectedVehicle.walkParticipants ?? []).filter(p => p.type === 'dog').map(p => {
                    const active = walkParticipantIds.includes(p.id);
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => { Haptics.selectionAsync(); setWalkParticipantIds(prev => active ? prev.filter(id => id !== p.id) : [...prev, p.id]); }}
                        style={[styles.vehicleChip, { backgroundColor: active ? '#FF980022' : colors.muted, borderColor: active ? '#FF9800' : colors.border }]}
                      >
                        <Text style={{ fontSize: 12 }}>🐕</Text>
                        <Text style={[styles.vehicleChipText, { color: active ? '#FF9800' : colors.mutedForeground }]}>{p.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Walk — heure / durée / distance / parcours */}
        {isWalk && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>HEURE DE DÉBUT</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: parsedStart ? '#4CAF50' : colors.border, color: colors.foreground }]}
              value={walkStartTime}
              onChangeText={setWalkStartTime}
              onBlur={() => { const n = normalizeWalkTime(walkStartTime); if (n) setWalkStartTime(n); }}
              placeholder="ex : 930 = 09:30"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
            />
          </View>
        )}
        {isWalk && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>DURÉE</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: walkDurMin > 0 ? '#4CAF50' : colors.border, color: colors.foreground }]}
              value={walkDuration}
              onChangeText={setWalkDuration}
              onBlur={() => {
                const dur = normalizeDurationInput(walkDuration);
                if (dur) setWalkDuration(`${dur.h}h${String(dur.m).padStart(2, '0')}`);
              }}
              placeholder="ex : 125 = 1h25, 45 = 45 min"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
            />
            {walkEndTime && (
              <View style={styles.confirmedRow}>
                <MaterialCommunityIcons name="clock-check-outline" size={14} color="#4CAF50" />
                <Text style={[styles.confirmedText, { color: '#4CAF50' }]}>
                  Fin estimée : {walkEndTime}
                </Text>
              </View>
            )}
          </View>
        )}
        {isWalk && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>DISTANCE (KM)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: walkDistNum > 0 ? '#4CAF50' : colors.border, color: colors.foreground }]}
              value={walkDistanceKm}
              onChangeText={setWalkDistanceKm}
              placeholder="ex: 3.5"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />
          </View>
        )}
        {isWalk && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>PARCOURS (FACULTATIF)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              value={walkRoute}
              onChangeText={setWalkRoute}
              placeholder="ex: Parc de la Tête d'Or"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
            />
          </View>
        )}

        {/* Start address */}
        {!isWalk && <View style={styles.section}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>DÉPART</Text>

          {/* Known place shortcuts */}
          {knownPlaces.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.placeScroll}>
              <View style={styles.placeChipRow}>
                {knownPlaces.map(p => {
                  const active = startResult?.lat === p.lat.toString() && startResult?.lon === p.lng.toString();
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => selectKnownPlaceStart(p)}
                      style={[styles.placeChip, {
                        borderColor: active ? '#4CAF50' : colors.border,
                        backgroundColor: active ? '#4CAF5018' : colors.card,
                      }]}
                    >
                      <MaterialCommunityIcons name="map-marker" size={12} color={active ? '#4CAF50' : colors.mutedForeground} />
                      <Text style={[styles.placeChipText, { color: active ? '#4CAF50' : colors.mutedForeground }]}>
                        {p.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          )}

          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, { flex: 1, backgroundColor: colors.input, borderColor: startResult ? '#4CAF50' : colors.border, color: colors.foreground }]}
              value={startAddress}
              onChangeText={t => { setStartAddress(t); setStartResult(null); setStartSuggestions([]); }}
              placeholder="Adresse de départ…"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="search"
              onSubmitEditing={searchStart}
            />
            <Pressable onPress={searchStart} style={[styles.searchBtn, { backgroundColor: colors.primary }]}>
              {loading ? <ActivityIndicator size="small" color="#121212" /> : <MaterialCommunityIcons name="magnify" size={18} color="#121212" />}
            </Pressable>
          </View>
          {startSuggestions.map((g, i) => (
            <Pressable
              key={i}
              onPress={() => selectStart(g)}
              style={[styles.suggestion, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.mutedForeground} />
              <Text style={[styles.suggestionText, { color: colors.foreground }]} numberOfLines={2}>
                {g.display_name}
              </Text>
            </Pressable>
          ))}
          {startResult && (
            <View style={styles.confirmedRow}>
              <MaterialCommunityIcons name="check-circle" size={14} color="#4CAF50" />
              <Text style={[styles.confirmedText, { color: '#4CAF50' }]}>
                {startResult.display_name.split(',').slice(0, 2).join(',')}
              </Text>
            </View>
          )}
        </View>}

        {/* End address */}
        {!isWalk && <View style={styles.section}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>ARRIVÉE</Text>

          {/* Known place shortcuts */}
          {knownPlaces.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.placeScroll}>
              <View style={styles.placeChipRow}>
                {knownPlaces.map(p => {
                  const active = endResult?.lat === p.lat.toString() && endResult?.lon === p.lng.toString();
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => selectKnownPlaceEnd(p)}
                      style={[styles.placeChip, {
                        borderColor: active ? '#4CAF50' : colors.border,
                        backgroundColor: active ? '#4CAF5018' : colors.card,
                      }]}
                    >
                      <MaterialCommunityIcons name="map-marker" size={12} color={active ? '#4CAF50' : colors.mutedForeground} />
                      <Text style={[styles.placeChipText, { color: active ? '#4CAF50' : colors.mutedForeground }]}>
                        {p.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          )}

          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, { flex: 1, backgroundColor: colors.input, borderColor: endResult ? '#4CAF50' : colors.border, color: colors.foreground }]}
              value={endAddress}
              onChangeText={t => { setEndAddress(t); setEndResult(null); setEndSuggestions([]); }}
              placeholder="Adresse d'arrivée…"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="search"
              onSubmitEditing={searchEnd}
            />
            <Pressable onPress={searchEnd} style={[styles.searchBtn, { backgroundColor: colors.primary }]}>
              {loading ? <ActivityIndicator size="small" color="#121212" /> : <MaterialCommunityIcons name="magnify" size={18} color="#121212" />}
            </Pressable>
          </View>
          {endSuggestions.map((g, i) => (
            <Pressable
              key={i}
              onPress={() => selectEnd(g)}
              style={[styles.suggestion, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.mutedForeground} />
              <Text style={[styles.suggestionText, { color: colors.foreground }]} numberOfLines={2}>
                {g.display_name}
              </Text>
            </Pressable>
          ))}
          {endResult && (
            <View style={styles.confirmedRow}>
              <MaterialCommunityIcons name="check-circle" size={14} color="#4CAF50" />
              <Text style={[styles.confirmedText, { color: '#4CAF50' }]}>
                {endResult.display_name.split(',').slice(0, 2).join(',')}
              </Text>
            </View>
          )}
        </View>}

        {/* Routes + summary — car/moto only */}
        {!isWalk && (
          <>
            {loadingRoutes ? (
              <View style={styles.routeLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.routeLoadingText, { color: colors.mutedForeground }]}>Calcul de l'itinéraire…</Text>
              </View>
            ) : routes.length > 0 ? (
              <View style={styles.section}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>ITINÉRAIRE</Text>
                {routes.map((r, i) => (
                  <Pressable
                    key={i}
                    onPress={() => { Haptics.selectionAsync(); setSelectedRouteIdx(i); }}
                    style={[styles.routeCard, {
                      backgroundColor: i === selectedRouteIdx ? colors.primary + '18' : colors.card,
                      borderColor: i === selectedRouteIdx ? colors.primary : colors.border,
                    }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.routeLabel, { color: colors.foreground }]}>
                        {i === 0 ? '🚀 Itinéraire recommandé' : `Itinéraire ${i + 1}`}
                      </Text>
                      <Text style={[styles.routeDetail, { color: colors.mutedForeground }]}>
                        {fmtDist(r.distance)} · {fmtDur(r.duration)}
                      </Text>
                      {selectedVehicle && (
                        <Text style={[styles.routeCost, { color: colors.mutedForeground }]}>
                          Coût estimé : {((r.distance / 1000) * selectedVehicle.costPerKm).toFixed(2)} €
                        </Text>
                      )}
                    </View>
                    {i === selectedRouteIdx && (
                      <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />
                    )}
                  </Pressable>
                ))}
              </View>
            ) : null}

            {selectedRoute && (
              <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
                <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Résumé du trajet</Text>
                <View style={styles.summaryRow}>
                  <MaterialCommunityIcons name="road-variant" size={16} color={colors.primary} />
                  <Text style={[styles.summaryVal, { color: colors.foreground }]}>{fmtDist(selectedRoute.distance)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <MaterialCommunityIcons name="clock-outline" size={16} color={colors.primary} />
                  <Text style={[styles.summaryVal, { color: colors.foreground }]}>{fmtDur(selectedRoute.duration)}</Text>
                </View>
                {selectedVehicle && (
                  <View style={styles.summaryRow}>
                    <MaterialCommunityIcons
                      name={selectedVehicle.type === 'moto' ? 'motorbike' : 'car'}
                      size={16}
                      color={colors.primary}
                    />
                    <Text style={[styles.summaryVal, { color: colors.foreground }]}>
                      {selectedVehicle.name} · {((selectedRoute.distance / 1000) * selectedVehicle.costPerKm).toFixed(2)} €
                    </Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  headerBack: { padding: 6, borderRadius: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  saveBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, minWidth: 96, alignItems: 'center' },
  saveBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },

  scroll: { padding: 16, gap: 20 },
  section: { gap: 8 },
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },

  vehicleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  vehicleChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  vehicleChipText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  placeScroll: { flexGrow: 0 },
  placeChipRow: { flexDirection: 'row', gap: 6, paddingRight: 4 },
  placeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1,
  },
  placeChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchBtn: { width: 44, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  suggestion: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 10, borderWidth: 1 },
  suggestionText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },

  confirmedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmedText: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },

  routeLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  routeLoadingText: { fontSize: 14, fontFamily: 'Inter_400Regular' },

  routeCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 14, gap: 12 },
  routeLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  routeDetail: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  routeCost: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },

  summaryCard: { borderRadius: 14, borderWidth: 1.5, padding: 16, gap: 10 },
  summaryTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryVal: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  partGroupLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, textTransform: 'uppercase' },
  walkUnit: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 4 },
});
