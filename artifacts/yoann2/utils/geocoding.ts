import AsyncStorage from '@react-native-async-storage/async-storage';
import { haversineKm } from '@/utils/haversine';

/**
 * Simplified reverse-geocoding for trip start/end addresses.
 *
 * - Returns "numéro rue, ville" extracted from Nominatim address components.
 * - Persistent cache (AsyncStorage) keyed to 3-decimal precision (~100 m).
 *   A cache hit is accepted if the stored point is within 150 m of the query point,
 *   matching the "known place" proximity system so both caches feel consistent.
 * - In-memory hot cache on top of AsyncStorage for speed.
 * - Module-level rate limiter enforces ≥1 100 ms between requests (Nominatim ToS).
 */

const BASE    = 'https://nominatim.openstreetmap.org';
const HEADERS = { 'User-Agent': 'Yoann2.0-App/1.0 (contact@yoann.app)' };

const CACHE_KEY = '@yoann2_geocode_cache';
const CACHE_RADIUS_M = 150;

interface CacheEntry {
  lat: number;
  lng: number;
  address: string;
  ts: number;
}

// In-memory hot cache (loaded from AsyncStorage lazily)
const _memCache = new Map<string, CacheEntry>();
let _memCacheLoaded = false;

let   lastCallMs    = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

async function loadCache(): Promise<Map<string, CacheEntry>> {
  if (_memCacheLoaded) return _memCache;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
      for (const [k, v] of Object.entries(parsed)) {
        _memCache.set(k, v);
      }
    }
  } catch {}
  _memCacheLoaded = true;
  return _memCache;
}

async function saveCache(): Promise<void> {
  try {
    const obj: Record<string, CacheEntry> = {};
    for (const [k, v] of _memCache) {
      obj[k] = v;
    }
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch {}
}

/**
 * Look up a nearby cached address within CACHE_RADIUS_M metres.
 * Returns the cached address string if found, null otherwise.
 */
async function lookupCache(lat: number, lng: number): Promise<string | null> {
  const cache = await loadCache();
  for (const entry of cache.values()) {
    const distM = haversineKm(lat, lng, entry.lat, entry.lng) * 1000;
    if (distM <= CACHE_RADIUS_M) {
      return entry.address;
    }
  }
  return null;
}

async function setCache(lat: number, lng: number, address: string): Promise<void> {
  const key = cacheKey(lat, lng);
  _memCache.set(key, { lat, lng, address, ts: Date.now() });
  await saveCache();
}

async function fetchSimplifiedAddress(lat: number, lng: number): Promise<string | null> {
  const gap = Date.now() - lastCallMs;
  if (gap < 1_100) await sleep(1_100 - gap);
  lastCallMs = Date.now();

  try {
    const res = await fetch(
      `${BASE}/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fr`,
      { headers: HEADERS },
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      display_name?: string;
      address?: {
        house_number?: string;
        road?: string;
        suburb?: string;
        city?: string;
        town?: string;
        village?: string;
        hamlet?: string;
        municipality?: string;
      };
    };

    const a = data.address;
    if (!a) return data.display_name ?? null;

    const street = a.house_number && a.road
      ? `${a.house_number} ${a.road}`
      : a.road ?? null;

    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet ?? null;

    if (street && city) return `${street}, ${city}`;
    if (street) return street;
    if (city) return city;
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

/**
 * Reverse-geocode a coordinate pair to a short human-readable address.
 *
 * 1. Check persistent cache first (150 m radius). Cache never expires — a geographic
 *    place name does not change.
 * 2. If cache miss, call Nominatim with the existing 1.1 s rate limit.
 * 3. Store result in persistent cache for future reuse.
 *
 * Returns null on network failure or when Nominatim returns no result.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  // 1. Persistent cache lookup (radius-based, matches known-place proximity)
  const cached = await lookupCache(lat, lng);
  if (cached) return cached;

  // 2. Nominatim call with rate limit
  const result = await fetchSimplifiedAddress(lat, lng);
  if (result) {
    // 3. Store in persistent cache
    await setCache(lat, lng, result);
  }
  return result;
}

// ── Forward geocoding ─────────────────────────────────────────────────────────

export interface GeoResult {
  lat: number;
  lng: number;
  displayName: string;
}

/**
 * Forward-geocode: address string → first matching GPS point.
 * Returns null when no result found or on network failure.
 */
export async function forwardGeocode(query: string): Promise<GeoResult | null> {
  const gap = Date.now() - lastCallMs;
  if (gap < 1_100) await sleep(1_100 - gap);
  lastCallMs = Date.now();

  try {
    const url =
      `${BASE}/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1&accept-language=fr`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json() as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;
    if (!data.length) return null;
    return {
      lat: parseFloat(data[0]!.lat),
      lng: parseFloat(data[0]!.lon),
      displayName: data[0]!.display_name,
    };
  } catch {
    return null;
  }
}
