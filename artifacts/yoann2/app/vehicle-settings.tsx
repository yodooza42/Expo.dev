import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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

import { useColors } from '@/hooks/useColors';
import type { MaintenanceItem, VehicleSettings } from '@/types/trips';
import { computeOdometer, getTrips, getVehicleSettings, saveVehicleSettings } from '@/utils/tripStorage';

function genId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export default function VehicleSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [settings, setSettings] = useState<VehicleSettings>({
    car: { costPerKm: 0.15, odometerBaseKm: 0, maintenanceItems: [] },
    moto: { costPerKm: 0.10, odometerBaseKm: 0, maintenanceItems: [] },
  });
  const [tab, setTab] = useState<'car' | 'moto'>('car');
  const [carOdo, setCarOdo] = useState(0);
  const [motoOdo, setMotoOdo] = useState(0);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemInterval, setNewItemInterval] = useState('');

  const load = useCallback(async () => {
    const [s, trips] = await Promise.all([getVehicleSettings(), getTrips()]);
    setSettings(s);
    setCarOdo(computeOdometer(trips, 'car', s.car.odometerBaseKm));
    setMotoOdo(computeOdometer(trips, 'moto', s.moto.odometerBaseKm));
  }, []);

  useEffect(() => { load(); }, [load]);

  const cfg = settings[tab];
  const odo = tab === 'car' ? carOdo : motoOdo;

  function update(partial: Partial<typeof cfg>) {
    setSettings(prev => ({ ...prev, [tab]: { ...prev[tab], ...partial } }));
  }

  async function save() {
    await saveVehicleSettings(settings);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  function openAddModal() {
    setNewItemName('');
    setNewItemInterval('');
    setAddModalVisible(true);
  }

  function confirmAddItem() {
    const name = newItemName.trim();
    const interval = parseInt(newItemInterval, 10);
    if (!name || isNaN(interval) || interval <= 0) return;
    const item: MaintenanceItem = {
      id: genId(),
      name,
      intervalKm: interval,
      lastResetKm: odo,
    };
    update({ maintenanceItems: [...cfg.maintenanceItems, item] });
    setAddModalVisible(false);
  }

  function resetItem(id: string) {
    Alert.alert(
      'Marquer l\'entretien effectué ?',
      `Le kilométrage de référence sera mis à jour à ${odo.toFixed(0)} km.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer', onPress: () => {
            update({
              maintenanceItems: cfg.maintenanceItems.map(item =>
                item.id === id ? { ...item, lastResetKm: odo } : item,
              ),
            });
          },
        },
      ],
    );
  }

  function deleteItem(id: string) {
    Alert.alert('Supprimer ce rappel ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: () => {
          update({ maintenanceItems: cfg.maintenanceItems.filter(i => i.id !== id) });
        },
      },
    ]);
  }

  const tabColor = tab === 'car' ? '#2196F3' : '#FF9800';
  const tabIcon = tab === 'car' ? 'car' : 'motorbike';

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={22} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Véhicules & entretien</Text>
        <Pressable onPress={save} hitSlop={12}>
          <Text style={[styles.saveBtn, { color: colors.primary }]}>Sauvegarder</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {(['car', 'moto'] as const).map(v => (
          <Pressable
            key={v}
            onPress={() => setTab(v)}
            style={[
              styles.tabBtn,
              tab === v && { borderBottomColor: v === 'car' ? '#2196F3' : '#FF9800', borderBottomWidth: 2 },
            ]}
          >
            <MaterialCommunityIcons
              name={v === 'car' ? 'car' : 'motorbike'}
              size={18}
              color={tab === v ? (v === 'car' ? '#2196F3' : '#FF9800') : colors.mutedForeground}
            />
            <Text style={[styles.tabLabel, { color: tab === v ? (v === 'car' ? '#2196F3' : '#FF9800') : colors.mutedForeground }]}>
              {v === 'car' ? 'Voiture' : 'Moto'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Odometer display */}
        <View style={[styles.odoDisplay, { backgroundColor: tabColor + '18', borderColor: tabColor }]}>
          <MaterialCommunityIcons name={tabIcon as any} size={22} color={tabColor} />
          <View>
            <Text style={[styles.odoVal, { color: tabColor }]}>{odo.toFixed(0)} km</Text>
            <Text style={[styles.odoSub, { color: colors.mutedForeground }]}>
              Odomètre total (base + trajets taggués)
            </Text>
          </View>
        </View>

        {/* Cost per km */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Coût au km (€)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
            keyboardType="decimal-pad"
            value={String(cfg.costPerKm)}
            onChangeText={v => {
              const n = parseFloat(v.replace(',', '.'));
              if (!isNaN(n) && n >= 0) update({ costPerKm: n });
            }}
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        {/* Odometer base */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Odomètre de départ (km)
          </Text>
          <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
            Kilométrage réel de votre compteur au début du suivi
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
            keyboardType="numeric"
            value={String(cfg.odometerBaseKm)}
            onChangeText={v => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n >= 0) update({ odometerBaseKm: n });
            }}
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        {/* Maintenance items */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Rappels d'entretien</Text>
            <Pressable
              onPress={openAddModal}
              style={[styles.addBtn, { backgroundColor: tabColor + '22', borderColor: tabColor }]}
            >
              <MaterialCommunityIcons name="plus" size={14} color={tabColor} />
              <Text style={[styles.addLabel, { color: tabColor }]}>Ajouter</Text>
            </Pressable>
          </View>

          {cfg.maintenanceItems.length === 0 ? (
            <View style={[styles.emptyItems, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyItemsText, { color: colors.mutedForeground }]}>
                Aucun rappel. Ajoutez une vidange, des pneus, une révision…
              </Text>
            </View>
          ) : (
            cfg.maintenanceItems.map(item => {
              const kmSince = odo - item.lastResetKm;
              const progress = Math.min(kmSince / item.intervalKm, 1);
              const isOverdue = kmSince >= item.intervalKm;
              const kmLeft = item.intervalKm - kmSince;
              return (
                <View
                  key={item.id}
                  style={[styles.itemCard, { backgroundColor: colors.card, borderColor: isOverdue ? '#FF9800' : colors.border }]}
                >
                  <View style={styles.itemHeader}>
                    <Text style={[styles.itemName, { color: colors.foreground }]}>{item.name}</Text>
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
                        width: `${progress * 100}%` as any,
                        backgroundColor: isOverdue ? '#FF9800' : tabColor,
                      }]}
                    />
                  </View>

                  <Text style={[styles.itemStatus, { color: isOverdue ? '#FF9800' : colors.mutedForeground }]}>
                    {isOverdue
                      ? `⚠️ Dépassé de ${Math.round(-kmLeft)} km`
                      : `${Math.round(kmLeft)} km restants / ${item.intervalKm} km`}
                  </Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>
                    Dernier entretien : {item.lastResetKm.toFixed(0)} km
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Add item modal */}
      <Modal visible={addModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setAddModalVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Nouveau rappel</Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Nom</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="ex: Vidange, Pneus, Révision…"
              placeholderTextColor={colors.mutedForeground}
              value={newItemName}
              onChangeText={setNewItemName}
              autoFocus
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 8 }]}>
              Intervalle (km)
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="ex: 5000"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              value={newItemInterval}
              onChangeText={setNewItemInterval}
            />

            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setAddModalVisible(false)}
                style={[styles.modalBtn, { backgroundColor: colors.muted }]}
              >
                <Text style={[styles.modalBtnLabel, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={confirmAddItem}
                style={[styles.modalBtn, { backgroundColor: tabColor }]}
              >
                <Text style={styles.modalBtnLabel}>Ajouter</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
  },
  tabLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  scroll: { padding: 20, gap: 20 },
  odoDisplay: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1, padding: 18,
  },
  odoVal: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  odoSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldHint: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  input: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, fontFamily: 'Inter_400Regular',
  },
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6,
  },
  addLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  emptyItems: { borderRadius: 12, borderWidth: 1, padding: 20, alignItems: 'center' },
  emptyItemsText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  itemCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flex: 1 },
  itemActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  itemStatus: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  itemSub: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', borderRadius: 20, borderWidth: 1, padding: 24, gap: 8,
  },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFF' },
});
