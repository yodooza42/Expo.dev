const BASE = 'https://nominatim.openstreetmap.org';
const HEADERS = { 'User-Agent': 'Yoann2.0-App/1.0 (contact@yoann.app)' };

/**
 * Reverse-geocode: lat/lng → human-readable address string.
 * Returns undefined on failure (network error, no result).
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=fr`,
      { headers: HEADERS },
    );
    if (!res.ok) return undefined;
    const data = await res.json() as { display_name?: string };
    return data.display_name;
  } catch {
    return undefined;
  }
}

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
