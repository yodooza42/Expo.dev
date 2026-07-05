import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
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
import { computeOdometer, getTrips, getVehicleSettings } from '@/utils/tripStorage';

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

  const load = useCallback(async () => {
    const [t, s, c] = await Promise.all([getTrips(), getVehicleSettings(), getCategories()]);
    setTrips(t.sort((a, b) => b.startTime - a.startTime));
    setSettings(s);
    setCategories(c);
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

  const alerts = useMemo(() => {
    const list: { vehicleName: string; itemName: string; type: 'km' | 'date'; over: number }[] = [];
    const now = Date.now();
    for (const v of settings) {
      const odo = computeOdometer(trips, v.id, v.odometerBaseKm);
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

  const catIds = useMemo(() => new Set(categories.map(c => c.id)), [categories]);
  const activeCats = useMemo(() => categories.filter(c => trips.some(t => t.categoryId === c.id)), [categories, trips]);
  const uncategorized = useMemo(() => trips.filter(t => !t.categoryId || !catIds.has(t.categoryId)), [trips, catIds]);
  const pending = uncategorized.filter(t => t.vehicle === null);

  const carColor = '#2196F3';
  const motoColor = '#FF9800';
  const monthLabel = currentMonthLabel();
  const hasMonthData = thisMonth.car.count > 0 || thisMonth.moto.count > 0;

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
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/nav-widget' as any); }}
            hitSlop={8}
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="widgets-outline" size={18} color={colors.mutedForeground} />
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
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Odometers ── */}
        {settings.filter(v => v.type !== 'other').length > 0 && (
          <View style={styles.odoRow}>
            {settings.filter(v => v.type !== 'other').map(v => {
              const odo = computeOdometer(trips, v.id, v.odometerBaseKm);
              const color = v.type === 'moto' ? motoColor : carColor;
              return (
                <View key={v.id} style={[styles.odoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name={v.type === 'moto' ? 'motorbike' : 'car'} size={20} color={color} />
                  <Text style={[styles.odoVal, { color: colors.foreground }]}>{odo.toFixed(0)}</Text>
                  <Text style={[styles.odoLabel, { color: colors.mutedForeground }]}>km {v.name}</Text>
                </View>
              );
            })}
          </View>
        )}

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

        {/* ── Maintenance ── */}
        {alerts.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Entretien requis</Text>
            {alerts.map((a, i) => (
              <Pressable
                key={i}
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
