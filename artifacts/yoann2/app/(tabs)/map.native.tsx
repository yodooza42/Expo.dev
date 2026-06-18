import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import { useLocationHistory } from '@/hooks/useLocationHistory';
import type { LocationPoint } from '@/utils/locationTracking';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDayLabel(day: string): string {
  const d = new Date(day + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

const FR_MONTHS: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4,
  mai: 5, juin: 6, juillet: 7, août: 8, aout: 8,
  septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
};

/**
 * Parses French search queries:
 * - "14h30" / "14:30" / "14h" → time search on current day
 * - "16 juin" / "lundi 16 juin" / "16/06" → navigate to that date
 * - "lundi 16 juin 14h30" → navigate to date + zoom to time
 */
function parseSearchQuery(query: string, currentYear: number): {
  dateKey?: string;
  time?: string;
} | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  let dateKey: string | undefined;
  let time: string | undefined;

  // Extract time part: "14h30" / "14:30" / "14h"
  const timeRx = /\b(\d{1,2})[h:](\d{2})\b|\b(\d{1,2})h\b/;
  const timeM = q.match(timeRx);
  if (timeM) {
    const h = (timeM[1] ?? timeM[3] ?? '0').padStart(2, '0');
    const m = (timeM[2] ?? '00').padStart(2, '0');
    time = `${h}:${m}`;
  }

  // Extract date part (remove time token first)
  const withoutTime = q.replace(timeRx, '').trim();

  // "16/06" or "16/06/2026"
  const slashM = withoutTime.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (slashM) {
    const day  = parseInt(slashM[1]!, 10);
    const mon  = parseInt(slashM[2]!, 10);
    const year = slashM[3] ? parseInt(slashM[3], 10) : currentYear;
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      dateKey = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // "16 juin" / "lundi 16 juin" / "16 juin 2026"
  if (!dateKey) {
    const textM = withoutTime.match(/(\d{1,2})\s+([a-zéûôèàâùî]+)(?:\s+(\d{4}))?/);
    if (textM) {
      const day = parseInt(textM[1]!, 10);
      const monName = textM[2]!;
      const year = textM[3] ? parseInt(textM[3], 10) : currentYear;
      const mon = FR_MONTHS[monName];
      if (mon && day >= 1 && day <= 31) {
        dateKey = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  if (!dateKey && !time) return null;
  return { dateKey, time };
}

function regionFromPoints(points: LocationPoint[]): Region | null {
  if (points.length === 0) return null;
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latDelta = Math.max((maxLat - minLat) * 1.4, 0.01);
  const lngDelta = Math.max((maxLng - minLng) * 1.4, 0.01);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

const DEFAULT_REGION: Region = {
  latitude: 48.8566,
  longitude: 2.3522,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const mapRef  = useRef<MapView>(null);

  const {
    selectedDay,
    setSelectedDay,
    dayStats,
    periodAvg7,
    periodAvg30,
    paused,
    hasPermission,
    loading,
    goToPrevDay,
    goToNextDay,
    enableTracking,
    togglePause,
    findPointByTime,
    refresh,
  } = useLocationHistory();

  const [search, setSearch]           = useState('');
  const [highlightPt, setHighlightPt] = useState<LocationPoint | null>(null);
  const pendingTimeRef = useRef<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const isToday = selectedDay === today;

  // Fit map to points when data loads; also run any pending time search
  useEffect(() => {
    const region = regionFromPoints(dayStats.points);
    if (region && mapRef.current) {
      mapRef.current.animateToRegion(region, 600);
    }
    setHighlightPt(null);

    // If a time search was deferred waiting for this day's data, run it now
    const pendingTime = pendingTimeRef.current;
    if (pendingTime && dayStats.points.length > 0) {
      pendingTimeRef.current = null;
      const pt = findPointByTime(pendingTime);
      if (pt) {
        setHighlightPt(pt);
        mapRef.current?.animateToRegion({
          latitude: pt.lat,
          longitude: pt.lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 800);
      }
    }
  }, [dayStats.points, findPointByTime]);

  const handleSearch = useCallback(() => {
    const q = search.trim();
    if (!q) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const parsed = parseSearchQuery(q, new Date().getFullYear());
    if (!parsed) {
      Alert.alert('Format non reconnu', 'Exemples : "16 juin", "lundi 16 juin", "14h30", "16/06"');
      return;
    }
    if (parsed.dateKey) {
      // Navigate to another day; defer time lookup until new day's points load
      if (parsed.time) {
        pendingTimeRef.current = parsed.time;
      }
      setSelectedDay(parsed.dateKey);
    } else if (parsed.time) {
      // Same day — resolve immediately with current data
      const pt = findPointByTime(parsed.time);
      if (pt) {
        setHighlightPt(pt);
        mapRef.current?.animateToRegion({
          latitude: pt.lat,
          longitude: pt.lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 600);
      } else {
        Alert.alert('Aucun point trouvé', 'Aucun point GPS enregistré à cet horaire.');
      }
    }
  }, [search, findPointByTime, setSelectedDay]);

  const handleEnableTracking = useCallback(async () => {
    const ok = await enableTracking();
    if (!ok) {
      Alert.alert(
        'Permission refusée',
        'Autorisez la localisation en arrière-plan dans les paramètres pour activer le suivi GPS.',
      );
    } else {
      refresh();
    }
  }, [enableTracking, refresh]);

  const handleTogglePause = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await togglePause();
  }, [togglePause]);

  const coordinates = dayStats.points.map(p => ({ latitude: p.lat, longitude: p.lng }));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Map ── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        userInterfaceStyle="dark"
        showsUserLocation
        showsMyLocationButton={false}
      >
        {coordinates.length > 1 && (
          <Polyline
            coordinates={coordinates}
            strokeColor={colors.primary}
            strokeWidth={3}
          />
        )}
        {/* Intermediate point markers (all points except first/last) */}
        {dayStats.points.slice(1, -1).map((pt, idx) => (
          <Marker
            key={`pt-${idx}`}
            coordinate={{ latitude: pt.lat, longitude: pt.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={[styles.markerDot, styles.markerMid]} />
          </Marker>
        ))}
        {/* Start marker */}
        {dayStats.points.length > 0 && (
          <Marker
            coordinate={{ latitude: dayStats.points[0]!.lat, longitude: dayStats.points[0]!.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={[styles.markerDot, { backgroundColor: '#4CAF50' }]} />
          </Marker>
        )}
        {/* End marker */}
        {dayStats.points.length > 1 && (
          <Marker
            coordinate={{
              latitude: dayStats.points[dayStats.points.length - 1]!.lat,
              longitude: dayStats.points[dayStats.points.length - 1]!.lng,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={[styles.markerDot, { backgroundColor: '#F44336' }]} />
          </Marker>
        )}
        {/* Highlight marker (search result) */}
        {highlightPt && (
          <Marker
            coordinate={{ latitude: highlightPt.lat, longitude: highlightPt.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={[styles.markerDot, styles.markerHighlight, { borderColor: colors.primary }]} />
          </Marker>
        )}
      </MapView>

      {/* ── Top overlay: day navigator + search ── */}
      <View
        style={[
          styles.topOverlay,
          { top: insets.top + 8, backgroundColor: colors.card + 'F0', borderColor: colors.border },
        ]}
      >
        {/* Day navigator */}
        <View style={styles.dayNav}>
          <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); goToPrevDay(); }} hitSlop={12}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.dayLabel, { color: colors.foreground }]} numberOfLines={1}>
            {formatDayLabel(selectedDay)}
          </Text>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); goToNextDay(); }}
            hitSlop={12}
            style={{ opacity: isToday ? 0.3 : 1 }}
          >
            <MaterialCommunityIcons name="chevron-right" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Search bar */}
        <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.background + 'CC' }]}>
          <MaterialCommunityIcons name="magnify" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Heure (ex: 14h30)…"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={15} color={colors.mutedForeground} />
            </Pressable>
          )}
          <Pressable
            onPress={handleSearch}
            hitSlop={8}
            style={[styles.searchBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.searchBtnTxt}>OK</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Recenter button ── */}
      <Pressable
        style={[styles.recenterBtn, { bottom: 260, right: 16, backgroundColor: colors.card + 'F0', borderColor: colors.border }]}
        onPress={() => {
          const region = regionFromPoints(dayStats.points);
          if (region) mapRef.current?.animateToRegion(region, 400);
          else mapRef.current?.animateToRegion(DEFAULT_REGION, 400);
        }}
        hitSlop={8}
      >
        <MaterialCommunityIcons name="crosshairs-gps" size={20} color={colors.primary} />
      </Pressable>

      {/* ── Bottom panel ── */}
      <View
        style={[
          styles.bottomPanel,
          { backgroundColor: colors.card + 'F8', borderTopColor: colors.border, paddingBottom: insets.bottom + 8 },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
        ) : (
          <>
            {/* Permission prompt */}
            {hasPermission === false && (
              <Pressable
                style={[styles.permBanner, { backgroundColor: '#FFC10722', borderColor: '#FFC107' }]}
                onPress={handleEnableTracking}
              >
                <MaterialCommunityIcons name="map-marker-alert-outline" size={18} color="#FFC107" />
                <Text style={[styles.permTxt, { color: '#FFC107' }]}>
                  Activer la localisation en arrière-plan
                </Text>
              </Pressable>
            )}

            {/* Day stats */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
              <View style={styles.statsRow}>
                <StatChip
                  icon="map-marker-distance"
                  color="#2196F3"
                  label="Distance"
                  value={`${dayStats.distanceKm} km`}
                  colors={colors}
                />
                <StatChip
                  icon="map-marker-multiple-outline"
                  color="#9C27B0"
                  label="Points"
                  value={String(dayStats.points.length)}
                  colors={colors}
                />
                <StatChip
                  icon="clock-start"
                  color="#4CAF50"
                  label="Premier"
                  value={dayStats.firstTime ?? '—'}
                  colors={colors}
                />
                <StatChip
                  icon="clock-end"
                  color="#F44336"
                  label="Dernier"
                  value={dayStats.lastTime ?? '—'}
                  colors={colors}
                />
              </View>
            </ScrollView>

            {/* Period averages */}
            <View style={[styles.avgRow, { borderTopColor: colors.border }]}>
              <View style={styles.avgItem}>
                <Text style={[styles.avgPeriod, { color: colors.mutedForeground }]}>Moy. 7 jours</Text>
                <Text style={[styles.avgVal, { color: colors.foreground }]}>{periodAvg7.avgKmPerDay} km/j</Text>
              </View>
              <View style={[styles.avgDivider, { backgroundColor: colors.border }]} />
              <View style={styles.avgItem}>
                <Text style={[styles.avgPeriod, { color: colors.mutedForeground }]}>Moy. 30 jours</Text>
                <Text style={[styles.avgVal, { color: colors.foreground }]}>{periodAvg30.avgKmPerDay} km/j</Text>
              </View>
              <View style={[styles.avgDivider, { backgroundColor: colors.border }]} />
              {/* Pause/resume button */}
              <Pressable
                style={[
                  styles.pauseBtn,
                  { backgroundColor: paused ? '#4CAF5022' : '#FF572222', borderColor: paused ? '#4CAF50' : '#FF5722' },
                ]}
                onPress={handleTogglePause}
              >
                <MaterialCommunityIcons
                  name={paused ? 'play-circle-outline' : 'pause-circle-outline'}
                  size={18}
                  color={paused ? '#4CAF50' : '#FF5722'}
                />
                <Text style={[styles.pauseTxt, { color: paused ? '#4CAF50' : '#FF5722' }]}>
                  {paused ? 'Reprendre' : 'Pause'}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────

function StatChip({
  icon, color, label, value, colors,
}: {
  icon: string;
  color: string;
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.statChip, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <MaterialCommunityIcons name={icon as any} size={16} color={color} />
      <View>
        <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  topOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    flex: 1,
    textTransform: 'capitalize',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 0,
  },
  searchBtn: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  searchBtnTxt: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  recenterBtn: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  bottomPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  permTxt: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  statsScroll: {
    flexGrow: 0,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statLabel: {
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
  },
  statValue: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  avgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 0,
  },
  avgItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  avgPeriod: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
  },
  avgVal: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  avgDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    marginHorizontal: 4,
  },
  pauseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginLeft: 4,
  },
  pauseTxt: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerMid: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2196F3',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  markerHighlight: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFC107',
    borderWidth: 2,
  },
});
