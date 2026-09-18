import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Trip, TripCategory } from '@/types/trips';
import { genId } from '@/utils/ids';
import { getTrips, updateTrip } from '@/utils/tripStorage';

const KEY_CATEGORIES = '@yoann2_trip_categories';
const KEY_CATEGORIES_LEGACY = '@yoann2_categories';

/** Radius in meters within which start or end points count as "the same place". */
export const MATCH_RADIUS_M = 400;

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function tripMatchesCategory(trip: Trip, cat: TripCategory): boolean {
  return (
    trip.startLat != null && trip.startLon != null && trip.endLat != null && trip.endLon != null &&
    haversineM(trip.startLat, trip.startLon, cat.startLat, cat.startLon) <= MATCH_RADIUS_M &&
    haversineM(trip.endLat, trip.endLon, cat.endLat, cat.endLon) <= MATCH_RADIUS_M
  );
}

/** True when trip start≈cat.end AND trip end≈cat.start (reverse route). */
export function tripIsReturnOf(trip: Trip, cat: TripCategory): boolean {
  return (
    trip.startLat != null && trip.startLon != null && trip.endLat != null && trip.endLon != null &&
    haversineM(trip.startLat, trip.startLon, cat.endLat, cat.endLon) <= MATCH_RADIUS_M &&
    haversineM(trip.endLat, trip.endLon, cat.startLat, cat.startLon) <= MATCH_RADIUS_M
  );
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function getCategories(): Promise<TripCategory[]> {
  try {
    let raw = await AsyncStorage.getItem(KEY_CATEGORIES);
    // Migration silencieuse : si la nouvelle clé est vide, essayer l'ancienne
    if (!raw) {
      raw = await AsyncStorage.getItem(KEY_CATEGORIES_LEGACY);
      if (raw) {
        // Migrer vers la nouvelle clé (best-effort, ignore l'erreur)
        await AsyncStorage.setItem(KEY_CATEGORIES, raw).catch(() => {});
      }
    }
    return raw ? (JSON.parse(raw) as TripCategory[]) : [];
  } catch {
    return [];
  }
}

export async function saveCategories(categories: TripCategory[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_CATEGORIES, JSON.stringify(categories));
  } catch {}
}

export async function createCategory(name: string, anchorTrip: Trip): Promise<TripCategory> {
  const cat: TripCategory = {
    id: genId(),
    name: name.trim() || 'Catégorie',
    startLat: anchorTrip.startLat!,
    startLon: anchorTrip.startLon!,
    endLat: anchorTrip.endLat!,
    endLon: anchorTrip.endLon!,
    createdAt: Date.now(),
  };
  const cats = await getCategories();
  await saveCategories([...cats, cat]);
  return cat;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const cats = await getCategories();
  const idx = cats.findIndex(c => c.id === id);
  if (idx === -1) return;
  cats[idx] = { ...cats[idx]!, name: name.trim() || cats[idx]!.name };
  await saveCategories(cats);
}

export async function deleteCategory(id: string): Promise<void> {
  const cats = await getCategories();
  await saveCategories(cats.filter(c => c.id !== id));
}

// ── Auto-matching ─────────────────────────────────────────────────────────────

/** Returns the first category whose anchor matches the trip's start + end within MATCH_RADIUS_M. */
export async function findMatchingCategory(trip: Trip): Promise<TripCategory | null> {
  const cats = await getCategories();
  return cats.find(c => tripMatchesCategory(trip, c)) ?? null;
}

// ── Bulk operations ───────────────────────────────────────────────────────────

/**
 * Create a new category anchored on `anchorTrip`, assign it to the anchor trip,
 * then scan all stored trips and auto-assign any unassigned trip that matches the
 * new category's geography.
 * Returns the created TripCategory.
 */
export async function createCategoryAndGroupSimilar(
  name: string,
  anchorTrip: Trip,
): Promise<TripCategory> {
  const cat = await createCategory(name, anchorTrip);
  const allTrips = await getTrips();

  await Promise.all(
    allTrips
      .filter(t => !t.categoryId && (tripMatchesCategory(t, cat) || tripIsReturnOf(t, cat)))
      .map(t => updateTrip(t.id, {
        categoryId: cat.id,
        isReturn: !tripMatchesCategory(t, cat) && tripIsReturnOf(t, cat),
      })),
  );

  return cat;
}

/**
 * Remove a category and clear its id from every trip that referenced it.
 */
export async function deleteCategoryAndUnlink(catId: string): Promise<void> {
  await deleteCategory(catId);
  const allTrips = await getTrips();
  await Promise.all(
    allTrips
      .filter(t => t.categoryId === catId)
      .map(t => updateTrip(t.id, { categoryId: undefined })),
  );
}
