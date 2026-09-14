import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { useColors } from '@/hooks/useColors';
import type { WalkRoute } from '@/types/places';
import type { Trip, TripCategory, TripLabel, Vehicle, VehicleType } from '@/types/trips';
import { fmtHHMM, fmtWeekdayShort } from '@/utils/date';
import {
  createCategoryAndGroupSimilar,
  deleteCategoryAndUnlink,
  getCategories,
  renameCategory,
  tripIsReturnOf,
  tripMatchesCategory,
} from '@/utils/tripCategories';
import { createLabel, deleteLabelAndUnlink, getLabels, renameLabel } from '@/utils/tripLabels';
import { tripEvents } from '@/utils/tripEvents';
import { getWalkRoutes } from '@/utils/placesStorage';
import { pH } from '@/styles/header';
import {
  computeOdometer,
  deleteTrip,
  getTrips,
  getVehicleSettings,
  updateTrip,
} from '@/utils/tripStorage';

// ── Format helpers ─────────────────────────────────────────────────────────────
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
  const catTrips = trips.filter(t => t.categoryId === catId).sort((a, b) => b.startTime - a.startTime);
  const total = catTrips.length;
  const thisWeek = catTrips.filter(t => t.endTime >= weekAgo).length;
  const thisMonth = catTrips.filter(t => t.endTime >= monthStart).length;
  const thisYear = catTrips.filter(t => t.endTime >= yearStart).length;
  const avgKm = total ? catTrips.reduce((s, t) => s + t.distanceKm, 0) / total : 0;
  const avgDurationMs = total ? catTrips.reduce((s, t) => s + (t.endTime - t.startTime), 0) / total : 0;
  return { total, thisWeek, thisMonth, thisYear, avgKm, avgDurationMs, trips: catTrips };
}

