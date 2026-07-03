import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import type { Trip, TripCategory, Vehicle } from '@/types/trips';
import { getCategories } from '@/utils/tripCategories';
import { getTrips, getVehicleSettings } from '@/utils/tripStorage';

// ── Data helpers ──────────────────────────────────────────────────────────────

function weekLabel(weeksAgo: number): string {
  if (weeksAgo === 0) return 'Sem.';
  return `S-${weeksAgo}`;
}

function shortMonth(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', { month: 'short' });
}

interface WeekData {
  label: string;
  car: number;
  moto: number;
  total: number;
}

interface MonthData {
  label: string;
  car: number;
  moto: number;
  total: number;
  cost: number;
}

function getWeeklyData(trips: Trip[]): WeekData[] {
  const now = Date.now();
  return Array.from({ length: 8 }, (_, i) => {
    const weeksAgo = 7 - i;
    const start = now - (weeksAgo + 1) * 7 * 24 * 3_600_000;
    const end   = now - weeksAgo * 7 * 24 * 3_600_000;
    const slice = trips.filter(t => t.endTime >= start && t.endTime < end && t.vehicle && t.vehicle !== 'ignored');
    const car  = slice.filter(t => t.vehicle === 'car').reduce((s, t) => s + t.distanceKm, 0);
    const moto = slice.filter(t => t.vehicle === 'moto').reduce((s, t) => s + t.distanceKm, 0);
    return { label: weekLabel(weeksAgo), car, moto, total: car + moto };
  });
}

function getMonthlyData(trips: Trip[], vehicles: Vehicle[]): MonthData[] {
  const costMap = new Map(vehicles.map(v => [v.id, v.costPerKm]));
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const monthOffset = 5 - i;
    const start = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1).getTime();
    const end   = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 1).getTime();
    const slice = trips.filter(t => t.endTime >= start && t.endTime < end && t.vehicle && t.vehicle !== 'ignored');
    const car  = slice.filter(t => t.vehicle === 'car').reduce((s, t) => s + t.distanceKm, 0);
    const moto = slice.filter(t => t.vehicle === 'moto').reduce((s, t) => s + t.distanceKm, 0);
    const cost = slice.reduce((s, t) => s + t.distanceKm * (costMap.get(t.vehicle ?? '') ?? 0.15), 0);
    return { label: shortMonth(start), car, moto, total: car + moto, cost };
  });
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

const BAR_H = 90;

function ChartBar({ car, moto, maxVal, label }: { car: number; moto: number; maxVal: number; label: string }) {
  const scale = maxVal > 0 ? BAR_H / maxVal : 0;
  const carH  = Math.max(car * scale, car > 0 ? 2 : 0);
  const motoH = Math.max(moto * scale, moto > 0 ? 2 : 0);
  return (
    <View style={styles.barWrap}>
      <View style={[styles.barStack, { height: BAR_H }]}>
        <View style={styles.barInner}>
          {moto > 0 && <View style={[styles.bar, { height: motoH, backgroundColor: '#FF9800' }]} />}
          {car > 0 && <View style={[styles.bar, { height: carH, backgroundColor: '#2196F3' }]} />}
        </View>
      </View>
      <Text style={styles.barLabel}>{label}</Text>
    </View>
  );
}

