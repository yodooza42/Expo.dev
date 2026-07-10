import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import { SubPageHeader } from '@/components/SubPageHeader';
import {
  CategoryConfig,
  DEFAULT_CATEGORY_CONFIGS,
  getCategoryConfigs,
  saveCategoryConfigs,
} from '@/utils/bankStorage';
import { genId } from '@/utils/ids';

export default function CategorySettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [configs, setConfigs] = useState<CategoryConfig[]>(DEFAULT_CATEGORY_CONFIGS);
  const [addingKwFor, setAddingKwFor] = useState<string | null>(null);
  const [kwDraft, setKwDraft] = useState('');
  const kwInputRef = useRef<TextInput>(null);

  const [renameModal, setRenameModal] = useState<{ id: string; name: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const [addCatModal, setAddCatModal] = useState<'income' | 'expense' | null>(null);
  const [addCatDraft, setAddCatDraft] = useState('');

  useEffect(() => {
    getCategoryConfigs().then(setConfigs);
  }, []);

  async function persist(next: CategoryConfig[]) {
    setConfigs(next);
    await saveCategoryConfigs(next);
  }

  function removeKeyword(catId: string, kwIdx: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    persist(configs.map(c =>
      c.id === catId ? { ...c, keywords: c.keywords.filter((_, i) => i !== kwIdx) } : c,
    ));
  }

  function confirmAddKeyword(catId: string) {
    const trimmed = kwDraft.trim();
    if (!trimmed) { setAddingKwFor(null); setKwDraft(''); return; }
    const already = configs.find(c => c.id === catId)?.keywords ?? [];
    if (!already.some(k => k.toLowerCase() === trimmed.toLowerCase())) {
      persist(configs.map(c =>
        c.id === catId ? { ...c, keywords: [...c.keywords, trimmed] } : c,
      ));
    }
    setAddingKwFor(null);
    setKwDraft('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function openRename(cat: CategoryConfig) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRenameDraft(cat.name);
    setRenameModal({ id: cat.id, name: cat.name });
  }

  function confirmRename() {
    const trimmed = renameDraft.trim();
    if (!trimmed || !renameModal) { setRenameModal(null); return; }
    persist(configs.map(c => c.id === renameModal.id ? { ...c, name: trimmed } : c));
    setRenameModal(null);
  }

  function deleteCategory(cat: CategoryConfig) {
    Alert.alert(
      'Supprimer la catégorie',
      `Supprimer "${cat.name}" ? Les transactions existantes conserveront ce label.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            persist(configs.filter(c => c.id !== cat.id));
          },
        },
      ],
    );
  }

  function confirmAddCategory() {
    const trimmed = addCatDraft.trim();
    if (!trimmed || !addCatModal) { setAddCatModal(null); return; }
    const maxOrder = Math.max(0, ...configs.filter(c => c.type === addCatModal).map(c => c.order ?? 0));
    const newCat: CategoryConfig = { id: genId(), name: trimmed, type: addCatModal, keywords: [], order: maxOrder + 1 };
    persist([...configs, newCat]);
    setAddCatModal(null);
    setAddCatDraft('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const expense = configs.filter(c => c.type === 'expense');
  const income  = configs.filter(c => c.type === 'income');

  function moveUp(type: 'income' | 'expense', idx: number) {
    if (idx <= 0) return;
    const list = configs.filter(c => c.type === type);
    const other = configs.filter(c => c.type !== type);
    const reordered = [...list];
    const temp = reordered[idx]!;
    reordered[idx] = reordered[idx - 1]!;
    reordered[idx - 1] = temp;
    reordered.forEach((c, i) => (c.order = i + 1));
    Haptics.selectionAsync();
    persist([...reordered, ...other]);
  }

  function moveDown(type: 'income' | 'expense', idx: number) {
    const list = configs.filter(c => c.type === type);
    if (idx >= list.length - 1) return;
    const other = configs.filter(c => c.type !== type);
    const reordered = [...list];
    const temp = reordered[idx]!;
    reordered[idx] = reordered[idx + 1]!;
    reordered[idx + 1] = temp;
    reordered.forEach((c, i) => (c.order = i + 1));
    Haptics.selectionAsync();
    persist([...reordered, ...other]);
  }

  function renderSection(label: string, list: CategoryConfig[], type: 'income' | 'expense') {
    const accent = type === 'expense' ? '#EF4444' : '#4CAF50';
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{label}</Text>
        {list.map((cat, idx) => (
          <View key={cat.id} style={[styles.catCard, { backgroundColor: colors.card, borderColor: colors.border }]}>

            {/* Name row */}
            <View style={styles.nameRow}>
              <View style={[styles.typeDot, { backgroundColor: accent }]} />
              <Text style={[styles.catName, { color: colors.foreground }]} numberOfLines={1}>
                {cat.name}
              </Text>
              {/* Order arrows */}
              <Pressable onPress={() => moveUp(type, idx)} hitSlop={8} style={styles.iconBtn} disabled={idx === 0}>
                <MaterialCommunityIcons name="chevron-up" size={16} color={idx === 0 ? colors.muted : colors.mutedForeground} />
              </Pressable>
              <Pressable onPress={() => moveDown(type, idx)} hitSlop={8} style={styles.iconBtn} disabled={idx === list.length - 1}>
                <MaterialCommunityIcons name="chevron-down" size={16} color={idx === list.length - 1 ? colors.muted : colors.mutedForeground} />
              </Pressable>
              <Pressable onPress={() => openRename(cat)} hitSlop={8} style={styles.iconBtn}>
                <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.mutedForeground} />
              </Pressable>
              <Pressable onPress={() => deleteCategory(cat)} hitSlop={8} style={styles.iconBtn}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#EF4444" />
              </Pressable>
            </View>

            {/* Keywords */}
            <View style={styles.kwSection}>
              <Text style={[styles.kwLabel, { color: colors.mutedForeground }]}>Mots-clés</Text>
              <View style={styles.kwRow}>
                {cat.keywords.map((kw, i) => (
                  <View key={i} style={[styles.kwChip, { backgroundColor: accent + '18', borderColor: accent + '55' }]}>
                    <Text style={[styles.kwText, { color: accent }]}>{kw}</Text>
                    <Pressable onPress={() => removeKeyword(cat.id, i)} hitSlop={6}>
                      <MaterialCommunityIcons name="close" size={12} color={accent} />
                    </Pressable>
                  </View>
                ))}
                {addingKwFor === cat.id ? (
                  <View style={[styles.kwInputChip, { borderColor: colors.primary, backgroundColor: colors.background }]}>
                    <TextInput
                      ref={kwInputRef}
                      value={kwDraft}
                      onChangeText={setKwDraft}
                      placeholder="Mot-clé…"
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.kwInput, { color: colors.foreground }]}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => confirmAddKeyword(cat.id)}
                      onBlur={() => confirmAddKeyword(cat.id)}
                    />
                  </View>
                ) : (
                  <Pressable
                    onPress={() => { setAddingKwFor(cat.id); setKwDraft(''); }}
                    style={[styles.kwAddBtn, { borderColor: colors.border }]}
                  >
                    <MaterialCommunityIcons name="plus" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.kwAddTxt, { color: colors.mutedForeground }]}>Ajouter</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        ))}

        {/* Add category button */}
        <Pressable
          onPress={() => { setAddCatDraft(''); setAddCatModal(type); }}
          style={[styles.addCatBtn, { borderColor: accent + '80', backgroundColor: accent + '10' }]}
        >
          <MaterialCommunityIcons name="plus" size={16} color={accent} />
          <Text style={[styles.addCatTxt, { color: accent }]}>Nouvelle catégorie</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SubPageHeader title="Catégories" />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>
        {renderSection('Dépenses', expense, 'expense')}
        {renderSection('Revenus', income, 'income')}
      </ScrollView>

      {/* Rename modal */}
      <Modal visible={renameModal !== null} transparent animationType="fade" onRequestClose={() => setRenameModal(null)}>
        <Pressable style={styles.overlay} onPress={() => setRenameModal(null)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Renommer</Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              autoFocus
              style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              returnKeyType="done"
              onSubmitEditing={confirmRename}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setRenameModal(null)} style={[styles.modalBtn, { backgroundColor: colors.muted }]}>
                <Text style={[styles.modalBtnTxt, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
              <Pressable onPress={confirmRename} style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                <Text style={[styles.modalBtnTxt, { color: '#000' }]}>Enregistrer</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add category modal */}
      <Modal visible={addCatModal !== null} transparent animationType="fade" onRequestClose={() => setAddCatModal(null)}>
        <Pressable style={styles.overlay} onPress={() => setAddCatModal(null)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Nouvelle catégorie {addCatModal === 'expense' ? 'de dépense' : 'de revenu'}
            </Text>
            <TextInput
              value={addCatDraft}
              onChangeText={setAddCatDraft}
              placeholder="Ex : Chiens, Tabac, Sport…"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              returnKeyType="done"
              onSubmitEditing={confirmAddCategory}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setAddCatModal(null)} style={[styles.modalBtn, { backgroundColor: colors.muted }]}>
                <Text style={[styles.modalBtnTxt, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
              <Pressable onPress={confirmAddCategory} style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                <Text style={[styles.modalBtnTxt, { color: '#000' }]}>Créer</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  scroll: { padding: 16, gap: 24 },

  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },

  catCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { flex: 1, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  iconBtn: { padding: 4 },

  kwSection: { gap: 6 },
  kwLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.4 },
  kwRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kwChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  kwText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  kwInputChip: {
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
    minWidth: 100,
  },
  kwInput: { fontSize: 13, fontFamily: 'Inter_400Regular', padding: 0 },
  kwAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: StyleSheet.hairlineWidth,
  },
  kwAddTxt: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  addCatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  addCatTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  overlay: {
    flex: 1, backgroundColor: '#00000088',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  modalSheet: { width: '100%', borderRadius: 16, padding: 20, gap: 14 },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  modalInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, fontFamily: 'Inter_400Regular',
  },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  modalBtn: {
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 8, minWidth: 90, alignItems: 'center',
  },
  modalBtnTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
