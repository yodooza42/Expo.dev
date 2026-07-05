import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppState,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import type { MaintenanceItem, Trip, TripCategory, Vehicle, VehicleType } from '@/types/trips';
import { fmtHHMM, fmtWeekdayShort } from '@/utils/date';
import {
  createCategoryAndGroupSimilar,
  deleteCategoryAndUnlink,
  getCategories,
  renameCategory,
  tripIsReturnOf,
  tripMatchesCategory,
} from '@/utils/tripCategories';
import { tripEvents } from '@/utils/tripEvents';
import { pH } from '@/styles/header';
import {
  computeOdometer,
  deleteTrip,
  getTrips,
  getVehicleSettings,
  updateTrip,
} from '@/utils/tripStorage';

// ── Format helpers ────────────────────────────────────────────────────────────
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

// ── Stats helpers ─────────────────────────────────────────────────────────────

interface MonthStats {
  key: string;
  label: string;
  car: { km: number; cost: number; count: number };
  moto: { km: number; cost: number; count: number };
}

function computeMonthStats(trips: Trip[], vehicles: Vehicle[]): MonthStats[] {
  const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
  const map = new Map<string, MonthStats>();
  for (const t of trips) {
    if (!t.vehicle || t.vehicle === 'ignored') continue;
    const veh = vehicleMap.get(t.vehicle);
    if (!veh) continue;
    const mk = monthKey(t.startTime);
    if (!map.has(mk)) {
      map.set(mk, { key: mk, label: fmtMonth(mk), car: { km: 0, cost: 0, count: 0 }, moto: { km: 0, cost: 0, count: 0 } });
    }
    const e = map.get(mk)!;
    const bucket = veh.type === 'moto' ? 'moto' : 'car';
    e[bucket].km += t.distanceKm;
    e[bucket].cost += t.distanceKm * veh.costPerKm;
    e[bucket].count += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

interface MaintenanceAlert {
  vehicleId: string;
  vehicleName: string;
  vehicleType: 'car' | 'moto' | 'other';
  item: MaintenanceItem;
  kmOver: number;
  odometer: number;
  type: 'km' | 'date';
  daysOver?: number;
}

function getAlerts(trips: Trip[], vehicles: Vehicle[]): MaintenanceAlert[] {
  const alerts: MaintenanceAlert[] = [];
  const now = Date.now();
  for (const v of vehicles) {
    const odo = computeOdometer(trips, v.id, v.odometerBaseKm);
    for (const item of v.maintenanceItems) {
      if (item.intervalKm > 0) {
        const since = odo - item.lastResetKm;
        if (since >= item.intervalKm) {
          alerts.push({ vehicleId: v.id, vehicleName: v.name, vehicleType: v.type, item, kmOver: Math.round(since - item.intervalKm), odometer: odo, type: 'km' });
        }
      }
      if (item.intervalDays && item.lastResetDate) {
        const daysSince = (now - item.lastResetDate) / (24 * 3_600_000);
        if (daysSince >= item.intervalDays) {
          alerts.push({ vehicleId: v.id, vehicleName: v.name, vehicleType: v.type, item, kmOver: 0, odometer: odo, type: 'date', daysOver: Math.round(daysSince - item.intervalDays) });
        }
      }
    }
  }
  return alerts;
}

interface CategoryStats {
  total: number;
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
  avgKm: number;
  avgDurationMs: number;
  trips: Trip[];
}

function computeCategoryStats(catId: string, trips: Trip[]): CategoryStats {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3_600_000;
  const d = new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const yearStart = new Date(d.getFullYear(), 0, 1).getTime();

  const catTrips = trips
    .filter(t => t.categoryId === catId)
    .sort((a, b) => b.startTime - a.startTime);
  const total = catTrips.length;
  const thisWeek = catTrips.filter(t => t.endTime >= weekAgo).length;
  const thisMonth = catTrips.filter(t => t.endTime >= monthStart).length;
  const thisYear = catTrips.filter(t => t.endTime >= yearStart).length;
  const avgKm = total ? catTrips.reduce((s, t) => s + t.distanceKm, 0) / total : 0;
  const avgDurationMs = total
    ? catTrips.reduce((s, t) => s + (t.endTime - t.startTime), 0) / total
    : 0;
  return { total, thisWeek, thisMonth, thisYear, avgKm, avgDurationMs, trips: catTrips };
}

// ── GroupModal ────────────────────────────────────────────────────────────────

function GroupModal({
  visible,
  trip,
  categories,
  colors,
  onClose,
  onCreate,
  onAssign,
}: {
  visible: boolean;
  trip: Trip | null;
  categories: TripCategory[];
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onCreate: (name: string) => void;
  onAssign: (catId: string, isReturn: boolean) => void;
}) {
  const [name, setName] = useState('');
  const insets = useSafeAreaInsets();

  const forwardMatches = useMemo(() => {
    if (!trip) return [];
    return categories.filter(c => tripMatchesCategory(trip, c));
  }, [trip, categories]);

  const returnMatches = useMemo(() => {
    if (!trip) return [];
    return categories.filter(c => !tripMatchesCategory(trip, c) && tripIsReturnOf(trip, c));
  }, [trip, categories]);

  const hasMatches = forwardMatches.length > 0 || returnMatches.length > 0;

  function handleCreate() {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName('');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Grouper ce trajet</Text>

          {hasMatches && (
            <>
              <Text style={[styles.sheetSub, { color: colors.mutedForeground }]}>
                Catégories similaires existantes :
              </Text>
              {forwardMatches.map(c => (
                <Pressable
                  key={c.id}
                  onPress={() => { onAssign(c.id, false); setName(''); }}
                  style={[styles.matchBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
                >
                  <MaterialCommunityIcons name="folder-outline" size={16} color={colors.primary} />
                  <Text style={[styles.matchBtnText, { color: colors.foreground }]}>{c.name}</Text>
                  <Text style={[styles.matchBtnBadge, { color: colors.primary }]}>→</Text>
                </Pressable>
              ))}
              {returnMatches.map(c => (
                <Pressable
                  key={c.id}
                  onPress={() => { onAssign(c.id, true); setName(''); }}
                  style={[styles.matchBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
                >
                  <MaterialCommunityIcons name="folder-outline" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.matchBtnText, { color: colors.foreground }]}>{c.name}</Text>
                  <Text style={[styles.matchBtnBadge, { color: colors.mutedForeground }]}>← Retour</Text>
                </Pressable>
              ))}
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>ou créer</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>
            </>
          )}

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nom (ex: Maison → Travail)"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.nameInput, {
              color: colors.foreground,
              borderColor: colors.border,
              backgroundColor: colors.background,
            }]}
            autoFocus={!hasMatches}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />

          <View style={styles.sheetActions}>
            <Pressable
              onPress={() => { onClose(); setName(''); }}
              style={[styles.sheetBtn, { backgroundColor: colors.muted }]}
            >
              <Text style={[styles.sheetBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
            </Pressable>
            <Pressable
              onPress={handleCreate}
              disabled={!name.trim()}
              style={[styles.sheetBtn, { backgroundColor: colors.primary, opacity: name.trim() ? 1 : 0.4 }]}
            >
              <Text style={[styles.sheetBtnText, { color: '#000' }]}>Créer</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── RenameModal ───────────────────────────────────────────────────────────────

function RenameModal({
  visible,
  category,
  colors,
  onClose,
  onRename,
}: {
  visible: boolean;
  category: TripCategory | null;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const insets = useSafeAreaInsets();
  useEffect(() => { if (category) setName(category.name); }, [category]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Renommer la catégorie</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={[styles.nameInput, {
              color: colors.foreground,
              borderColor: colors.border,
              backgroundColor: colors.background,
            }]}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => { if (name.trim()) { onRename(name.trim()); } }}
          />
          <View style={styles.sheetActions}>
            <Pressable onPress={onClose} style={[styles.sheetBtn, { backgroundColor: colors.muted }]}>
              <Text style={[styles.sheetBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
            </Pressable>
            <Pressable
              onPress={() => { if (name.trim()) onRename(name.trim()); }}
              disabled={!name.trim()}
              style={[styles.sheetBtn, { backgroundColor: colors.primary, opacity: name.trim() ? 1 : 0.4 }]}
            >
              <Text style={[styles.sheetBtnText, { color: '#000' }]}>OK</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── CategoryCard ──────────────────────────────────────────────────────────────

function CategoryCard({
  category,
  allTrips,
  colors,
  onUpdate,
  onDelete,
  onRename,
}: {
  category: TripCategory;
  allTrips: Trip[];
  colors: ReturnType<typeof useColors>;
  onUpdate: () => void;
  onDelete: () => void;
  onRename: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const stats = computeCategoryStats(category.id, allTrips);

  const carCount = stats.trips.filter(t => t.vehicle === 'car').length;
  const motoCount = stats.trips.filter(t => t.vehicle === 'moto').length;
  const returnCount = stats.trips.filter(t => t.isReturn).length;
  const forwardCount = stats.total - returnCount;
  const lastDurDiffMin = stats.total >= 2 && stats.trips.length > 0
    ? Math.round(((stats.trips[0].endTime - stats.trips[0].startTime) - stats.avgDurationMs) / 60_000)
    : 0;
  const showSpeedChip = stats.total >= 2 && Math.abs(lastDurDiffMin) >= 1;

  return (
    <View style={[styles.catCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header */}
      <Pressable onPress={() => setExpanded(e => !e)} style={styles.catHeader}>
        <View style={[styles.catBadge, { backgroundColor: colors.primary + '22' }]}>
          <Text style={[styles.catBadgeText, { color: colors.primary }]}>{stats.total}</Text>
        </View>
        <Text style={[styles.catName, { color: colors.foreground }]} numberOfLines={1}>
          {category.name}
        </Text>
        <Pressable onPress={onRename} hitSlop={10}>
          <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.mutedForeground} />
        </Pressable>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18} color={colors.mutedForeground}
        />
      </Pressable>

      {/* Freq counters */}
      <View style={styles.catStats}>
        {stats.thisWeek > 0 && (
          <View style={[styles.chip, { backgroundColor: colors.primary + '18' }]}>
            <Text style={[styles.chipText, { color: colors.primary }]}>{stats.thisWeek}× sem.</Text>
          </View>
        )}
        {stats.thisMonth > 0 && (
          <View style={[styles.chip, { backgroundColor: colors.muted }]}>
            <Text style={[styles.chipText, { color: colors.foreground }]}>{stats.thisMonth}× mois</Text>
          </View>
        )}
        {stats.thisYear > 0 && (
          <View style={[styles.chip, { backgroundColor: colors.muted }]}>
            <Text style={[styles.chipText, { color: colors.foreground }]}>{stats.thisYear}× an</Text>
          </View>
        )}
        <Text style={[styles.catMeta, { color: colors.mutedForeground }]}>
          ~{stats.avgKm.toFixed(1)} km · {fmtDuration(stats.avgDurationMs)} moy.
        </Text>
        {showSpeedChip && (
          <View style={[styles.chip, { backgroundColor: lastDurDiffMin < 0 ? '#4CAF5018' : '#FF980018' }]}>
            <Text style={[styles.chipText, { color: lastDurDiffMin < 0 ? '#4CAF50' : '#FF9800' }]}>
              {lastDurDiffMin > 0 ? '+' : ''}{lastDurDiffMin} min vs moy{lastDurDiffMin <= -5 ? ' 🔥' : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Vehicle breakdown */}
      {(carCount > 0 || motoCount > 0) && (
        <View style={styles.catVehicles}>
          {carCount > 0 && (
            <View style={styles.catVehItem}>
              <MaterialCommunityIcons name="car" size={11} color="#2196F3" />
              <Text style={[styles.catVehText, { color: colors.mutedForeground }]}>{carCount}</Text>
            </View>
          )}
          {motoCount > 0 && (
            <View style={styles.catVehItem}>
              <MaterialCommunityIcons name="motorbike" size={11} color="#FF9800" />
              <Text style={[styles.catVehText, { color: colors.mutedForeground }]}>{motoCount}</Text>
            </View>
          )}
          {returnCount > 0 && forwardCount > 0 && (
            <Text style={[styles.catReturnText, { color: colors.mutedForeground }]}>
              · {forwardCount}→ {returnCount}←
            </Text>
          )}
        </View>
      )}

      {/* Expanded individual trips */}
      {expanded && (
        <View style={styles.catTrips}>
          {stats.trips.map(t => (
            <TripRow key={t.id} trip={t} colors={colors} onUpdate={onUpdate} compact />
          ))}
          <Pressable
            onPress={onDelete}
            style={[styles.deleteCatBtn, { borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.deleteCatText, { color: colors.mutedForeground }]}>
              Supprimer la catégorie
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── TripRow ───────────────────────────────────────────────────────────────────

function TripRow({
  trip,
  colors,
  onUpdate,
  compact,
  onGroup,
  onDelete,
}: {
  trip: Trip;
  colors: ReturnType<typeof useColors>;
  onUpdate: () => void;
  compact?: boolean;
  onGroup?: (t: Trip) => void;
  onDelete?: () => void;
}) {
  const router = useRouter();
  const carColor = '#2196F3';
  const motoColor = '#FF9800';
  const isPending = trip.vehicle === null;

  const vehicleIcon =
    trip.vehicle === 'car' ? 'car' :
    trip.vehicle === 'moto' ? 'motorbike' :
    trip.vehicle === 'ignored' ? 'close-circle-outline' : 'tag-outline';

  const vehicleColor =
    trip.vehicle === 'car' ? carColor :
    trip.vehicle === 'moto' ? motoColor :
    isPending ? colors.primary : colors.mutedForeground;

  async function retag(vehicle: VehicleType) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateTrip(trip.id, { vehicle });
    onUpdate();
    // After tagging a real vehicle, auto-open category picker if not yet grouped
    if (vehicle !== 'ignored' && !trip.categoryId && onGroup) {
      onGroup(trip);
    }
  }

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/trip-map', params: { id: trip.id } } as any); }}
      style={[
        styles.tripCard,
        { backgroundColor: colors.card, borderColor: isPending && !compact ? colors.primary + '66' : colors.border },
        compact && styles.tripCardCompact,
      ]}
    >
      <View style={styles.tripHeader}>
        <View style={[styles.tripIconWrap, { backgroundColor: vehicleColor + '22' }]}>
          <MaterialCommunityIcons name={vehicleIcon as any} size={16} color={vehicleColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.tripDate, { color: colors.foreground }]}>
            {fmtWeekdayShort(trip.startTime)}
          </Text>
          <Text style={[styles.tripTime, { color: colors.mutedForeground }]}>
            {fmtHHMM(trip.startTime)} → {fmtHHMM(trip.endTime)}
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
        {!compact && onDelete && (
          <Pressable
            onPress={() => Alert.alert(
              'Supprimer ce trajet ?',
              `${trip.distanceKm.toFixed(1)} km · ${fmtWeekdayShort(trip.startTime)}`,
              [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer', style: 'destructive',
                  onPress: async () => { await deleteTrip(trip.id); onDelete(); } },
              ]
            )}
            hitSlop={8}
            style={styles.tripDeleteBtn}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {(trip.startAddress || trip.endAddress) && !compact && (
        <View style={styles.tripAddrRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={11} color={colors.mutedForeground} />
          <Text style={[styles.tripAddr, { color: colors.mutedForeground }]} numberOfLines={1}>
            {trip.startAddress ?? '…'} → {trip.endAddress ?? '…'}
          </Text>
        </View>
      )}

      {isPending && !compact && (
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

      {!compact && onGroup && !trip.categoryId && (
        <Pressable
          onPress={() => { Haptics.selectionAsync(); onGroup(trip); }}
          style={[styles.groupBtn, { borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="folder-plus-outline" size={13} color={colors.mutedForeground} />
          <Text style={[styles.groupBtnText, { color: colors.mutedForeground }]}>Grouper</Text>
        </Pressable>
      )}

    </Pressable>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TripsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [categories, setCategories] = useState<TripCategory[]>([]);
  const [settings, setSettings] = useState<Vehicle[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [groupingTrip, setGroupingTrip] = useState<Trip | null>(null);
  const [renameTarget, setRenameTarget] = useState<TripCategory | null>(null);

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
  useEffect(() => {
    return tripEvents.onTripUpdated(load);
  }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleGroupCreate(name: string) {
    if (!groupingTrip) return;
    setGroupingTrip(null);
    await createCategoryAndGroupSimilar(name, groupingTrip);
    await load();
  }

  async function handleGroupAssign(catId: string, isReturn: boolean) {
    if (!groupingTrip) return;
    setGroupingTrip(null);
    await updateTrip(groupingTrip.id, { categoryId: catId, isReturn });
    await load();
  }

  async function handleDeleteCategory(catId: string) {
    Alert.alert(
      'Supprimer la catégorie',
      'Les trajets ne seront pas supprimés, seulement dissociés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            await deleteCategoryAndUnlink(catId);
            await load();
          },
        },
      ],
    );
  }

  async function handleRenameCategory(catId: string, name: string) {
    setRenameTarget(null);
    await renameCategory(catId, name);
    await load();
  }

  async function handleDeleteTrip(id: string) {
    await deleteTrip(id);
    await load();
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const catIds = useMemo(() => new Set(categories.map(c => c.id)), [categories]);

  const activeCats = useMemo(
    () => categories.filter(c => trips.some(t => t.categoryId === c.id)),
    [categories, trips],
  );

  const uncategorized = useMemo(
    () => trips.filter(t => !t.categoryId || !catIds.has(t.categoryId)),
    [trips, catIds],
  );

  const pending = uncategorized.filter(t => t.vehicle === null);
  const monthStats = useMemo(() => computeMonthStats(trips, settings), [trips, settings]);
  const alerts = useMemo(() => getAlerts(trips, settings), [trips, settings]);
  const carColor = '#2196F3';
  const motoColor = '#FF9800';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <GroupModal
        visible={groupingTrip !== null}
        trip={groupingTrip}
        categories={categories}
        colors={colors}
        onClose={() => setGroupingTrip(null)}
        onCreate={handleGroupCreate}
        onAssign={handleGroupAssign}
      />
      <RenameModal
        visible={renameTarget !== null}
        category={renameTarget}
        colors={colors}
        onClose={() => setRenameTarget(null)}
        onRename={name => renameTarget && handleRenameCategory(renameTarget.id, name)}
      />

      {/* Header */}
      <View style={[pH.row, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={pH.btnGroup}>
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
            style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="wrench" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Maintenance alerts */}
        {alerts.length > 0 && (
          <View style={styles.section}>
            {alerts.map(a => (
              <Pressable
                key={`${a.vehicleId}-${a.item.id}`}
                onPress={() => router.push('/vehicle-settings' as any)}
                style={[styles.alertCard, { backgroundColor: '#FF980020', borderColor: '#FF9800' }]}
              >
                <MaterialCommunityIcons name="wrench-outline" size={18} color="#FF9800" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertTitle, { color: '#FF9800' }]}>
                    {a.item.name} — {a.vehicleType === 'moto' ? '🏍' : '🚗'} {a.vehicleName}
                  </Text>
                  <Text style={[styles.alertSub, { color: colors.mutedForeground }]}>
                    {a.type === 'date'
                      ? `+${a.daysOver} jour${(a.daysOver ?? 0) > 1 ? 's' : ''} depuis l'échéance`
                      : `+${a.kmOver} km depuis le seuil · ${a.odometer.toFixed(0)} km total`}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#FF9800" />
              </Pressable>
            ))}
          </View>
        )}

        {/* Pending banner */}
        {pending.length > 0 && (
          <View style={[styles.pendingBanner, { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}>
            <MaterialCommunityIcons name="tag-outline" size={18} color={colors.primary} />
            <Text style={[styles.pendingText, { color: colors.primary }]}>
              {pending.length} trajet{pending.length > 1 ? 's' : ''} à taguer
            </Text>
          </View>
        )}

        {/* Odometers — dynamic per vehicle */}
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

        {/* ── Categories ── */}
        {activeCats.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Catégories</Text>
            {activeCats.map(cat => (
              <CategoryCard
                key={cat.id}
                category={cat}
                allTrips={trips}
                colors={colors}
                onUpdate={load}
                onDelete={() => handleDeleteCategory(cat.id)}
                onRename={() => setRenameTarget(cat)}
              />
            ))}
          </View>
        )}

        {/* ── Monthly stats (all trips) ── */}
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
                      <Text style={[styles.monthVehicle, { color: colors.foreground }]}>{m.car.km.toFixed(1)} km</Text>
                      <Text style={[styles.monthCost, { color: colors.mutedForeground }]}>{m.car.cost.toFixed(2)} €</Text>
                      <Text style={[styles.monthCount, { color: colors.mutedForeground }]}>{m.car.count} trajet{m.car.count > 1 ? 's' : ''}</Text>
                    </View>
                  )}
                  {m.moto.count > 0 && (
                    <View style={styles.monthRow}>
                      <MaterialCommunityIcons name="motorbike" size={14} color={motoColor} />
                      <Text style={[styles.monthVehicle, { color: colors.foreground }]}>{m.moto.km.toFixed(1)} km</Text>
                      <Text style={[styles.monthCost, { color: colors.mutedForeground }]}>{m.moto.cost.toFixed(2)} €</Text>
                      <Text style={[styles.monthCount, { color: colors.mutedForeground }]}>{m.moto.count} trajet{m.moto.count > 1 ? 's' : ''}</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Uncategorized trips ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {uncategorized.length > 0
              ? `Trajets récents (${uncategorized.length})`
              : 'Trajets récents'}
          </Text>
          {uncategorized.length === 0 && trips.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="road-variant" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun trajet enregistré</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Les trajets sont détectés automatiquement à partir de 15 km/h. Assurez-vous que le tracking GPS est actif.
              </Text>
            </View>
          ) : uncategorized.length === 0 ? (
            <View style={[styles.allGroupedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="check-circle-outline" size={24} color={colors.primary} />
              <Text style={[styles.allGroupedText, { color: colors.mutedForeground }]}>
                Tous les trajets sont groupés en catégories.
              </Text>
            </View>
          ) : (
            uncategorized.map(trip => (
              <TripRow
                key={trip.id}
                trip={trip}
                colors={colors}
                onUpdate={load}
                onGroup={setGroupingTrip}
                onDelete={() => handleDeleteTrip(trip.id)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* FAB — ajout manuel de trajet */}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/trip/new' as any); }}
      >
        <MaterialCommunityIcons name="plus" size={26} color="#121212" />
      </Pressable>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  matchBtnBadge: { marginLeft: 'auto' as any, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  mapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5,
    paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2,
  },
  mapBtnText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  catReturnText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  scroll: { padding: 16, gap: 16 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },

  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 14 },
  alertTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  alertSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },

  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 14 },
  pendingText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  fab: {
    position: 'absolute',
    bottom: 28,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
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

  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 32, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },

  allGroupedCard: { borderRadius: 14, borderWidth: 1, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  allGroupedText: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },

  // CategoryCard
  catCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catBadge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catBadgeText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  catName: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  catStats: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  catMeta: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  catVehicles: { flexDirection: 'row', gap: 10 },
  catVehItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  catVehText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  catTrips: { gap: 8, marginTop: 4 },
  deleteCatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  deleteCatText: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  // TripRow
  tripAddrRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tripAddr: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular' },
  tripCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  tripCardCompact: { padding: 10 },
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
  groupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  groupBtnText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  tripDeleteBtn: { padding: 4, marginLeft: 2 },

  // GroupModal / RenameModal
  overlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 },
  sheetTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  sheetSub: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  matchBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  matchBtnText: { fontSize: 14, fontFamily: 'Inter_500Medium', flex: 1 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  nameInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
  sheetActions: { flexDirection: 'row', gap: 10 },
  sheetBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  sheetBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
