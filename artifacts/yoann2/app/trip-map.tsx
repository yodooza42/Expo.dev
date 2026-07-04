import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TripMapView } from '@/components/TripMapView';
import { useColors } from '@/hooks/useColors';
import type { PlaceCategory } from '@/types/places';
import type { Trip, Vehicle } from '@/types/trips';
import { getKnownPlaces, getPlaceCategories } from '@/utils/placesStorage';
import { getTrips, getVehicleSettings } from '@/utils/tripStorage';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}
function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}`;
}

export default function TripMapScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [osrmRoute, setOsrmRoute] = useState<{ lat: number; lng: number }[] | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [placeCategories, setPlaceCategories] = useState<PlaceCategory[]>([]);
  const [knownPlaces, setKnownPlaces] = useState<Array<{ id: string; name: string; categoryId?: string }>>([]);

  useEffect(() => {
    getPlaceCategories().then(setPlaceCategories).catch(() => {});
    getKnownPlaces().then(setKnownPlaces).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([getTrips(), getVehicleSettings()]).then(([trips, v]) => {
      const found = trips.find(t => t.id === id) ?? null;
      setTrip(found);
      setVehicles(v);
      setLoading(false);

      // For manual trips without GPS trace: fetch OSRM route geometry
      if (
        found &&
        found.source === 'manual' &&
        (!found.route || found.route.length < 2) &&
        found.startLat && found.startLon && found.endLat && found.endLon
      ) {
        setLoadingRoute(true);
        const url = `https://router.project-osrm.org/route/v1/driving/${found.startLon},${found.startLat};${found.endLon},${found.endLat}?overview=full&geometries=geojson`;
        fetch(url)
          .then(r => r.json())
          .then((data: { routes?: Array<{ geometry: { coordinates: [number, number][] } }> }) => {
            const coords = data.routes?.[0]?.geometry?.coordinates;
            if (coords && coords.length >= 2) {
              setOsrmRoute(coords.map(([lng, lat]) => ({ lat, lng })));
            } else {
              // Fallback: straight line between start and end
              setOsrmRoute([
                { lat: found.startLat, lng: found.startLon },
                { lat: found.endLat, lng: found.endLon },
              ]);
            }
          })
          .catch(() => {
            setOsrmRoute([
              { lat: found.startLat, lng: found.startLon },
              { lat: found.endLat, lng: found.endLon },
            ]);
          })
          .finally(() => setLoadingRoute(false));
      }
    });
  }, [id]);

  const MAP_H = SCREEN_H * 0.62;
  const MAP_W = SCREEN_W;

  return (
    <View style={[styles.root, { backgroundColor: '#121212' }]}>
      {/* Back button */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.backBtn, { top: insets.top + 10 }]}
      >
        <MaterialCommunityIcons name="chevron-left" size={26} color="#fff" />
      </Pressable>

      {/* Map area */}
      <View style={{ width: MAP_W, height: MAP_H, overflow: 'hidden' }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#FFC107" />
          </View>
        ) : (() => {
          const displayRoute = trip?.route && trip.route.length >= 2 ? trip.route : osrmRoute;
          if (!displayRoute || displayRoute.length < 2) {
            return loadingRoute ? (
              <View style={styles.center}>
                <ActivityIndicator color="#FFC107" />
                <Text style={styles.noRoute}>Calcul de l'itinéraire…</Text>
              </View>
            ) : (
              <View style={styles.center}>
                <MaterialCommunityIcons name="map-marker-off-outline" size={48} color="#555" />
                <Text style={styles.noRoute}>Tracé GPS non disponible</Text>
              </View>
            );
          }
          return (
            <TripMapView
              route={displayRoute}
              width={MAP_W}
              height={MAP_H}
              lineColor={trip?.source === 'manual' ? '#2196F3' : '#FFC107'}
            />
          );
        })()}
      </View>

      {/* Info card */}
      {trip && (
        <View style={[styles.card, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          {(trip.startAddress || trip.endAddress) && (
            <View style={[styles.addrBanner, { borderBottomColor: colors.border }]}>
              <AddressBadge
                address={trip.startAddress}
                placeId={trip.startPlaceId}
                dotColor="#4CAF50"
                categories={placeCategories}
                places={knownPlaces}
                colors={colors}
              />
              <MaterialCommunityIcons name="arrow-right" size={13} color={colors.mutedForeground} />
              <AddressBadge
                address={trip.endAddress}
                placeId={trip.endPlaceId}
                dotColor="#FFC107"
                categories={placeCategories}
                places={knownPlaces}
                colors={colors}
              />
            </View>
          )}
          <Text style={[styles.dateText, { color: colors.foreground }]}>
            {fmtDate(trip.startTime)}
          </Text>
          <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
            {fmtTime(trip.startTime)} → {fmtTime(trip.endTime)}
          </Text>

          <View style={styles.statsRow}>
            <StatItem
              icon="map-marker-distance"
              value={`${trip.distanceKm.toFixed(1)} km`}
              color="#FFC107"
            />
            <StatItem
              icon="clock-outline"
              value={fmtDuration(trip.endTime - trip.startTime)}
              color={colors.mutedForeground}
            />
            <StatItem
              icon={
                trip.source === 'manual'
                  ? 'pencil-outline'
                  : trip.routeSource === 'osrm'
                    ? 'road-variant'
                    : 'navigation-variant-outline'
              }
              value={
                trip.source === 'manual'
                  ? 'Trajet manuel'
                  : trip.routeSource === 'osrm'
                    ? 'Tracé routier'
                    : `${trip.pointCount} pts GPS`
              }
              color={
                trip.routeSource === 'osrm' ? '#4CAF50' : colors.mutedForeground
              }
            />
            {trip.vehicle && trip.vehicle !== 'ignored' && (() => {
              const veh = vehicles.find(v => v.id === trip.vehicle);
              const name = veh?.name ?? (trip.vehicle === 'moto' ? 'Moto' : 'Voiture');
              const color = veh?.type === 'moto' || trip.vehicle === 'moto' ? '#FF9800' : '#2196F3';
              const icon = veh?.type === 'moto' || trip.vehicle === 'moto' ? 'motorbike' : 'car';
              return <StatItem icon={icon} value={name} color={color} />;
            })()}
          </View>

          {(trip.route || osrmRoute) && (
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Départ</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: trip.source === 'manual' ? '#2196F3' : '#FFC107' }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Arrivée</Text>
              </View>
              <Text style={[styles.legendText, { color: trip.routeSource === 'osrm' ? '#4CAF50' : colors.mutedForeground }]}>
                {trip.source === 'manual'
                  ? 'Itinéraire estimé (OSRM)'
                  : trip.routeSource === 'osrm'
                    ? `Tracé routier OSRM · ${trip.route?.length ?? 0} pts`
                    : `${trip.route?.length ?? 0} pts (tracé GPS simplifié)`}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function StatItem({ icon, value, color }: { icon: string; value: string; color: string }) {
  return (
    <View style={styles.statItem}>
      <MaterialCommunityIcons name={icon as any} size={16} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function AddressBadge({
  address,
  placeId,
  dotColor,
  categories,
  places,
  colors,
}: {
  address?: string;
  placeId?: string;
  dotColor: string;
  categories: PlaceCategory[];
  places: Array<{ id: string; name: string; categoryId?: string }>;
  colors: ReturnType<typeof useColors>;
}) {
  const place = placeId ? places.find(p => p.id === placeId) : null;
  const cat   = place?.categoryId ? categories.find(c => c.id === place.categoryId) : null;
  const icon  = (cat?.icon ?? (placeId ? 'map-marker' : 'map-marker-outline')) as string;
  const iconColor = cat?.color ?? dotColor;

  return (
    <View style={styles.addrBadge}>
      <MaterialCommunityIcons name={icon as any} size={14} color={iconColor} />
      <Text style={[styles.addrBadgeText, { color: colors.foreground }]} numberOfLines={1}>
        {address ?? '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noRoute: { color: '#555', fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  card: {
    flex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 6,
  },
  dateText: { fontSize: 17, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize' },
  timeText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statValue: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  addrBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addrBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  addrBadgeText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
});
