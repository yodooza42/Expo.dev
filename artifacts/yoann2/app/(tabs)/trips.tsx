import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import type { MaintenanceItem, Trip, VehicleSettings, VehicleType } from '@/types/trips';
import {
  computeOdometer,
  getTrips,
  getVehicleSettings,
  updateTrip,
} from '@/utils/tripStorage';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}`;
}

function fmtMonth(key: string): string {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface MonthStats {
  key: string;
  label: string;
  car: { km: number; cost: number; count: number };
  moto: { km: number; cost: number; count: number };
}

function computeStats(trips: Trip[], settings: VehicleSettings): MonthStats[] {
  const map = new Map<string, MonthStats>();
  for (const t of trips) {
    if (!t.vehicle || t.vehicle === 'ignored') continue;
    const mk = monthKey(t.startTime);
    if (!map.has(mk)) {
      map.set(mk, { key: mk, label: fmtMonth(mk), car: { km: 0, cost: 0, count: 0 }, moto: { km: 0, cost: 0, count: 0 } });
    }
    const e = map.get(mk)!;
    e[t.vehicle].km += t.distanceKm;
    e[t.vehicle].cost += t.distanceKm * settings[t.vehicle].costPerKm;
    e[t.vehicle].count += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

interface MaintenanceAlert {
  vehicle: 'car' | 'moto';
  item: MaintenanceItem;
  kmOver: number;
  odometer: number;
}

function getAlerts(trips: Trip[], settings: VehicleSettings): MaintenanceAlert[] {
  const alerts: MaintenanceAlert[] = [];
  for (const v of ['car', 'moto'] as const) {
    const cfg = settings[v];
    const odo = computeOdometer(trips, v, cfg.odometerBaseKm);
    for (const item of cfg.maintenanceItems) {
      const since = odo - item.lastResetKm;
      if (since >= item.intervalKm) {
        alerts.push({ vehicle: v, item, kmOver: Math.round(since - item.intervalKm), odometer: odo });
      }
    }
  }
  return alerts;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TripsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [settings, setSettings] = useState<VehicleSettings>({
    car: { costPerKm: 0.15, odometerBaseKm: 0, maintenanceItems: [] },
    moto: { costPerKm: 0.10, odometerBaseKm: 0, maintenanceItems: [] },
  });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [t, s] = await Promise.all([getTrips(), getVehicleSettings()]);
    setTrips(t.sort((a, b) => b.startTime - a.startTime));
    setSettings(s);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') load(); });
    return () => sub.remove();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const pending = trips.filter(t => t.vehicle === null);
  const monthStats = computeStats(trips, settings);
  const alerts = getAlerts(trips, settings);
  const carOdo = computeOdometer(trips, 'car', settings.car.odometerBaseKm);
  const motoOdo = computeOdometer(trips, 'moto', settings.moto.odometerBaseKm);

  const carColor = '#2196F3';
  const motoColor = '#FF9800';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Trajets & Km</Text>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/vehicle-settings' as any); }}
          hitSlop={12}
        >
          <MaterialCommunityIcons name="cog-outline" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Maintenance alerts ── */}
        {alerts.length > 0 && (
          <View style={styles.section}>
            {alerts.map(a => (
              <Pressable
                key={`${a.vehicle}-${a.item.id}`}
                onPress={() => router.push('/vehicle-settings' as any)}
                style={[styles.alertCard, { backgroundColor: '#FF980020', borderColor: '#FF9800' }]}
              >
                <MaterialCommunityIcons name="wrench-outline" size={18} color="#FF9800" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertTitle, { color: '#FF9800' }]}>
                    {a.item.name} — {a.vehicle === 'car' ? '🚗 Voiture' : '🏍 Moto'}
                  </Text>
                  <Text style={[styles.alertSub, { color: colors.mutedForeground }]}>
                    +{a.kmOver} km depuis le seuil · {a.odometer.toFixed(0)} km total
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#FF9800" />
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Pending tag banner ── */}
        {pending.length > 0 && (
          <View style={[styles.pendingBanner, { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}>
            <MaterialCommunityIcons name="tag-outline" size={18} color={colors.primary} />
            <Text style={[styles.pendingText, { color: colors.primary }]}>
              {pending.length} trajet{pending.length > 1 ? 's' : ''} à taguer
            </Text>
          </View>
        )}

        {/* ── Odometers ── */}
        <View style={styles.odoRow}>
          <View style={[styles.odoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="car" size={20} color={carColor} />
            <Text style={[styles.odoVal, { color: colors.foreground }]}>{carOdo.toFixed(0)}</Text>
            <Text style={[styles.odoLabel, { color: colors.mutedForeground }]}>km voiture</Text>
          </View>
          <View style={[styles.odoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="motorbike" size={20} color={motoColor} />
            <Text style={[styles.odoVal, { color: colors.foreground }]}>{motoOdo.toFixed(0)}</Text>
            <Text style={[styles.odoLabel, { color: colors.mutedForeground }]}>km moto</Text>
          </View>
        </View>

        {/* ── Monthly stats ── */}
        {monthStats.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Par mois</Text>
            {monthStats.map(m => (
              <View key={m.key} style={[styles.monthCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.monthLabel, { color: colors.foreground }]}>{m.label}</Text>
                <View style={styles.monthRows}>
                  {m.car.count > 0 && (
                    <View style={styles.monthRow}>
                      <MaterialCommunityIcons name="car" size={14} color={carColor} />
                      <Text style={[styles.monthVehicle, { color: colors.foreground }]}>
                        {m.car.km.toFixed(1)} km
                      </Text>
                      <Text style={[styles.monthCost, { color: colors.mutedForeground }]}>
                        {m.car.cost.toFixed(2)} €
                      </Text>
                      <Text style={[styles.monthCount, { color: colors.mutedForeground }]}>
                        {m.car.count} trajet{m.car.count > 1 ? 's' : ''}
                      </Text>
                    </View>
                  )}
                  {m.moto.count > 0 && (
                    <View style={styles.monthRow}>
                      <MaterialCommunityIcons name="motorbike" size={14} color={motoColor} />
                      <Text style={[styles.monthVehicle, { color: colors.foreground }]}>
                        {m.moto.km.toFixed(1)} km
                      </Text>
                      <Text style={[styles.monthCost, { color: colors.mutedForeground }]}>
                        {m.moto.cost.toFixed(2)} €
                      </Text>
                      <Text style={[styles.monthCount, { color: colors.mutedForeground }]}>
                        {m.moto.count} trajet{m.moto.count > 1 ? 's' : ''}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Trip list ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Trajets récents
          </Text>
          {trips.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="road-variant" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Aucun trajet enregistré
              </Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Les trajets sont détectés automatiquement à partir de 15 km/h. Assurez-vous que le tracking GPS est actif.
              </Text>
            </View>
          ) : (
            trips.map(trip => <TripRow key={trip.id} trip={trip} colors={colors} onUpdate={load} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ── TripRow ───────────────────────────────────────────────────────────────────

function TripRow({
  trip,
  colors,
  onUpdate,
}: {
  trip: Trip;
  colors: ReturnType<typeof useColors>;
  onUpdate: () => void;
}) {
  const carColor = '#2196F3';
  const motoColor = '#FF9800';
  const isPending = trip.vehicle === null;

  const vehicleIcon = trip.vehicle === 'car' ? 'car' :
    trip.vehicle === 'moto' ? 'motorbike' :
    trip.vehicle === 'ignored' ? 'close-circle-outline' : 'tag-outline';

  const vehicleColor = trip.vehicle === 'car' ? carColor :
    trip.vehicle === 'moto' ? motoColor :
    isPending ? colors.primary : colors.mutedForeground;

  async function retag(vehicle: VehicleType) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateTrip(trip.id, { vehicle });
    onUpdate();
  }

  return (
    <View style={[styles.tripCard, { backgroundColor: colors.card, borderColor: isPending ? colors.primary + '66' : colors.border }]}>
      <View style={styles.tripHeader}>
        <View style={[styles.tripIconWrap, { backgroundColor: vehicleColor + '22' }]}>
          <MaterialCommunityIcons name={vehicleIcon as any} size={16} color={vehicleColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.tripDate, { color: colors.foreground }]}>
            {fmtDate(trip.startTime)}
          </Text>
          <Text style={[styles.tripTime, { color: colors.mutedForeground }]}>
            {fmtTime(trip.startTime)} → {fmtTime(trip.endTime)}
          </Text>
        </View>
        <View style={styles.tripRight}>
          <Text style={[styles.tripDist, { color: colors.foreground }]}>
            {trip.distanceKm.toFixed(1)} km
          </Text>
          <Text style={[styles.tripDur, { color: colors.mutedForeground }]}>
            {fmtDuration(trip.endTime - trip.startTime)}
          </Text>
        </View>
      </View>

      {isPending && (
        <View style={styles.retagRow}>
          <Pressable
            onPress={() => retag('car')}
            style={[styles.retagBtn, { backgroundColor: carColor + '22', borderColor: carColor }]}
          >
            <MaterialCommunityIcons name="car" size={14} color={carColor} />
            <Text style={[styles.retagLabel, { color: carColor }]}>Voiture</Text>
          </Pressable>
          <Pressable
            onPress={() => retag('moto')}
            style={[styles.retagBtn, { backgroundColor: motoColor + '22', borderColor: motoColor }]}
          >
            <MaterialCommunityIcons name="motorbike" size={14} color={motoColor} />
            <Text style={[styles.retagLabel, { color: motoColor }]}>Moto</Text>
          </Pressable>
          <Pressable
            onPress={() => retag('ignored')}
            style={[styles.retagBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="close" size={14} color={colors.mutedForeground} />
            <Text style={[styles.retagLabel, { color: colors.mutedForeground }]}>Ignorer</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  scroll: { padding: 16, gap: 16 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  alertCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 14,
  },
  alertTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  alertSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 14,
  },
  pendingText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  odoRow: { flexDirection: 'row', gap: 12 },
  odoCard: {
    flex: 1, borderRadius: 14, borderWidth: 1, padding: 16,
    alignItems: 'center', gap: 4,
  },
  odoVal: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  odoLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
  monthCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  monthLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize' },
  monthRows: { gap: 6 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthVehicle: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  monthCost: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  monthCount: { fontSize: 11, fontFamily: 'Inter_400Regular', minWidth: 60, textAlign: 'right' },
  emptyCard: {
    borderRadius: 14, borderWidth: 1, padding: 32,
    alignItems: 'center', gap: 12,
  },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  tripCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  tripHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tripIconWrap: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tripDate: { fontSize: 13, fontFamily: 'Inter_500Medium', textTransform: 'capitalize' },
  tripTime: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  tripRight: { alignItems: 'flex-end', gap: 2 },
  tripDist: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  tripDur: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  retagRow: { flexDirection: 'row', gap: 8 },
  retagBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 8, borderWidth: 1, paddingVertical: 7 },
  retagLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});
