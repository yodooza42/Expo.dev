import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
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
import type { Vehicle } from '@/types/trips';
import { getVehicleSettings, saveTrip } from '@/utils/tripStorage';

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

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');

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
    getVehicleSettings().then(v => {
      setVehicles(v);
      if (v.length > 0) setSelectedVehicleId(v[0]!.id);
    });
  }, []);

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

  async function handleSave() {
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
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);

    setSaving(true);
    try {
      await saveTrip({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        startTime: dateMs,
        endTime: dateMs + durationMs,
        distanceKm,
        vehicle: vehicle?.type === 'moto' ? 'moto' : vehicle?.type === 'car' ? 'car' : 'car',
        pointCount: 2,
        startLat: parseFloat(startResult.lat),
        startLon: parseFloat(startResult.lon),
        endLat: parseFloat(endResult.lat),
        endLon: parseFloat(endResult.lon),
        source: 'manual',
      });
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
  const canSave = !!startResult && !!endResult && routes.length > 0 && !!selectedVehicleId;

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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Trajet manuel</Text>
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
              const c = v.type === 'moto' ? '#FF9800' : '#2196F3';
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
                    name={v.type === 'moto' ? 'motorbike' : 'car'}
                    size={16}
                    color={active ? c : colors.mutedForeground}
                  />
                  <Text style={[styles.vehicleChipText, { color: active ? c : colors.mutedForeground }]}>{v.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Start address */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>DÉPART</Text>
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
        </View>

        {/* End address */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>ARRIVÉE</Text>
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
        </View>

        {/* Routes */}
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

        {/* Summary card */}
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
                <MaterialCommunityIcons name={selectedVehicle.type === 'moto' ? 'motorbike' : 'car'} size={16} color={colors.primary} />
                <Text style={[styles.summaryVal, { color: colors.foreground }]}>
                  {selectedVehicle.name} · {((selectedRoute.distance / 1000) * selectedVehicle.costPerKm).toFixed(2)} €
                </Text>
              </View>
            )}
          </View>
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
});
