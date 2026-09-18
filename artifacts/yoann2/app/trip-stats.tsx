import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import { SubPageHeader } from '@/components/SubPageHeader';
import type { FuelEntry } from '@/types/fuel';
import type { Trip, TripCategory, Vehicle } from '@/types/trips';
import { computeAutoCostPerKm, getEffectiveCostPerKm, type CostBreakdown } from '@/utils/costPerKm';
import { getFuelEntries } from '@/utils/fuelStorage';
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

function getMonthlyData(
  trips: Trip[],
  vehicles: Vehicle[],
  effectiveCostMap: Map<string, number>,
): MonthData[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const monthOffset = 5 - i;
    const start = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1).getTime();
    const end   = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 1).getTime();
    const slice = trips.filter(t => t.endTime >= start && t.endTime < end && t.vehicle && t.vehicle !== 'ignored');
    const car  = slice.filter(t => t.vehicle === 'car').reduce((s, t) => s + t.distanceKm, 0);
    const moto = slice.filter(t => t.vehicle === 'moto').reduce((s, t) => s + t.distanceKm, 0);
    // Use effective cost/km (auto or manual) for each trip's vehicle
    const cost = slice.reduce((s, t) => {
      const veh = vehicles.find(v => v.id === t.vehicle);
      const cpk = veh ? (effectiveCostMap.get(veh.id) ?? veh.costPerKm) : 0.15;
      return s + t.distanceKm * cpk;
    }, 0);
    return { label: shortMonth(start), car, moto, total: car + moto, cost };
  });
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

