import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DateTimePicker from '@react-native-community/datetimepicker';

import { BottomSheet } from '@/components/BottomSheet';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { MaintenanceItem, Trip, Vehicle, VehicleInsurance, WalkParticipant } from '@/types/trips';
import type { WalkRoute } from '@/types/places';
import { fmtHHMM, fmtWeekdayShort } from '@/utils/date';
import { computeAutoCostPerKm } from '@/utils/costPerKm';
import { addTransaction } from '@/utils/bankStorage';
import { computeOdometer, getTrips, getVehicleSettings, saveVehicleSettings, recalibrateOdometer, lastOdometerRecalStatus } from '@/utils/tripStorage';
import { getWalkRoutes } from '@/utils/placesStorage';
import { genId } from '@/utils/ids';

// ── Local types ───────────────────────────────────────────────────────────────
type VehicleTab = 'general' | 'maintenance' | 'insurance' | 'participants' | 'stats';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin === 0) return '—';
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

function fmtLastWalk(ts: number | null): string {
  if (!ts) return 'Jamais sorti';
  const diffMs = Date.now() - ts;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return hours <= 0 ? "Aujourd'hui" : `il y a ${hours}h`;
  const d = Math.round(diffMs / (24 * 3_600_000));
  return `il y a ${d} jour${d > 1 ? 's' : ''}`;
}

function getWalkStats(trips: Trip[], participantId: string, vehicleId: string, days: number) {
  const cutoff = Date.now() - days * 24 * 3_600_000;
  const relevant = trips.filter(
    t => t.vehicle === vehicleId && t.endTime >= cutoff && (t.walkParticipants ?? []).includes(participantId),
  );
  return {
    count: relevant.length,
    km: relevant.reduce((s, t) => s + t.distanceKm, 0),
    durationMs: relevant.reduce((s, t) => s + (t.endTime - t.startTime), 0),
  };
}

function getLastWalk(trips: Trip[], participantId: string, vehicleId: string): number | null {
  return trips
    .filter(t => t.vehicle === vehicleId && (t.walkParticipants ?? []).includes(participantId))
    .sort((a, b) => b.endTime - a.endTime)[0]?.endTime ?? null;
}

