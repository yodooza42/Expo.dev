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
import type { KnownPlace, WalkRoute } from '@/types/places';
import type { RoutePoint, Vehicle } from '@/types/trips';
import { findNearestPlace, getKnownPlaces, getWalkRoutes } from '@/utils/placesStorage';
import { simplifyRoute } from '@/utils/routeSimplification';
import { getVehicleSettings, saveTrip, updateTrip } from '@/utils/tripStorage';
import { checkDepartureAlertAfterTrip } from '@/utils/departureAlert';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface Waypoint {
  id: string;
  geo: GeoResult | null;
  address: string;
  suggestions: GeoResult[];
}

interface OsrmRoute {
  distance: number;   // metres
  duration: number;   // seconds
  geometry?: RoutePoint[];
  legs?: Array<{ distance: number; duration: number }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function placeToGeoResult(p: KnownPlace): GeoResult {
  return { display_name: p.name, lat: p.lat.toString(), lon: p.lng.toString() };
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
  const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?alternatives=true&overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OSRM error');
  const data = await res.json() as {
    routes?: Array<{
      distance: number;
      duration: number;
      geometry: { coordinates: [number, number][] };
    }>;
  };
  if (!data.routes?.length) throw new Error('Aucun itinéraire trouvé');
  return data.routes.map(r => ({
    distance: r.distance,
    duration: r.duration,
    geometry: simplifyRoute(r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))),
  }));
}