const BAR_H = Math.round(Dimensions.get('window').height * 0.135);

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
  const [effectiveCostMap, setEffectiveCostMap] = useState<Map<string, number>>(new Map());
  const [fuelBreakdownMap, setFuelBreakdownMap] = useState<Map<string, CostBreakdown>>(new Map());
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);

  useEffect(() => {
    getFuelEntries().then(setFuelEntries);
  }, []);

  useEffect(() => {
    Promise.all([getTrips(), getCategories(), getVehicleSettings()]).then(async ([t, c, v]) => {
      setTrips(t);
      setCategories(c);
      setVehicles(v);
      const [cpkEntries, breakdownEntries] = await Promise.all([
        Promise.all(v.map(async veh => [veh.id, await getEffectiveCostPerKm(veh)] as [string, number])),
        Promise.all(v.map(async veh => [veh.id, await computeAutoCostPerKm(veh)] as [string, CostBreakdown | null])),
      ]);
      setEffectiveCostMap(new Map(cpkEntries));
      const breakMap = new Map<string, CostBreakdown>();
      for (const [id, bd] of breakdownEntries) {
        if (bd) breakMap.set(id, bd);
      }
      setFuelBreakdownMap(breakMap);
    });
  }, []);

  const weeklyData  = useMemo(() => getWeeklyData(trips), [trips]);
  const monthlyData = useMemo(
    () => getMonthlyData(trips, vehicles, effectiveCostMap),
    [trips, vehicles, effectiveCostMap],
  );

  const maxWeeklyKm    = Math.max(...weeklyData.map(d => d.total), 1);
  const maxMonthlyKm   = Math.max(...monthlyData.map(d => d.total), 1);
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
      <SubPageHeader title="Statistiques" />

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

        {/* Effective cost/km per vehicle */}
        {vehicles.filter(v => v.id === 'car' || v.id === 'moto' || true).length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Coût / km effectif</Text>
            {vehicles.filter(v => v.type !== 'walk').map(v => {
              const cpk = effectiveCostMap.get(v.id) ?? v.costPerKm;
              const isAuto = v.costMode === 'auto';
              const vColor = v.type === 'moto' ? '#FF9800' : '#2196F3';
              return (
                <View key={v.id} style={styles.costRow}>
                  <MaterialCommunityIcons
                    name={v.type === 'moto' ? 'motorbike' : 'car'}
                    size={18}
                    color={vColor}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.costVehicleName, { color: colors.foreground }]}>{v.name}</Text>
                    <Text style={[styles.costModeTxt, { color: colors.mutedForeground }]}>
                      {isAuto ? 'Calcul auto (carburant + entretien)' : 'Valeur manuelle'}
                    </Text>
                  </View>
                  <View style={styles.costBadgeWrap}>
                    <View style={[styles.costModeBadge, {
                      backgroundColor: isAuto ? '#4CAF5018' : '#2196F318',
                      borderColor: isAuto ? '#4CAF5044' : '#2196F344',
                    }]}>
                      <Text style={[styles.costModeBadgeTxt, { color: isAuto ? '#4CAF50' : '#2196F3' }]}>
                        {isAuto ? 'AUTO' : 'MANUEL'}
                      </Text>
                    </View>
                    <Text style={[styles.costVal, { color: colors.foreground }]}>
                      {cpk.toFixed(3)} €/km
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* €/100km comparative */}
        {(() => {
          const vehsWithData = vehicles.filter(v => v.type !== 'walk' && fuelBreakdownMap.has(v.id));
          if (vehsWithData.length < 1) return null;
          const maxC100 = Math.max(...vehsWithData.map(v => fuelBreakdownMap.get(v.id)!.fuelCostPer100km), 1);
          const sorted = [...vehsWithData].sort((a, b) =>
            (fuelBreakdownMap.get(a.id)!.fuelCostPer100km) - (fuelBreakdownMap.get(b.id)!.fuelCostPer100km)
          );
          const cheapest = sorted[0];
          const mostExpensive = sorted[sorted.length - 1];
          const ratio = cheapest && mostExpensive && cheapest.id !== mostExpensive.id
            ? fuelBreakdownMap.get(mostExpensive.id)!.fuelCostPer100km / fuelBreakdownMap.get(cheapest.id)!.fuelCostPer100km
            : null;
          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Coût carburant / 100 km</Text>
              {vehsWithData.map(v => {
                const bd = fuelBreakdownMap.get(v.id)!;
                const vColor = v.type === 'moto' ? '#FF9800' : '#2196F3';
                const barPct = Math.max((bd.fuelCostPer100km / maxC100) * 100, 4);
                return (
                  <View key={v.id} style={styles.c100Row}>
                    <View style={styles.c100LabelCol}>
                      <View style={styles.c100NameRow}>
                        <MaterialCommunityIcons name={v.type === 'moto' ? 'motorbike' : 'car'} size={14} color={vColor} />
                        <Text style={[styles.c100Name, { color: colors.foreground }]}>{v.name}</Text>
                      </View>
                      <Text style={[styles.c100Sub, { color: colors.mutedForeground }]}>
                        {bd.kmInPeriod.toFixed(0)} km · {bd.fuelTotalEUR.toFixed(0)} €
                      </Text>
                    </View>
                    <View style={styles.c100BarCol}>
                      <View style={[styles.c100BarBg, { backgroundColor: colors.muted }]}>
                        <View style={[styles.c100BarFill, { width: `${barPct}%`, backgroundColor: vColor }]} />
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.c100Val, { color: vColor }]}>
                        {bd.fuelCostPer100km.toFixed(2)} €
                      </Text>
                      {bd.fuelLPer100km > 0 && (
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 }}>
                          {bd.fuelLPer100km.toFixed(1)} L/100
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
              {ratio !== null && ratio > 1.1 && cheapest && mostExpensive && (
                <View style={[styles.c100Tip, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.c100TipText, { color: colors.mutedForeground }]}>
                    Avec le même budget, le {cheapest.name} fait{' '}
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
                      {ratio.toFixed(1)}× plus de km
                    </Text>
                    {' '}que le {mostExpensive.name}
                  </Text>
                </View>
              )}
            </View>
          );
        })()}

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
            Basé sur le coût/km effectif de chaque véhicule
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

        {/* Consommation L/100km par véhicule */}
        {vehicles.length > 0 && fuelEntries.length > 0 && (() => {
          const rows = vehicles.map(v => {
            const vFuel = fuelEntries
              .filter(e => e.vehicleId === v.id && !e.isExternal)
              .sort((a, b) => a.timestamp - b.timestamp);
            const liters = vFuel.reduce((s, e) => s + e.liters, 0);
            const km = trips
              .filter(t => t.vehicle === v.id && t.vehicle !== 'ignored')
              .reduce((s, t) => s + t.distanceKm, 0);
            // Méthode des pleins : dernier intervalle consécutif avec km > 5
            let l100: number | null = null;
            for (let i = vFuel.length - 1; i >= 1; i--) {
              const fNew  = vFuel[i]!;
              const fPrev = vFuel[i - 1]!;
              const kmBetween = trips
                .filter(t => t.vehicle === v.id && t.startTime >= fPrev.timestamp && t.startTime < fNew.timestamp)
                .reduce((s, t) => s + t.distanceKm, 0);
              if (kmBetween > 5) { l100 = (fNew.liters / kmBetween) * 100; break; }
            }
            if (l100 === null && km > 0) l100 = (liters / km) * 100; // fallback 1 seul plein
            return { v, liters, km, l100 };
          }).filter(r => r.liters > 0);
          if (rows.length === 0) return null;
          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Consommation réelle</Text>
              {rows.map(({ v, liters, km, l100 }) => (
                <View key={v.id} style={styles.catRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.catName, { color: colors.foreground }]}>{v.name}</Text>
                    <Text style={[styles.catSub, { color: colors.mutedForeground }]}>
                      {liters.toFixed(1)} L · {km.toFixed(0)} km enregistrés
                    </Text>
                  </View>
                  <Text style={[styles.cardTitle, { color: '#FF9800' }]}>
                    {l100 !== null ? `${l100.toFixed(1)} L/100` : '—'}
                  </Text>
                </View>
              ))}
            </View>
          );
        })()}
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

  costRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  costVehicleName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  costModeTxt: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  costBadgeWrap: { alignItems: 'flex-end', gap: 4 },
  costModeBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  costModeBadgeTxt: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  costVal: { fontSize: 15, fontFamily: 'Inter_700Bold' },

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

  c100Row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  c100LabelCol: { width: 80 },
  c100NameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  c100Name: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  c100Sub: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 1 },
  c100BarCol: { flex: 1 },
  c100BarBg: { height: 10, borderRadius: 5, overflow: 'hidden' },
  c100BarFill: { height: '100%', borderRadius: 5 },
  c100Val: { fontSize: 14, fontFamily: 'Inter_700Bold', minWidth: 52, textAlign: 'right' },
  c100Tip: { borderRadius: 10, padding: 12, marginTop: 2 },
  c100TipText: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },

  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catName: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  catSub: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  catBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catBar: { width: 80, height: 6, borderRadius: 3, overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 3 },
  catCount: { fontSize: 13, fontFamily: 'Inter_700Bold', minWidth: 28, textAlign: 'right' },
});
