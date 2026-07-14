import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import {
  type ShoppingCategory,
  type ShoppingItem,
  getShoppingCategories,
  getShoppingList,
  saveShoppingCategories,
  saveShoppingList,
} from '@/utils/shoppingListStorage';

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const CAT_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#F44336', '#9C27B0',
  '#E91E63', '#00BCD4', '#795548', '#607D8B', '#FF5722',
];

export default function ShoppingListScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [categories, setCategories] = useState<ShoppingCategory[]>([]);
  const [newName, setNewName] = useState('');
  const [flatMode, setFlatMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [catModal, setCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(CAT_COLORS[0]!);

  const [pickerItemId, setPickerItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [its, cats] = await Promise.all([getShoppingList(), getShoppingCategories()]);
    setItems(its);
    setCategories(cats);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function persist(next: ShoppingItem[]) {
    setItems(next);
    await saveShoppingList(next);
  }

  async function persistCats(next: ShoppingCategory[]) {
    setCategories(next);
    await saveShoppingCategories(next);
  }

  async function addItem() {
    const name = newName.trim();
    if (!name) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await persist([...items, { id: genId(), name, checked: false }]);
    setNewName('');
  }

  async function toggleItem(id: string) {
    Haptics.selectionAsync();
    await persist(items.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  }

  async function deleteItem(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await persist(items.filter(i => i.id !== id));
  }

  function confirmDelete(item: ShoppingItem) {
    Alert.alert('Supprimer ?', `Retirer "${item.name}" de la liste ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteItem(item.id) },
    ]);
  }

  async function assignCategory(itemId: string, categoryId: string | undefined) {
    Haptics.selectionAsync();
    await persist(items.map(i => i.id === itemId ? { ...i, categoryId } : i));
    setPickerItemId(null);
  }

  async function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    const next = [...categories, { id: genId(), name, color: newCatColor }];
    await persistCats(next);
    setNewCatName('');
    setNewCatColor(CAT_COLORS[next.length % CAT_COLORS.length]!);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function deleteCategory(id: string) {
    await persist(items.map(i => i.categoryId === id ? { ...i, categoryId: undefined } : i));
    await persistCats(categories.filter(c => c.id !== id));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  async function sortAlpha() {
    Haptics.selectionAsync();
    const unchecked = [...items.filter(i => !i.checked)].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const checked   = [...items.filter(i =>  i.checked)].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    await persist([...unchecked, ...checked]);
  }

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const sections = useMemo(() => {
    const result: Array<{ key: string; title: string; color: string; data: ShoppingItem[]; total: number }> = [];
    for (const cat of categories) {
      const all = items.filter(i => i.categoryId === cat.id);
      if (all.length === 0) continue;
      const sorted = [...all.filter(i => !i.checked), ...all.filter(i => i.checked)];
      result.push({ key: cat.id, title: cat.name, color: cat.color, data: collapsed.has(cat.id) ? [] : sorted, total: all.length });
    }
    const uncat = items.filter(i => !i.categoryId);
    if (uncat.length > 0) {
      const sorted = [...uncat.filter(i => !i.checked), ...uncat.filter(i => i.checked)];
      result.push({ key: '__uncat__', title: 'Sans catégorie', color: colors.mutedForeground, data: collapsed.has('__uncat__') ? [] : sorted, total: uncat.length });
    }
    return result;
  }, [items, categories, collapsed, colors.mutedForeground]);

  const flatUnchecked = useMemo(() => items.filter(i => !i.checked), [items]);
  const uncheckedTotal = items.filter(i => !i.checked).length;
  const checkedTotal   = items.filter(i =>  i.checked).length;
  const pickerItem = pickerItemId ? items.find(i => i.id === pickerItemId) : null;

  function renderItemRow(item: ShoppingItem) {
    const cat = item.categoryId ? categories.find(c => c.id === item.categoryId) : null;
    return (
      <Pressable
        key={item.id}
        onPress={() => toggleItem(item.id)}
        onLongPress={() => confirmDelete(item)}
        style={[styles.row, { backgroundColor: colors.card }]}
      >
        <View style={[styles.checkbox, {
          borderColor: item.checked ? '#4CAF50' : colors.mutedForeground,
          backgroundColor: item.checked ? '#4CAF5020' : 'transparent',
        }]}>
          {item.checked && <MaterialCommunityIcons name="check" size={14} color="#4CAF50" />}
        </View>
        <Text
          style={[styles.itemName, { color: item.checked ? colors.mutedForeground : colors.foreground }, item.checked && styles.itemChecked]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Pressable
          onPress={() => setPickerItemId(item.id)}
          hitSlop={8}
          style={[styles.catTagBtn, { backgroundColor: cat ? cat.color + '22' : colors.muted + '44' }]}
        >
          <MaterialCommunityIcons name="tag-outline" size={12} color={cat ? cat.color : colors.mutedForeground} />
        </Pressable>
        <Pressable onPress={() => confirmDelete(item)} hitSlop={8} style={styles.deleteBtn}>
          <MaterialCommunityIcons name="close" size={16} color={colors.mutedForeground} />
        </Pressable>
      </Pressable>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <MaterialCommunityIcons name="cart-outline" size={20} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Liste de courses</Text>
        </View>
        <Pressable onPress={sortAlpha} hitSlop={8} style={styles.iconBtn}>
          <MaterialCommunityIcons name="sort-alphabetical-ascending" size={20} color={colors.mutedForeground} />
        </Pressable>
        <Pressable onPress={() => setCatModal(true)} hitSlop={8} style={styles.iconBtn}>
          <MaterialCommunityIcons name="folder-edit-outline" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* ── Add input ── */}
      <View style={[styles.addRow, { borderBottomColor: colors.border }]}>
        <TextInput
          style={[styles.addInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
          value={newName}
          onChangeText={setNewName}
          placeholder="Ajouter un article…"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="done"
          onSubmitEditing={addItem}
        />
        <Pressable
          onPress={addItem}
          style={[styles.addBtn, { backgroundColor: newName.trim() ? colors.primary : colors.muted }]}
          disabled={!newName.trim()}
        >
          <MaterialCommunityIcons name="plus" size={22} color={newName.trim() ? '#121212' : colors.mutedForeground} />
        </Pressable>
      </View>

      {/* ── Stats + flat toggle ── */}
      {items.length > 0 && (
        <View style={[styles.statsRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.statsText, { color: colors.mutedForeground }]}>{uncheckedTotal} à acheter</Text>
          <Text style={[styles.statsDot]}>·</Text>
          <Text style={[styles.statsText, { color: '#4CAF50' }]}>{checkedTotal} en stock</Text>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setFlatMode(f => !f); }}
            style={[styles.flatBtn, {
              backgroundColor: flatMode ? colors.primary + '22' : colors.card,
              borderColor: flatMode ? colors.primary : colors.border,
            }]}
          >
            <MaterialCommunityIcons name="format-list-checks" size={13} color={flatMode ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.flatBtnText, { color: flatMode ? colors.primary : colors.mutedForeground }]}>
              Ce qui manque
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── List ── */}
      {flatMode ? (
        <FlatList
          data={flatUnchecked}
          keyExtractor={i => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="check-all" size={48} color="#4CAF50" />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Rien à acheter !</Text>
            </View>
          }
          renderItem={({ item }) => renderItemRow(item)}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={i => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="cart-outline" size={48} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Liste vide — ajoute ton premier article
              </Text>
            </View>
          }
          renderSectionHeader={({ section }) => {
            const isOpen = !collapsed.has(section.key);
            const uncheckedCount = items.filter(i =>
              section.key === '__uncat__' ? !i.categoryId && !i.checked : i.categoryId === section.key && !i.checked,
            ).length;
            return (
              <Pressable
                onPress={() => toggleCollapse(section.key)}
                style={[styles.catHeader, { backgroundColor: colors.background }]}
              >
                <View style={[styles.catDot, { backgroundColor: section.color }]} />
                <Text style={[styles.catHeaderTitle, { color: colors.foreground }]}>{section.title}</Text>
                <Text style={[styles.catTotal, { color: colors.mutedForeground }]}>{section.total}</Text>
                {uncheckedCount > 0 && (
                  <View style={[styles.catBadge, { backgroundColor: section.color + '22' }]}>
                    <Text style={[styles.catBadgeText, { color: section.color }]}>{uncheckedCount} à avoir</Text>
                  </View>
                )}
                <MaterialCommunityIcons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
              </Pressable>
            );
          }}
          renderItem={({ item }) => renderItemRow(item)}
        />
      )}

      {/* ── Category picker modal ── */}
      <Modal visible={!!pickerItemId} transparent animationType="fade" onRequestClose={() => setPickerItemId(null)}>
        <Pressable style={styles.overlay} onPress={() => setPickerItemId(null)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]} numberOfLines={1}>
              🏷 {pickerItem?.name}
            </Text>
            <Pressable
              style={[styles.pickerRow, { borderBottomColor: colors.border }]}
              onPress={() => assignCategory(pickerItemId!, undefined)}
            >
              <MaterialCommunityIcons name="tag-off-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.pickerRowText, { color: colors.mutedForeground, flex: 1 }]}>Sans catégorie</Text>
              {!pickerItem?.categoryId && <MaterialCommunityIcons name="check" size={16} color="#4CAF50" />}
            </Pressable>
            {categories.map(cat => (
              <Pressable
                key={cat.id}
                style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                onPress={() => assignCategory(pickerItemId!, cat.id)}
              >
                <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                <Text style={[styles.pickerRowText, { color: colors.foreground, flex: 1 }]}>{cat.name}</Text>
                {pickerItem?.categoryId === cat.id && <MaterialCommunityIcons name="check" size={16} color="#4CAF50" />}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Category management modal ── */}
      <Modal visible={catModal} transparent animationType="slide" onRequestClose={() => setCatModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setCatModal(false)}>
          <Pressable style={[styles.mgmtSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Catégories</Text>

            {/* Add new */}
            <View style={styles.addCatRow}>
              <TextInput
                style={[styles.addInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                value={newCatName}
                onChangeText={setNewCatName}
                placeholder="Nouvelle catégorie…"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
                onSubmitEditing={addCategory}
              />
              <Pressable
                onPress={addCategory}
                style={[styles.addBtn, { backgroundColor: newCatName.trim() ? newCatColor : colors.muted }]}
                disabled={!newCatName.trim()}
              >
                <MaterialCommunityIcons name="plus" size={20} color={newCatName.trim() ? '#121212' : colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Color palette */}
            <View style={styles.colorRow}>
              {CAT_COLORS.map(c => (
                <Pressable
                  key={c}
                  onPress={() => setNewCatColor(c)}
                  style={[styles.colorDot, { backgroundColor: c, borderWidth: newCatColor === c ? 2.5 : 0, borderColor: '#fff' }]}
                />
              ))}
            </View>

            {/* Existing categories */}
            <ScrollView style={styles.catList} showsVerticalScrollIndicator={false}>
              {categories.length === 0 && (
                <Text style={[styles.emptyText, { color: colors.mutedForeground, paddingVertical: 16 }]}>
                  Aucune catégorie — crées-en une ci-dessus
                </Text>
              )}
              {categories.map(cat => {
                const count = items.filter(i => i.categoryId === cat.id).length;
                return (
                  <View key={cat.id} style={[styles.catMgmtRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                    <Text style={[styles.catMgmtName, { color: colors.foreground }]}>{cat.name}</Text>
                    <Text style={[styles.catCount, { color: colors.mutedForeground }]}>{count} art.</Text>
                    <Pressable
                      hitSlop={8}
                      onPress={() => Alert.alert(
                        'Supprimer ?',
                        `Supprimer "${cat.name}" ? Les articles seront dé-classés.`,
                        [
                          { text: 'Annuler', style: 'cancel' },
                          { text: 'Supprimer', style: 'destructive', onPress: () => deleteCategory(cat.id) },
                        ],
                      )}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  iconBtn:      { padding: 6 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:  { fontSize: 18, fontFamily: 'Inter_600SemiBold' },

  addRow: {
    flexDirection: 'row', gap: 10, padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addInput: {
    flex: 1, borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, fontFamily: 'Inter_400Regular',
  },
  addBtn: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statsText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  statsDot:  { fontSize: 12, color: '#555' },

  flatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
  },
  flatBtnText: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  list: { padding: 10, gap: 2 },
  sep:  { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  catHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 6,
  },
  catDot:         { width: 10, height: 10, borderRadius: 5 },
  catHeaderTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', flex: 1 },
  catTotal:       { fontSize: 12, fontFamily: 'Inter_400Regular' },
  catBadge:       { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  catBadgeText:   { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  itemName:    { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  itemChecked: { textDecorationLine: 'line-through', opacity: 0.5 },
  catTagBtn:   { borderRadius: 6, padding: 5 },
  deleteBtn:   { padding: 4 },

  empty:     { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 24 },

  overlay: {
    flex: 1, backgroundColor: '#00000088',
    justifyContent: 'center', alignItems: 'center',
  },

  pickerSheet: {
    width: '85%', borderRadius: 16, borderWidth: 1,
    paddingTop: 16, paddingBottom: 8, overflow: 'hidden',
  },
  sheetTitle: {
    fontSize: 15, fontFamily: 'Inter_600SemiBold',
    paddingHorizontal: 16, marginBottom: 8,
  },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerRowText: { fontSize: 14, fontFamily: 'Inter_400Regular' },

  mgmtSheet: {
    width: '90%', borderRadius: 16, borderWidth: 1,
    paddingTop: 16, paddingBottom: 8, overflow: 'hidden',
  },
  addCatRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  colorRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  colorDot:  { width: 26, height: 26, borderRadius: 13 },
  catList:   { maxHeight: 240 },
  catMgmtRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  catMgmtName: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  catCount:    { fontSize: 12, fontFamily: 'Inter_400Regular', marginRight: 8 },
});
