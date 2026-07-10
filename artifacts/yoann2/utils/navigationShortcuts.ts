import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { genId } from '@/utils/ids';

export interface NavShortcut {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  icon?: string;
}

export interface ShortcutIconDef {
  key: string;
  emoji: string;
  mdi: string;
  label: string;
}

export const SHORTCUT_ICONS: ShortcutIconDef[] = [
  { key: 'home',       emoji: '🏠', mdi: 'home',                    label: 'Maison'     },
  { key: 'work',       emoji: '🦬', mdi: 'briefcase',               label: 'Travail'    },
  { key: 'rdv',        emoji: '📅', mdi: 'calendar-clock',          label: 'RDV'        },
  { key: 'medical',    emoji: '🏥', mdi: 'hospital-box-outline',    label: 'Médecin'    },
  { key: 'gym',        emoji: '🏋', mdi: 'dumbbell',                label: 'Sport'      },
  { key: 'shop',       emoji: '🛒', mdi: 'cart-outline',            label: 'Courses'    },
  { key: 'school',     emoji: '🏫', mdi: 'school-outline',          label: 'École'      },
  { key: 'restaurant', emoji: '🍽', mdi: 'silverware-fork-knife',   label: 'Restaurant' },
  { key: 'parking',    emoji: '🅿',  mdi: 'parking',                label: 'Parking'    },
  { key: 'airport',    emoji: '✈',  mdi: 'airplane',               label: 'Aéroport'  },
];

export function getShortcutEmoji(icon?: string): string {
  if (!icon) return '⬆';
  return SHORTCUT_ICONS.find(i => i.key === icon)?.emoji ?? '⬆';
}

export function getShortcutMdi(icon?: string): string {
  if (!icon) return 'navigation-variant';
  return SHORTCUT_ICONS.find(i => i.key === icon)?.mdi ?? 'navigation-variant';
}

const SHORTCUTS_KEY = '@yoann2_nav_shortcuts';
export const MAX_SHORTCUTS = 3;

// ── Persistence ──────────────────────────────────────────────────────────────

export async function getNavShortcuts(): Promise<NavShortcut[]> {
  try {
    const raw = await AsyncStorage.getItem(SHORTCUTS_KEY);
    return raw ? (JSON.parse(raw) as NavShortcut[]) : [];
  } catch {
    return [];
  }
}

export async function saveNavShortcuts(shortcuts: NavShortcut[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      SHORTCUTS_KEY,
      JSON.stringify(shortcuts.slice(0, MAX_SHORTCUTS)),
    );
  } catch {}
}

export async function upsertNavShortcut(shortcut: NavShortcut): Promise<void> {
  const list = await getNavShortcuts();
  const idx = list.findIndex(s => s.id === shortcut.id);
  if (idx >= 0) list[idx] = shortcut;
  else list.push(shortcut);
  await saveNavShortcuts(list);
}

export async function deleteNavShortcut(id: string): Promise<void> {
  const list = await getNavShortcuts();
  await saveNavShortcuts(list.filter(s => s.id !== id));
}

export function createShortcut(
  name: string,
  address: string,
  lat?: number,
  lng?: number,
): NavShortcut {
  const id = genId();
  return { id, name, address, lat: lat ?? null, lng: lng ?? null };
}

// ── Geocoding ────────────────────────────────────────────────────────────────

export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const results = await Location.geocodeAsync(address.trim());
    if (results.length > 0 && results[0]) {
      return { lat: results[0].latitude, lng: results[0].longitude };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Navigation deep link (Waze → Google Maps → web fallback) ────────────────

export async function openNavigation(lat: number, lng: number): Promise<void> {
  const wazeUrl = `waze://?ll=${lat},${lng}&navigate=yes`;
  const gmapsNative =
    Platform.OS === 'android'
      ? `google.navigation:q=${lat},${lng}&mode=d`
      : `maps://?daddr=${lat},${lng}`;
  const gmapsWeb = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

  try {
    if (await Linking.canOpenURL(wazeUrl)) {
      await Linking.openURL(wazeUrl);
      return;
    }
  } catch {}

  try {
    if (await Linking.canOpenURL(gmapsNative)) {
      await Linking.openURL(gmapsNative);
      return;
    }
  } catch {}

  await Linking.openURL(gmapsWeb);
}
