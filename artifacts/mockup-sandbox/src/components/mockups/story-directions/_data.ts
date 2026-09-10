export type DemoRoutePoint = {
  lat: number;
  lng: number;
};

export type DemoChartPoint = {
  ms: number;
  km: number;
  spd: number;
  alt: number;
};

/**
 * Tracé d'illustration cohérent autour de Brantôme. La distance affichée reste
 * la donnée de balade (6,42 km), comme dans le vrai renderer qui remet le tracé
 * GPS à l'échelle de la distance enregistrée.
 */
export const DEMO_ROUTE: DemoRoutePoint[] = [
  { lat: 45.36486, lng: 0.64672 },
  { lat: 45.36539, lng: 0.64576 },
  { lat: 45.36608, lng: 0.64481 },
  { lat: 45.36691, lng: 0.64414 },
  { lat: 45.36782, lng: 0.64396 },
  { lat: 45.36870, lng: 0.64436 },
  { lat: 45.36942, lng: 0.64523 },
  { lat: 45.37000, lng: 0.64643 },
  { lat: 45.37031, lng: 0.64788 },
  { lat: 45.37013, lng: 0.64941 },
  { lat: 45.36959, lng: 0.65076 },
  { lat: 45.36882, lng: 0.65162 },
  { lat: 45.36791, lng: 0.65191 },
  { lat: 45.36705, lng: 0.65252 },
  { lat: 45.36649, lng: 0.65366 },
  { lat: 45.36624, lng: 0.65504 },
  { lat: 45.36570, lng: 0.65601 },
  { lat: 45.36487, lng: 0.65639 },
  { lat: 45.36405, lng: 0.65591 },
  { lat: 45.36344, lng: 0.65486 },
  { lat: 45.36312, lng: 0.65347 },
  { lat: 45.36258, lng: 0.65244 },
  { lat: 45.36180, lng: 0.65183 },
  { lat: 45.36126, lng: 0.65071 },
  { lat: 45.36117, lng: 0.64924 },
  { lat: 45.36158, lng: 0.64790 },
  { lat: 45.36229, lng: 0.64706 },
  { lat: 45.36312, lng: 0.64678 },
  { lat: 45.36388, lng: 0.64714 },
  { lat: 45.36443, lng: 0.64773 },
  { lat: 45.36482, lng: 0.64682 },
];

const DEMO_SPEEDS = [
  4.3, 4.7, 5.0, 5.2, 4.9, 5.1, 5.4, 5.0, 4.6, 4.8,
  5.2, 5.5, 5.1, 4.7, 4.5, 4.9, 5.3, 5.6, 5.2, 4.8,
  4.4, 4.7, 5.0, 5.4, 5.1, 4.9, 4.6, 5.0, 5.3, 4.8, 4.5,
];

const DEMO_ALTITUDES = [
  104, 106, 109, 112, 116, 120, 124, 127, 130, 128,
  125, 121, 118, 116, 119, 123, 128, 132, 135, 131,
  126, 121, 117, 114, 111, 108, 106, 109, 112, 107, 104,
];

export const DEMO_POINTS: DemoChartPoint[] = DEMO_ROUTE.map((_, index) => {
  const progress = index / (DEMO_ROUTE.length - 1);
  return {
    ms: Math.round(4_680_000 * progress),
    km: Number((6.42 * progress).toFixed(3)),
    spd: DEMO_SPEEDS[index],
    alt: DEMO_ALTITUDES[index],
  };
});

export const DEMO_OPTIONS = {
  title: 'Balade Les bords de Dronne',
  placeLabel: 'Brantôme',
  color: '#4CAF50',
  vehicleEmoji: '🚶',
  dateLabel: '10 sept. 2026',
  timeLabel: '09:12 → 10:30',
  distKm: 6.42,
  durationSec: 4_680,
  durationLabel: '1h18',
  averagePaceLabel: '12:09 /km',
  maxSpeed: 5.6,
  gainM: 82,
  minAlt: 104,
  maxAlt: 135,
  hasAlt: true,
  points: DEMO_POINTS,
  route: DEMO_ROUTE,
  videoDurationSec: 6,
  showPace: true,
  isWalk: true,
  walkParticipants: ['Yoann', 'Marie'],
  walkSpotName: 'Les bords de Dronne · Brantôme',
  photos: [],
  theme: 'dark',
  mapDistanceNote: 'Distance carte explicitement illustrative',
} as const;

function routeToSvgPath(route: DemoRoutePoint[]): string {
  const lngs = route.map((point) => point.lng);
  const lats = route.map((point) => point.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const spanLng = maxLng - minLng || 1;
  const spanLat = maxLat - minLat || 1;
  const padding = 24;
  const drawable = 360 - padding * 2;
  const scale = Math.min(drawable / spanLng, drawable / spanLat);
  const width = spanLng * scale;
  const height = spanLat * scale;
  const offsetX = (360 - width) / 2;
  const offsetY = (360 - height) / 2;

  return route
    .map((point, index) => {
      const x = offsetX + (point.lng - minLng) * scale;
      const y = offsetY + (maxLat - point.lat) * scale;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

/** Chemin dérivé de DEMO_ROUTE, prévu pour un SVG viewBox="0 0 360 360". */
export const DEMO_ROUTE_PATH = routeToSvgPath(DEMO_ROUTE);