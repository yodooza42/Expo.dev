import AsyncStorage from '@react-native-async-storage/async-storage';

import type { KnownPlace, PlaceCategory, WalkRoute } from '@/types/places';
import { DEFAULT_PLACE_CATEGORIES } from '@/types/places';
import { haversineKm } from '@/utils/haversine';
import { renamePlaceInTrips } from '@/utils/tripStorage';

const KEY_CATEGORIES    = '@yoann2_place_categories';
const KEY_PLACES        = '@yoann2_known_places';
const KEY_ADDRESS_USAGE = '@yoann2_address_usage';

// ── Categories ────────────────────────────────────────────────────────────────

export async function getPlaceCategories(): Promise<PlaceCategory[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_CATEGORIES);
    if (!raw) return [...DEFAULT_PLACE_CATEGORIES];
    const parsed = JSON.parse(raw) as PlaceCategory[];
    const ids = new Set(parsed.map(c => c.id));
    const missing = DEFAULT_PLACE_CATEGORIES.filter(d => !ids.has(d.id));
    return [...missing, ...parsed];
  } catch {
    return [...DEFAULT_PLACE_CATEGORIES];
  }
}

export async function savePlaceCategory(cat: PlaceCategory): Promise<void> {
  try {
    const cats = await getPlaceCategories();
    const idx = cats.findIndex(c => c.id === cat.id);
    if (idx >= 0) cats[idx] = cat;
    else cats.push(cat);
    await AsyncStorage.setItem(KEY_CATEGORIES, JSON.stringify(cats));
  } catch {}
}

export async function deletePlaceCategory(id: string): Promise<void> {
  try {
    const cats = await getPlaceCategories();
    await AsyncStorage.setItem(KEY_CATEGORIES, JSON.stringify(cats.filter(c => c.id !== id && !c.isSystem)));
    const places = await getKnownPlaces();
    const first = cats.find(c => c.id !== id)?.id ?? DEFAULT_PLACE_CATEGORIES[0]!.id;
    const updated = places.map(p => p.categoryId === id ? { ...p, categoryId: first } : p);
    await AsyncStorage.setItem(KEY_PLACES, JSON.stringify(updated));
  } catch {}
}

// ── Places ────────────────────────────────────────────────────────────────────

export async function getKnownPlaces(): Promise<KnownPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PLACES);
    return raw ? (JSON.parse(raw) as KnownPlace[]) : [];
  } catch {
    return [];
  }
}

export async function saveKnownPlace(place: KnownPlace): Promise<void> {
  try {
    const places = await getKnownPlaces();
    const idx = places.findIndex(p => p.id === place.id);
    const previousName = idx >= 0 ? places[idx]?.name : undefined;
    if (idx >= 0) places[idx] = place;
    else places.push(place);
    await AsyncStorage.setItem(KEY_PLACES, JSON.stringify(places));
    if (previousName !== undefined && previousName !== place.name) {
      await renamePlaceInTrips(place.id, place.name);
    }
  } catch {}
}

export async function deleteKnownPlace(id: string): Promise<void> {
  try {
    const places = await getKnownPlaces();
    await AsyncStorage.setItem(KEY_PLACES, JSON.stringify(places.filter(p => p.id !== id)));
  } catch {}
}

// ── Walk routes ───────────────────────────────────────────────────────────────

const KEY_WALK_ROUTES = '@yoann2_walk_routes';

export async function getWalkRoutes(): Promise<WalkRoute[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_WALK_ROUTES);
    return raw ? (JSON.parse(raw) as WalkRoute[]) : [];
  } catch {
    return [];
  }
}

export async function saveWalkRoute(route: WalkRoute): Promise<void> {
  try {
    const routes = await getWalkRoutes();
    const idx = routes.findIndex(r => r.id === route.id);
    if (idx >= 0) routes[idx] = route;
    else routes.push(route);
    await AsyncStorage.setItem(KEY_WALK_ROUTES, JSON.stringify(routes));
  } catch {}
}

export async function deleteWalkRoute(id: string): Promise<void> {
  try {
    const routes = await getWalkRoutes();
    await AsyncStorage.setItem(KEY_WALK_ROUTES, JSON.stringify(routes.filter(r => r.id !== id)));
  } catch {}
}

// ── Address usage (frequency-based suggestion ranking) ────────────────────────

export async function getAddressUsage(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(KEY_ADDRESS_USAGE);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export async function incrementAddressUsage(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    const usage = await getAddressUsage();
    usage[trimmed] = (usage[trimmed] ?? 0) + 1;
    await AsyncStorage.setItem(KEY_ADDRESS_USAGE, JSON.stringify(usage));
  } catch {}
}

/**
 * Returns suggestions sorted by descending usage count.
 * Known-place names come first in the pool, then default suggestions not already present.
 */
export function sortSuggestionsByUsage(
  knownPlaceNames: string[],
  defaultSuggestions: string[],
  usage: Record<string, number>,
): string[] {
  const all: string[] = [...knownPlaceNames];
  for (const s of defaultSuggestions) {
    if (!all.includes(s)) all.push(s);
  }
  return all.sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0));
}

// ── Proximity helper ──────────────────────────────────────────────────────────

/**
 * Returns the nearest KnownPlace within maxRadiusM metres, or null if none.
 * Each place uses its own radiusM unless maxRadiusM is provided (which overrides).
 */
export async function findNearestPlace(
  lat: number,
  lng: number,
  maxRadiusM?: number,
): Promise<KnownPlace | null> {
  const places = await getKnownPlaces();
  let best: KnownPlace | null = null;
  let bestDist = Infinity;
  for (const place of places) {
    const distM = haversineKm(lat, lng, place.lat, place.lng) * 1000;
    const limit = maxRadiusM ?? place.radiusM;
    if (distM <= limit && distM < bestDist) {
      bestDist = distM;
      best = place;
    }
  }
  return best;
}
