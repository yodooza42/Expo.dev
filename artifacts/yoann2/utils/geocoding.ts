/**
 * Simplified reverse-geocoding for trip start/end addresses.
 *
 * - Returns "numéro rue, ville" extracted from Nominatim address components.
 * - In-memory cache keyed to 4-decimal precision (~11 m), avoiding redundant calls.
 * - Module-level rate limiter enforces ≥1 100 ms between requests (Nominatim ToS).
 */

const BASE    = 'https://nominatim.openstreetmap.org';
const HEADERS = { 'User-Agent': 'Yoann2.0-App/1.0 (contact@yoann.app)' };

const cache         = new Map<string, string>();
let   lastCallMs    = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
 * Results are cached; a 1.1 s rate limit is enforced between Nominatim calls.
 * Returns null on network failure or when Nominatim returns no result.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key)!;

  const result = await fetchSimplifiedAddress(lat, lng);
  if (result) cache.set(key, result);
  return result;
}
