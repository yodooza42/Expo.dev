import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import {
  type ShoppingItem,
  getShoppingList,
  saveShoppingList,
} from '@/utils/shoppingListStorage';
import { useFocusEffect } from 'expo-router';

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function ShoppingListScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    setItems(await getShoppingList());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function persist(next: ShoppingItem[]) {
    setItems(next);
    await saveShoppingList(next);
  }

  async function addItem() {
    const name = newName.trim();
    if (!name) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = [...items, { id: genId(), name, checked: false }];
    await persist(next);
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

  async function sortAlpha() {
    Haptics.selectionAsync();
    const unchecked = [...items.filter(i => !i.checked)].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const checked   = [...items.filter(i =>  i.checked)].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    await persist([...unchecked, ...checked]);
  }

  // Display: unchecked first (to buy), checked after (in stock)
  const unchecked = items.filter(i => !i.checked);
  const checked   = items.filter(i =>  i.checked);
  const sorted    = [...unchecked, ...checked];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <MaterialCommunityIcons name="cart-outline" size={20} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Liste de courses</Text>
        </View>
        <Pressable onPress={sortAlpha} hitSlop={8} style={styles.sortBtn}>
          <MaterialCommunityIcons name="sort-alphabetical-ascending" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Add input */}
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

      {/* Stats */}
      {items.length > 0 && (
        <View style={[styles.statsRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.statsText, { color: colors.mutedForeground }]}>
            {unchecked.length} à acheter
          </Text>
          <Text style={[styles.statsDot, { color: colors.border }]}>·</Text>
          <Text style={[styles.statsText, { color: '#4CAF50' }]}>
            {checked.length} en stock
          </Text>
        </View>
      )}

      {/* List */}
      <FlatList
        data={sorted}
        keyExtractor={i => i.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="cart-outline" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Liste vide — ajoute ton premier article
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => toggleItem(item.id)}
            onLongPress={() => confirmDelete(item)}
            style={[styles.row, { backgroundColor: colors.card }]}
          >
            <View style={[styles.checkbox, {
              borderColor: item.checked ? '#4CAF50' : colors.mutedForeground,
              backgroundColor: item.checked ? '#4CAF5020' : 'transparent',
            }]}>
              {item.checked && (
                <MaterialCommunityIcons name="check" size={14} color="#4CAF50" />
              )}
            </View>
            <Text style={[
              styles.itemName,
              { color: item.checked ? colors.mutedForeground : colors.foreground },
              item.checked && styles.itemChecked,
            ]}>
              {item.name}
            </Text>
            <Pressable
              onPress={() => confirmDelete(item)}
              hitSlop={8}
              style={styles.deleteBtn}
            >
              <MaterialCommunityIcons name="close" size={16} color={colors.mutedForeground} />
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  sortBtn: { padding: 4 },

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
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statsText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  statsDot: { fontSize: 12 },

  list: { padding: 12, gap: 2 },
  sep: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  itemName: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  itemChecked: { textDecorationLine: 'line-through', opacity: 0.5 },
  deleteBtn: { padding: 4 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