function CostBar({ cost, maxCost, label }: { cost: number; maxCost: number; label: string }) {
  const barH = Math.max(maxCost > 0 ? (cost / maxCost) * BAR_H : 0, cost > 0 ? 2 : 0);
  return (
    <View style={styles.barWrap}>
      <View style={[styles.barStack, { height: BAR_H }]}>
        <View style={styles.barInner}>
          <View style={[styles.bar, { height: barH, backgroundColor: '#FFC107' }]} />
        </View>
      </View>
      <Text style={styles.barLabel}>{label}</Text>
      {cost > 0 && <Text style={styles.barSub}>{cost.toFixed(0)}€</Text>}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TripStatsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [categories, setCategories] = useState<TripCategory[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    Promise.all([getTrips(), getCategories(), getVehicleSettings()]).then(([t, c, v]) => {
      setTrips(t);
      setCategories(c);
      setVehicles(v);
    });
  }, []);

  const weeklyData  = useMemo(() => getWeeklyData(trips), [trips]);
  const monthlyData = useMemo(() => getMonthlyData(trips, vehicles), [trips, vehicles]);

  const maxWeeklyKm  = Math.max(...weeklyData.map(d => d.total), 1);
  const maxMonthlyKm = Math.max(...monthlyData.map(d => d.total), 1);
  const maxMonthlyCost = Math.max(...monthlyData.map(d => d.cost), 1);

  const totalCar  = trips.filter(t => t.vehicle === 'car').reduce((s, t)  => s + t.distanceKm, 0);
  const totalMoto = trips.filter(t => t.vehicle === 'moto').reduce((s, t) => s + t.distanceKm, 0);
  const totalKm   = totalCar + totalMoto;

  // Top 5 categories by trip count
  const topCats = useMemo(() => {
    return categories
      .map(c => ({
        cat: c,
        count: trips.filter(t => t.categoryId === c.id).length,
        km: trips.filter(t => t.categoryId === c.id).reduce((s, t) => s + t.distanceKm, 0),
      }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [categories, trips]);

  const maxCatCount = Math.max(...topCats.map(x => x.count), 1);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Statistiques</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>

        {/* Total split */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Répartition totale</Text>
          <View style={styles.splitRow}>
            <View style={styles.splitItem}>
              <MaterialCommunityIcons name="car" size={22} color="#2196F3" />
              <Text style={[styles.splitVal, { color: colors.foreground }]}>{totalCar.toFixed(0)} km</Text>
              <Text style={[styles.splitPct, { color: colors.mutedForeground }]}>
                {totalKm > 0 ? ((totalCar / totalKm) * 100).toFixed(0) : 0}%
              </Text>
            </View>
            <View style={[styles.splitBar, { backgroundColor: colors.muted }]}>
              <View style={[styles.splitFill, { width: `${totalKm > 0 ? (totalCar / totalKm) * 100 : 50}%`, backgroundColor: '#2196F3' }]} />
            </View>
            <View style={styles.splitItem}>
              <MaterialCommunityIcons name="motorbike" size={22} color="#FF9800" />
              <Text style={[styles.splitVal, { color: colors.foreground }]}>{totalMoto.toFixed(0)} km</Text>
              <Text style={[styles.splitPct, { color: colors.mutedForeground }]}>
                {totalKm > 0 ? ((totalMoto / totalKm) * 100).toFixed(0) : 0}%
              </Text>
            </View>
          </View>
          <Text style={[styles.totalKmText, { color: colors.mutedForeground }]}>
            {totalKm.toFixed(0)} km au total · {trips.length} trajets
          </Text>
        </View>

        {/* Weekly km */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Km par semaine</Text>
          <View style={styles.chart}>
            {weeklyData.map((d, i) => (
              <ChartBar key={i} car={d.car} moto={d.moto} maxVal={maxWeeklyKm} label={d.label} />
            ))}
          </View>
          <View style={styles.legend}>
            <LegendDot color="#2196F3" label="Voiture" />
            <LegendDot color="#FF9800" label="Moto" />
          </View>
        </View>

        {/* Monthly km */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Km par mois</Text>
          <View style={styles.chart}>
            {monthlyData.map((d, i) => (
              <ChartBar key={i} car={d.car} moto={d.moto} maxVal={maxMonthlyKm} label={d.label} />
            ))}
          </View>
        </View>

        {/* Monthly cost */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Coût estimé / mois</Text>
          <View style={styles.chart}>
            {monthlyData.map((d, i) => (
              <CostBar key={i} cost={d.cost} maxCost={maxMonthlyCost} label={d.label} />
            ))}
          </View>
          <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
            Basé sur le coût/km configuré (voiture + moto)
          </Text>
        </View>

        {/* Top categories */}
        {topCats.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Top catégories</Text>
            {topCats.map(({ cat, count, km }) => (
              <View key={cat.id} style={styles.catRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.catName, { color: colors.foreground }]}>{cat.name}</Text>
                  <Text style={[styles.catSub, { color: colors.mutedForeground }]}>
                    {km.toFixed(0)} km · ~{km > 0 ? (km / count).toFixed(1) : 0} km/trajet
                  </Text>
                </View>
                <View style={styles.catBarWrap}>
                  <View style={[styles.catBar, { backgroundColor: colors.muted }]}>
                    <View style={[styles.catBarFill, { width: `${(count / maxCatCount) * 100}%`, backgroundColor: '#FFC107' }]} />
                  </View>
                  <Text style={[styles.catCount, { color: colors.primary }]}>{count}×</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  scroll: { padding: 16, gap: 14 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  cardTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  hintText: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  splitItem: { alignItems: 'center', gap: 4 },
  splitVal: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  splitPct: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  splitBar: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  splitFill: { height: '100%', borderRadius: 4 },
  totalKmText: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  barWrap: { flex: 1, alignItems: 'center', gap: 3 },
  barStack: { width: '100%', justifyContent: 'flex-end' },
  barInner: { flexDirection: 'column', gap: 1, alignItems: 'stretch' },
  bar: { borderRadius: 2, width: '100%' },
  barLabel: { fontSize: 8, color: '#777', fontFamily: 'Inter_400Regular', textAlign: 'center' },
  barSub: { fontSize: 7, color: '#555', fontFamily: 'Inter_400Regular', textAlign: 'center' },

  legend: { flexDirection: 'row', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendLabel: { fontSize: 11, color: '#777', fontFamily: 'Inter_400Regular' },

  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catName: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  catSub: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  catBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catBar: { width: 80, height: 6, borderRadius: 3, overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 3 },
  catCount: { fontSize: 13, fontFamily: 'Inter_700Bold', minWidth: 28, textAlign: 'right' },
});
