import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ShoppingCategory {
  id: string;
  name: string;
  color: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
  categoryId?: string;
  stock?: number;
  threshold?: number;
}

const LIST_KEY = '@yoann2/shopping_list';
const CATS_KEY = '@yoann2/shopping_categories';

export async function getShoppingList(): Promise<ShoppingItem[]> {
  const raw = await AsyncStorage.getItem(LIST_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export async function saveShoppingList(items: ShoppingItem[]): Promise<void> {
  await AsyncStorage.setItem(LIST_KEY, JSON.stringify(items));
}

export async function getShoppingCategories(): Promise<ShoppingCategory[]> {
  const raw = await AsyncStorage.getItem(CATS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export async function saveShoppingCategories(cats: ShoppingCategory[]): Promise<void> {
  await AsyncStorage.setItem(CATS_KEY, JSON.stringify(cats));
}
