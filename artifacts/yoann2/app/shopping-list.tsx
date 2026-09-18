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

function isStockTracked(item: ShoppingItem): boolean {
  return item.threshold !== undefined;
}

function isComplete(item: ShoppingItem): boolean {
  if (isStockTracked(item)) return (item.stock ?? 0) >= (item.threshold ?? 0);
  return item.checked;
}

function quantityToBuy(item: ShoppingItem): number {
  if (!isStockTracked(item)) return 0;
  const stock = item.stock ?? 0;
  const threshold = item.threshold ?? 0;
  if (stock >= threshold) return 0;
  return threshold - stock + 1;
}

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

  const [stockItemId, setStockItemId] = useState<string | null>(null);
  const [editStock, setEditStock] = useState(0);
  const [editThreshold, setEditThreshold] = useState(1);

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

  function openStockEditor(item: ShoppingItem) {
    setEditStock(item.stock ?? 0);
    setEditThreshold(item.threshold ?? 1);
    setStockItemId(item.id);
  }

  async function saveStock() {
    if (!stockItemId) return;
    Haptics.selectionAsync();
    await persist(items.map(i =>
      i.id === stockItemId ? { ...i, stock: editStock, threshold: editThreshold } : i,
    ));
    setStockItemId(null);
  }

  async function removeStock() {
    if (!stockItemId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await persist(items.map(i =>
      i.id === stockItemId ? { ...i, stock: undefined, threshold: undefined, checked: false } : i,
    ));
    setStockItemId(null);
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
    const todo = [...items.filter(i => !isComplete(i))].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const done = [...items.filter(i =>  isComplete(i))].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    await persist([...todo, ...done]);
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
      const sorted = [...all.filter(i => !isComplete(i)), ...all.filter(i => isComplete(i))];
      result.push({ key: cat.id, title: cat.name, color: cat.color, data: collapsed.has(cat.id) ? [] : sorted, total: all.length });
    }
    const uncat = items.filter(i => !i.categoryId);
    if (uncat.length > 0) {
      const sorted = [...uncat.filter(i => !isComplete(i)), ...uncat.filter(i => isComplete(i))];
      result.push({ key: '__uncat__', title: 'Sans catégorie', color: colors.mutedForeground, data: collapsed.has('__uncat__') ? [] : sorted, total: uncat.length });
    }
    return result;
  }, [items, categories, collapsed, colors.mutedForeground]);

  const needsToBuyItems = useMemo(() => items.filter(i => !isComplete(i)), [items]);
  const todoTotal = items.filter(i => !isComplete(i)).length;
  const doneTotal = items.filter(i =>  isComplete(i)).length;
  const pickerItem = pickerItemId ? items.find(i => i.id === pickerItemId) : null;
  const stockItem  = stockItemId  ? items.find(i => i.id === stockItemId)  : null;

  function renderItemRow(item: ShoppingItem) {
    const cat = item.categoryId ? categories.find(c => c.id === item.categoryId) : null;
    const tracked = isStockTracked(item);
    const done = isComplete(item);
    const qty = quantityToBuy(item);
    const stock = item.stock ?? 0;
    const threshold = item.threshold ?? 0;
    const stockColor = done ? '#4CAF50' : '#FF9800';

    return (
      <Pressable
        key={item.id}
        onPress={() => tracked ? openStockEditor(item) : toggleItem(item.id)}
        onLongPress={() => confirmDelete(item)}
        style={[styles.row, { backgroundColor: colors.card }]}
      >
        {tracked ? (
          <View style={[styles.stockIcon, { backgroundColor: stockColor + '22', borderColor: stockColor }]}>
            <MaterialCommunityIcons
              name={done ? 'package-variant-closed-check' : 'package-variant'}
              size={15}
              color={stockColor}
            />
          </View>
        ) : (
          <View style={[styles.checkbox, {
            borderColor: done ? '#4CAF50' : colors.mutedForeground,
            backgroundColor: done ? '#4CAF5020' : 'transparent',
          }]}>
            {done && <MaterialCommunityIcons name="check" size={14} color="#4CAF50" />}
          </View>
        )}

        <View style={styles.nameBlock}>
          <Text
            style={[styles.itemName, { color: done ? colors.mutedForeground : colors.foreground }, done && styles.itemChecked]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {tracked && (
            <View style={styles.stockRow}>
              <Text style={[styles.stockText, { color: colors.mutedForeground }]}>
                {stock} en stock · seuil {threshold}
              </Text>
              {qty > 0 && (
                <View style={[styles.qtyBadge, { backgroundColor: '#FF980022' }]}>
                  <Text style={styles.qtyBadgeText}>à acheter : {qty}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <Pressable
          onPress={() => openStockEditor(item)}
          hitSlop={8}
          style={[styles.catTagBtn, { backgroundColor: tracked ? stockColor + '22' : colors.muted + '44' }]}
        >
          <MaterialCommunityIcons
            name={tracked ? 'numeric' : 'numeric-off'}
            size={12}
            color={tracked ? stockColor : colors.mutedForeground}
          />
        </Pressable>
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
          <Text style={[styles.statsText, { color: colors.mutedForeground }]}>{todoTotal} à acheter</Text>
          <Text style={styles.statsDot}>·</Text>
          <Text style={[styles.statsText, { color: '#4CAF50' }]}>{doneTotal} ok</Text>
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
          data={needsToBuyItems}
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
            const todoCount = items.filter(i =>
              (section.key === '__uncat__' ? !i.categoryId : i.categoryId === section.key) && !isComplete(i),
            ).length;
            return (
              <Pressable
                onPress={() => toggleCollapse(section.key)}
                style={[styles.catHeader, { backgroundColor: colors.background }]}
              >
                <View style={[styles.catDot, { backgroundColor: section.color }]} />
                <Text style={[styles.catHeaderTitle, { color: colors.foreground }]}>{section.title}</Text>
                <Text style={[styles.catTotal, { color: colors.mutedForeground }]}>{section.total}</Text>
                {todoCount > 0 && (
                  <View style={[styles.catBadge, { backgroundColor: section.color + '22' }]}>
                    <Text style={[styles.catBadgeText, { color: section.color }]}>{todoCount} à avoir</Text>
                  </View>
                )}
                <MaterialCommunityIcons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
              </Pressable>
            );
          }}
          renderItem={({ item }) => renderItemRow(item)}
        />
      )}

      {/* ── Stock editor modal ── */}
      <Modal visible={!!stockItemId} transparent animationType="fade" onRequestClose={() => setStockItemId(null)}>
        <Pressable style={styles.overlay} onPress={() => setStockItemId(null)}>
          <Pressable style={[styles.stockSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]} numberOfLines={1}>
              📦 {stockItem?.name}
            </Text>

            <View style={[styles.stockDivider, { backgroundColor: colors.border }]} />

            {/* Stock stepper */}
            <View style={styles.stepperRow}>
              <Text style={[styles.stepperLabel, { color: colors.mutedForeground }]}>En stock</Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setEditStock(v => Math.max(0, v - 1)); }}
                  style={[styles.stepBtn, { backgroundColor: colors.muted }]}
                >
                  <MaterialCommunityIcons name="minus" size={18} color={colors.foreground} />
                </Pressable>
                <TextInput
                  style={[styles.stepInput, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
                  value={String(editStock)}
                  onChangeText={t => { const n = parseInt(t, 10); if (!isNaN(n) && n >= 0) setEditStock(n); }}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setEditStock(v => v + 1); }}
                  style={[styles.stepBtn, { backgroundColor: colors.muted }]}
                >
                  <MaterialCommunityIcons name="plus" size={18} color={colors.foreground} />
                </Pressable>
              </View>
            </View>

            {/* Threshold stepper */}
            <View style={styles.stepperRow}>
              <Text style={[styles.stepperLabel, { color: colors.mutedForeground }]}>Seuil minimum</Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setEditThreshold(v => Math.max(1, v - 1)); }}
                  style={[styles.stepBtn, { backgroundColor: colors.muted }]}
                >
                  <MaterialCommunityIcons name="minus" size={18} color={colors.foreground} />
                </Pressable>
                <TextInput
                  style={[styles.stepInput, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
                  value={String(editThreshold)}
                  onChangeText={t => { const n = parseInt(t, 10); if (!isNaN(n) && n >= 1) setEditThreshold(n); }}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setEditThreshold(v => v + 1); }}
                  style={[styles.stepBtn, { backgroundColor: colors.muted }]}
                >
                  <MaterialCommunityIcons name="plus" size={18} color={colors.foreground} />
                </Pressable>
              </View>
            </View>

            {/* Preview */}
            {(() => {
              const qty = editStock >= editThreshold ? 0 : editThreshold - editStock + 1;
              return (
                <View style={[styles.previewBox, { backgroundColor: qty > 0 ? '#FF980015' : '#4CAF5015', borderColor: qty > 0 ? '#FF9800' : '#4CAF50' }]}>
                  <MaterialCommunityIcons name={qty > 0 ? 'cart-arrow-down' : 'check-circle-outline'} size={16} color={qty > 0 ? '#FF9800' : '#4CAF50'} />
                  <Text style={[styles.previewText, { color: qty > 0 ? '#FF9800' : '#4CAF50' }]}>
                    {qty > 0 ? `À acheter : ${qty}` : 'En stock — rien à acheter'}
                  </Text>
                </View>
              );
            })()}

            <View style={[styles.stockDivider, { backgroundColor: colors.border }]} />

            {/* Actions */}
            <View style={styles.stockActions}>
              {isStockTracked(stockItem ?? { id: '', name: '', checked: false }) && (
                <Pressable onPress={removeStock} style={[styles.stockActionBtn, { borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="numeric-off" size={15} color={colors.mutedForeground} />
                  <Text style={[styles.stockActionText, { color: colors.mutedForeground }]}>Désactiver</Text>
                </Pressable>
              )}
              <Pressable onPress={saveStock} style={[styles.stockActionBtn, styles.stockSaveBtn, { backgroundColor: colors.primary }]}>
                <MaterialCommunityIcons name="check" size={15} color="#121212" />
                <Text style={[styles.stockActionText, { color: '#121212', fontFamily: 'Inter_600SemiBold' }]}>Valider</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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

            <View style={styles.colorRow}>
              {CAT_COLORS.map(c => (
                <Pressable
                  key={c}
                  onPress={() => setNewCatColor(c)}
                  style={[styles.colorDot, { backgroundColor: c, borderWidth: newCatColor === c ? 2.5 : 0, borderColor: '#fff' }]}
                />
              ))}
            </View>

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
    paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stockIcon: {
    width: 28, height: 28, borderRadius: 8, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  nameBlock:   { flex: 1, gap: 3 },
  itemName:    { fontSize: 15, fontFamily: 'Inter_400Regular' },
  itemChecked: { textDecorationLine: 'line-through', opacity: 0.5 },
  stockRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockText:   { fontSize: 11, fontFamily: 'Inter_400Regular' },
  qtyBadge:    { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  qtyBadgeText:{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#FF9800' },

  catTagBtn: { borderRadius: 6, padding: 5 },
  deleteBtn: { padding: 4 },

  empty:     { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 24 },

  overlay: {
    flex: 1, backgroundColor: '#00000088',
    justifyContent: 'center', alignItems: 'center',
  },

  stockSheet: {
    width: '88%', borderRadius: 16, borderWidth: 1,
    paddingTop: 16, paddingBottom: 12, overflow: 'hidden',
  },
  stockDivider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  stepperRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 12, gap: 12,
  },
  stepperLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  stepper:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 36, height: 36, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  stepInput: {
    width: 48, height: 36, borderRadius: 8, borderWidth: 1,
    textAlign: 'center', fontSize: 16, fontFamily: 'Inter_600SemiBold',
  },
  previewBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
  },
  previewText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  stockActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  stockActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
  },
  stockSaveBtn: { borderWidth: 0 },
  stockActionText: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  sheetTitle: {
    fontSize: 15, fontFamily: 'Inter_600SemiBold',
    paddingHorizontal: 16, marginBottom: 8,
  },
  pickerSheet: {
    width: '85%', borderRadius: 16, borderWidth: 1,
    paddingTop: 16, paddingBottom: 8, overflow: 'hidden',
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