// ── GroupModal ────────────────────────────────────────────────────────────────
function GroupModal({
  visible, trip, categories, labels, colors, onClose, onCreate, onAssign, onAssignLabel, onCreateLabel,
}: {
  visible: boolean;
  trip: Trip | null;
  categories: TripCategory[];
  labels: TripLabel[];
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onCreate: (name: string) => void;
  onAssign: (catId: string, isReturn: boolean) => void;
  onAssignLabel: (labelId: string | undefined) => void;
  onCreateLabel: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [labelName, setLabelName] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);

  const forwardMatches = useMemo(() => {
    if (!trip) return [];
    return categories.filter(c => tripMatchesCategory(trip, c));
  }, [trip, categories]);

  const returnMatches = useMemo(() => {
    if (!trip) return [];
    return categories.filter(c => !tripMatchesCategory(trip, c) && tripIsReturnOf(trip, c));
  }, [trip, categories]);

  const hasGeoMatches = forwardMatches.length > 0 || returnMatches.length > 0;
  const currentLabelId = trip?.labelId;

  function handleCreate() {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName('');
  }

  function handleCreateLabel() {
    if (!labelName.trim()) return;
    onCreateLabel(labelName.trim());
    setLabelName('');
    setShowLabelInput(false);
  }

  function handleClose() {
    onClose();
    setName('');
    setLabelName('');
    setShowLabelInput(false);
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Grouper ce trajet" avoidKeyboard>
          {/* ── Groupes personnalisés ── */}
          <Text style={[styles.sheetSub, { color: colors.mutedForeground }]}>Groupes personnalisés :</Text>
          <View style={styles.labelChipRow}>
            {labels.map(l => {
              const active = l.id === currentLabelId;
              return (
                <Pressable
                  key={l.id}
                  onPress={() => { onAssignLabel(active ? undefined : l.id); }}
                  style={[styles.labelChip, {
                    backgroundColor: active ? colors.primary + '22' : colors.muted,
                    borderColor: active ? colors.primary : colors.border,
                  }]}
                >
                  <MaterialCommunityIcons name={active ? 'tag' : 'tag-outline'} size={12} color={active ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.labelChipText, { color: active ? colors.primary : colors.foreground }]}>{l.name}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setShowLabelInput(v => !v)}
              style={[styles.labelChip, { backgroundColor: colors.muted, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="plus" size={12} color={colors.mutedForeground} />
              <Text style={[styles.labelChipText, { color: colors.mutedForeground }]}>Nouveau</Text>
            </Pressable>
          </View>
          {showLabelInput && (
            <View style={styles.labelCreateRow}>
              <TextInput
                value={labelName} onChangeText={setLabelName}
                placeholder="Nom du groupe"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.labelCreateInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                autoFocus returnKeyType="done" onSubmitEditing={handleCreateLabel}
              />
              <Pressable onPress={handleCreateLabel} disabled={!labelName.trim()}
                style={[styles.labelCreateBtn, { backgroundColor: colors.primary, opacity: labelName.trim() ? 1 : 0.4 }]}
              >
                <Text style={[styles.labelCreateBtnText, { color: '#000' }]}>OK</Text>
              </Pressable>
            </View>
          )}

          {/* ── Catégorie géographique ── */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>catégorie géo</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>
          {hasGeoMatches && (
            <>
              {forwardMatches.map(c => (
                <Pressable key={c.id} onPress={() => { onAssign(c.id, false); setName(''); }}
                  style={[styles.matchBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="folder-outline" size={16} color={colors.primary} />
                  <Text style={[styles.matchBtnText, { color: colors.foreground }]}>{c.name}</Text>
                  <Text style={[styles.matchBtnBadge, { color: colors.primary }]}>→</Text>
                </Pressable>
              ))}
              {returnMatches.map(c => (
                <Pressable key={c.id} onPress={() => { onAssign(c.id, true); setName(''); }}
                  style={[styles.matchBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="folder-outline" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.matchBtnText, { color: colors.foreground }]}>{c.name}</Text>
                  <Text style={[styles.matchBtnBadge, { color: colors.mutedForeground }]}>← Retour</Text>
                </Pressable>
              ))}
            </>
          )}
          <TextInput
            value={name} onChangeText={setName}
            placeholder="Nom (ex: Maison → Travail)"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            returnKeyType="done" onSubmitEditing={handleCreate}
          />
          <View style={styles.sheetActions}>
            <Pressable onPress={handleClose} style={[styles.sheetBtn, { backgroundColor: colors.muted }]}>
              <Text style={[styles.sheetBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
            </Pressable>
            <Pressable onPress={handleCreate} disabled={!name.trim()}
              style={[styles.sheetBtn, { backgroundColor: colors.primary, opacity: name.trim() ? 1 : 0.4 }]}>
              <Text style={[styles.sheetBtnText, { color: '#000' }]}>Créer catégorie</Text>
            </Pressable>
          </View>
    </BottomSheet>
  );
}

// ── RenameModal ───────────────────────────────────────────────────────────────
function RenameModal({
  visible, category, colors, onClose, onRename,
}: {
  visible: boolean;
  category: TripCategory | null;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState('');
  useEffect(() => { if (category) setName(category.name); }, [category]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Renommer la catégorie" avoidKeyboard>
          <TextInput
            value={name} onChangeText={setName}
            style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            autoFocus returnKeyType="done"
            onSubmitEditing={() => { if (name.trim()) onRename(name.trim()); }}
          />
          <View style={styles.sheetActions}>
            <Pressable onPress={onClose} style={[styles.sheetBtn, { backgroundColor: colors.muted }]}>
              <Text style={[styles.sheetBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
            </Pressable>
            <Pressable onPress={() => { if (name.trim()) onRename(name.trim()); }} disabled={!name.trim()}
              style={[styles.sheetBtn, { backgroundColor: colors.primary, opacity: name.trim() ? 1 : 0.4 }]}>
              <Text style={[styles.sheetBtnText, { color: '#000' }]}>OK</Text>
            </Pressable>
          </View>
    </BottomSheet>
  );
}

// ── RenameLabelModal ──────────────────────────────────────────────────────────
function RenameLabelModal({
  visible, label, colors, onClose, onRename,
}: {
  visible: boolean;
  label: TripLabel | null;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState('');
  useEffect(() => { if (label) setName(label.name); }, [label]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Renommer le groupe" avoidKeyboard>
          <TextInput
            value={name} onChangeText={setName}
            style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            autoFocus returnKeyType="done"
            onSubmitEditing={() => { if (name.trim()) onRename(name.trim()); }}
          />
          <View style={styles.sheetActions}>
            <Pressable onPress={onClose} style={[styles.sheetBtn, { backgroundColor: colors.muted }]}>
              <Text style={[styles.sheetBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
            </Pressable>
            <Pressable onPress={() => { if (name.trim()) onRename(name.trim()); }} disabled={!name.trim()}
              style={[styles.sheetBtn, { backgroundColor: colors.primary, opacity: name.trim() ? 1 : 0.4 }]}>
              <Text style={[styles.sheetBtnText, { color: '#000' }]}>OK</Text>
            </Pressable>
          </View>
    </BottomSheet>
  );
}

// ── LabelCard ─────────────────────────────────────────────────────────────────
function LabelCard({
  label, allTrips, colors, onUpdate, onDelete, onRename, vehicles, onUngroupTrip,
}: {
  label: TripLabel;
  allTrips: Trip[];
  colors: ReturnType<typeof useColors>;
  onUpdate: () => void;
  onDelete: () => void;
  onRename: () => void;
  vehicles?: Vehicle[];
  onUngroupTrip?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const labelTrips = useMemo(() =>
    allTrips.filter(t => t.labelId === label.id).sort((a, b) => b.startTime - a.startTime),
    [allTrips, label.id],
  );

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3_600_000;
  const d = new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const yearStart = new Date(d.getFullYear(), 0, 1).getTime();

  const total = labelTrips.length;
  const thisWeek = labelTrips.filter(t => t.endTime >= weekAgo).length;
  const thisMonth = labelTrips.filter(t => t.endTime >= monthStart).length;
  const thisYear = labelTrips.filter(t => t.endTime >= yearStart).length;
  const totalKm = labelTrips.reduce((s, t) => s + t.distanceKm, 0);

  return (
    <View style={[styles.catCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable onPress={() => setExpanded(e => !e)} style={styles.catHeader}>
        <View style={[styles.catBadge, { backgroundColor: colors.primary + '22' }]}>
          <Text style={[styles.catBadgeText, { color: colors.primary }]}>{total}</Text>
        </View>
        <Text style={[styles.catName, { color: colors.foreground }]} numberOfLines={1}>{label.name}</Text>
        <Pressable onPress={onRename} hitSlop={10}>
          <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.mutedForeground} />
        </Pressable>
        <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
      </Pressable>
      <View style={styles.catStats}>
        {thisWeek > 0 && (
          <View style={[styles.chip, { backgroundColor: colors.primary + '18' }]}>
            <Text style={[styles.chipText, { color: colors.primary }]}>{thisWeek}× sem.</Text>
          </View>
        )}
        {thisMonth > 0 && (
          <View style={[styles.chip, { backgroundColor: colors.muted }]}>
            <Text style={[styles.chipText, { color: colors.foreground }]}>{thisMonth}× mois</Text>
          </View>
        )}
        {thisYear > 0 && (
          <View style={[styles.chip, { backgroundColor: colors.muted }]}>
            <Text style={[styles.chipText, { color: colors.foreground }]}>{thisYear}× an</Text>
          </View>
        )}
        <Text style={[styles.catMeta, { color: colors.mutedForeground }]}>
          {totalKm.toFixed(1)} km total
        </Text>
      </View>
      {expanded && (
        <View style={styles.catTrips}>
          {labelTrips.map(t => (
            <TripRow key={t.id} trip={t} colors={colors} onUpdate={onUpdate} compact vehicles={vehicles} onUngroup={onUngroupTrip ? () => onUngroupTrip(t.id) : undefined} />
          ))}
          <Pressable onPress={onDelete} style={[styles.deleteCatBtn, { borderColor: colors.border }]}>
            <MaterialCommunityIcons name="trash-can-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.deleteCatText, { color: colors.mutedForeground }]}>Supprimer le groupe</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── CategoryCard ──────────────────────────────────────────────────────────────
function CategoryCard({
  category, allTrips, colors, onUpdate, onDelete, onRename, vehicles, onUngroupTrip,
}: {
  category: TripCategory;
  allTrips: Trip[];
  colors: ReturnType<typeof useColors>;
  onUpdate: () => void;
  onDelete: () => void;
  onRename: () => void;
  vehicles?: Vehicle[];
  onUngroupTrip?: (id: string) => void;
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
      <Pressable onPress={() => setExpanded(e => !e)} style={styles.catHeader}>
        <View style={[styles.catBadge, { backgroundColor: colors.primary + '22' }]}>
          <Text style={[styles.catBadgeText, { color: colors.primary }]}>{stats.total}</Text>
        </View>
        <Text style={[styles.catName, { color: colors.foreground }]} numberOfLines={1}>{category.name}</Text>
        <Pressable onPress={onRename} hitSlop={10}>
          <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.mutedForeground} />
        </Pressable>
        <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
      </Pressable>
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
      {expanded && (
        <View style={styles.catTrips}>
          {stats.trips.map(t => (
            <TripRow key={t.id} trip={t} colors={colors} onUpdate={onUpdate} compact vehicles={vehicles} onUngroup={onUngroupTrip ? () => onUngroupTrip(t.id) : undefined} />
          ))}
          <Pressable onPress={onDelete} style={[styles.deleteCatBtn, { borderColor: colors.border }]}>
            <MaterialCommunityIcons name="trash-can-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.deleteCatText, { color: colors.mutedForeground }]}>Supprimer la catégorie</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── TripRow ───────────────────────────────────────────────────────────────────
function TripRow({
  trip, colors, onUpdate, compact, onGroup, onDelete, onUngroup, vehicles, walkRouteMap,
}: {
  trip: Trip;
  colors: ReturnType<typeof useColors>;
  onUpdate: () => void;
  compact?: boolean;
  onGroup?: (t: Trip) => void;
  onDelete?: () => void;
  onUngroup?: () => void;
  vehicles?: Vehicle[];
  walkRouteMap?: Map<string, string>;
}) {
  const router = useRouter();
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChangeVehicle, setShowChangeVehicle] = useState(false);
  const carColor = '#2196F3';
  const motoColor = '#FF9800';
  const walkColor = '#4CAF50';
  const isPending = trip.vehicle === null;

  const vehicleObj = vehicles?.find(v => v.id === trip.vehicle);
  const isWalk = vehicleObj?.type === 'walk';

  const vehicleIcon =
    trip.vehicle === 'car' ? 'car' :
    trip.vehicle === 'moto' ? 'motorbike' :
    trip.vehicle === 'ignored' ? 'close-circle-outline' :
    isWalk ? 'walk' : 'tag-outline';

  const vehicleColor =
    trip.vehicle === 'car' ? carColor :
    trip.vehicle === 'moto' ? motoColor :
    isWalk ? walkColor :
    isPending ? colors.primary : colors.mutedForeground;

  const walkParticipantDetails = isWalk && trip.walkParticipants?.length
    ? trip.walkParticipants
        .map(id => vehicleObj?.walkParticipants?.find(p => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p)
    : [];

  async function retag(vehicle: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateTrip(trip.id, { vehicle });
    onUpdate();
    if (vehicle !== 'ignored' && !trip.categoryId && onGroup) onGroup(trip);
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
          <Text style={[styles.tripDate, { color: colors.foreground }]}>{fmtWeekdayShort(trip.startTime)}</Text>
          <Text style={[styles.tripTime, { color: colors.mutedForeground }]}>{fmtHHMM(trip.startTime)} → {fmtHHMM(trip.endTime)}</Text>
        </View>
        <View style={styles.tripRight}>
          <Text style={[styles.tripDist, { color: colors.foreground }]}>{trip.distanceKm.toFixed(1)} km</Text>
          <Text style={[styles.tripDur, { color: colors.mutedForeground }]}>{fmtDuration(trip.endTime - trip.startTime)}</Text>
        </View>
        {(onUngroup || onDelete) && (
          <Pressable
            onPress={onUngroup
              ? () => Alert.alert(
                  'Dégrouper ce trajet ?',
                  `${trip.distanceKm.toFixed(1)} km · ${fmtWeekdayShort(trip.startTime)}`,
                  [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Dégrouper', onPress: () => onUngroup() },
                  ]
                )
              : () => Alert.alert(
                  'Supprimer ce trajet ?',
                  `${trip.distanceKm.toFixed(1)} km · ${fmtWeekdayShort(trip.startTime)}`,
                  [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Supprimer', style: 'destructive', onPress: async () => { await deleteTrip(trip.id); onDelete!(); } },
                  ]
                )
            }
            hitSlop={8} style={styles.tripDeleteBtn}
          >
            <MaterialCommunityIcons name={onUngroup ? 'link-off' : 'trash-can-outline'} size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
      {isWalk && !compact && trip.walkRouteId && walkRouteMap?.get(trip.walkRouteId) ? (
        <View style={styles.tripAddrRow}>
          <View style={[styles.walkRouteChip, { backgroundColor: '#4CAF5018' }]}>
            <MaterialCommunityIcons name="walk" size={11} color="#4CAF50" />
            <Text style={[styles.walkRouteChipText, { color: '#4CAF50' }]}>
              {walkRouteMap.get(trip.walkRouteId)}
            </Text>
          </View>
        </View>
      ) : !isWalk && (trip.startAddress || trip.endAddress) && !compact ? (
        <View style={styles.tripAddrRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={11} color={colors.mutedForeground} />
          <Text style={[styles.tripAddr, { color: colors.mutedForeground }]} numberOfLines={1}>
            {(() => {
              const start = trip.startAddress ?? '…';
              const end = trip.endAddress ?? '…';
              const ints = trip.intermediates ?? [];
              if (ints.length === 0) return `${start} → ${end}`;
              if (ints.length === 1) return `${start} → ${ints[0]!.name} → ${end}`;
              return `${start} → ${ints.length} étapes → ${end}`;
            })()}
          </Text>
        </View>
      ) : null}
      {isWalk && walkParticipantDetails.length > 0 && (
        <View>
          <Pressable
            onPress={compact ? () => { Haptics.selectionAsync(); setShowParticipants(v => !v); } : undefined}
            style={styles.tripAddrRow}
          >
            {walkParticipantDetails.slice(0, 6).map((p, i) => (
              <View key={i} style={{
                width: 20, height: 20, borderRadius: 10,
                backgroundColor: p.type === 'dog' ? '#FF980030' : '#2196F330',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: p.type === 'dog' ? '#FF9800' : '#2196F3', fontSize: 8, fontFamily: 'Inter_700Bold' }}>
                  {p.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            ))}
            {!compact && (
              <Text style={[styles.tripAddr, { color: colors.mutedForeground, marginLeft: 2 }]}>
                {walkParticipantDetails.map(p => p.name).join(', ')}
              </Text>
            )}
          </Pressable>
          {compact && showParticipants && (
            <View style={[styles.participantTooltip, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.participantTooltipText, { color: colors.foreground }]}>
                {walkParticipantDetails.map(p => p.name).join(', ')}
              </Text>
            </View>
          )}
        </View>
      )}
      {(isPending || showChangeVehicle) && !compact && (
        <View style={styles.retagSection}>
          {showChangeVehicle && !isPending && (
            <Text style={[styles.retagHint, { color: colors.mutedForeground }]}>Changer le véhicule</Text>
          )}
          <View style={styles.retagRow}>
            <Pressable onPress={() => { retag('car'); setShowChangeVehicle(false); }} style={[styles.retagBtn, { backgroundColor: carColor + '22', borderColor: carColor }]}>
              <MaterialCommunityIcons name="car" size={14} color={carColor} />
              <Text style={[styles.retagLabel, { color: carColor }]}>Voiture</Text>
            </Pressable>
            <Pressable onPress={() => { retag('moto'); setShowChangeVehicle(false); }} style={[styles.retagBtn, { backgroundColor: motoColor + '22', borderColor: motoColor }]}>
              <MaterialCommunityIcons name="motorbike" size={14} color={motoColor} />
              <Text style={[styles.retagLabel, { color: motoColor }]}>Moto</Text>
            </Pressable>
            {(vehicles ?? []).filter(v => v.type === 'walk').map(v => (
              <Pressable key={v.id} onPress={() => { retag(v.id); setShowChangeVehicle(false); }} style={[styles.retagBtn, { backgroundColor: walkColor + '22', borderColor: walkColor }]}>
                <MaterialCommunityIcons name="walk" size={14} color={walkColor} />
                <Text style={[styles.retagLabel, { color: walkColor }]}>{v.name}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => { retag('ignored'); setShowChangeVehicle(false); }} style={[styles.retagBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="close" size={14} color={colors.mutedForeground} />
              <Text style={[styles.retagLabel, { color: colors.mutedForeground }]}>Ignorer</Text>
            </Pressable>
          </View>
        </View>
      )}
      {!compact && !isPending && !showChangeVehicle && (
        <Pressable
          onPress={() => { Haptics.selectionAsync(); setShowChangeVehicle(true); }}
          style={[styles.changeVehicleBtn, { borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="pencil-outline" size={13} color={colors.mutedForeground} />
          <Text style={[styles.changeVehicleBtnText, { color: colors.mutedForeground }]}>Changer véhicule</Text>
        </Pressable>
      )}
      {!compact && showChangeVehicle && (
        <Pressable
          onPress={() => { Haptics.selectionAsync(); setShowChangeVehicle(false); }}
          style={[styles.changeVehicleBtn, { borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="close" size={13} color={colors.mutedForeground} />
          <Text style={[styles.changeVehicleBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
        </Pressable>
      )}
      {!compact && onGroup && (
        <Pressable onPress={() => { Haptics.selectionAsync(); onGroup(trip); }}
          style={[styles.groupBtn, { borderColor: colors.border }]}>
          <MaterialCommunityIcons name="folder-plus-outline" size={13} color={colors.mutedForeground} />
          <Text style={[styles.groupBtnText, { color: colors.mutedForeground }]}>Grouper</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

// ── WalkRouteCard ─────────────────────────────────────────────────────────────
function WalkRouteCard({
  route, allTrips, walkVehicleIds, colors, onUpdate, vehicles, onUngroupTrip,
}: {
  route: WalkRoute;
  allTrips: Trip[];
  walkVehicleIds: Set<string>;
  colors: ReturnType<typeof useColors>;
  onUpdate: () => void;
  vehicles?: Vehicle[];
  onUngroupTrip?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const walkColor = '#4CAF50';

  const routeTrips = useMemo(() =>
    allTrips
      .filter(t => t.walkRouteId === route.id && walkVehicleIds.has(t.vehicle ?? ''))
      .sort((a, b) => b.startTime - a.startTime),
    [allTrips, route.id, walkVehicleIds],
  );

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3_600_000;
  const d = new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const yearStart = new Date(d.getFullYear(), 0, 1).getTime();

  const total = routeTrips.length;
  const thisWeek = routeTrips.filter(t => t.endTime >= weekAgo).length;
  const thisMonth = routeTrips.filter(t => t.endTime >= monthStart).length;
  const thisYear = routeTrips.filter(t => t.endTime >= yearStart).length;
  const avgKm = total ? routeTrips.reduce((s, t) => s + t.distanceKm, 0) / total : 0;
  const avgDurationMs = total ? routeTrips.reduce((s, t) => s + (t.endTime - t.startTime), 0) / total : 0;

  const lastDurDiffMin = total >= 2
    ? Math.round(((routeTrips[0].endTime - routeTrips[0].startTime) - avgDurationMs) / 60_000)
    : 0;
  const showSpeedChip = total >= 2 && Math.abs(lastDurDiffMin) >= 1;

  return (
    <View style={[styles.catCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable onPress={() => setExpanded(e => !e)} style={styles.catHeader}>
        <View style={[styles.catBadge, { backgroundColor: walkColor + '22' }]}>
          <Text style={[styles.catBadgeText, { color: walkColor }]}>{total}</Text>
        </View>
        <Text style={[styles.catName, { color: colors.foreground }]} numberOfLines={1}>{route.name}</Text>
        <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
      </Pressable>
      <View style={styles.catStats}>
        {thisWeek > 0 && (
          <View style={[styles.chip, { backgroundColor: walkColor + '18' }]}>
            <Text style={[styles.chipText, { color: walkColor }]}>{thisWeek}× sem.</Text>
          </View>
        )}
        {thisMonth > 0 && (
          <View style={[styles.chip, { backgroundColor: colors.muted }]}>
            <Text style={[styles.chipText, { color: colors.foreground }]}>{thisMonth}× mois</Text>
          </View>
        )}
        {thisYear > 0 && (
          <View style={[styles.chip, { backgroundColor: colors.muted }]}>
            <Text style={[styles.chipText, { color: colors.foreground }]}>{thisYear}× an</Text>
          </View>
        )}
        <Text style={[styles.catMeta, { color: colors.mutedForeground }]}>
          ~{avgKm.toFixed(1)} km · {fmtDuration(avgDurationMs)} moy.
        </Text>
        {showSpeedChip && (
          <View style={[styles.chip, { backgroundColor: lastDurDiffMin < 0 ? '#4CAF5018' : '#FF980018' }]}>
            <Text style={[styles.chipText, { color: lastDurDiffMin < 0 ? '#4CAF50' : '#FF9800' }]}>
              {lastDurDiffMin > 0 ? '+' : ''}{lastDurDiffMin} min vs moy{lastDurDiffMin <= -5 ? ' 🔥' : ''}
            </Text>
          </View>
        )}
      </View>
      {expanded && (
        <View style={styles.catTrips}>
          {routeTrips.map(t => (
            <TripRow key={t.id} trip={t} colors={colors} onUpdate={onUpdate} compact vehicles={vehicles} onUngroup={onUngroupTrip ? () => onUngroupTrip(t.id) : undefined} />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function TripListScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [categories, setCategories] = useState<TripCategory[]>([]);
  const [labels, setLabels] = useState<TripLabel[]>([]);
  const [settings, setSettings] = useState<Vehicle[]>([]);
  const [walkRoutes, setWalkRoutes] = useState<WalkRoute[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [groupingTrip, setGroupingTrip] = useState<Trip | null>(null);
  const [renameTarget, setRenameTarget] = useState<TripCategory | null>(null);
  const [renameLabelTarget, setRenameLabelTarget] = useState<TripLabel | null>(null);

  const load = useCallback(async () => {
    const [t, s, c, wr, lb] = await Promise.all([getTrips(), getVehicleSettings(), getCategories(), getWalkRoutes(), getLabels()]);
    setTrips(t.sort((a, b) => b.startTime - a.startTime));
    setSettings(s);
    setCategories(c);
    setWalkRoutes(wr);
    setLabels(lb);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') load(); });
    return () => sub.remove();
  }, [load]);
  useEffect(() => { return tripEvents.onTripUpdated(load); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

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
    Alert.alert('Supprimer la catégorie', 'Les trajets ne seront pas supprimés, seulement dissociés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await deleteCategoryAndUnlink(catId); await load(); } },
    ]);
  }

  async function handleRenameCategory(catId: string, name: string) {
    setRenameTarget(null);
    await renameCategory(catId, name);
    await load();
  }

  async function handleDeleteTrip(id: string) { await deleteTrip(id); await load(); }

  async function handleUngroupFromCategory(id: string) { await updateTrip(id, { categoryId: undefined }); await load(); }
  async function handleUngroupFromLabel(id: string) { await updateTrip(id, { labelId: undefined }); await load(); }
  async function handleUngroupFromWalkRoute(id: string) { await updateTrip(id, { walkRouteId: undefined }); await load(); }

  async function handleLabelAssign(labelId: string | undefined) {
    if (!groupingTrip) return;
    setGroupingTrip(null);
    await updateTrip(groupingTrip.id, { labelId });
    await load();
  }

  async function handleLabelCreate(name: string) {
    if (!groupingTrip) return;
    setGroupingTrip(null);
    const label = await createLabel(name);
    await updateTrip(groupingTrip.id, { labelId: label.id });
    await load();
  }

  async function handleDeleteLabel(labelId: string) {
    Alert.alert('Supprimer le groupe', 'Les trajets ne seront pas supprimés, seulement dissociés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await deleteLabelAndUnlink(labelId); await load(); } },
    ]);
  }

  async function handleRenameLabel(labelId: string, name: string) {
    setRenameLabelTarget(null);
    await renameLabel(labelId, name);
    await load();
  }

  async function handleRemoveTripFromLabel(tripId: string) {
    await updateTrip(tripId, { labelId: undefined });
    await load();
  }

  const walkRouteMap = useMemo(() => new Map(walkRoutes.map(r => [r.id, r.name])), [walkRoutes]);
  const catIds = useMemo(() => new Set(categories.map(c => c.id)), [categories]);
  const activeCats = useMemo(() => categories.filter(c => trips.some(t => t.categoryId === c.id)), [categories, trips]);
  const activeLabels = useMemo(() => labels.filter(l => trips.some(t => t.labelId === l.id)), [labels, trips]);
  const activeLabelIds = useMemo(() => new Set(activeLabels.map(l => l.id)), [activeLabels]);

  const walkVehicleIds = useMemo(() => new Set(settings.filter(v => v.type === 'walk').map(v => v.id)), [settings]);
  const activeWalkRoutes = useMemo(() =>
    walkRoutes.filter(wr => trips.some(t => t.walkRouteId === wr.id && walkVehicleIds.has(t.vehicle ?? ''))),
    [walkRoutes, trips, walkVehicleIds],
  );

  // ── Réorganisation automatique par usage du mois en cours ──────────────────
  // Les catégories/groupes/balades sans trajet ce mois-ci sont masqués (mais
  // restent sélectionnables via GroupModal, qui utilise la liste complète) et
  // réapparaissent dès qu'ils comptent 1 trajet dans le mois.
  const monthStartTs = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }, []);

  const catMonthCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of activeCats) m.set(c.id, trips.filter(t => t.categoryId === c.id && t.endTime >= monthStartTs).length);
    return m;
  }, [activeCats, trips, monthStartTs]);

  const labelMonthCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of activeLabels) m.set(l.id, trips.filter(t => t.labelId === l.id && t.endTime >= monthStartTs).length);
    return m;
  }, [activeLabels, trips, monthStartTs]);

  const walkRouteMonthCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const wr of activeWalkRoutes) {
      m.set(wr.id, trips.filter(t => t.walkRouteId === wr.id && walkVehicleIds.has(t.vehicle ?? '') && t.endTime >= monthStartTs).length);
    }
    return m;
  }, [activeWalkRoutes, trips, walkVehicleIds, monthStartTs]);

  const visibleCats = useMemo(() =>
    activeCats
      .filter(c => (catMonthCount.get(c.id) ?? 0) > 0)
      .sort((a, b) => (catMonthCount.get(b.id) ?? 0) - (catMonthCount.get(a.id) ?? 0)),
    [activeCats, catMonthCount],
  );

  const visibleLabels = useMemo(() =>
    activeLabels
      .filter(l => (labelMonthCount.get(l.id) ?? 0) > 0)
      .sort((a, b) => (labelMonthCount.get(b.id) ?? 0) - (labelMonthCount.get(a.id) ?? 0)),
    [activeLabels, labelMonthCount],
  );

  const visibleWalkRoutes = useMemo(() =>
    activeWalkRoutes
      .filter(wr => (walkRouteMonthCount.get(wr.id) ?? 0) > 0)
      .sort((a, b) => (walkRouteMonthCount.get(b.id) ?? 0) - (walkRouteMonthCount.get(a.id) ?? 0)),
    [activeWalkRoutes, walkRouteMonthCount],
  );

  const uncategorized = useMemo(() =>
    trips.filter(t =>
      (!t.labelId || !activeLabelIds.has(t.labelId)) &&
      (!t.categoryId || !catIds.has(t.categoryId)) &&
      !(t.walkRouteId && walkVehicleIds.has(t.vehicle ?? '')),
    ),
    [trips, catIds, walkVehicleIds, activeLabelIds],
  );
  const pending = uncategorized.filter(t => t.vehicle === null);
  const monthStats = useMemo(() => computeMonthStats(trips, settings), [trips, settings]);
  const carColor = '#2196F3';
  const motoColor = '#FF9800';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <GroupModal
        visible={groupingTrip !== null} trip={groupingTrip} categories={categories} labels={labels} colors={colors}
        onClose={() => setGroupingTrip(null)} onCreate={handleGroupCreate} onAssign={handleGroupAssign}
        onAssignLabel={handleLabelAssign} onCreateLabel={handleLabelCreate}
      />
      <RenameModal
        visible={renameTarget !== null} category={renameTarget} colors={colors}
        onClose={() => setRenameTarget(null)}
        onRename={name => renameTarget && handleRenameCategory(renameTarget.id, name)}
      />
      <RenameLabelModal
        visible={renameLabelTarget !== null} label={renameLabelTarget} colors={colors}
        onClose={() => setRenameLabelTarget(null)}
        onRename={name => renameLabelTarget && handleRenameLabel(renameLabelTarget.id, name)}
      />

      {/* Header */}
      <View style={[styles.pageHeader, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.pageHeaderTitle, { color: colors.foreground }]}>Mes Trajets</Text>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/story-period' as any); }}
          accessibilityLabel="Préparer le souvenir du mois"
          hitSlop={8}
          style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="movie-play-outline" size={18} color={colors.mutedForeground} />
        </Pressable>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/trip/new' as any); }}
          hitSlop={8}
          style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="plus" size={18} color={colors.foreground} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {pending.length > 0 && (
          <View style={[styles.pendingBanner, { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}>
            <MaterialCommunityIcons name="tag-outline" size={18} color={colors.primary} />
            <Text style={[styles.pendingText, { color: colors.primary }]}>
              {pending.length} trajet{pending.length > 1 ? 's' : ''} à taguer
            </Text>
          </View>
        )}

        <View style={styles.odoRow}>
          {settings.filter(v => v.type !== 'other').map(v => {
            const odo = computeOdometer(trips, v.id, v.odometerBaseKm, v.odometerAdjustments);
            const color = v.type === 'moto' ? motoColor : v.type === 'walk' ? '#4CAF50' : carColor;
            return (
              <View key={v.id} style={[styles.odoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <MaterialCommunityIcons name={v.type === 'moto' ? 'motorbike' : v.type === 'walk' ? 'walk' : 'car'} size={20} color={color} />
                <Text style={[styles.odoVal, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
                  {Math.round(odo).toLocaleString('fr-FR')}
                </Text>
                <Text style={[styles.odoLabel, { color: colors.mutedForeground }]}>km {v.name}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {uncategorized.length > 0 ? `Trajets récents (${uncategorized.length})` : 'Trajets récents'}
          </Text>
          {uncategorized.length === 0 && trips.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="road-variant" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun trajet enregistré</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Les trajets sont détectés automatiquement à partir de 15 km/h.
              </Text>
            </View>
          ) : uncategorized.length === 0 ? (
            <View style={[styles.allGroupedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="check-circle-outline" size={24} color={colors.primary} />
              <Text style={[styles.allGroupedText, { color: colors.mutedForeground }]}>Tous les trajets sont groupés en catégories.</Text>
            </View>
          ) : (
            uncategorized.map(trip => (
              <TripRow key={trip.id} trip={trip} colors={colors} onUpdate={load} vehicles={settings}
                walkRouteMap={walkRouteMap} onGroup={setGroupingTrip} onDelete={() => handleDeleteTrip(trip.id)} />
            ))
          )}
        </View>

        {(visibleLabels.length > 0 || visibleCats.length > 0) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Trajets</Text>
            {visibleCats.map(cat => (
              <CategoryCard key={cat.id} category={cat} allTrips={trips} colors={colors} vehicles={settings}
                onUpdate={load} onDelete={() => handleDeleteCategory(cat.id)} onRename={() => setRenameTarget(cat)} onUngroupTrip={handleUngroupFromCategory} />
            ))}
            {visibleLabels.map(label => (
              <LabelCard
                key={label.id}
                label={label}
                allTrips={trips}
                colors={colors}
                vehicles={settings}
                onUpdate={load}
                onDelete={() => handleDeleteLabel(label.id)}
                onRename={() => setRenameLabelTarget(label)}
                onUngroupTrip={handleUngroupFromLabel}
              />
            ))}
          </View>
        )}

        {visibleWalkRoutes.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Balades</Text>
            {visibleWalkRoutes.map(wr => (
              <WalkRouteCard key={wr.id} route={wr} allTrips={trips} walkVehicleIds={walkVehicleIds}
                colors={colors} onUpdate={load} vehicles={settings} onUngroupTrip={handleUngroupFromWalkRoute} />
            ))}
          </View>
        )}

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

      </ScrollView>

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/trip/new' as any); }}
      >
        <MaterialCommunityIcons name="plus" size={26} color="#121212" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pageHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  pageHeaderTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_600SemiBold' },

  scroll: { padding: 16, gap: 16 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },

  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 14 },
  pendingText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  odoRow: { flexDirection: 'row', gap: 12 },
  odoCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 10, alignItems: 'center', gap: 4 },
  odoVal: { fontSize: 18, fontFamily: 'Inter_700Bold' },
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
  catReturnText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  catTrips: { gap: 8, marginTop: 4 },
  deleteCatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  deleteCatText: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  tripCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  tripCardCompact: { padding: 10 },
  tripHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tripIconWrap: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tripDate: { fontSize: 13, fontFamily: 'Inter_500Medium', textTransform: 'capitalize' },
  tripTime: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  tripRight: { alignItems: 'flex-end', gap: 2 },
  tripDist: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  tripDur: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  tripAddrRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tripAddr: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular' },
  walkRouteChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  walkRouteChipText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  participantTooltip: { marginTop: 2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, alignSelf: 'flex-start' },
  participantTooltipText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  tripDeleteBtn: { padding: 4, marginLeft: 2 },
  retagSection: { gap: 4 },
  retagHint: { fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  retagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  retagBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 8, borderWidth: 1, paddingVertical: 7, minWidth: 60 },
  retagLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  changeVehicleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  changeVehicleBtnText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  groupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  groupBtnText: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  labelChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  labelChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  labelChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  labelCreateRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  labelCreateInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular' },
  labelCreateBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  labelCreateBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  removeLabelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingVertical: 4, paddingHorizontal: 4, borderTopWidth: StyleSheet.hairlineWidth },
  removeLabelText: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6,
  },

  sheetSub: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  matchBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  matchBtnText: { fontSize: 14, fontFamily: 'Inter_500Medium', flex: 1 },
  matchBtnBadge: { marginLeft: 'auto' as any, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  nameInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
  sheetActions: { flexDirection: 'row', gap: 10 },
  sheetBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  sheetBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
