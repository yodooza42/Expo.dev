import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
}

const KEY = '@yoann2/shopping_list';

export async function getShoppingList(): Promise<ShoppingItem[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export async function saveShoppingList(items: ShoppingItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}
