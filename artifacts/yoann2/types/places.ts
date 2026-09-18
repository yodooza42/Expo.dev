export interface WalkRoute {
  id: string;
  name: string;
  createdAt: number;
}

export interface PlaceCategory {
  id: string;
  name: string;
  /** MaterialCommunityIcons icon name */
  icon: string;
  color: string;
  /** System categories cannot be deleted */
  isSystem?: boolean;
}

export interface KnownPlace {
  id: string;
  name: string;
  categoryId: string;
  lat: number;
  lng: number;
  /** Detection radius in metres (default 200) */
  radiusM: number;
  /** Human-readable address (optional, filled by reverse geocoding) */
  address?: string;
  createdAt: number;
}

export const DEFAULT_PLACE_CATEGORIES: PlaceCategory[] = [
  { id: 'home',     name: 'Maison',        icon: 'home',                color: '#FFC107', isSystem: true },
  { id: 'shops',    name: 'Magasins',       icon: 'shopping',            color: '#4CAF50', isSystem: true },
  { id: 'walks',    name: 'Spots balades',  icon: 'tree',                color: '#8BC34A', isSystem: true },
  { id: 'people',   name: 'Humanoïdes',     icon: 'account-group',       color: '#9C27B0', isSystem: true },
  { id: 'services', name: 'Services',       icon: 'gas-station',         color: '#2196F3', isSystem: true },
];

/** Icons available for custom categories */
export const PLACE_ICONS: string[] = [
  'home', 'shopping', 'tree', 'account-group', 'gas-station',
  'hospital-building', 'school', 'silverware-fork-knife', 'office-building',
  'star', 'heart', 'car-wrench', 'gym', 'church', 'bank', 'beach',
  'map-marker', 'parking', 'train', 'airplane',
];