async function fetchMultiPointRoute(
  points: Array<{ lat: number; lon: number }>,
): Promise<OsrmRoute> {
  const coords = points.map(p => `${p.lon},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?alternatives=false&overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OSRM error');
  const data = await res.json() as {
    routes?: Array<{
      distance: number;
      duration: number;
      geometry: { coordinates: [number, number][] };
      legs: Array<{ distance: number; duration: number }>;
    }>;
  };
  if (!data.routes?.length) throw new Error('Aucun itinéraire trouvé');
  const r = data.routes[0]!;
  const geometry = simplifyRoute(r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })));
  return {
    distance: r.distance,
    duration: r.duration,
    geometry,
    legs: r.legs.map(l => ({ distance: l.distance, duration: l.duration })),
  };
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

function makeWaypoint(id: string): Waypoint {
  return { id, geo: null, address: '', suggestions: [] };
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

  const [manualStartTime, setManualStartTime] = useState(getParisTime);

  const [walkStartTime, setWalkStartTime] = useState(getParisTime);
  const [walkDuration, setWalkDuration] = useState('');
  const [walkDistanceKm, setWalkDistanceKm] = useState('');
  const [walkRouteId, setWalkRouteId] = useState<string | null>(null);
  const [walkRoutes, setWalkRoutes] = useState<WalkRoute[]>([]);

  // ── Waypoint state ─────────────────────────────────────────────────────────
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [startResult, setStartResult] = useState<GeoResult | null>(null);
  const [endResult, setEndResult] = useState<GeoResult | null>(null);
  const [startSuggestions, setStartSuggestions] = useState<GeoResult[]>([]);
  const [endSuggestions, setEndSuggestions] = useState<GeoResult[]>([]);

  const [intermediates, setIntermediates] = useState<Waypoint[]>([]);

  const [routes, setRoutes] = useState<OsrmRoute[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);

  const [loading, setLoading] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tripDate, setTripDate] = useState(() => new Date().toISOString().split('T')[0]!);

  useEffect(() => {
    Promise.all([getVehicleSettings(), getKnownPlaces(), getWalkRoutes()]).then(([v, p, r]) => {
      setVehicles(v);
      if (v.length > 0) {
        const walkVehicle = params.vehicleType === 'walk' ? v.find(v => v.type === 'walk') : undefined;
        setSelectedVehicleId((walkVehicle ?? v[0]!).id);
      }
      setKnownPlaces(p);
      setWalkRoutes(r);
    });
  }, []);

  useEffect(() => {
    setWalkParticipantIds([]);
  }, [selectedVehicleId]);

  // ── Route calculation ──────────────────────────────────────────────────────

  async function triggerRouteCalc(
    start: GeoResult | null,
    end: GeoResult | null,
    mids: Waypoint[],
  ) {
    if (!start || !end) return;
    const allMidsResolved = mids.every(w => w.geo !== null);
    if (!allMidsResolved) return;

    setLoadingRoutes(true);
    setRoutes([]);
    try {
      if (mids.length === 0) {
        const r = await fetchRoutes(
          parseFloat(start.lat), parseFloat(start.lon),
          parseFloat(end.lat), parseFloat(end.lon),
        );
        setRoutes(r);
      } else {
        const points = [
          { lat: parseFloat(start.lat), lon: parseFloat(start.lon) },
          ...mids.map(w => ({ lat: parseFloat(w.geo!.lat), lon: parseFloat(w.geo!.lon) })),
          { lat: parseFloat(end.lat), lon: parseFloat(end.lon) },
        ];
        const r = await fetchMultiPointRoute(points);
        setRoutes([r]);
      }
      setSelectedRouteIdx(0);
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de calculer l\'itinéraire');
    } finally {
      setLoadingRoutes(false);
    }
  }

  // ── Start / End search ─────────────────────────────────────────────────────

  const searchStart = useCallback(async () => {
    if (startAddress.length < 3) return;
    setLoading(true);
    try {
      setStartSuggestions(await geocode(startAddress));
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
      setEndSuggestions(await geocode(endAddress));
    } catch {
      setEndSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [endAddress]);

  function selectStart(geo: GeoResult) {
    setStartResult(geo);
    setStartAddress(geo.display_name.split(',')[0] ?? geo.display_name);
    setStartSuggestions([]);
    triggerRouteCalc(geo, endResult, intermediates);
  }

  function selectEnd(geo: GeoResult) {
    setEndResult(geo);
    setEndAddress(geo.display_name.split(',')[0] ?? geo.display_name);
    setEndSuggestions([]);
    triggerRouteCalc(startResult, geo, intermediates);
  }

  function selectKnownPlaceStart(place: KnownPlace) {
    Haptics.selectionAsync();
    selectStart(placeToGeoResult(place));
  }

  function selectKnownPlaceEnd(place: KnownPlace) {
    Haptics.selectionAsync();
    selectEnd(placeToGeoResult(place));
  }

  // ── Intermediate waypoints ─────────────────────────────────────────────────

  function addIntermediate() {
    Haptics.selectionAsync();
    setRoutes([]);
    setIntermediates(prev => [...prev, makeWaypoint(genId())]);
  }

  function removeIntermediate(id: string) {
    Haptics.selectionAsync();
    const next = intermediates.filter(w => w.id !== id);
    setIntermediates(next);
    setRoutes([]);
    triggerRouteCalc(startResult, endResult, next);
  }

  function updateIntermediate(id: string, patch: Partial<Waypoint>) {
    setIntermediates(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w));
  }

  async function searchIntermediate(id: string, address: string) {
    if (address.length < 3) return;
    setLoading(true);
    try {
      const results = await geocode(address);
      updateIntermediate(id, { suggestions: results });
    } catch {
      updateIntermediate(id, { suggestions: [] });
    } finally {
      setLoading(false);
    }
  }

  function selectIntermediateGeo(id: string, geo: GeoResult) {
    const next = intermediates.map(w =>
      w.id === id
        ? { ...w, geo, address: geo.display_name.split(',')[0] ?? geo.display_name, suggestions: [] }
        : w
    );
    setIntermediates(next);
    triggerRouteCalc(startResult, endResult, next);
  }

  function selectKnownPlaceIntermediate(id: string, place: KnownPlace) {
    Haptics.selectionAsync();
    selectIntermediateGeo(id, placeToGeoResult(place));
  }

  // ── Walk save ──────────────────────────────────────────────────────────────

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
        ...(walkRouteId ? { walkRouteId } : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder la balade.');
    } finally {
      setSaving(false);
    }
  }

  // ── Car/Moto save ──────────────────────────────────────────────────────────

  async function handleSave() {
    if (selectedVehicle?.type === 'walk') return handleSaveWalk();

    if (!startResult || !endResult) {
      Alert.alert('Adresses manquantes', 'Veuillez sélectionner un départ et une arrivée.');
      return;
    }
    if (intermediates.some(w => !w.geo)) {
      Alert.alert('Étape incomplète', 'Toutes les étapes doivent être renseignées ou supprimées.');
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

    const timeStr = normalizeWalkTime(manualStartTime) ?? manualStartTime;
    const timeParts = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    const startH  = timeParts ? parseInt(timeParts[1]!, 10) : 0;
    const startMn = timeParts ? parseInt(timeParts[2]!, 10) : 0;
    const [y, mo, d] = tripDate.split('-').map(Number);
    const dateMs = new Date(y!, mo! - 1, d!, startH, startMn, 0, 0).getTime();

    const startLat = parseFloat(startResult.lat);
    const startLon = parseFloat(startResult.lon);
    const endLat   = parseFloat(endResult.lat);
    const endLon   = parseFloat(endResult.lon);

    setSaving(true);
    try {
      const [startPlace, endPlace, ...intermediatePlaces] = await Promise.all([
        findNearestPlace(startLat, startLon).catch(() => null),
        findNearestPlace(endLat, endLon).catch(() => null),
        ...intermediates.map(w =>
          findNearestPlace(parseFloat(w.geo!.lat), parseFloat(w.geo!.lon)).catch(() => null)
        ),
      ]);

      const intermediateData = intermediates.map((w, i) => {
        const place = intermediatePlaces[i] ?? null;
        return {
          name: place?.name ?? w.geo!.display_name.split(',').slice(0, 2).join(','),
          ...(place ? { placeId: place.id } : {}),
        };
      });

      const tripId = genId();
      await saveTrip({
        id: tripId,
        startTime: dateMs,
        endTime: dateMs + durationMs,
        distanceKm,
        vehicle: selectedVehicleId || null,
        walkParticipants: walkParticipantIds.length > 0 ? walkParticipantIds : undefined,
        pointCount: intermediates.length > 0 ? intermediates.length + 2 : 2,
        startLat,
        startLon,
        endLat,
        endLon,
        startAddress: startPlace?.name ?? startResult.display_name.split(',').slice(0, 2).join(','),
        startPlaceId: startPlace?.id,
        endAddress: endPlace?.name ?? endResult.display_name.split(',').slice(0, 2).join(','),
        endPlaceId: endPlace?.id,
        source: 'manual',
        ...(intermediateData.length > 0 ? { intermediates: intermediateData } : {}),
      });

      // Geometry: use cached from multi-point call, or fetch for simple 2-point route
      let geometry = route.geometry ?? null;
      if (!geometry) {
        geometry = await fetchOsrmGeometry(startLat, startLon, endLat, endLon);
      }
      if (geometry) {
        await updateTrip(tripId, { route: geometry }).catch(() => {});
      }

      // Recalculate departure alert if a RDV is scheduled today
      checkDepartureAlertAfterTrip(endLat, endLon, dateMs + durationMs).catch(() => {});

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder le trajet.');
    } finally {
      setSaving(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const selectedRoute = routes[selectedRouteIdx];
  const isWalk = selectedVehicle?.type === 'walk';
  const hasIntermediates = intermediates.length > 0;

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
    : (!!startResult && !!endResult && routes.length > 0 && !!selectedVehicleId && intermediates.every(w => !!w.geo));

  // ── Shared address block (used for start, end, intermediates) ──────────────

  function KnownPlaceChips({
    activeGeo,
    onSelect,
  }: {
    activeGeo: GeoResult | null;
    onSelect: (p: KnownPlace) => void;
  }) {
    if (knownPlaces.length === 0) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.placeScroll}>
        <View style={styles.placeChipRow}>
          {knownPlaces.map(p => {
            const active = activeGeo?.lat === p.lat.toString() && activeGeo?.lon === p.lng.toString();
            return (
              <Pressable
                key={p.id}
                onPress={() => onSelect(p)}
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
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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

        {/* Start time — non-walk only */}
        {!isWalk && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>HEURE DE DÉBUT</Text>
            <TextInput
              style={[styles.input, {
                backgroundColor: colors.input,
                borderColor: normalizeWalkTime(manualStartTime) ? colors.primary : colors.border,
                color: colors.foreground,
              }]}
              value={manualStartTime}
              onChangeText={setManualStartTime}
              onBlur={() => { const n = normalizeWalkTime(manualStartTime); if (n) setManualStartTime(n); }}
              placeholder="ex : 930 = 09:30"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
            />
          </View>
        )}

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
                  <MaterialCommunityIcons name={icon as any} size={16} color={active ? c : colors.mutedForeground} />
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

        {/* Walk fields */}
        {isWalk && (
          <>
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
            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>DURÉE</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: walkDurMin > 0 ? '#4CAF50' : colors.border, color: colors.foreground }]}
                value={walkDuration}
                onChangeText={setWalkDuration}
                onBlur={() => { const dur = normalizeDurationInput(walkDuration); if (dur) setWalkDuration(`${dur.h}h${String(dur.m).padStart(2, '0')}`); }}
                placeholder="ex : 125 = 1h25, 45 = 45 min"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
              />
              {walkEndTime && (
                <View style={styles.confirmedRow}>
                  <MaterialCommunityIcons name="clock-check-outline" size={14} color="#4CAF50" />
                  <Text style={[styles.confirmedText, { color: '#4CAF50' }]}>Fin estimée : {walkEndTime}</Text>
                </View>
              )}
            </View>
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
            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>PARCOURS (FACULTATIF)</Text>
              {walkRoutes.length === 0 ? (
                <Text style={[styles.confirmedText, { color: colors.mutedForeground, fontStyle: 'italic' }]}>
                  Aucun parcours configuré — ajoute-en dans Lieux connus.
                </Text>
              ) : (
                <View style={styles.vehicleRow}>
                  {walkRoutes.map(r => {
                    const active = walkRouteId === r.id;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => { Haptics.selectionAsync(); setWalkRouteId(active ? null : r.id); }}
                        style={[styles.vehicleChip, { backgroundColor: active ? '#4CAF5022' : colors.muted, borderColor: active ? '#4CAF50' : colors.border }]}
                      >
                        <MaterialCommunityIcons name="map-marker-path" size={13} color={active ? '#4CAF50' : colors.mutedForeground} />
                        <Text style={[styles.vehicleChipText, { color: active ? '#4CAF50' : colors.mutedForeground }]}>{r.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}

        {/* ── Car / Moto address sections ── */}
        {!isWalk && (
          <>
            {/* DÉPART */}
            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>DÉPART</Text>
              <KnownPlaceChips activeGeo={startResult} onSelect={selectKnownPlaceStart} />
              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, { flex: 1, backgroundColor: colors.input, borderColor: startResult ? '#4CAF50' : colors.border, color: colors.foreground }]}
                  value={startAddress}
                  onChangeText={t => { setStartAddress(t); setStartResult(null); setStartSuggestions([]); setRoutes([]); }}
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
                  <Text style={[styles.suggestionText, { color: colors.foreground }]} numberOfLines={2}>{g.display_name}</Text>
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
            </View>

            {/* ── Intermediate waypoints ── */}
            {intermediates.map((wp, idx) => (
              <View key={wp.id} style={[styles.section, styles.waypointSection, { borderColor: colors.border }]}>
                <View style={styles.waypointHeader}>
                  <View style={[styles.waypointDot, { backgroundColor: colors.primary }]}>
                    <Text style={styles.waypointDotText}>{idx + 1}</Text>
                  </View>
                  <Text style={[styles.label, { color: colors.mutedForeground, flex: 1 }]}>ÉTAPE {idx + 1}</Text>
                  <Pressable
                    onPress={() => removeIntermediate(wp.id)}
                    hitSlop={10}
                    style={[styles.removeWaypointBtn, { backgroundColor: colors.muted }]}
                  >
                    <MaterialCommunityIcons name="close" size={14} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                <KnownPlaceChips activeGeo={wp.geo} onSelect={p => selectKnownPlaceIntermediate(wp.id, p)} />

                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: colors.input, borderColor: wp.geo ? '#4CAF50' : colors.border, color: colors.foreground }]}
                    value={wp.address}
                    onChangeText={t => { updateIntermediate(wp.id, { address: t, geo: null, suggestions: [] }); setRoutes([]); }}
                    placeholder={`Adresse étape ${idx + 1}…`}
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="search"
                    onSubmitEditing={() => searchIntermediate(wp.id, wp.address)}
                  />
                  <Pressable
                    onPress={() => searchIntermediate(wp.id, wp.address)}
                    style={[styles.searchBtn, { backgroundColor: colors.primary }]}
                  >
                    {loading ? <ActivityIndicator size="small" color="#121212" /> : <MaterialCommunityIcons name="magnify" size={18} color="#121212" />}
                  </Pressable>
                </View>
                {wp.suggestions.map((g, i) => (
                  <Pressable
                    key={i}
                    onPress={() => selectIntermediateGeo(wp.id, g)}
                    style={[styles.suggestion, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.suggestionText, { color: colors.foreground }]} numberOfLines={2}>{g.display_name}</Text>
                  </Pressable>
                ))}
                {wp.geo && (
                  <View style={styles.confirmedRow}>
                    <MaterialCommunityIcons name="check-circle" size={14} color="#4CAF50" />
                    <Text style={[styles.confirmedText, { color: '#4CAF50' }]}>
                      {wp.geo.display_name.split(',').slice(0, 2).join(',')}
                    </Text>
                  </View>
                )}
              </View>
            ))}

            {/* Add étape button */}
            <Pressable
              onPress={addIntermediate}
              style={[styles.addWaypointBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '12' }]}
            >
              <MaterialCommunityIcons name="map-marker-plus-outline" size={16} color={colors.primary} />
              <Text style={[styles.addWaypointText, { color: colors.primary }]}>Ajouter une étape</Text>
            </Pressable>

            {/* ARRIVÉE */}
            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>ARRIVÉE</Text>
              <KnownPlaceChips activeGeo={endResult} onSelect={selectKnownPlaceEnd} />
              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, { flex: 1, backgroundColor: colors.input, borderColor: endResult ? '#4CAF50' : colors.border, color: colors.foreground }]}
                  value={endAddress}
                  onChangeText={t => { setEndAddress(t); setEndResult(null); setEndSuggestions([]); setRoutes([]); }}
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
                  <Text style={[styles.suggestionText, { color: colors.foreground }]} numberOfLines={2}>{g.display_name}</Text>
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
            </View>

            {/* Route display */}
            {loadingRoutes ? (
              <View style={styles.routeLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.routeLoadingText, { color: colors.mutedForeground }]}>Calcul de l'itinéraire…</Text>
              </View>
            ) : routes.length > 0 && !hasIntermediates ? (
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
                {/* Per-leg breakdown for multi-point routes */}
                {selectedRoute.legs && selectedRoute.legs.length > 1 && (
                  <View style={styles.legBreakdown}>
                    <Text style={[styles.legBreakdownTitle, { color: colors.mutedForeground }]}>Détail des segments</Text>
                    {selectedRoute.legs.map((leg, i) => {
                      const labels = [
                        startResult?.display_name.split(',')[0] ?? 'Départ',
                        ...intermediates.map((w, j) => w.geo?.display_name.split(',')[0] ?? `Étape ${j + 1}`),
                        endResult?.display_name.split(',')[0] ?? 'Arrivée',
                      ];
                      return (
                        <View key={i} style={styles.legRow}>
                          <MaterialCommunityIcons name="arrow-right" size={12} color={colors.mutedForeground} />
                          <Text style={[styles.legLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {labels[i]} → {labels[i + 1]}
                          </Text>
                          <Text style={[styles.legValue, { color: colors.foreground }]}>
                            {fmtDist(leg.distance)} · {fmtDur(leg.duration)}
                          </Text>
                        </View>
                      );
                    })}
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
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1,
  },
  placeChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchBtn: { width: 44, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  suggestion: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 10, borderWidth: 1 },
  suggestionText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },

  confirmedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmedText: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },

  // Intermediate waypoints
  waypointSection: {
    borderWidth: 1, borderRadius: 14, borderStyle: 'dashed', padding: 12,
  },
  waypointHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waypointDot: {
    width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  waypointDotText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#121212' },
  removeWaypointBtn: { padding: 6, borderRadius: 20 },

  addWaypointBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 12,
  },
  addWaypointText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

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

  legBreakdown: { gap: 6, marginTop: 4, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ffffff20' },
  legBreakdownTitle: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legLabel: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular' },
  legValue: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  partGroupLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, textTransform: 'uppercase' },
  walkUnit: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 4 },
});
