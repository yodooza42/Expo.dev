import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
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

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import type { MaintenanceItem, Vehicle } from '@/types/trips';
import { computeAutoCostPerKm } from '@/utils/costPerKm';
import { computeOdometer, getTrips, getVehicleSettings, saveVehicleSettings } from '@/utils/tripStorage';
import { genId } from '@/utils/ids';

export default function VehicleSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { projects } = useApp();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string>('car');
  const [trips, setTrips] = useState<{ vehicle: string | null; distanceKm: number }[]>([]);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemInterval, setNewItemInterval] = useState('');
  const [newItemType, setNewItemType] = useState<'km' | 'date'>('km');
  const [newItemDays, setNewItemDays] = useState('');
  const [newItemCost, setNewItemCost] = useState('');

  const [addVehicleVisible, setAddVehicleVisible] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehicleType, setNewVehicleType] = useState<'car' | 'moto' | 'other'>('car');

  const [projectPickerVisible, setProjectPickerVisible] = useState(false);

  const load = useCallback(async () => {
    const [v, t] = await Promise.all([getVehicleSettings(), getTrips()]);
    setVehicles(v);
    setTrips(t.map(tr => ({ vehicle: tr.vehicle, distanceKm: tr.distanceKm })));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Fallback selectedId if the currently selected vehicle no longer exists
  useEffect(() => {
    if (vehicles.length > 0 && !vehicles.find(v => v.id === selectedId)) {
      setSelectedId(vehicles[0]!.id);
    }
  }, [vehicles, selectedId]);

  const selected = vehicles.find(v => v.id === selectedId) ?? vehicles[0];
  const odo = selected ? computeOdometer(trips as any, selected.id, selected.odometerBaseKm) : 0;
  const tabColor = selected?.type === 'moto' ? '#FF9800' : '#2196F3';

  function updateSelected(partial: Partial<Vehicle>) {
    setVehicles(prev => prev.map(v => v.id === selectedId ? { ...v, ...partial } : v));
  }

  async function save() {
    await saveVehicleSettings(vehicles);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
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
      ? 'La date de référence sera mise à aujourd\'hui.'
      : `Le kilométrage de référence sera mis à ${odo.toFixed(0)} km.`;
    Alert.alert('Marquer l\'entretien effectué ?', msg, [
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
      costPerKm: newVehicleType === 'moto' ? 0.10 : 0.15,
      odometerBaseKm: 0,
      maintenanceItems: [],
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
            const chipColor = v.type === 'moto' ? '#FF9800' : '#2196F3';
            return (
              <Pressable
                key={v.id}
                onPress={() => { Haptics.selectionAsync(); setSelectedId(v.id); }}
                style={[styles.chip, {
                  backgroundColor: active ? chipColor + '22' : colors.muted,
                  borderColor: active ? chipColor : colors.border,
                }]}
              >
                <MaterialCommunityIcons
                  name={v.type === 'moto' ? 'motorbike' : v.type === 'car' ? 'car' : 'car-outline'}
                  size={14}
                  color={active ? chipColor : colors.mutedForeground}
                />
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

      {selected ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Vehicle name */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>NOM DU VÉHICULE</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              value={selected.name}
              onChangeText={name => updateSelected({ name })}
              placeholderTextColor={colors.mutedForeground}
              placeholder="Ex: Doblo, Msx, Tesla…"
            />
          </View>

          {/* Vehicle type */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TYPE</Text>
            <View style={styles.typeRow}>
              {([['car', 'car', 'Voiture'], ['moto', 'motorbike', 'Moto'], ['other', 'car-outline', 'Autre']] as const).map(([t, icon, label]) => (
                <Pressable
                  key={t}
                  onPress={() => updateSelected({ type: t })}
                  style={[styles.typeBtn, {
                    backgroundColor: selected.type === t ? tabColor + '22' : colors.muted,
                    borderColor: selected.type === t ? tabColor : colors.border,
                  }]}
                >
                  <MaterialCommunityIcons name={icon} size={16} color={selected.type === t ? tabColor : colors.mutedForeground} />
                  <Text style={[styles.typeBtnLabel, { color: selected.type === t ? tabColor : colors.mutedForeground }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Odometer display */}
          <View style={[styles.odoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons
              name={selected.type === 'moto' ? 'motorbike' : 'car'}
              size={22}
              color={tabColor}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.odoVal, { color: colors.foreground }]}>{odo.toFixed(0)} km</Text>
              <Text style={[styles.odoSub, { color: colors.mutedForeground }]}>Odomètre estimé</Text>
            </View>
          </View>

          {/* Cost per km */}
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
                onChangeText={t => {
                  const v = parseFloat(t);
                  if (!isNaN(v)) updateSelected({ costPerKm: v });
                }}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.mutedForeground}
                placeholder="0.15"
              />
            )}
          </View>

          {/* Odometer base */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ODOMÈTRE DE DÉPART (km)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              value={selected.odometerBaseKm.toString()}
              onChangeText={t => {
                const v = parseFloat(t);
                if (!isNaN(v)) updateSelected({ odometerBaseKm: v });
              }}
              keyboardType="numeric"
              placeholderTextColor={colors.mutedForeground}
              placeholder="0"
            />
          </View>

          {/* Maintenance project */}
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

          {/* Maintenance items */}
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
                    <Text style={[styles.itemStatus, { color: isOverdue ? '#FF9800' : colors.mutedForeground }]}>
                      {statusText}
                    </Text>
                    <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{subText}</Text>
                  </View>
                );
              })
            )}
          </View>

          {/* Delete vehicle (not for default car/moto) */}
          <Pressable
            onPress={handleDeleteVehicle}
            style={[styles.deleteVehicleBtn, { borderColor: '#EF4444' }]}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={16} color="#EF4444" />
            <Text style={[styles.deleteVehicleText, { color: '#EF4444' }]}>Supprimer {selected.name}</Text>
          </Pressable>
        </ScrollView>
      ) : null}

      {/* Add maintenance item modal */}
      <Modal visible={addModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setAddModalVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Nouveau rappel</Text>

            <View style={styles.typeRow}>
              <Pressable
                onPress={() => setNewItemType('km')}
                style={[styles.typeBtn, { backgroundColor: newItemType === 'km' ? tabColor + '30' : colors.muted, borderColor: newItemType === 'km' ? tabColor : colors.border }]}
              >
                <MaterialCommunityIcons name="speedometer" size={14} color={newItemType === 'km' ? tabColor : colors.mutedForeground} />
                <Text style={[styles.typeBtnLabel, { color: newItemType === 'km' ? tabColor : colors.mutedForeground }]}>Kilométrage</Text>
              </Pressable>
              <Pressable
                onPress={() => setNewItemType('date')}
                style={[styles.typeBtn, { backgroundColor: newItemType === 'date' ? '#7C3AED30' : colors.muted, borderColor: newItemType === 'date' ? '#7C3AED' : colors.border }]}
              >
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

      {/* Add vehicle modal */}
      <Modal visible={addVehicleVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setAddVehicleVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Ajouter un véhicule</Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Nom</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Ex: Twingo, Vespa…"
              placeholderTextColor={colors.mutedForeground}
              value={newVehicleName}
              onChangeText={setNewVehicleName}
              autoFocus
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 8 }]}>Type</Text>
            <View style={styles.typeRow}>
              {([['car', 'car', 'Voiture'], ['moto', 'motorbike', 'Moto'], ['other', 'car-outline', 'Autre']] as const).map(([t, icon, label]) => (
                <Pressable
                  key={t}
                  onPress={() => setNewVehicleType(t)}
                  style={[styles.typeBtn, {
                    backgroundColor: newVehicleType === t ? '#FFC10722' : colors.muted,
                    borderColor: newVehicleType === t ? '#FFC107' : colors.border,
                  }]}
                >
                  <MaterialCommunityIcons name={icon} size={16} color={newVehicleType === t ? '#FFC107' : colors.mutedForeground} />
                  <Text style={[styles.typeBtnLabel, { color: newVehicleType === t ? '#FFC107' : colors.mutedForeground }]}>{label}</Text>
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
      <Modal visible={projectPickerVisible} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setProjectPickerVisible(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, marginBottom: 8 }]}>Projet entretien</Text>
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
          </View>
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
});
