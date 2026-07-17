import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import type { Trip, TripCategory, Vehicle } from '@/types/trips';
import { getCategories } from '@/utils/tripCategories';
import { tripEvents } from '@/utils/tripEvents';
import { pH } from '@/styles/header';
import { getFuelEntries } from '@/utils/fuelStorage';
import type { FuelEntry } from '@/types/fuel';
import { computeOdometer, getTrips, getVehicleSettings } from '@/utils/tripStorage';
import { getKnownPlaces, getPlaceCategories } from '@/utils/placesStorage';
import type { KnownPlace, PlaceCategory } from '@/types/places';

// ── Vehicle images ────────────────────────────────────────────────────────────
const DOBLO_IMG = require('@/assets/images/doblo-main.png');
const MSX_IMG   = require('@/assets/images/msx-main.png');

interface VehicleCardProps {
  vehicle: Vehicle;
  odo: number;
  fillPct: number | null;
  remaining: number | null;
  isReserve: boolean;
  gaugeColor: string;
  hasData: boolean;
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
}

function TurnaroundCard({ vehicle, odo, fillPct, remaining, isReserve, gaugeColor, hasData, colors }: VehicleCardProps) {
  return (
    <View style={[trStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Image source={DOBLO_IMG} style={trStyles.carImg} resizeMode="contain" />
      <Text style={[trStyles.odoVal, { color: colors.foreground }]}>{odo.toFixed(0)}</Text>
      <Text style={[trStyles.odoLabel, { color: colors.mutedForeground }]}>KM {vehicle.name.toUpperCase()}</Text>
      {fillPct !== null && (
        <View style={trStyles.gaugeWrapper}>
          <View style={[trStyles.gaugeTrack, { backgroundColor: colors.muted }]}>
            <View style={[trStyles.gaugeFill, { width: `${fillPct * 100}%` as any, backgroundColor: gaugeColor }]} />
          </View>
          <Text style={[trStyles.gaugeLabel, { color: isReserve ? '#F44336' : colors.mutedForeground }]}>
            {isReserve ? '⚠ Réserve' : remaining !== null ? `~${remaining.toFixed(0)} km` : '—'}
          </Text>
        </View>
      )}
    </View>
  );
}

interface WalkCardProps {
  vehicle: Vehicle;
  km: number;
  count: number;
  lastTripParticipants: string[];
  dogLastWalk: { name: string; days: number | null }[];
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
}
function WalkCard({ vehicle, km, count, lastTripParticipants, dogLastWalk, colors }: WalkCardProps) {
  const walkColor = '#4CAF50';
  const participants = vehicle.walkParticipants ?? [];
  const lastNames = lastTripParticipants
    .map(id => participants.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const dogsWithData = dogLastWalk.filter(d => d.days !== null);

  return (
    <View style={[trStyles.walkFullCard, { backgroundColor: colors.card, borderColor: '#4CAF5040' }]}>
      <View style={[trStyles.walkIconBox, { backgroundColor: '#4CAF5018' }]}>
        <MaterialCommunityIcons name="walk" size={26} color={walkColor} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[trStyles.walkTitle, { color: colors.foreground }]}>{vehicle.name}</Text>
        <Text style={[trStyles.walkSub, { color: colors.mutedForeground }]}>
          {km.toFixed(1)} km ce mois · {count} sortie{count !== 1 ? 's' : ''}
        </Text>

        {/* Dernière balade par chien */}
        {dogsWithData.length > 0 && (
          <Text style={[trStyles.walkDogRow, { color: colors.mutedForeground }]} numberOfLines={1}>
            🐾{' '}
            {dogsWithData.map((d, i) => {
              const label = d.days === 0 ? 'auj.' : `${d.days}j`;
              const color = d.days! > 14 ? '#F44336' : d.days! > 7 ? '#FF9800' : walkColor;
              return (
                <Text key={i} style={{ color }}>
                  {i > 0 ? '  ·  ' : ''}{d.name} {label}
                </Text>
              );
            })}
          </Text>
        )}

      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={walkColor} />
    </View>
  );
}

const trStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 4,
  },
  carImg: { width: 140, height: 110 },
  odoVal: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  odoLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
  gaugeWrapper: { width: '100%', alignItems: 'center', gap: 4, marginTop: 4 },
  gaugeTrack: { width: '100%', height: 5, borderRadius: 3, overflow: 'hidden' },
  gaugeFill: { height: 5, borderRadius: 3 },
  gaugeLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  walkFullCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  walkIconBox: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  walkTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  walkSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  walkDogRow: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 3 },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function currentMonthLabel(): string {
  return new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function TripsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [settings, setSettings] = useState<Vehicle[]>([]);
  const [categories, setCategories] = useState<TripCategory[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [knownPlaces, setKnownPlaces] = useState<KnownPlace[]>([]);
  const [placeCategories, setPlaceCategories] = useState<PlaceCategory[]>([]);

  const load = useCallback(async () => {
    const [t, s, c, f, kp, pc] = await Promise.all([getTrips(), getVehicleSettings(), getCategories(), getFuelEntries(), getKnownPlaces(), getPlaceCategories()]);
    setTrips(t.sort((a, b) => b.startTime - a.startTime));
    setSettings(s);
    setCategories(c);
    setFuelEntries(f);
    setKnownPlaces(kp);
    setPlaceCategories(pc);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') load(); });
    return () => sub.remove();
  }, [load]);
  useEffect(() => { return tripEvents.onTripUpdated(load); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const mk = useMemo(currentMonthKey, []);

  const thisMonth = useMemo(() => {
    const vehicleMap = new Map(settings.map(v => [v.id, v]));
    return trips.reduce((acc, t) => {
      if (!t.vehicle || t.vehicle === 'ignored') return acc;
      const d = new Date(t.startTime);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (key !== mk) return acc;
      const veh = vehicleMap.get(t.vehicle);
      if (!veh) return acc;
      if (veh.type === 'walk') return acc;
      const b = veh.type === 'moto' ? 'moto' : 'car';
      acc[b].km += t.distanceKm;
      acc[b].cost += t.distanceKm * veh.costPerKm;
      acc[b].count += 1;
      return acc;
    }, {
      car: { km: 0, cost: 0, count: 0 },
      moto: { km: 0, cost: 0, count: 0 },
    });
  }, [trips, settings, mk]);

  const walkMonthData = useMemo(() => {
    const now = Date.now();
    return settings
      .filter(v => v.type === 'walk')
      .map(v => {
        const vehicleTrips = trips.filter(
          t => t.vehicle === v.id && (() => {
            const d = new Date(t.startTime);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === mk;
          })(),
        );
        const lastTrip = trips
          .filter(t => t.vehicle === v.id)
          .sort((a, b) => b.endTime - a.endTime)[0];
        const dogs = (v.walkParticipants ?? []).filter(p => p.type === 'dog');
        const dogLastWalk = dogs.map(dog => {
          const lastDogTrip = trips
            .filter(t => t.vehicle === v.id && (t.walkParticipants ?? []).includes(dog.id))
            .sort((a, b) => b.endTime - a.endTime)[0];
          const days = lastDogTrip ? Math.round((now - lastDogTrip.endTime) / 86_400_000) : null;
          return { name: dog.name, days };
        });
        return {
          vehicle: v,
          km: vehicleTrips.reduce((s, t) => s + t.distanceKm, 0),
          count: vehicleTrips.length,
          lastTripParticipants: lastTrip?.walkParticipants ?? [],
          dogLastWalk,
        };
      });
  }, [settings, trips, mk]);

  const alerts = useMemo(() => {
    const list: { vehicleName: string; itemName: string; type: 'km' | 'date'; over: number }[] = [];
    const now = Date.now();
    for (const v of settings) {
      const odo = computeOdometer(trips, v.id, v.odometerBaseKm, v.odometerAdjustments);
      for (const item of v.maintenanceItems) {
        if (item.intervalKm > 0) {
          const since = odo - item.lastResetKm;
          if (since >= item.intervalKm) {
            list.push({ vehicleName: v.name, itemName: item.name, type: 'km', over: Math.round(since - item.intervalKm) });
          }
        }
        if (item.intervalDays && item.lastResetDate) {
          const daysSince = (now - item.lastResetDate) / (24 * 3_600_000);
          if (daysSince >= item.intervalDays) {
            list.push({ vehicleName: v.name, itemName: item.name, type: 'date', over: Math.round(daysSince - item.intervalDays) });
          }
        }
      }
    }
    return list;
  }, [trips, settings]);

  // ── Rappels assurance (15 jours avant renouvellement) ─────────────────────
  const insuranceAlerts = useMemo(() => {
    const now = Date.now();
    return settings
      .filter(v => v.insurance?.paymentDate && v.insurance.annualCost > 0)
      .map(v => {
        const pay = new Date(v.insurance!.paymentDate);
        const renewal = new Date(pay);
        renewal.setFullYear(renewal.getFullYear() + 1);
        const daysUntil = Math.round((renewal.getTime() - now) / (24 * 3_600_000));
        return { vehicleName: v.name, daysUntil, renewalDate: renewal };
      })
      .filter(a => a.daysUntil <= 15);
  }, [settings]);

  const catIds = useMemo(() => new Set(categories.map(c => c.id)), [categories]);
  const activeCats = useMemo(() => categories.filter(c => trips.some(t => t.categoryId === c.id)), [categories, trips]);
  const uncategorized = useMemo(() => trips.filter(t => !t.categoryId || !catIds.has(t.categoryId)), [trips, catIds]);
  const pending = uncategorized.filter(t => t.vehicle === null);

  // ── Autonomie par véhicule ─────────────────────────────────────────────────
  // Algorithme :
  //  1. Consommation (L/100) = 100 × litres_du_plein / km_depuis_plein_précédent
  //     (on prend l'intervalle le plus récent avec km > 5)
  //  2. On propage les litres restants plein par plein (depuis le 1er, réservoir vide)
  //     → si on refait le plein avant d'être à sec, on additionne les litres restants
  //  3. fillPct = litres_restants_maintenant / litres_total_au_dernier_plein
  //  4. km_restants = litres_restants × 100 / conso
  const autonomieData = useMemo(() => {
    const result: Record<string, {
      kmSinceFillup: number;
      fillPct: number | null;
      remainingKm: number | null;
      hasData: boolean;
    }> = {};
    for (const v of settings) {
      const vFuel = fuelEntries
        .filter(e => e.vehicleId === v.id)
        .sort((a, b) => b.timestamp - a.timestamp); // plus récent en premier
      if (vFuel.length === 0) {
        result[v.id] = { kmSinceFillup: 0, fillPct: null, remainingKm: null, hasData: false };
        continue;
      }
      const lastFuel = vFuel[0]!;
      const kmSinceFillup = trips
        .filter(t => t.vehicle === v.id && t.startTime >= lastFuel.timestamp)
        .reduce((s, t) => s + t.distanceKm, 0);

      let fillPct: number | null = null;
      let remainingKm: number | null = null;

      if (vFuel.length >= 2) {
        // Pleins du plus ancien au plus récent
        const oldest = vFuel.slice().reverse();

        // Conso de référence = intervalle le plus récent avec km > 5
        let bestConso: number | null = null; // L/100km
        for (let i = oldest.length - 1; i >= 1; i--) {
          const fNew = oldest[i]!;
          const fPrev = oldest[i - 1]!;
          const kmBetween = trips
            .filter(t => t.vehicle === v.id && t.startTime >= fPrev.timestamp && t.startTime < fNew.timestamp)
            .reduce((s, t) => s + t.distanceKm, 0);
          if (kmBetween > 5) {
            bestConso = (100 * fNew.liters) / kmBetween;
            break;
          }
        }

        if (bestConso !== null && bestConso > 0) {
          // Propagation des litres : on part du 1er plein (réservoir vide supposé)
          let remLiters = oldest[0]!.liters;
          for (let i = 1; i < oldest.length; i++) {
            const fPrev = oldest[i - 1]!;
            const fCurr = oldest[i]!;
            const kmBetween = trips
              .filter(t => t.vehicle === v.id && t.startTime >= fPrev.timestamp && t.startTime < fCurr.timestamp)
              .reduce((s, t) => s + t.distanceKm, 0);
            remLiters = Math.max(0, remLiters - (kmBetween * bestConso) / 100) + fCurr.liters;
          }
          // remLiters = litres dans le réservoir juste après le dernier plein
          const totalAtFillup = remLiters;
          const remNow = Math.max(0, remLiters - (kmSinceFillup * bestConso) / 100);
          fillPct = totalAtFillup > 0 ? Math.min(1, remNow / totalAtFillup) : null;
          remainingKm = (remNow * 100) / bestConso;
        }
      }

      result[v.id] = { kmSinceFillup, fillPct, remainingKm, hasData: true };
    }
    return result;
  }, [fuelEntries, trips, settings]);

  // ── Maintenance à venir (75 – 100 % de l'intervalle) ──────────────────────
  const upcoming = useMemo(() => {
    const list: { vehicleName: string; itemName: string; type: 'km' | 'date'; remaining: number }[] = [];
    const now = Date.now();
    for (const v of settings) {
      const odo = computeOdometer(trips, v.id, v.odometerBaseKm, v.odometerAdjustments);
      for (const item of v.maintenanceItems) {
        if (item.intervalKm > 0) {
          const since = odo - item.lastResetKm;
          const pct = since / item.intervalKm;
          if (pct >= 0.75 && pct < 1) {
            list.push({ vehicleName: v.name, itemName: item.name, type: 'km', remaining: Math.round(item.intervalKm - since) });
          }
        }
        if (item.intervalDays && item.lastResetDate) {
          const daysSince = (now - item.lastResetDate) / (24 * 3_600_000);
          const pct = daysSince / item.intervalDays;
          if (pct >= 0.75 && pct < 1) {
            list.push({ vehicleName: v.name, itemName: item.name, type: 'date', remaining: Math.round(item.intervalDays - daysSince) });
          }
        }
      }
    }
    return list;
  }, [trips, settings]);

  const spotsBalades = useMemo(() => {
    const vehicleMap = new Map(settings.map(v => [v.id, v]));
    const spotsCat = placeCategories.find(c =>
      c.name.toLowerCase().replace(/\s+/g, '') === 'spotsbalades',
    );
    if (!spotsCat) return { km: 0, cost: 0, count: 0 };
    const spotsIds = new Set(knownPlaces.filter(p => p.categoryId === spotsCat.id).map(p => p.id));
    if (spotsIds.size === 0) return { km: 0, cost: 0, count: 0 };
    return trips.reduce((acc, t) => {
      if (!t.vehicle || t.vehicle === 'ignored') return acc;
      const d = new Date(t.startTime);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (key !== mk) return acc;
      const veh = vehicleMap.get(t.vehicle);
      if (!veh || veh.type === 'walk' || veh.type === 'other') return acc;
      const matchStart = t.startPlaceId && spotsIds.has(t.startPlaceId);
      const matchEnd   = t.endPlaceId   && spotsIds.has(t.endPlaceId);
      if (!matchStart && !matchEnd) return acc;
      acc.km    += t.distanceKm;
      acc.cost  += t.distanceKm * veh.costPerKm;
      acc.count += 1;
      return acc;
    }, { km: 0, cost: 0, count: 0 });
  }, [trips, settings, knownPlaces, placeCategories, mk]);

  const carColor = '#2196F3';
  const motoColor = '#FF9800';
  const walkColor = '#4CAF50';
  const monthLabel = currentMonthLabel();
  const hasMonthData = thisMonth.car.count > 0 || thisMonth.moto.count > 0 || spotsBalades.count > 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[pH.row, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={pH.btnGroup}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/trip-list' as any); }}
            hitSlop={8}
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="map-legend" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/known-places' as any); }}
            hitSlop={8}
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/navigate-to' as any); }}
            hitSlop={8}
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Image source={require('@/assets/icons/icon-nav.png')} style={{ width: 20, height: 20 }} />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/fuel-log' as any); }}
            hitSlop={8}
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="gas-station" size={18} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/trip-stats' as any); }}
            hitSlop={8}
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="chart-bar" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/map'); }}
            hitSlop={8}
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="map-outline" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/vehicle-settings' as any); }}
            hitSlop={8}
            style={[pH.btn, {
              backgroundColor: alerts.length > 0 ? '#FF980018' : colors.card,
              borderColor: alerts.length > 0 ? '#FF9800' : colors.border,
            }]}
          >
            <MaterialCommunityIcons name="wrench" size={18} color={alerts.length > 0 ? '#FF9800' : colors.mutedForeground} />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/player'); }}
            hitSlop={8}
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="music-note" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Odometers — véhicules motorisés ── */}
        {settings.filter(v => v.type !== 'other' && v.type !== 'walk').length > 0 && (
          <View style={styles.odoRow}>
            {settings.filter(v => v.type !== 'other' && v.type !== 'walk').map(v => {
              const odo = computeOdometer(trips, v.id, v.odometerBaseKm, v.odometerAdjustments);
              const auto = autonomieData[v.id];
              const hasRange = auto?.hasData && auto.fillPct !== null;
              const fillPct = auto?.fillPct ?? null;
              const remaining = hasRange && auto!.remainingKm !== null ? Math.round(auto!.remainingKm!) : null;
              const gaugeColor = fillPct == null ? colors.muted
                : fillPct > 0.5 ? '#4CAF50'
                : fillPct > 0.25 ? '#FF9800'
                : '#F44336';
              const isReserve = hasRange && (auto!.remainingKm ?? 1) <= 0;
              const goToMaintenance = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/vehicle-settings?vehicleId=${v.id}&tab=maintenance` as any); };
              if (v.type === 'car') {
                return (
                  <Pressable key={v.id} style={{ flex: 1 }} onPress={goToMaintenance}>
                    <TurnaroundCard
                      vehicle={v}
                      odo={odo}
                      fillPct={fillPct}
                      remaining={remaining}
                      isReserve={isReserve}
                      gaugeColor={gaugeColor}
                      hasData={auto?.hasData ?? false}
                      colors={colors}
                    />
                  </Pressable>
                );
              }
              return (
                <Pressable key={v.id} style={{ flex: 1 }} onPress={goToMaintenance}>
                  <View style={[trStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Image source={MSX_IMG} style={trStyles.carImg} resizeMode="contain" />
                    <Text style={[trStyles.odoVal, { color: colors.foreground }]}>{odo.toFixed(0)}</Text>
                    <Text style={[trStyles.odoLabel, { color: colors.mutedForeground }]}>KM {v.name.toUpperCase()}</Text>
                    {fillPct !== null && (
                      <View style={trStyles.gaugeWrapper}>
                        <View style={[trStyles.gaugeTrack, { backgroundColor: colors.muted }]}>
                          <View style={[trStyles.gaugeFill, { width: `${fillPct * 100}%` as any, backgroundColor: gaugeColor }]} />
                        </View>
                        <Text style={[trStyles.gaugeLabel, { color: isReserve ? '#F44336' : colors.mutedForeground }]}>
                          {isReserve ? '⚠ Réserve' : remaining !== null ? `~${remaining.toFixed(0)} km` : '—'}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Véhicule Balade — pleine largeur, en bas ── */}
        {walkMonthData.map(wData => (
          <Pressable
            key={wData.vehicle.id}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/vehicle-settings?vehicleId=${wData.vehicle.id}&tab=stats` as any); }}
          >
            <WalkCard
              vehicle={wData.vehicle}
              km={wData.km}
              count={wData.count}
              lastTripParticipants={wData.lastTripParticipants}
              dogLastWalk={wData.dogLastWalk}
              colors={colors}
            />
          </Pressable>
        ))}

        {/* ── Ce mois ── */}
        {hasMonthData && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Ce mois</Text>
            <View style={[styles.monthCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.monthLabel, { color: colors.foreground }]}>{monthLabel}</Text>
              <View style={styles.monthRows}>
                {thisMonth.car.count > 0 && (
                  <View style={styles.monthRow}>
                    <MaterialCommunityIcons name="car" size={14} color={carColor} />
                    <Text style={[styles.monthVehicle, { color: colors.foreground }]}>{thisMonth.car.km.toFixed(1)} km</Text>
                    <Text style={[styles.monthCost, { color: colors.mutedForeground }]}>{thisMonth.car.cost.toFixed(2)} €</Text>
                    <Text style={[styles.monthCount, { color: colors.mutedForeground }]}>{thisMonth.car.count} trajet{thisMonth.car.count > 1 ? 's' : ''}</Text>
                  </View>
                )}
                {thisMonth.moto.count > 0 && (
                  <View style={styles.monthRow}>
                    <MaterialCommunityIcons name="motorbike" size={14} color={motoColor} />
                    <Text style={[styles.monthVehicle, { color: colors.foreground }]}>{thisMonth.moto.km.toFixed(1)} km</Text>
                    <Text style={[styles.monthCost, { color: colors.mutedForeground }]}>{thisMonth.moto.cost.toFixed(2)} €</Text>
                    <Text style={[styles.monthCount, { color: colors.mutedForeground }]}>{thisMonth.moto.count} trajet{thisMonth.moto.count > 1 ? 's' : ''}</Text>
                  </View>
                )}
                {spotsBalades.count > 0 && (
                  <View style={styles.monthRow}>
                    <MaterialCommunityIcons name="walk" size={14} color={walkColor} />
                    <Text style={[styles.monthVehicle, { color: colors.foreground }]}>{spotsBalades.km.toFixed(1)} km</Text>
                    <Text style={[styles.monthCost, { color: colors.mutedForeground }]}>
                      {spotsBalades.cost > 0 ? `${spotsBalades.cost.toFixed(2)} €` : '—'}
                    </Text>
                    <Text style={[styles.monthCount, { color: colors.mutedForeground }]}>{spotsBalades.count} trajet{spotsBalades.count > 1 ? 's' : ''}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* ── Mes Trajets — lien vers la liste ── */}
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.push('/trip-list' as any); }}
          style={[styles.dashCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={[styles.dashCardIcon, { backgroundColor: colors.primary + '18' }]}>
            <MaterialCommunityIcons name="map-legend" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[styles.dashCardTitle, { color: colors.foreground }]}>Mes Trajets</Text>
            <Text style={[styles.dashCardSub, { color: colors.mutedForeground }]}>
              {activeCats.length} catégorie{activeCats.length !== 1 ? 's' : ''}
              {pending.length > 0 ? `  ·  ${pending.length} à taguer` : ''}
              {uncategorized.length > 0 && pending.length === 0 ? `  ·  ${uncategorized.length} non groupé${uncategorized.length > 1 ? 's' : ''}` : ''}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.mutedForeground} />
        </Pressable>

        {/* ── Rappels assurance ── */}
        {insuranceAlerts.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Assurance</Text>
            {insuranceAlerts.map((a, i) => (
              <Pressable
                key={`ins-${i}`}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/vehicle-settings' as any); }}
                style={[styles.alertCard, { backgroundColor: '#7C3AED18', borderColor: '#7C3AED' }]}
              >
                <MaterialCommunityIcons name="shield-car" size={18} color="#7C3AED" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertTitle, { color: '#7C3AED' }]}>Paiement assurance {a.vehicleName}</Text>
                  <Text style={[styles.alertSub, { color: colors.mutedForeground }]}>
                    {a.daysUntil <= 0
                      ? 'Échéance dépassée'
                      : `Dans ${a.daysUntil} jour${a.daysUntil > 1 ? 's' : ''} — ${a.renewalDate.toLocaleDateString('fr-FR')}`}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#7C3AED" />
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Maintenance ── */}
        {(alerts.length > 0 || upcoming.length > 0) ? (
          <View style={styles.section}>
            {alerts.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Entretien requis</Text>
                {alerts.map((a, i) => (
                  <Pressable
                    key={`alert-${i}`}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/vehicle-settings' as any); }}
                    style={[styles.alertCard, { backgroundColor: '#FF980018', borderColor: '#FF9800' }]}
                  >
                    <MaterialCommunityIcons name="wrench-outline" size={18} color="#FF9800" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alertTitle, { color: '#FF9800' }]}>{a.itemName} — {a.vehicleName}</Text>
                      <Text style={[styles.alertSub, { color: colors.mutedForeground }]}>
                        {a.type === 'date' ? `+${a.over} jour${a.over > 1 ? 's' : ''} depuis l'échéance` : `+${a.over} km depuis le seuil`}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color="#FF9800" />
                  </Pressable>
                ))}
              </>
            )}
            {upcoming.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: alerts.length > 0 ? 6 : 0 }]}>À venir</Text>
                {upcoming.map((u, i) => (
                  <Pressable
                    key={`upcoming-${i}`}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/vehicle-settings' as any); }}
                    style={[styles.alertCard, { backgroundColor: '#FFC10714', borderColor: '#FFC107' }]}
                  >
                    <MaterialCommunityIcons name="clock-outline" size={18} color="#FFC107" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alertTitle, { color: '#FFC107' }]}>{u.itemName} — {u.vehicleName}</Text>
                      <Text style={[styles.alertSub, { color: colors.mutedForeground }]}>
                        {u.type === 'date'
                          ? `Dans ${u.remaining} jour${u.remaining > 1 ? 's' : ''}`
                          : `Dans ~${u.remaining} km`}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color="#FFC107" />
                  </Pressable>
                ))}
              </>
            )}
          </View>
        ) : (
          <View style={[styles.okCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="check-circle-outline" size={18} color="#4CAF50" />
            <Text style={[styles.okText, { color: colors.mutedForeground }]}>Aucune alerte d'entretien</Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 16, gap: 16 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },

  odoRow: { flexDirection: 'row', gap: 12 },
  odoCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center', gap: 4 },
  odoVal: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  odoLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
  gaugeWrapper: { width: '100%', alignItems: 'center', gap: 4, marginTop: 4 },
  gaugeTrack: { width: '100%', height: 5, borderRadius: 3, overflow: 'hidden' },
  gaugeFill: { height: 5, borderRadius: 3 },
  gaugeLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },

  monthCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  monthLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize' },
  monthRows: { gap: 6 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthVehicle: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  monthCost: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  monthCount: { fontSize: 11, fontFamily: 'Inter_400Regular', minWidth: 60, textAlign: 'right' },

  dashCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  dashCardIcon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dashCardTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  dashCardSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 14 },
  alertTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  alertSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },

  okCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 14 },
  okText: { fontSize: 13, fontFamily: 'Inter_400Regular' },

});