function getParticipantTrips(trips: Trip[], participantId: string, vehicleId: string): Trip[] {
  return trips
    .filter(t => t.vehicle === vehicleId && (t.walkParticipants ?? []).includes(participantId))
    .sort((a, b) => b.startTime - a.startTime);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function VehicleSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { projects } = useApp();
  const { vehicleId: paramVehicleId, tab: paramTab } = useLocalSearchParams<{ vehicleId?: string; tab?: string }>();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string>(paramVehicleId ?? 'car');
  const [trips, setTrips] = useState<Trip[]>([]);

  // Maintenance modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemInterval, setNewItemInterval] = useState('');
  const [newItemType, setNewItemType] = useState<'km' | 'date'>('km');
  const [newItemDays, setNewItemDays] = useState('');
  const [newItemCost, setNewItemCost] = useState('');

  // Add vehicle modal
  const [addVehicleVisible, setAddVehicleVisible] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehicleType, setNewVehicleType] = useState<'car' | 'moto' | 'other' | 'walk'>('car');

  // Participant modal
  const [addParticipantVisible, setAddParticipantVisible] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [newParticipantType, setNewParticipantType] = useState<'human' | 'dog'>('human');
  const [newParticipantReminder, setNewParticipantReminder] = useState('');

  const [projectPickerVisible, setProjectPickerVisible] = useState(false);
  const [activeVehicleTab, setActiveVehicleTab] = useState<VehicleTab>(
    (['general', 'maintenance', 'insurance', 'participants', 'stats'] as const).includes(paramTab as VehicleTab)
      ? (paramTab as VehicleTab)
      : 'general',
  );
  const [insDatePickerVisible, setInsDatePickerVisible] = useState(false);
  const [recalModalVisible, setRecalModalVisible] = useState(false);
  const [recalValue, setRecalValue] = useState('');
  const [expandedParticipants, setExpandedParticipants] = useState<Set<string>>(new Set());
  const [visiblePastTrips, setVisiblePastTrips] = useState<Set<string>>(new Set());
  const [walkRoutes, setWalkRoutes] = useState<WalkRoute[]>([]);

  const load = useCallback(async () => {
    const [v, t, wr] = await Promise.all([getVehicleSettings(), getTrips(), getWalkRoutes()]);
    setWalkRoutes(wr);
    setVehicles(v);
    setTrips(t);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Fallback selectedId if the currently selected vehicle no longer exists
  useEffect(() => {
    if (vehicles.length > 0 && !vehicles.find(v => v.id === selectedId)) {
      setSelectedId(vehicles[0]!.id);
    }
  }, [vehicles, selectedId]);

  // Reset tab and expanded participants when switching vehicles
  useEffect(() => {
    const sel = vehicles.find(v => v.id === selectedId);
    if (!sel) return;
    setExpandedParticipants(new Set());
    if (sel.type === 'walk' && (activeVehicleTab === 'maintenance' || activeVehicleTab === 'insurance')) {
      setActiveVehicleTab('general');
    } else if (sel.type !== 'walk' && (activeVehicleTab === 'participants' || activeVehicleTab === 'stats')) {
      setActiveVehicleTab('general');
    }
  }, [selectedId, vehicles]);

  // Reset expanded participants when switching tabs
  useEffect(() => {
    setExpandedParticipants(new Set());
  }, [activeVehicleTab]);

  const selected = vehicles.find(v => v.id === selectedId) ?? vehicles[0];
  const odo = selected ? computeOdometer(trips as any, selected.id, selected.odometerBaseKm, selected.odometerAdjustments) : 0;
  const isWalk = selected?.type === 'walk';
  const tabColor = selected?.type === 'moto' ? '#FF9800' : isWalk ? '#4CAF50' : '#2196F3';

  function updateSelected(partial: Partial<Vehicle>) {
    setVehicles(prev => prev.map(v => v.id === selectedId ? { ...v, ...partial } : v));
  }

  async function save() {
    await saveVehicleSettings(vehicles);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  function confirmRecalibration() {
    if (!selected) return;
    const realKm = parseFloat(recalValue.replace(',', '.'));
    if (isNaN(realKm) || realKm <= 0) {
      Alert.alert('Valeur invalide', 'Veuillez entrer un kilométrage positif.');
      return;
    }
    const updated = recalibrateOdometer(vehicles, selected.id, realKm, trips as any);
    setVehicles(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRecalModalVisible(false);
    setRecalValue('');
  }

  function openAddModal() {
    setNewItemName('');
    setNewItemInterval('');
    setNewItemType('km');
    setNewItemDays('');
    setAddModalVisible(true);
  }

  function confirmAddItem() {
    if (!selected) return;
    const name = newItemName.trim();
    if (!name) return;
    const cost = parseFloat(newItemCost.replace(',', '.'));
    const itemCost = isNaN(cost) || cost <= 0 ? undefined : cost;
    let item: MaintenanceItem;
    if (newItemType === 'km') {
      const interval = parseInt(newItemInterval, 10);
      if (isNaN(interval) || interval <= 0) return;
      item = { id: genId(), name, intervalKm: interval, lastResetKm: odo, cost: itemCost };
    } else {
      const days = parseInt(newItemDays, 10);
      if (isNaN(days) || days <= 0) return;
      item = { id: genId(), name, intervalKm: 0, lastResetKm: 0, intervalDays: days, lastResetDate: Date.now(), cost: itemCost };
    }
    updateSelected({ maintenanceItems: [...selected.maintenanceItems, item] });
    setNewItemCost('');
    setAddModalVisible(false);
  }

  function resetItem(id: string) {
    if (!selected) return;
    const target = selected.maintenanceItems.find(i => i.id === id);
    const isDateBased = !!target?.intervalDays;
    const msg = isDateBased
      ? "La date de référence sera mise à aujourd'hui."
      : `Le kilométrage de référence sera mis à ${odo.toFixed(0)} km.`;
    Alert.alert("Marquer l'entretien effectué ?", msg, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer', onPress: () => {
          updateSelected({
            maintenanceItems: selected.maintenanceItems.map(i =>
              i.id === id
                ? { ...i, lastResetKm: isDateBased ? i.lastResetKm : odo, ...(isDateBased ? { lastResetDate: Date.now() } : {}) }
                : i,
            ),
          });
        },
      },
    ]);
  }

  async function recordInsurancePayment() {
    if (!selected || !selected.insurance || selected.insurance.annualCost <= 0) return;
    const today = new Date().toISOString().split('T')[0]!;
    const year = new Date().getFullYear();
    const tx = await addTransaction({
      type: 'expense',
      label: `Assurance - ${selected.name} - ${year}`,
      category: 'Assurance',
      amount: selected.insurance.annualCost,
      date: today,
    });
    const updatedIns: VehicleInsurance = { ...selected.insurance, paymentDate: today, transactionId: tx.id };
    const updatedVehicles = vehicles.map(v => v.id === selected.id ? { ...v, insurance: updatedIns } : v);
    setVehicles(updatedVehicles);
    await saveVehicleSettings(updatedVehicles);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Paiement enregistré', `Assurance - ${selected.name} - ${year} ajouté aux finances.`);
  }

  function deleteItem(id: string) {
    if (!selected) return;
    Alert.alert('Supprimer ce rappel ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => {
        updateSelected({ maintenanceItems: selected.maintenanceItems.filter(i => i.id !== id) });
      }},
    ]);
  }

  function confirmAddVehicle() {
    const name = newVehicleName.trim() || 'Nouveau véhicule';
    const id = genId();
    const newV: Vehicle = {
      id, name, type: newVehicleType,
      costPerKm: newVehicleType === 'moto' ? 0.10 : newVehicleType === 'walk' ? 0 : 0.15,
      odometerBaseKm: 0,
      maintenanceItems: [],
      ...(newVehicleType === 'walk' ? { walkParticipants: [] } : {}),
    };
    setVehicles(prev => [...prev, newV]);
    setSelectedId(id);
    setAddVehicleVisible(false);
    setNewVehicleName('');
    setNewVehicleType('car');
  }

  function handleDeleteVehicle() {
    if (vehicles.length <= 1) {
      Alert.alert('Impossible', 'Vous devez garder au moins un véhicule.');
      return;
    }
    Alert.alert(
      `Supprimer ${selected?.name} ?`,
      'Les trajets enregistrés ne seront pas supprimés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive', onPress: () => {
            const remaining = vehicles.filter(v => v.id !== selectedId);
            setVehicles(remaining);
            setSelectedId(remaining[0]?.id ?? '');
          },
        },
      ],
    );
  }

  function confirmAddParticipant() {
    if (!selected || selected.type !== 'walk') return;
    const name = newParticipantName.trim();
    if (!name) return;
    const reminder = parseInt(newParticipantReminder, 10);
    const p: WalkParticipant = {
      id: genId(),
      name,
      type: newParticipantType,
      ...(newParticipantType === 'dog' && !isNaN(reminder) && reminder > 0 ? { reminderDays: reminder } : {}),
    };
    updateSelected({ walkParticipants: [...(selected.walkParticipants ?? []), p] });
    setAddParticipantVisible(false);
    setNewParticipantName('');
    setNewParticipantReminder('');
    setNewParticipantType('human');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function deleteParticipant(id: string) {
    if (!selected) return;
    const p = (selected.walkParticipants ?? []).find(x => x.id === id);
    Alert.alert(`Supprimer ${p?.name ?? 'ce participant'} ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: () => {
          updateSelected({ walkParticipants: (selected.walkParticipants ?? []).filter(x => x.id !== id) });
        },
      },
    ]);
  }

  // ── Tabs definition (conditional on vehicle type) ─────────────────────────
  const tabDefs: Array<[VehicleTab, string]> = isWalk
    ? [['general', 'Général'], ['participants', 'Participants'], ['stats', 'Stats']]
    : [['general', 'Général'], ['maintenance', 'Entretien'], ['insurance', 'Assurance']];

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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Véhicules & entretien</Text>
        <Pressable onPress={save} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.saveBtnText}>Sauvegarder</Text>
        </Pressable>
      </View>

      {/* Vehicle chips */}
      <View style={[styles.chipBar, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
          {vehicles.map(v => {
            const active = v.id === selectedId;
            const chipColor = v.type === 'moto' ? '#FF9800' : v.type === 'walk' ? '#4CAF50' : '#2196F3';
            const chipIcon = v.type === 'moto' ? 'motorbike' : v.type === 'walk' ? 'walk' : v.type === 'car' ? 'car' : 'car-outline';
            return (
              <Pressable
                key={v.id}
                onPress={() => { Haptics.selectionAsync(); setSelectedId(v.id); }}
                style={[styles.chip, {
                  backgroundColor: active ? chipColor + '22' : colors.muted,
                  borderColor: active ? chipColor : colors.border,
                }]}
              >
                <MaterialCommunityIcons name={chipIcon as any} size={14} color={active ? chipColor : colors.mutedForeground} />
                <Text style={[styles.chipText, { color: active ? chipColor : colors.mutedForeground }]}>
                  {v.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAddVehicleVisible(true); }}
            style={[styles.chip, { backgroundColor: colors.muted, borderColor: colors.border, borderStyle: 'dashed' }]}
          >
            <MaterialCommunityIcons name="plus" size={14} color={colors.mutedForeground} />
            <Text style={[styles.chipText, { color: colors.mutedForeground }]}>Ajouter</Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* ── Inner tab bar ── */}
      {selected && (
        <View style={[styles.innerTabBar, { borderBottomColor: colors.border }]}>
          {tabDefs.map(([tab, label]) => {
            const isActive = activeVehicleTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => { Haptics.selectionAsync(); setActiveVehicleTab(tab); }}
                style={[styles.innerTab, isActive && { borderBottomColor: tabColor, borderBottomWidth: 2 }]}
              >
                <Text style={[styles.innerTabText, { color: isActive ? tabColor : colors.mutedForeground }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {selected ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── GÉNÉRAL ── */}
          {activeVehicleTab === 'general' && (<>
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>NOM</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              value={selected.name}
              onChangeText={name => updateSelected({ name })}
              placeholderTextColor={colors.mutedForeground}
              placeholder="Ex: Doblo, Msx, Balade…"
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TYPE</Text>
            <View style={styles.typeRow}>
              {([['car', 'car', 'Voiture'], ['moto', 'motorbike', 'Moto'], ['other', 'car-outline', 'Autre'], ['walk', 'walk', 'Balade']] as const).map(([t, icon, label]) => {
                const tc = t === 'moto' ? '#FF9800' : t === 'walk' ? '#4CAF50' : '#2196F3';
                return (
                  <Pressable
                    key={t}
                    onPress={() => updateSelected({ type: t })}
                    style={[styles.typeBtn, {
                      backgroundColor: selected.type === t ? tc + '22' : colors.muted,
                      borderColor: selected.type === t ? tc : colors.border,
                    }]}
                  >
                    <MaterialCommunityIcons name={icon as any} size={16} color={selected.type === t ? tc : colors.mutedForeground} />
                    <Text style={[styles.typeBtnLabel, { color: selected.type === t ? tc : colors.mutedForeground }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Motor-only sections */}
          {!isWalk && (<>
          <View style={[styles.odoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name={selected.type === 'moto' ? 'motorbike' : 'car'} size={22} color={tabColor} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.odoVal, { color: colors.foreground }]}>{odo.toFixed(0)} km</Text>
              <Text style={[styles.odoSub, { color: colors.mutedForeground }]}>Odomètre estimé</Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>COÛT AU KM (€)</Text>
              <View style={[styles.modeChip, { backgroundColor: selected.costMode === 'auto' ? colors.primary + '22' : colors.muted }]}>
                <Pressable
                  onPress={() => updateSelected({ costMode: selected.costMode === 'auto' ? 'manual' : 'auto' })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 }}
                >
                  <MaterialCommunityIcons
                    name={selected.costMode === 'auto' ? 'calculator-variant' : 'pencil-outline'}
                    size={12}
                    color={selected.costMode === 'auto' ? colors.primary : colors.mutedForeground}
                  />
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: selected.costMode === 'auto' ? colors.primary : colors.mutedForeground }}>
                    {selected.costMode === 'auto' ? 'Auto' : 'Manuel'}
                  </Text>
                </Pressable>
              </View>
            </View>
            {selected.costMode === 'auto' ? (
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 4 }}>
                Calcul auto depuis les pleins et entretiens enregistrés.
              </Text>
            ) : (
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                value={selected.costPerKm.toString()}
                onChangeText={t => { const v = parseFloat(t); if (!isNaN(v)) updateSelected({ costPerKm: v }); }}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.mutedForeground}
                placeholder="0.15"
              />
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ODOMÈTRE DE DÉPART (km)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              value={selected.odometerBaseKm.toString()}
              onChangeText={t => { const v = parseFloat(t); if (!isNaN(v)) updateSelected({ odometerBaseKm: v }); }}
              keyboardType="numeric"
              placeholderTextColor={colors.mutedForeground}
              placeholder="0"
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>RECALAGE ODOMÈTRE</Text>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRecalValue(''); setRecalModalVisible(true); }}
                style={[styles.addBtn, { backgroundColor: tabColor + '22', borderColor: tabColor }]}
              >
                <MaterialCommunityIcons name="map-marker-question-outline" size={13} color={tabColor} />
                <Text style={[styles.addBtnText, { color: tabColor }]}>Recaler</Text>
              </Pressable>
            </View>
            {(() => {
              const status = lastOdometerRecalStatus(selected);
              if (status) {
                const isOld = status.daysAgo > 90;
                return (
                  <Text style={{ color: isOld ? '#E65100' : colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
                    {status.text}{isOld ? ' · Pensez à recaler' : ''}
                  </Text>
                );
              }
              return (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
                  Jamais recalé. Le compteur théorique peut dériver si un trajet est manqué.
                </Text>
              );
            })()}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PROJET ENTRETIEN</Text>
            <Pressable
              onPress={() => setProjectPickerVisible(true)}
              style={[styles.input, styles.inputPressable, { backgroundColor: colors.input, borderColor: colors.border }]}
            >
              <Text style={{ color: selected.maintenanceProjectId ? colors.foreground : colors.mutedForeground, fontSize: 15 }}>
                {projects.find(p => p.id === selected.maintenanceProjectId)?.name ?? 'Aucun projet lié'}
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
          </>)}

          {/* Walk general info */}
          {isWalk && (
            <View style={[styles.odoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="walk" size={22} color={tabColor} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.odoVal, { color: colors.foreground }]}>
                  {odo.toFixed(1)} km
                </Text>
                <Text style={[styles.odoSub, { color: colors.mutedForeground }]}>
                  Distance totale · {trips.filter(t => t.vehicle === selected.id).length} balades
                </Text>
              </View>
            </View>
          )}

          <Pressable
            onPress={handleDeleteVehicle}
            style={[styles.deleteVehicleBtn, { borderColor: '#EF4444' }]}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={16} color="#EF4444" />
            <Text style={[styles.deleteVehicleText, { color: '#EF4444' }]}>Supprimer {selected.name}</Text>
          </Pressable>
          </>)}

          {/* ── ENTRETIEN ── */}
          {activeVehicleTab === 'maintenance' && (<>
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>RAPPELS D'ENTRETIEN</Text>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openAddModal(); }}
                style={[styles.addBtn, { backgroundColor: tabColor + '22', borderColor: tabColor }]}
              >
                <MaterialCommunityIcons name="plus" size={13} color={tabColor} />
                <Text style={[styles.addBtnText, { color: tabColor }]}>Ajouter</Text>
              </Pressable>
            </View>

            {selected.maintenanceItems.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="wrench-outline" size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  Aucun rappel d'entretien configuré
                </Text>
              </View>
            ) : (
              selected.maintenanceItems.map(item => {
                const isDateBased = !!item.intervalDays;
                let progress = 0;
                let statusText = '';
                let subText = '';
                if (isDateBased && item.lastResetDate && item.intervalDays) {
                  const days = (Date.now() - item.lastResetDate) / (24 * 3_600_000);
                  progress = Math.min(days / item.intervalDays, 1);
                  const pct = Math.round(progress * 100);
                  statusText = `${pct}% · ${Math.round(days)} j / ${item.intervalDays} j`;
                  if (progress >= 1) {
                    const over = Math.round(days - item.intervalDays);
                    statusText = `⚠️ Dépassé de ${over} jour${over > 1 ? 's' : ''}`;
                  }
                  const resetDate = new Date(item.lastResetDate);
                  subText = `Dernier : ${resetDate.toLocaleDateString('fr-FR')}`;
                } else if (item.intervalKm > 0) {
                  const since = odo - item.lastResetKm;
                  progress = Math.min(since / item.intervalKm, 1);
                  const remaining = Math.max(0, item.intervalKm - since);
                  statusText = progress >= 1
                    ? `⚠️ Dépassé de ${Math.round(since - item.intervalKm)} km`
                    : `${Math.round(since)} / ${item.intervalKm} km · encore ${remaining.toFixed(0)} km`;
                  subText = `Dernier à : ${item.lastResetKm.toFixed(0)} km`;
                }
                const isOverdue = progress >= 1;

                return (
                  <View key={item.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: isOverdue ? '#FF9800' : colors.border }]}>
                    <View style={styles.itemHeader}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <MaterialCommunityIcons
                          name={isDateBased ? 'calendar-clock-outline' as any : 'speedometer'}
                          size={13}
                          color={isDateBased ? '#7C3AED' : tabColor}
                        />
                        <Text style={[styles.itemName, { color: colors.foreground }]}>{item.name}</Text>
                      </View>
                      <View style={styles.itemActions}>
                        <Pressable
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); resetItem(item.id); }}
                          style={[styles.iconBtn, { backgroundColor: '#4CAF5022' }]}
                        >
                          <MaterialCommunityIcons name="check" size={14} color="#4CAF50" />
                        </Pressable>
                        <Pressable
                          onPress={() => deleteItem(item.id)}
                          style={[styles.iconBtn, { backgroundColor: '#EF444422' }]}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={14} color="#EF4444" />
                        </Pressable>
                      </View>
                    </View>
                    <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                      <View
                        style={[styles.progressFill, {
                          width: `${Math.round(progress * 100)}%` as any,
                          backgroundColor: isOverdue ? '#FF9800' : (isDateBased ? '#7C3AED' : tabColor),
                        }]}
                      />
                    </View>
                    <Text style={[styles.itemStatus, { color: isOverdue ? '#FF9800' : colors.mutedForeground }]}>{statusText}</Text>
                    <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{subText}</Text>
                  </View>
                );
              })
            )}
          </View>
          </>)}

          {/* ── ASSURANCE ── */}
          {activeVehicleTab === 'insurance' && (<>
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PRIME ANNUELLE (€)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                value={selected.insurance?.annualCost ? String(selected.insurance.annualCost) : ''}
                onChangeText={t => {
                  const v = parseFloat(t.replace(',', '.'));
                  updateSelected({ insurance: { ...selected.insurance, annualCost: isNaN(v) ? 0 : v, paymentDate: selected.insurance?.paymentDate ?? '', transactionId: selected.insurance?.transactionId } });
                }}
                keyboardType="numeric"
                placeholder="Ex: 850"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DATE DU DERNIER PAIEMENT</Text>
              <Pressable
                onPress={() => setInsDatePickerVisible(true)}
                style={[styles.input, styles.inputPressable, { backgroundColor: colors.input, borderColor: colors.border }]}
              >
                <Text style={{ color: selected.insurance?.paymentDate ? colors.foreground : colors.mutedForeground, fontSize: 15 }}>
                  {selected.insurance?.paymentDate
                    ? new Date(selected.insurance.paymentDate).toLocaleDateString('fr-FR')
                    : 'Choisir une date…'}
                </Text>
                <MaterialCommunityIcons name="calendar" size={18} color={colors.mutedForeground} />
              </Pressable>
              {insDatePickerVisible && (
                <DateTimePicker
                  value={selected.insurance?.paymentDate ? new Date(selected.insurance.paymentDate) : new Date()}
                  mode="date"
                  display="default"
                  onChange={(_, date) => {
                    setInsDatePickerVisible(false);
                    if (date) {
                      const iso = date.toISOString().split('T')[0]!;
                      updateSelected({ insurance: { annualCost: selected.insurance?.annualCost ?? 0, paymentDate: iso, transactionId: selected.insurance?.transactionId } });
                    }
                  }}
                />
              )}
            </View>

            {selected.insurance?.paymentDate && selected.insurance.annualCost > 0 && (() => {
              const pay = new Date(selected.insurance.paymentDate);
              const renewal = new Date(pay);
              renewal.setFullYear(renewal.getFullYear() + 1);
              const daysUntil = Math.round((renewal.getTime() - Date.now()) / (24 * 3_600_000));
              const isOverdue = daysUntil <= 0;
              const isWarning = daysUntil <= 15 && !isOverdue;
              const cardColor = isOverdue ? '#EF4444' : isWarning ? '#FF9800' : '#4CAF50';
              return (
                <View style={[styles.insStatusCard, { backgroundColor: cardColor + '18', borderColor: cardColor }]}>
                  <MaterialCommunityIcons name="shield-check-outline" size={22} color={cardColor} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.insStatusTitle, { color: cardColor }]}>
                      {isOverdue ? 'Échéance dépassée' : isWarning ? `Renouvellement dans ${daysUntil} jour${daysUntil > 1 ? 's' : ''}` : `Valide encore ${daysUntil} jours`}
                    </Text>
                    <Text style={[styles.insStatusSub, { color: colors.mutedForeground }]}>
                      Échéance : {renewal.toLocaleDateString('fr-FR')} · {selected.insurance.annualCost} €/an
                    </Text>
                  </View>
                </View>
              );
            })()}

            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); recordInsurancePayment(); }}
              style={[styles.insPayBtn, { backgroundColor: tabColor + '22', borderColor: tabColor }]}
            >
              <MaterialCommunityIcons name="cash-plus" size={18} color={tabColor} />
              <Text style={[styles.insPayBtnText, { color: tabColor }]}>Enregistrer le paiement dans les finances</Text>
            </Pressable>
          </>)}

          {/* ── PARTICIPANTS (walk only) ── */}
          {activeVehicleTab === 'participants' && (<>
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PARTICIPANTS</Text>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setNewParticipantName(''); setNewParticipantType('human'); setNewParticipantReminder(''); setAddParticipantVisible(true); }}
                style={[styles.addBtn, { backgroundColor: tabColor + '22', borderColor: tabColor }]}
              >
                <MaterialCommunityIcons name="plus" size={13} color={tabColor} />
                <Text style={[styles.addBtnText, { color: tabColor }]}>Ajouter</Text>
              </Pressable>
            </View>

            {/* Humains */}
            {(() => {
              const humans = (selected.walkParticipants ?? []).filter(p => p.type === 'human');
              return humans.length > 0 ? (
                <View style={styles.participantGroup}>
                  <Text style={[styles.participantGroupLabel, { color: colors.mutedForeground }]}>
                    <MaterialCommunityIcons name="account-outline" size={12} color={colors.mutedForeground} /> HUMAINS
                  </Text>
                  {humans.map(p => (
                    <View key={p.id} style={[styles.participantRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={[styles.participantAvatar, { backgroundColor: '#2196F322' }]}>
                        <Text style={{ color: '#2196F3', fontSize: 13, fontFamily: 'Inter_700Bold' }}>{p.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={[styles.participantName, { color: colors.foreground }]}>{p.name}</Text>
                      <Pressable onPress={() => deleteParticipant(p.id)} style={[styles.iconBtn, { backgroundColor: '#EF444418' }]}>
                        <MaterialCommunityIcons name="trash-can-outline" size={14} color="#EF4444" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null;
            })()}

            {/* Chiens */}
            {(() => {
              const dogs = (selected.walkParticipants ?? []).filter(p => p.type === 'dog');
              return dogs.length > 0 ? (
                <View style={styles.participantGroup}>
                  <Text style={[styles.participantGroupLabel, { color: colors.mutedForeground }]}>
                    🐕 CHIENS
                  </Text>
                  {dogs.map(p => (
                    <View key={p.id} style={[styles.participantRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={[styles.participantAvatar, { backgroundColor: '#FF980022' }]}>
                        <Text style={{ color: '#FF9800', fontSize: 13, fontFamily: 'Inter_700Bold' }}>{p.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.participantName, { color: colors.foreground }]}>{p.name}</Text>
                        {p.reminderDays ? (
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>
                            Rappel si pas sorti depuis {p.reminderDays}j
                          </Text>
                        ) : null}
                      </View>
                      <Pressable onPress={() => deleteParticipant(p.id)} style={[styles.iconBtn, { backgroundColor: '#EF444418' }]}>
                        <MaterialCommunityIcons name="trash-can-outline" size={14} color="#EF4444" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null;
            })()}

            {(selected.walkParticipants ?? []).length === 0 && (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="account-multiple-outline" size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  Aucun participant configuré.{'\n'}Ajoute les humains et chiens qui accompagnent les balades.
                </Text>
              </View>
            )}
          </View>
          </>)}

          {/* ── STATS (walk only) ── */}
          {activeVehicleTab === 'stats' && (<>
          {(selected.walkParticipants ?? []).length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="chart-bar" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Ajoutez des participants dans l'onglet Participants pour voir les statistiques.
              </Text>
            </View>
          ) : (
            (selected.walkParticipants ?? []).map(p => {
              const lastTs = getLastWalk(trips, p.id, selected.id);
              const s7  = getWalkStats(trips, p.id, selected.id, 7);
              const s30 = getWalkStats(trips, p.id, selected.id, 30);
              const s90 = getWalkStats(trips, p.id, selected.id, 90);
              const avatarColor = p.type === 'dog' ? '#FF9800' : '#2196F3';
              return (
                <View key={p.id} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {/* Header */}
                  <View style={styles.statCardHeader}>
                    <View style={[styles.participantAvatar, { backgroundColor: avatarColor + '22' }]}>
                      <Text style={{ color: avatarColor, fontSize: 15, fontFamily: 'Inter_700Bold' }}>{p.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.statName, { color: colors.foreground }]}>{p.name}</Text>
                      <Text style={[styles.statLastWalk, { color: lastTs ? (Date.now() - lastTs > (p.reminderDays ?? 999) * 86400000 ? '#EF4444' : colors.mutedForeground) : '#EF4444' }]}>
                        {fmtLastWalk(lastTs)}
                      </Text>
                    </View>
                  </View>

                  {/* Stats grid */}
                  <View style={styles.statGrid}>
                    <View style={styles.statGridHeader}>
                      <Text style={[styles.statColLabel, { color: colors.mutedForeground }]} />
                      <Text style={[styles.statColLabel, { color: tabColor }]}>7 j</Text>
                      <Text style={[styles.statColLabel, { color: tabColor }]}>30 j</Text>
                      <Text style={[styles.statColLabel, { color: tabColor }]}>90 j</Text>
                    </View>
                    <View style={[styles.statGridRow, { borderTopColor: colors.border }]}>
                      <Text style={[styles.statRowLabel, { color: colors.mutedForeground }]}>Balades</Text>
                      <Text style={[styles.statVal, { color: colors.foreground }]}>{s7.count}</Text>
                      <Text style={[styles.statVal, { color: colors.foreground }]}>{s30.count}</Text>
                      <Text style={[styles.statVal, { color: colors.foreground }]}>{s90.count}</Text>
                    </View>
                    <View style={[styles.statGridRow, { borderTopColor: colors.border }]}>
                      <Text style={[styles.statRowLabel, { color: colors.mutedForeground }]}>Km</Text>
                      <Text style={[styles.statVal, { color: colors.foreground }]}>{s7.km.toFixed(1)}</Text>
                      <Text style={[styles.statVal, { color: colors.foreground }]}>{s30.km.toFixed(1)}</Text>
                      <Text style={[styles.statVal, { color: colors.foreground }]}>{s90.km.toFixed(1)}</Text>
                    </View>
                    <View style={[styles.statGridRow, { borderTopColor: colors.border }]}>
                      <Text style={[styles.statRowLabel, { color: colors.mutedForeground }]}>Durée</Text>
                      <Text style={[styles.statVal, { color: colors.foreground }]}>{fmtDuration(s7.durationMs)}</Text>
                      <Text style={[styles.statVal, { color: colors.foreground }]}>{fmtDuration(s30.durationMs)}</Text>
                      <Text style={[styles.statVal, { color: colors.foreground }]}>{fmtDuration(s90.durationMs)}</Text>
                    </View>
                  </View>

                  {/* Past trips list */}
                  {(() => {
                    const pTrips = getParticipantTrips(trips, p.id, selected.id);
                    if (pTrips.length === 0) return null;
                    const LIMIT = 10;
                    const isExpanded = expandedParticipants.has(p.id);
                    const visible = isExpanded ? pTrips : pTrips.slice(0, LIMIT);
                    const hidden = pTrips.length - LIMIT;
                    return (
                      <View style={styles.pastTripsSection}>
                        <Pressable
                          style={styles.pastTripsToggleRow}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setVisiblePastTrips(prev => {
                              const s = new Set(prev);
                              if (s.has(p.id)) s.delete(p.id); else s.add(p.id);
                              return s;
                            });
                          }}
                        >
                          <Text style={[styles.pastTripsLabel, { color: colors.mutedForeground }]}>
                            BALADES PASSÉES ({pTrips.length})
                          </Text>
                          <MaterialCommunityIcons
                            name={visiblePastTrips.has(p.id) ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={colors.mutedForeground}
                          />
                        </Pressable>
                        {visiblePastTrips.has(p.id) && (
                          <>
                            {visible.map(t => {
                              const allParticipantDetails = (t.walkParticipants ?? [])
                                .map(pid => (selected.walkParticipants ?? []).find(wp => wp.id === pid))
                                .filter((wp): wp is NonNullable<typeof wp> => !!wp);
                              return (
                                <Pressable
                                  key={t.id}
                                  onPress={() => { router.push({ pathname: '/trip-map', params: { id: t.id, backLabel: 'Véhicules', participantName: p.name } } as any); }}
                                  style={[styles.pastTripRow, { borderColor: colors.border }]}
                                >
                                  <View style={[styles.pastTripIcon, { backgroundColor: '#4CAF5022' }]}>
                                    <MaterialCommunityIcons name="walk" size={14} color="#4CAF50" />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={[styles.pastTripDate, { color: colors.foreground }]}>{fmtWeekdayShort(t.startTime)}</Text>
                                    <Text style={[styles.pastTripTime, { color: colors.mutedForeground }]}>{fmtHHMM(t.startTime)} → {fmtHHMM(t.endTime)}</Text>
                                    {!!t.walkRouteId && walkRoutes.find(r => r.id === t.walkRouteId) && (
                                      <Text style={[styles.pastTripRoute, { color: '#4CAF50' }]} numberOfLines={1}>
                                        {walkRoutes.find(r => r.id === t.walkRouteId)!.name}
                                      </Text>
                                    )}
                                  </View>
                                  <View style={styles.pastTripRight}>
                                    <Text style={[styles.pastTripDist, { color: colors.foreground }]}>{t.distanceKm.toFixed(1)} km</Text>
                                    <Text style={[styles.pastTripDur, { color: colors.mutedForeground }]}>{fmtDuration(t.endTime - t.startTime)}</Text>
                                  </View>
                                  {allParticipantDetails.length > 0 && (
                                    <View style={styles.pastTripAvatars}>
                                      {allParticipantDetails.slice(0, 5).map((wp, i) => (
                                        <View key={i} style={[styles.pastTripAvatar, {
                                          backgroundColor: wp.type === 'dog' ? '#FF980030' : '#2196F330',
                                        }]}>
                                          <Text style={{ color: wp.type === 'dog' ? '#FF9800' : '#2196F3', fontSize: 7, fontFamily: 'Inter_700Bold' }}>
                                            {wp.name.charAt(0).toUpperCase()}
                                          </Text>
                                        </View>
                                      ))}
                                    </View>
                                  )}
                                </Pressable>
                              );
                            })}
                            {!isExpanded && hidden > 0 && (
                              <Pressable
                                onPress={() => { Haptics.selectionAsync(); setExpandedParticipants(prev => new Set([...prev, p.id])); }}
                                style={[styles.seeMoreBtn, { borderColor: colors.border }]}
                              >
                                <MaterialCommunityIcons name="chevron-down" size={14} color={colors.mutedForeground} />
                                <Text style={[styles.seeMoreText, { color: colors.mutedForeground }]}>
                                  Voir {hidden} autre{hidden > 1 ? 's' : ''} balade{hidden > 1 ? 's' : ''}
                                </Text>
                              </Pressable>
                            )}
                            {isExpanded && pTrips.length > LIMIT && (
                              <Pressable
                                onPress={() => { Haptics.selectionAsync(); setExpandedParticipants(prev => { const s = new Set(prev); s.delete(p.id); return s; }); }}
                                style={[styles.seeMoreBtn, { borderColor: colors.border }]}
                              >
                                <MaterialCommunityIcons name="chevron-up" size={14} color={colors.mutedForeground} />
                                <Text style={[styles.seeMoreText, { color: colors.mutedForeground }]}>Réduire</Text>
                              </Pressable>
                            )}
                          </>
                        )}
                      </View>
                    );
                  })()}
                </View>
              );
            })
          )}
          </>)}
        </ScrollView>
      ) : null}

      {/* Add maintenance item modal */}
      <Modal visible={addModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setAddModalVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Nouveau rappel</Text>
            <View style={styles.typeRow}>
              <Pressable onPress={() => setNewItemType('km')} style={[styles.typeBtn, { backgroundColor: newItemType === 'km' ? tabColor + '30' : colors.muted, borderColor: newItemType === 'km' ? tabColor : colors.border }]}>
                <MaterialCommunityIcons name="speedometer" size={14} color={newItemType === 'km' ? tabColor : colors.mutedForeground} />
                <Text style={[styles.typeBtnLabel, { color: newItemType === 'km' ? tabColor : colors.mutedForeground }]}>Kilométrage</Text>
              </Pressable>
              <Pressable onPress={() => setNewItemType('date')} style={[styles.typeBtn, { backgroundColor: newItemType === 'date' ? '#7C3AED30' : colors.muted, borderColor: newItemType === 'date' ? '#7C3AED' : colors.border }]}>
                <MaterialCommunityIcons name={'calendar-clock-outline' as any} size={14} color={newItemType === 'date' ? '#7C3AED' : colors.mutedForeground} />
                <Text style={[styles.typeBtnLabel, { color: newItemType === 'date' ? '#7C3AED' : colors.mutedForeground }]}>Date</Text>
              </Pressable>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Nom</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="ex: Vidange, CT, Révision…"
              placeholderTextColor={colors.mutedForeground}
              value={newItemName}
              onChangeText={setNewItemName}
              autoFocus
            />
            {newItemType === 'km' ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 8 }]}>Intervalle (km)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="ex: 5000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={newItemInterval}
                  onChangeText={setNewItemInterval}
                />
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 8 }]}>Intervalle (jours)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="ex: 730 (CT tous les 2 ans)"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={newItemDays}
                  onChangeText={setNewItemDays}
                />
              </>
            )}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setAddModalVisible(false)} style={[styles.modalBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 14 }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={confirmAddItem} style={[styles.modalBtn, { backgroundColor: tabColor, borderColor: tabColor }]}>
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Ajouter</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add participant modal */}
      <Modal visible={addParticipantVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setAddParticipantVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Ajouter un participant</Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Nom</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Ex: Marie, Akela…"
              placeholderTextColor={colors.mutedForeground}
              value={newParticipantName}
              onChangeText={setNewParticipantName}
              autoFocus
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 8 }]}>Type</Text>
            <View style={styles.typeRow}>
              <Pressable
                onPress={() => setNewParticipantType('human')}
                style={[styles.typeBtn, { backgroundColor: newParticipantType === 'human' ? '#2196F322' : colors.muted, borderColor: newParticipantType === 'human' ? '#2196F3' : colors.border }]}
              >
                <MaterialCommunityIcons name="account-outline" size={16} color={newParticipantType === 'human' ? '#2196F3' : colors.mutedForeground} />
                <Text style={[styles.typeBtnLabel, { color: newParticipantType === 'human' ? '#2196F3' : colors.mutedForeground }]}>Humain</Text>
              </Pressable>
              <Pressable
                onPress={() => setNewParticipantType('dog')}
                style={[styles.typeBtn, { backgroundColor: newParticipantType === 'dog' ? '#FF980022' : colors.muted, borderColor: newParticipantType === 'dog' ? '#FF9800' : colors.border }]}
              >
                <Text style={{ fontSize: 14 }}>🐕</Text>
                <Text style={[styles.typeBtnLabel, { color: newParticipantType === 'dog' ? '#FF9800' : colors.mutedForeground }]}>Chien</Text>
              </Pressable>
            </View>

            {newParticipantType === 'dog' && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 8 }]}>
                  Rappel si pas sorti depuis X jours (optionnel)
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="ex: 2"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={newParticipantReminder}
                  onChangeText={setNewParticipantReminder}
                />
              </>
            )}

            <View style={styles.modalActions}>
              <Pressable onPress={() => setAddParticipantVisible(false)} style={[styles.modalBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 14 }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={confirmAddParticipant} style={[styles.modalBtn, { backgroundColor: tabColor, borderColor: tabColor }]}>
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Ajouter</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add vehicle modal */}
      <Modal visible={addVehicleVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setAddVehicleVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Ajouter un véhicule</Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Nom</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Ex: Twingo, Vespa, Balade…"
              placeholderTextColor={colors.mutedForeground}
              value={newVehicleName}
              onChangeText={setNewVehicleName}
              autoFocus
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 8 }]}>Type</Text>
            <View style={[styles.typeRow, { flexWrap: 'wrap' }]}>
              {([['car', 'car', 'Voiture', '#2196F3'], ['moto', 'motorbike', 'Moto', '#FF9800'], ['other', 'car-outline', 'Autre', '#9E9E9E'], ['walk', 'walk', 'Balade', '#4CAF50']] as const).map(([t, icon, label, tc]) => (
                <Pressable
                  key={t}
                  onPress={() => setNewVehicleType(t)}
                  style={[styles.typeBtn, {
                    backgroundColor: newVehicleType === t ? tc + '22' : colors.muted,
                    borderColor: newVehicleType === t ? tc : colors.border,
                    minWidth: '45%',
                  }]}
                >
                  <MaterialCommunityIcons name={icon as any} size={16} color={newVehicleType === t ? tc : colors.mutedForeground} />
                  <Text style={[styles.typeBtnLabel, { color: newVehicleType === t ? tc : colors.mutedForeground }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setAddVehicleVisible(false)} style={[styles.modalBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 14 }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={confirmAddVehicle} style={[styles.modalBtn, { backgroundColor: '#FFC107', borderColor: '#FFC107' }]}>
                <Text style={{ color: '#121212', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Créer</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Project picker modal */}
      <BottomSheet visible={projectPickerVisible} onClose={() => setProjectPickerVisible(false)} title="Projet entretien" maxHeight="70%">
            <Pressable
              onPress={() => { updateSelected({ maintenanceProjectId: undefined }); setProjectPickerVisible(false); }}
              style={[styles.projectRow, { borderBottomColor: colors.border }]}
            >
              <MaterialCommunityIcons name="close-circle-outline" size={18} color={colors.mutedForeground} />
              <Text style={[styles.projectRowText, { color: colors.mutedForeground }]}>Aucun projet</Text>
            </Pressable>
            <FlatList
              data={projects}
              keyExtractor={p => p.id}
              renderItem={({ item: p }) => (
                <Pressable
                  onPress={() => { updateSelected({ maintenanceProjectId: p.id }); setProjectPickerVisible(false); }}
                  style={[styles.projectRow, { borderBottomColor: colors.border, backgroundColor: selected?.maintenanceProjectId === p.id ? colors.primary + '18' : 'transparent' }]}
                >
                  <MaterialCommunityIcons name="folder-outline" size={18} color={colors.primary} />
                  <Text style={[styles.projectRowText, { color: colors.foreground }]}>{p.name}</Text>
                  {selected?.maintenanceProjectId === p.id && (
                    <MaterialCommunityIcons name="check" size={16} color={colors.primary} style={{ marginLeft: 'auto' as any }} />
                  )}
                </Pressable>
              )}
            />
      </BottomSheet>

      {/* Recalibration modal */}
      <Modal visible={recalModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setRecalModalVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Recaler l'odomètre</Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Kilométrage réel affiché au compteur (km)
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="ex: 45 328"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              value={recalValue}
              onChangeText={setRecalValue}
              autoFocus
            />
            {selected && (
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 }}>
                Théorique actuel : {computeOdometer(trips as any, selected.id, selected.odometerBaseKm, selected.odometerAdjustments).toFixed(1)} km
              </Text>
            )}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setRecalModalVisible(false)} style={[styles.modalBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 14 }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={confirmRecalibration} style={[styles.modalBtn, { backgroundColor: tabColor, borderColor: tabColor }]}>
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Recaler</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerBack: { padding: 6, borderRadius: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  saveBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  saveBtnText: { color: '#121212', fontFamily: 'Inter_600SemiBold', fontSize: 13 },

  chipBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  chipScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  scroll: { padding: 16, gap: 16 },
  section: { gap: 8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, textTransform: 'uppercase' },

  input: { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
  inputPressable: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  typeBtnLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  odoCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 16 },
  odoVal: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  odoSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },

  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  addBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  emptyCard: { borderRadius: 12, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  itemCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 6 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', flex: 1 },
  itemActions: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  progressBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  itemStatus: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  itemSub: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  deleteVehicleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 8,
  },
  deleteVehicleText: { fontSize: 14, fontFamily: 'Inter_500Medium' },

  innerTabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  innerTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  innerTabText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  insStatusCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 14 },
  insStatusTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  insStatusSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  insPayBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  insPayBtnText: { fontSize: 14, fontFamily: 'Inter_500Medium' },

  modalBackdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', borderRadius: 16, borderWidth: 1, padding: 20, gap: 8 },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1 },

  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },

  pickerSheet: { width: '100%', position: 'absolute', bottom: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, padding: 20, maxHeight: '70%' },
  projectRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  projectRowText: { fontSize: 15, fontFamily: 'Inter_400Regular' },

  // Participant styles
  participantGroup: { gap: 6 },
  participantGroupLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 4 },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  participantAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  participantName: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  // Stats styles
  statCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  statCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statName: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  statLastWalk: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  statGrid: { gap: 0 },
  statGridHeader: { flexDirection: 'row', paddingBottom: 6 },
  statGridRow: { flexDirection: 'row', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  statColLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  statRowLabel: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
  statVal: { flex: 1, textAlign: 'center', fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  // Past trips list styles
  pastTripsSection: { gap: 4, marginTop: 2 },
  pastTripsToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  pastTripsLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  pastTripRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth,
  },
  pastTripIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pastTripDate: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  pastTripTime: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  pastTripRoute: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 2 },
  pastTripRight: { alignItems: 'flex-end', gap: 1 },
  pastTripDist: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  pastTripDur: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  pastTripAvatars: { flexDirection: 'row', gap: 3 },
  pastTripAvatar: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  seeMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  seeMoreText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
