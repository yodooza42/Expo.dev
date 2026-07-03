import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { useColors } from '@/hooks/useColors';
import { useLocationHistory } from '@/hooks/useLocationHistory';
import type { Trip, Vehicle } from '@/types/trips';
import { LEAFLET_CSS, LEAFLET_JS } from '@/utils/leafletBundle';
import { getTrips, getVehicleSettings } from '@/utils/tripStorage';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDayLabel(day: string): string {
  const d = new Date(day + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function tripDayKey(trip: Trip): string {
  const d = new Date(trip.startTime);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

const FR_MONTHS: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4,
  mai: 5, juin: 6, juillet: 7, août: 8, aout: 8,
  septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
};

function parseSearchQuery(q: string, currentYear: number): string | null {
  const norm = q.toLowerCase().trim();
  const slashRe = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;
  const numMonthRe = /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s+([a-zéûôùèàâî]+)(?:\s+(\d{4}))?/;

  const sm = norm.match(slashRe);
  if (sm) {
    const day = parseInt(sm[1]!, 10);
    const month = parseInt(sm[2]!, 10);
    const year = sm[3] ? parseInt(sm[3], 10) + (sm[3].length === 2 ? 2000 : 0) : currentYear;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const nm = norm.match(numMonthRe);
  if (nm) {
    const day = parseInt(nm[1]!, 10);
    const monthNum = FR_MONTHS[nm[2]!];
    if (monthNum) {
      const year = nm[3] ? parseInt(nm[3], 10) : currentYear;
      return `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

// ── Vehicle helpers ───────────────────────────────────────────────────────────

const VEHICLE_COLORS: Record<string, string> = {
  car: '#2196F3',
  moto: '#FF9800',
  unknown: '#9E9E9E',
  ignored: '#555555',
};

function vehicleColor(vehicle: string | undefined): string {
  return VEHICLE_COLORS[vehicle ?? 'unknown'] ?? '#9E9E9E';
}

function vehicleIcon(vehicle: string | undefined): string {
  if (vehicle === 'moto') return 'motorbike';
  if (vehicle === 'car') return 'car';
  return 'help-circle-outline';
}

// ── Leaflet HTML builder (Leaflet bundled locally — no CDN) ───────────────────

function buildTripsMapHtml(dayTrips: Trip[], vehicles: Vehicle[]): string {
  const vehicleMap: Record<string, string> = {};
  vehicles.forEach(v => { vehicleMap[v.id] = v.name; });

  const tripsData = dayTrips.map(t => {
    const route = t.route && t.route.length >= 2
      ? t.route.map(p => [p.lat, p.lng])
      : (t.startLat && t.startLon && t.endLat && t.endLon)
        ? [[t.startLat, t.startLon], [t.endLat, t.endLon]]
        : null;
    const color = vehicleColor(t.vehicle ?? undefined);
    const vehicleName = vehicleMap[t.vehicle ?? ''] ?? (t.vehicle === 'car' ? 'Voiture' : t.vehicle === 'moto' ? 'Moto' : 'Inconnu');
    const dashed = !t.route || t.route.length < 2;
    return {
      id: t.id,
      route,
      color,
      dashed,
      vehicle: vehicleName,
      dist: t.distanceKm.toFixed(1),
      start: fmtTime(t.startTime),
      end: fmtTime(t.endTime),
      dur: fmtDuration(t.endTime - t.startTime),
    };
  }).filter(t => t.route !== null);

  const tripsJSON = JSON.stringify(tripsData);

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>${LEAFLET_CSS}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#121212}
  #map{width:100vw;height:100vh}
  .leaflet-control-zoom{margin:12px!important}
  .leaflet-control-zoom a{background:#1E1E1E!important;color:#FFF!important;border-color:#333!important}
  .dk .leaflet-popup-content-wrapper{background:#1E1E1E;color:#FFF;border:1px solid #444;border-radius:12px;box-shadow:0 4px 16px #0008}
  .dk .leaflet-popup-tip{background:#1E1E1E}
  .dk .leaflet-popup-content{margin:10px 14px;font-family:sans-serif;font-size:13px;line-height:1.8}
  .dk .leaflet-popup-close-button{color:#666!important;font-size:16px!important;top:6px!important;right:8px!important}
  .pt{font-weight:700;font-size:14px;margin-bottom:2px}
  .pr{color:#AAA;font-size:12px}
  .pb{margin-top:8px;background:#FFC107;color:#121212;border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;width:100%}
</style>
<script>${LEAFLET_JS}</script>
</head>
<body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);

var trips=${tripsJSON};
var tripLayers={};

function addTrip(t){
  if(!t.route||t.route.length<2)return;
  var col=t.color;
  var opts={color:col,weight:5,opacity:0.85,interactive:false};
  if(t.dashed)opts.dashArray='8,6';

  var hitLine=L.polyline(t.route,{color:col,weight:16,opacity:0,interactive:true}).addTo(map);
  var visLine=L.polyline(t.route,opts).addTo(map);

  var startPt=t.route[0];
  var endPt=t.route[t.route.length-1];
  var sm=L.circleMarker(startPt,{radius:7,color:'#4CAF50',fillColor:'#4CAF50',fillOpacity:1,weight:2,interactive:false}).addTo(map);
  var em=L.circleMarker(endPt,{radius:7,color:col,fillColor:col,fillOpacity:1,weight:2,interactive:false}).addTo(map);

  tripLayers[t.id]={line:visLine,start:sm,end:em,bounds:L.polyline(t.route).getBounds()};

  hitLine.on('click',function(e){
    var html='<div class="pt">'+t.vehicle+'</div>'
      +'<div class="pr">📍 '+t.dist+' km · '+t.dur+'</div>'
      +'<div class="pr">🕐 '+t.start+' → '+t.end+'</div>'
      +(t.dashed?'<div class="pr" style="color:#FFC107;margin-top:4px">Itinéraire estimé</div>':'')
      +'<button class="pb" onclick="openTrip(\''+t.id+'\')">Voir le détail →</button>';
    L.popup({className:'dk',offset:[0,-2],maxWidth:200}).setLatLng(e.latlng).setContent(html).openOn(map);
    L.DomEvent.stopPropagation(e);
  });
}

function openTrip(id){
  if(window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'open_trip',id:id}));
  }
}

var allLatlngs=[];
for(var i=0;i<trips.length;i++){
  addTrip(trips[i]);
  if(trips[i].route)allLatlngs=allLatlngs.concat(trips[i].route);
}

if(allLatlngs.length>0){
  map.fitBounds(L.polyline(allLatlngs).getBounds().pad(0.2));
}else{
  map.setView([46.2276,2.2137],6);
}

window.focusTrip=function(id){
  var layer=tripLayers[id];
  if(!layer)return;
  map.fitBounds(layer.bounds.pad(0.25));
};

window.recenter=function(){
  if(allLatlngs.length>0){
    map.fitBounds(L.polyline(allLatlngs).getBounds().pad(0.2));
  }
};
</script>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const webRef  = useRef<WebView>(null);

  const { paused, hasPermission, togglePause, enableTracking } = useLocationHistory();

  const today      = new Date().toISOString().slice(0, 10);
  const [selectedDay, setSelectedDay] = useState(today);
  const [allTrips, setAllTrips]       = useState<Trip[]>([]);
  const [vehicles, setVehicles]       = useState<Vehicle[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');

  const isToday = selectedDay === today;

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    const [trips, vSettings] = await Promise.all([getTrips(), getVehicleSettings()]);
    setAllTrips(trips.filter(t => t.vehicle !== 'ignored'));
    setVehicles(vSettings);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Day trips ─────────────────────────────────────────────────────────────────

  const dayTrips = useMemo(
    () => allTrips
      .filter(t => tripDayKey(t) === selectedDay)
      .sort((a, b) => a.startTime - b.startTime),
    [allTrips, selectedDay],
  );

  const vehicleMap = useMemo(() => {
    const m: Record<string, string> = {};
    vehicles.forEach(v => { m[v.id] = v.name; });
    return m;
  }, [vehicles]);

  const carKm  = useMemo(() => dayTrips.filter(t => t.vehicle === 'car').reduce((s, t) => s + t.distanceKm, 0), [dayTrips]);
  const motoKm = useMemo(() => dayTrips.filter(t => t.vehicle === 'moto').reduce((s, t) => s + t.distanceKm, 0), [dayTrips]);

  // ── Map key (rebuild WebView when day or trips change) ────────────────────────

  const mapHtml = useMemo(() => buildTripsMapHtml(dayTrips, vehicles), [dayTrips, vehicles]);
  const mapKey  = `${selectedDay}-${dayTrips.length}`;

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const goToPrevDay = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDay(d => shiftDay(d, -1));
  }, []);

  const goToNextDay = useCallback(() => {
    if (isToday) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDay(d => shiftDay(d, 1));
  }, [isToday]);

  const handleSearch = useCallback(() => {
    const q = search.trim();
    if (!q) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const dateKey = parseSearchQuery(q, new Date().getFullYear());
    if (!dateKey) {
      Alert.alert('Format non reconnu', 'Exemples : "16 juin", "16/06"');
      return;
    }
    setSelectedDay(dateKey);
    setSearch('');
  }, [search]);

  const handleEnableTracking = useCallback(async () => {
    const ok = await enableTracking();
    if (!ok) {
      Alert.alert('Permission refusée', 'Autorisez la localisation en arrière-plan dans les paramètres.');
    }
  }, [enableTracking]);

  const handleTogglePause = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await togglePause();
  }, [togglePause]);

  // ── WebView messages ──────────────────────────────────────────────────────────

  const handleWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string; id?: string };
      if (msg.type === 'open_trip' && msg.id) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: '/trip-map', params: { id: msg.id } } as any);
      }
    } catch {}
  }, [router]);

  const focusTripOnMap = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    webRef.current?.injectJavaScript(`window.focusTrip && window.focusTrip('${id}'); true;`);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Map ── */}
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
        onMessage={handleWebViewMessage}
      />

      {/* ── Top overlay ── */}
      <View style={[styles.topOverlay, { top: insets.top + 8, backgroundColor: colors.card + 'F0', borderColor: colors.border }]}>
        <View style={styles.dayNav}>
          <Pressable onPress={goToPrevDay} hitSlop={12}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.dayLabel, { color: colors.foreground }]} numberOfLines={1}>
            {formatDayLabel(selectedDay)}
          </Text>
          <Pressable onPress={goToNextDay} hitSlop={12} style={{ opacity: isToday ? 0.3 : 1 }}>
            <MaterialCommunityIcons name="chevron-right" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.background + 'CC' }]}>
          <MaterialCommunityIcons name="magnify" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Date (ex: 16 juin, 16/06)…"
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
          <Pressable onPress={handleSearch} hitSlop={8} style={[styles.searchBtn, { backgroundColor: colors.primary }]}>
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
      <View style={[styles.bottomPanel, { backgroundColor: colors.card + 'F8', borderTopColor: colors.border, paddingBottom: insets.bottom + 6 }]}>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 14 }} />
        ) : (
          <>
            {/* Permission banner */}
            {hasPermission === false && (
              <Pressable
                style={[styles.permBanner, { backgroundColor: '#FFC10722', borderColor: '#FFC107' }]}
                onPress={handleEnableTracking}
              >
                <MaterialCommunityIcons name="map-marker-alert-outline" size={16} color="#FFC107" />
                <Text style={[styles.permTxt, { color: '#FFC107' }]}>Activer la localisation en arrière-plan</Text>
              </Pressable>
            )}

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statChip}>
                <MaterialCommunityIcons name="car" size={15} color="#2196F3" />
                <Text style={[styles.statVal, { color: colors.foreground }]}>{carKm.toFixed(1)} km</Text>
                <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Voiture</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statChip}>
                <MaterialCommunityIcons name="motorbike" size={15} color="#FF9800" />
                <Text style={[styles.statVal, { color: colors.foreground }]}>{motoKm.toFixed(1)} km</Text>
                <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Moto</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statChip}>
                <MaterialCommunityIcons name="routes" size={15} color={colors.primary} />
                <Text style={[styles.statVal, { color: colors.foreground }]}>{dayTrips.length}</Text>
                <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>Trajet{dayTrips.length > 1 ? 's' : ''}</Text>
              </View>

              {/* Pause/Resume button */}
              <Pressable
                style={[
                  styles.pauseBtn,
                  { backgroundColor: paused ? '#4CAF5022' : '#FF572222', borderColor: paused ? '#4CAF50' : '#FF5722' },
                ]}
                onPress={handleTogglePause}
              >
                <MaterialCommunityIcons
                  name={paused ? 'play-circle-outline' : 'pause-circle-outline'}
                  size={16}
                  color={paused ? '#4CAF50' : '#FF5722'}
                />
                <Text style={[styles.pauseTxt, { color: paused ? '#4CAF50' : '#FF5722' }]}>
                  {paused ? 'Reprendre' : 'Pause'}
                </Text>
              </Pressable>
            </View>

            {/* Trip list */}
            {dayTrips.length === 0 ? (
              <View style={styles.emptyRow}>
                <MaterialCommunityIcons name="map-marker-off-outline" size={20} color={colors.mutedForeground} />
                <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Aucun trajet ce jour-là</Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tripListScroll}
                contentContainerStyle={styles.tripListContent}
              >
                {dayTrips.map(trip => {
                  const col = vehicleColor(trip.vehicle ?? undefined);
                  const icon = vehicleIcon(trip.vehicle ?? undefined);
                  const name = vehicleMap[trip.vehicle ?? ''] ?? (trip.vehicle === 'moto' ? 'Msx' : trip.vehicle === 'car' ? 'Doblo' : 'Inconnu');
                  return (
                    <Pressable
                      key={trip.id}
                      style={[styles.tripCard, { backgroundColor: colors.card, borderColor: col + '55' }]}
                      onPress={() => focusTripOnMap(trip.id)}
                      onLongPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        router.push({ pathname: '/trip-map', params: { id: trip.id } } as any);
                      }}
                    >
                      <MaterialCommunityIcons name={icon as any} size={16} color={col} />
                      <Text style={[styles.tripCardName, { color: colors.foreground }]}>{name}</Text>
                      <Text style={[styles.tripCardDist, { color: col }]}>{trip.distanceKm.toFixed(1)} km</Text>
                      <Text style={[styles.tripCardTime, { color: colors.mutedForeground }]}>
                        {fmtTime(trip.startTime)} → {fmtTime(trip.endTime)}
                      </Text>
                      {trip.source === 'manual' && (
                        <View style={[styles.manualBadge, { borderColor: colors.primary + '88' }]}>
                          <Text style={[styles.manualTxt, { color: colors.primary }]}>manuel</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
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
    textTransform: 'capitalize',
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
    right: 14,
    bottom: 240,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },

  bottomPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 14,
    gap: 8,
    minHeight: 170,
  },

  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  permTxt: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statVal: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  statLbl: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  statDivider: { width: StyleSheet.hairlineWidth, height: 20 },

  pauseBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  pauseTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  emptyTxt: { fontSize: 13, fontFamily: 'Inter_400Regular' },

  tripListScroll: { flexGrow: 0 },
  tripListContent: { gap: 8, paddingBottom: 2, paddingTop: 2 },

  tripCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
    minWidth: 130,
  },
  tripCardName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
  tripCardDist: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  tripCardTime: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  manualBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginTop: 2,
  },
  manualTxt: { fontSize: 9, fontFamily: 'Inter_500Medium' },
});
