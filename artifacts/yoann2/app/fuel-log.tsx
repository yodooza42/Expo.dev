import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { SubPageHeader } from '@/components/SubPageHeader';
import type { FuelEntry } from '@/types/fuel';
import type { Vehicle } from '@/types/trips';
import { addTransaction } from '@/utils/bankStorage';
import {
  deleteFuelEntry,
  getFuelEntries,
  getLastFuelType,
  saveLastFuelType,
  saveFuelEntry,
} from '@/utils/fuelStorage';
import { getVehicleSettings } from '@/utils/tripStorage';

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtMonth(key: string): string {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(dateStr: string): string {
  return dateStr.split('-').reverse().join('/');
}

// ── Stats ─────────────────────────────────────────────────────────────────────

interface MonthStat {
  key: string;
  label: string;
  count: number;
  liters: number;
  cost: number;
  byVehicle: { vehicleName: string; vehicleType: string | null; count: number; liters: number; cost: number }[];
}

function computeMonthStats(entries: FuelEntry[]): MonthStat[] {
  const map = new Map<string, MonthStat>();
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);

  for (const e of sorted) {
    const mk = monthKey(e.timestamp);
    if (!map.has(mk)) {
      map.set(mk, { key: mk, label: fmtMonth(mk), count: 0, liters: 0, cost: 0, byVehicle: [] });
    }
    const stat = map.get(mk)!;
    stat.count++;
    stat.liters += e.liters;
    stat.cost += e.totalCost;

    let veh = stat.byVehicle.find(v => v.vehicleName === e.vehicleName);
    if (!veh) {
      veh = { vehicleName: e.vehicleName, vehicleType: e.vehicleType, count: 0, liters: 0, cost: 0 };
      stat.byVehicle.push(veh);
    }
    veh.count++;
    veh.liters += e.liters;
    veh.cost += e.totalCost;
  }

  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FuelLogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { add } = useLocalSearchParams<{ add?: string }>();

  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Fuel modal state
  const [fuelOpen, setFuelOpen] = useState(false);
  const [fuelSelectedId, setFuelSelectedId] = useState<string | null>(null);
  const [fuelExternalName, setFuelExternalName] = useState('');
  const [fuelType, setFuelType] = useState<'gazole' | 'sp95' | 'sp98'>('sp95');
  const [fuelLiters, setFuelLiters] = useState('');
  const [fuelTotalCost, setFuelTotalCost] = useState('');
  const [fuelDate, setFuelDate] = useState(new Date().toISOString().slice(0, 10));
  const [fuelShowDatePicker, setFuelShowDatePicker] = useState(false);

  const load = useCallback(async () => {
    const [e, v] = await Promise.all([getFuelEntries(), getVehicleSettings()]);
    setEntries(e.sort((a, b) => b.timestamp - a.timestamp));
    setVehicles(v);
    if (fuelSelectedId === null && v.length > 0) {
      setFuelSelectedId(v[0]!.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Ouvre le modal automatiquement si l'app a été ouverte avec ?add=1
  // (ex : bouton ⛽ du widget)
  useEffect(() => {
    if (add === '1') setFuelOpen(true);
  }, [add]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleSelectVehicle(id: string | null) {
    setFuelSelectedId(id);
    if (id !== null) {
      const lastType = await getLastFuelType(id);
      setFuelType(lastType);
    }
    Haptics.selectionAsync();
  }

  async function handleSaveFuel() {
    const liters = parseFloat(fuelLiters.replace(',', '.'));
    const total  = parseFloat(fuelTotalCost.replace(',', '.'));
    const isExternal = fuelSelectedId === null;
    const selectedVehicle = vehicles.find(v => v.id === fuelSelectedId);
    const vehicleName = isExternal ? fuelExternalName.trim() : (selectedVehicle?.name ?? '');
    if (isNaN(liters) || isNaN(total) || liters <= 0 || total <= 0) return;
    if (isExternal && !vehicleName) return;

    const pricePerLiter = total / liters;
    const vehicleType   = selectedVehicle?.type ?? null;
    const fuelTypeLabel = { gazole: 'Gazole', sp95: 'SP95', sp98: 'SP98' }[fuelType];
    const txLabel = `Plein — ${vehicleName} — ${fuelTypeLabel}`;
    const txNote  = isExternal
      ? `Avance — ${vehicleName} · ${liters.toFixed(1)}L`
      : `${liters.toFixed(1)}L · ${pricePerLiter.toFixed(3)}€/L`;

    const newTx = await addTransaction({
      type: 'expense',
      amount: parseFloat(total.toFixed(2)),
      label: txLabel,
      category: 'Carburant',
      date: fuelDate,
      note: txNote,
    });

    const entry: FuelEntry = {
      id: `fuel_${Date.now()}`,
      timestamp: Date.now(),
      date: fuelDate,
      vehicleId: fuelSelectedId,
      vehicleName,
      vehicleType,
      fuelType,
      liters,
      totalCost: total,
      pricePerLiter,
      isExternal,
      financeTransactionId: newTx.id,
    };

    await saveFuelEntry(entry);
    if (!isExternal && fuelSelectedId) {
      await saveLastFuelType(fuelSelectedId, fuelType);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setFuelLiters('');
    setFuelTotalCost('');
    setFuelExternalName('');
    setFuelDate(new Date().toISOString().slice(0, 10));
    setFuelOpen(false);
    await load();
  }

  async function handleDelete(entry: FuelEntry) {
    Alert.alert(
      'Supprimer ce plein ?',
      `${entry.vehicleName} · ${entry.liters.toFixed(1)}L · ${entry.totalCost.toFixed(2)}€`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => { await deleteFuelEntry(entry.id); await load(); },
        },
      ],
    );
  }

  const monthStats = useMemo(() => computeMonthStats(entries), [entries]);

  const fuelSaveEnabled = (() => {
    const l = parseFloat(fuelLiters.replace(',', '.'));
    const t = parseFloat(fuelTotalCost.replace(',', '.'));
    const extOk = fuelSelectedId !== null || fuelExternalName.trim().length > 0;
    return l > 0 && t > 0 && extOk;
  })();

  const vehicleColor = (type: string | null) =>
    type === 'moto' ? '#FF9800' : type === 'car' ? '#2196F3' : '#9C27B0';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SubPageHeader
        title="Carburant"
        right={
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFuelOpen(true); }}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="gas-station" size={16} color="#121212" />
            <Text style={styles.addBtnText}>Passage à la pompe</Text>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {entries.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="gas-station-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun passage enregistré</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Appuie sur «&nbsp;Passage à la pompe&nbsp;» pour ajouter ton premier plein.
            </Text>
          </View>
        ) : (
          <>
            {/* ── Stats par mois ── */}
            {monthStats.map(stat => (
              <View key={stat.key} style={styles.section}>
                <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
                  {stat.label.toUpperCase()}
                </Text>

                {/* Résumé du mois */}
                <View style={[styles.monthCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.monthRow}>
                    <View style={styles.monthStat}>
                      <Text style={[styles.monthStatValue, { color: colors.foreground }]}>{stat.count}</Text>
                      <Text style={[styles.monthStatLabel, { color: colors.mutedForeground }]}>passages</Text>
                    </View>
                    <View style={[styles.monthDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.monthStat}>
                      <Text style={[styles.monthStatValue, { color: colors.foreground }]}>{stat.liters.toFixed(1)} L</Text>
                      <Text style={[styles.monthStatLabel, { color: colors.mutedForeground }]}>litres</Text>
                    </View>
                    <View style={[styles.monthDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.monthStat}>
                      <Text style={[styles.monthStatValue, { color: colors.primary }]}>{stat.cost.toFixed(2)} €</Text>
                      <Text style={[styles.monthStatLabel, { color: colors.mutedForeground }]}>total</Text>
                    </View>
                  </View>

                  {/* Détail par véhicule */}
                  {stat.byVehicle.map(veh => (
                    <View key={veh.vehicleName} style={[styles.vehRow, { borderTopColor: colors.border }]}>
                      <MaterialCommunityIcons
                        name={veh.vehicleType === 'moto' ? 'motorbike' : 'car'}
                        size={13}
                        color={vehicleColor(veh.vehicleType)}
                      />
                      <Text style={[styles.vehName, { color: colors.foreground }]}>{veh.vehicleName}</Text>
                      <Text style={[styles.vehMeta, { color: colors.mutedForeground }]}>
                        {veh.count}× · {veh.liters.toFixed(1)} L · {veh.cost.toFixed(2)} €
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Entrées du mois */}
                {entries
                  .filter(e => monthKey(e.timestamp) === stat.key)
                  .map(entry => {
                    const vColor = vehicleColor(entry.vehicleType);
                    const ftLabels = { gazole: 'Gazole', sp95: 'SP95', sp98: 'SP98' };
                    return (
                      <Pressable
                        key={entry.id}
                        onLongPress={() => handleDelete(entry)}
                        style={[styles.entryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      >
                        <View style={[styles.entryIconWrap, { backgroundColor: vColor + '22' }]}>
                          <MaterialCommunityIcons
                            name={entry.vehicleType === 'moto' ? 'motorbike' : 'car'}
                            size={16}
                            color={vColor}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.entryVehicle, { color: colors.foreground }]}>{entry.vehicleName}</Text>
                          <Text style={[styles.entrySub, { color: colors.mutedForeground }]}>
                            {ftLabels[entry.fuelType]} · {fmtDate(entry.date)}
                          </Text>
                        </View>
                        <View style={styles.entryRight}>
                          <Text style={[styles.entryCost, { color: colors.foreground }]}>{entry.totalCost.toFixed(2)} €</Text>
                          <Text style={[styles.entryLiters, { color: colors.mutedForeground }]}>{entry.liters.toFixed(1)} L</Text>
                        </View>
                      </Pressable>
                    );
                  })}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* ── Fuel modal ── */}
      <BottomSheet visible={fuelOpen} onClose={() => setFuelOpen(false)} avoidKeyboard>
            {/* Header + date */}
            <View style={styles.fuelHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.foreground, marginBottom: 0 }]}>⛽ Passage à la pompe</Text>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFuelShowDatePicker(true); }}
                style={[styles.fuelDateBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
              >
                <MaterialCommunityIcons name="calendar-outline" size={14} color={colors.primary} />
                <Text style={[styles.fuelDateTxt, { color: colors.foreground }]}>
                  {fuelDate.split('-').reverse().join('/')}
                </Text>
              </Pressable>
            </View>


            {/* Vehicle picker */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fuelVehicleScroll}>
              <View style={styles.fuelVehicleRow}>
                {vehicles.map(v => {
                  const sel = fuelSelectedId === v.id;
                  const vColor = v.type === 'moto' ? '#FF9800' : '#2196F3';
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => handleSelectVehicle(v.id)}
                      style={[styles.fuelVehicleBtn, {
                        backgroundColor: sel ? `${vColor}22` : colors.muted,
                        borderColor: sel ? vColor : colors.border,
                      }]}
                    >
                      <MaterialCommunityIcons
                        name={v.type === 'moto' ? 'motorbike' : 'car'}
                        size={15}
                        color={sel ? vColor : colors.mutedForeground}
                      />
                      <Text style={[styles.fuelVehicleText, { color: sel ? vColor : colors.mutedForeground }]}>
                        {v.name}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => handleSelectVehicle(null)}
                  style={[styles.fuelVehicleBtn, {
                    backgroundColor: fuelSelectedId === null ? '#9C27B022' : colors.muted,
                    borderColor: fuelSelectedId === null ? '#9C27B0' : colors.border,
                  }]}
                >
                  <MaterialCommunityIcons name="plus" size={15} color={fuelSelectedId === null ? '#9C27B0' : colors.mutedForeground} />
                  <Text style={[styles.fuelVehicleText, { color: fuelSelectedId === null ? '#9C27B0' : colors.mutedForeground }]}>
                    Autre
                  </Text>
                </Pressable>
              </View>
            </ScrollView>

            {/* External vehicle name */}
            {fuelSelectedId === null && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Nom du véhicule</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  placeholder="Ex : Toyota de Jean"
                  placeholderTextColor={colors.mutedForeground}
                  value={fuelExternalName}
                  onChangeText={setFuelExternalName}
                />
              </>
            )}

            {/* Fuel type chips */}
            <View style={styles.fuelTypeRow}>
              {(['gazole', 'sp95', 'sp98'] as const).map(ft => {
                const labels = { gazole: 'Gazole', sp95: 'SP95', sp98: 'SP98' };
                const sel = fuelType === ft;
                return (
                  <Pressable
                    key={ft}
                    onPress={() => { setFuelType(ft); Haptics.selectionAsync(); }}
                    style={[styles.fuelTypeChip, {
                      backgroundColor: sel ? '#4CAF5022' : colors.muted,
                      borderColor: sel ? '#4CAF50' : colors.border,
                    }]}
                  >
                    <Text style={[styles.fuelTypeText, { color: sel ? '#4CAF50' : colors.mutedForeground }]}>
                      {labels[ft]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Inputs: Total € + Litres */}
            <View style={styles.fuelInputsRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Total (€)</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  placeholder="Ex : 65.40"
                  placeholderTextColor={colors.mutedForeground}
                  value={fuelTotalCost}
                  onChangeText={setFuelTotalCost}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Litres</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  placeholder="Ex : 35.0"
                  placeholderTextColor={colors.mutedForeground}
                  value={fuelLiters}
                  onChangeText={setFuelLiters}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleSaveFuel}
                />
              </View>
            </View>

            {/* Auto-calculated price/L */}
            {(() => {
              const l = parseFloat(fuelLiters.replace(',', '.'));
              const t = parseFloat(fuelTotalCost.replace(',', '.'));
              if (l > 0 && t > 0) {
                return (
                  <Text style={[styles.fuelCalc, { color: colors.mutedForeground }]}>
                    → {(t / l).toFixed(3)} €/L
                  </Text>
                );
              }
              return null;
            })()}

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { borderColor: colors.border }]} onPress={() => setFuelOpen(false)}>
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, {
                  backgroundColor: colors.primary,
                  opacity: fuelSaveEnabled ? 1 : 0.4,
                }]}
                onPress={handleSaveFuel}
              >
                <Text style={[styles.modalBtnText, { color: '#121212', fontFamily: 'Inter_600SemiBold' }]}>Enregistrer</Text>
              </Pressable>
            </View>
      </BottomSheet>

      {fuelShowDatePicker && (
        <DateTimePicker
          value={new Date(fuelDate + 'T12:00:00')}
          mode="date"
          display="calendar"
          maximumDate={new Date()}
          onChange={(_evt, selected) => {
            setFuelShowDatePicker(false);
            if (selected) setFuelDate(selected.toISOString().slice(0, 10));
          }}
        />
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', flex: 1 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  addBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#121212' },

  scroll: { padding: 16, gap: 0 },
  section: { marginBottom: 24 },
  sectionHeader: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5,
    marginBottom: 8,
  },

  // Empty state
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 32 },

  // Month card
  monthCard: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8, overflow: 'hidden',
  },
  monthRow: { flexDirection: 'row', padding: 16 },
  monthStat: { flex: 1, alignItems: 'center' },
  monthStatValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  monthStatLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  monthDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  vehRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth,
  },
  vehName: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  vehMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  // Entry card
  entryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 12, marginBottom: 6,
  },
  entryIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  entryVehicle: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  entrySub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  entryRight: { alignItems: 'flex-end' },
  entryCost: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  entryLiters: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  modalSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    padding: 20, gap: 10,
  },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalBtn: {
    flex: 1, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12, alignItems: 'center',
  },
  modalBtnPrimary: { borderWidth: 0 },
  modalBtnText: { fontSize: 15, fontFamily: 'Inter_500Medium' },

  // Fuel modal internals
  fuelHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  fuelDateBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 6 },
  fuelDateTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  fuelVehicleScroll: { marginHorizontal: -4 },
  fuelVehicleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  fuelVehicleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1 },
  fuelVehicleText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  fuelTypeRow: { flexDirection: 'row', gap: 8 },
  fuelTypeChip: { flex: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 9, borderWidth: 1 },
  fuelTypeText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  fuelInputsRow: { flexDirection: 'row', gap: 10 },
  fuelCalc: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: -4 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  fieldInput: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Inter_400Regular',
  },
});
