import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';

import { useColors } from '@/hooks/useColors';
import { useLocationHistory } from '@/hooks/useLocationHistory';
import { exportBackup, importBackup } from '@/utils/locationBackup';
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

function parseSearchQuery(
  q: string,
  currentYear: number,
): { dateKey?: string; time?: string } | null {
  const norm = q.toLowerCase().trim();

  const timeRe = /(\d{1,2})[h:](\d{2})|(\d{1,2})h$/;
  const slashRe = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;
  const numMonthRe = /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s+([a-zéûôùèàâî]+)(?:\s+(\d{4}))?/;
  const timeOnlyRe = /^(\d{1,2})[h:](\d{2})?$|^(\d{1,2})h$/;

  if (timeOnlyRe.test(norm)) {
    const m = norm.match(timeRe);
    if (!m) return null;
    const h = m[1] ?? m[3] ?? '0';
    const min = m[2] ?? '00';
    return { time: `${h.padStart(2, '0')}:${min}` };
  }

  let dateKey: string | undefined;
  let time: string | undefined;

  const sm = norm.match(slashRe);
  if (sm) {
    const day = parseInt(sm[1]!, 10);
    const month = parseInt(sm[2]!, 10);
    const year = sm[3] ? parseInt(sm[3], 10) + (sm[3].length === 2 ? 2000 : 0) : currentYear;
    dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  if (!dateKey) {
    const nm = norm.match(numMonthRe);
    if (nm) {
      const day = parseInt(nm[1]!, 10);
      const monthNum = FR_MONTHS[nm[2]!];
      if (monthNum) {
        const year = nm[3] ? parseInt(nm[3], 10) : currentYear;
        dateKey = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  const tm = norm.match(timeRe);
  if (tm) {
    const h = tm[1] ?? tm[3] ?? '0';
    const min = tm[2] ?? '00';
    time = `${h.padStart(2, '0')}:${min}`;
  }

  if (!dateKey && !time) return null;
  return { dateKey, time };
}

// ── Leaflet HTML builder ──────────────────────────────────────────────────────

function buildMapHtml(
  points: LocationPoint[],
  primaryColor: string,
  highlightPt: LocationPoint | null,
): string {
  const latlngs = JSON.stringify(points.map(p => [p.lat, p.lng]));
  const highlight = highlightPt
    ? JSON.stringify([highlightPt.lat, highlightPt.lng])
    : 'null';

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#121212}
  #map{width:100vw;height:100vh}
  .leaflet-control-zoom{margin:12px!important}
  .leaflet-control-zoom a{background:#1E1E1E!important;color:#FFF!important;border-color:#333!important}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);

var pts=${latlngs};
var hl=${highlight};
var pri='${primaryColor}';

if(pts.length>0){
  L.polyline(pts,{color:pri,weight:4,opacity:0.9}).addTo(map);
  L.circleMarker(pts[0],{radius:8,color:'#4CAF50',fillColor:'#4CAF50',fillOpacity:1,weight:2}).addTo(map);
  if(pts.length>1){
    L.circleMarker(pts[pts.length-1],{radius:8,color:'#F44336',fillColor:'#F44336',fillOpacity:1,weight:2}).addTo(map);
    for(var i=1;i<pts.length-1;i++){
      L.circleMarker(pts[i],{radius:3,color:'#2196F3',fillColor:'#2196F3',fillOpacity:0.7,weight:1}).addTo(map);
    }
  }
  if(hl){
    L.circleMarker(hl,{radius:11,color:pri,fillColor:pri,fillOpacity:0.85,weight:3}).addTo(map);
    map.setView(hl,16);
  } else {
    map.fitBounds(L.polyline(pts).getBounds().pad(0.15));
  }
} else {
  map.setView([46.2276,2.2137],6);
}

window.recenter=function(){
  if(pts.length>0) map.fitBounds(L.polyline(pts).getBounds().pad(0.15));
  else map.setView([46.2276,2.2137],6);
};
</script>
</body>
</html>`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({
  icon, color, label, value, colors,
}: {
  icon: string; color: string; label: string; value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.statChip, { backgroundColor: color + '18', borderColor: color + '44' }]}>
      <MaterialCommunityIcons name={icon as any} size={18} color={color} />
      <View>
        <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      </View>
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const webRef   = useRef<WebView>(null);
  const [backupBusy, setBackupBusy] = useState(false);

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
  const pendingTimeRef                = useRef<string | null>(null);

  const today   = new Date().toISOString().slice(0, 10);
  const isToday = selectedDay === today;

  useEffect(() => {
    setHighlightPt(null);
    const pendingTime = pendingTimeRef.current;
    if (pendingTime && dayStats.points.length > 0) {
      pendingTimeRef.current = null;
      const pt = findPointByTime(pendingTime);
      if (pt) setHighlightPt(pt);
    }
  }, [dayStats.points, findPointByTime]);

  const handleSearch = useCallback(() => {
    const q = search.trim();
    if (!q) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const parsed = parseSearchQuery(q, new Date().getFullYear());
    if (!parsed) {
      Alert.alert('Format non reconnu', 'Exemples : "16 juin", "14h30", "16/06"');
      return;
    }
    if (parsed.dateKey) {
      if (parsed.time) pendingTimeRef.current = parsed.time;
      setSelectedDay(parsed.dateKey);
    } else if (parsed.time) {
      const pt = findPointByTime(parsed.time);
      if (pt) {
        setHighlightPt(pt);
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

  const handleExport = useCallback(async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      await exportBackup();
    } catch {
      Alert.alert('Erreur', 'Impossible d\'exporter les données.');
    } finally {
      setBackupBusy(false);
    }
  }, [backupBusy]);

  const handleImport = useCallback(async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const { restored, error } = await importBackup();
      if (error) {
        Alert.alert('Erreur', error);
      } else if (restored > 0) {
        Alert.alert('Importé', `${restored} jour${restored > 1 ? 's' : ''} restauré${restored > 1 ? 's' : ''}.`);
        refresh();
      }
    } catch {
      Alert.alert('Erreur', 'Impossible d\'importer le fichier.');
    } finally {
      setBackupBusy(false);
    }
  }, [backupBusy, refresh]);

  const mapHtml    = buildMapHtml(dayStats.points, colors.primary, highlightPt);
  const mapKey     = `${selectedDay}-${highlightPt?.timestamp ?? 'none'}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Map (WebView + Leaflet) ── */}
      <WebView
        key={mapKey}
        ref={webRef}
        source={{ html: mapHtml }}
        style={styles.map}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scalesPageToFit={false}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      />

      {/* ── Top overlay: day navigator + search ── */}
      <View
        style={[
          styles.topOverlay,
          { top: insets.top + 8, backgroundColor: colors.card + 'F0', borderColor: colors.border },
        ]}
      >
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
        style={[styles.recenterBtn, { backgroundColor: colors.card + 'F0', borderColor: colors.border }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          webRef.current?.injectJavaScript('window.recenter && window.recenter(); true;');
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

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
              <View style={styles.statsRow}>
                <StatChip icon="map-marker-distance" color="#2196F3" label="Distance" value={`${dayStats.distanceKm} km`} colors={colors} />
                <StatChip icon="map-marker-multiple-outline" color="#9C27B0" label="Points" value={String(dayStats.points.length)} colors={colors} />
                <StatChip icon="clock-start" color="#4CAF50" label="Premier" value={dayStats.firstTime ?? '—'} colors={colors} />
                <StatChip icon="clock-end" color="#F44336" label="Dernier" value={dayStats.lastTime ?? '—'} colors={colors} />
              </View>
            </ScrollView>

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

            {/* ── Backup row ── */}
            <View style={[styles.backupRow, { borderTopColor: colors.border }]}>
              <Pressable
                style={[styles.backupBtn, { borderColor: colors.border, opacity: backupBusy ? 0.5 : 1 }]}
                onPress={handleExport}
                disabled={backupBusy}
              >
                <MaterialCommunityIcons name="export-variant" size={15} color={colors.mutedForeground} />
                <Text style={[styles.backupTxt, { color: colors.mutedForeground }]}>Exporter</Text>
              </Pressable>
              <Pressable
                style={[styles.backupBtn, { borderColor: colors.border, opacity: backupBusy ? 0.5 : 1 }]}
                onPress={handleImport}
                disabled={backupBusy}
              >
                <MaterialCommunityIcons name="import" size={15} color={colors.mutedForeground} />
                <Text style={[styles.backupTxt, { color: colors.mutedForeground }]}>Importer</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  topOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    elevation: 4,
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    paddingHorizontal: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 2,
  },
  searchBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  searchBtnTxt: {
    color: '#121212',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },

  recenterBtn: {
    position: 'absolute',
    right: 16,
    bottom: 260,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },

  bottomPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  permTxt: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },

  statsScroll: { flexGrow: 0 },
  statsRow: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statLabel: { fontSize: 9, fontFamily: 'Inter_400Regular' },
  statValue: { fontSize: 14, fontFamily: 'Inter_700Bold' },

  avgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  avgItem: { flex: 1, alignItems: 'center', gap: 2 },
  avgPeriod: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  avgVal: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  avgDivider: { width: 1, height: 30, marginHorizontal: 4 },

  pauseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  pauseTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  backupRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  backupBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  backupTxt: { fontSize: 11, fontFamily: 'Inter_500Medium' },
});
