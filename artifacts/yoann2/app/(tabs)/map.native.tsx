import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { exportBackup, importBackup } from '@/utils/locationBackup';
import { correctActivity, deleteDayPoints, loadMultiDayPoints } from '@/utils/locationTracking';
import type { ActivityType, LocationPoint } from '@/utils/locationTracking';
import { haversineKm } from '@/utils/haversine';
import { getTrips, updateTrip } from '@/utils/tripStorage';
import type { Trip, RoutePoint } from '@/types/trips';
import type { PlaceCategory } from '@/types/places';
import { getPlaceCategories, saveKnownPlace } from '@/utils/placesStorage';
import { reverseGeocode } from '@/utils/geocoding';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDayLabel(day: string): string {
  const d = new Date(day + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function fmtTripTime(ts: number): string {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0');
}

function fmtReplayDay(day: string): string {
  const d = new Date(day + 'T12:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const wd = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][d.getDay()]!;
  return `${wd} ${dd}/${mm}`;
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
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

// ── Leaflet HTML builders ─────────────────────────────────────────────────────

const ACTIVITY_COLORS: Record<string, string> = {
  walk: '#4CAF50',
  car: '#2196F3',
  unknown: '#FFC107',
};

const LEAFLET_HEAD = `
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>`;

const LEAFLET_BASE_CSS = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#121212}
  #map{width:100vw;height:100vh}
  .leaflet-control-zoom{margin:12px!important}
  .leaflet-control-zoom a{background:#1E1E1E!important;color:#FFF!important;border-color:#333!important}`;

function buildMapHtml(
  points: LocationPoint[],
  primaryColor: string,
  highlightPt: LocationPoint | null,
): string {
  const ptsData = JSON.stringify(
    points.map(p => ({
      lat: p.lat,
      lng: p.lng,
      activity: p.activity ?? 'unknown',
      ts: p.timestamp,
      spd: p.speedKmh,
    })),
  );
  const highlight = highlightPt ? JSON.stringify([highlightPt.lat, highlightPt.lng]) : 'null';
  const highlightColor = highlightPt
    ? (ACTIVITY_COLORS[highlightPt.activity ?? 'unknown'] ?? primaryColor)
    : primaryColor;

  return `<!DOCTYPE html>
<html>
<head>${LEAFLET_HEAD}
<style>${LEAFLET_BASE_CSS}
  .dark-popup .leaflet-popup-content-wrapper{background:#1E1E1E;color:#FFF;border:1px solid #FFC107;border-radius:10px;box-shadow:0 4px 16px #0008}
  .dark-popup .leaflet-popup-tip{background:#1E1E1E}
  .dark-popup .leaflet-popup-content{margin:10px 14px;font-family:sans-serif;font-size:13px;line-height:1.7}
  .dark-popup .leaflet-popup-close-button{color:#999!important;font-size:16px!important;top:6px!important;right:8px!important}
  .popup-act{font-size:15px;font-weight:700;margin-bottom:2px}
  .popup-row{color:#CCC;font-size:12px}
  .popup-spd{color:#FFC107;font-weight:600}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);

var ptsData=${ptsData};
var hl=${highlight};
var hlColor='${highlightColor}';

var COLORS={walk:'#4CAF50',car:'#2196F3',unknown:'#FFC107'};
var ACT_LABELS={walk:'🚶 Marche',car:'🚗 Voiture',unknown:'❓ Inconnu'};

function colorFor(act){return COLORS[act]||'#FFC107';}

function fmtTime(ts){
  var d=new Date(ts);
  var h=String(d.getHours()).padStart(2,'0');
  var m=String(d.getMinutes()).padStart(2,'0');
  return h+'h'+m;
}

function makeSeg(i){
  var seg=[[ptsData[i].lat,ptsData[i].lng],[ptsData[i+1].lat,ptsData[i+1].lng]];
  var col=colorFor(ptsData[i].activity);
  var hitLine=L.polyline(seg,{color:col,weight:14,opacity:0,interactive:true}).addTo(map);
  var lpTimer=null;
  hitLine.on('click',function(e){
    var p=ptsData[i];
    var spd=p.spd!=null?'<span class="popup-spd">'+p.spd+' km/h</span>':'<span class="popup-row">Vitesse inconnue</span>';
    var html='<div class="popup-act">'+(ACT_LABELS[p.activity]||'❓ Inconnu')+'</div>'
      +'<div class="popup-row">🕐 '+fmtTime(p.ts)+'</div>'
      +'<div class="popup-row">⚡ '+spd+'</div>';
    L.popup({className:'dark-popup',offset:[0,-2],maxWidth:180}).setLatLng(e.latlng).setContent(html).openOn(map);
    L.DomEvent.stopPropagation(e);
  });
  hitLine.on('touchstart',function(){
    var p=ptsData[i];
    lpTimer=setTimeout(function(){
      lpTimer=null;
      if(window.ReactNativeWebView){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'longpress',ts:p.ts,activity:p.activity}));
      }
    },600);
  });
  hitLine.on('touchend touchmove',function(){
    if(lpTimer){clearTimeout(lpTimer);lpTimer=null;}
  });
  hitLine.on('contextmenu',function(e){L.DomEvent.stopPropagation(e);});
  L.polyline(seg,{color:col,weight:4,opacity:0.9,interactive:false}).addTo(map);
}

if(ptsData.length>0){
  var latlngs=ptsData.map(function(p){return[p.lat,p.lng];});
  for(var i=0;i<ptsData.length-1;i++){makeSeg(i);}
  L.circleMarker(latlngs[0],{radius:8,color:'#4CAF50',fillColor:'#4CAF50',fillOpacity:1,weight:2}).addTo(map);
  if(ptsData.length>1){L.circleMarker(latlngs[latlngs.length-1],{radius:8,color:'#F44336',fillColor:'#F44336',fillOpacity:1,weight:2}).addTo(map);}
  if(hl){
    L.circleMarker(hl,{radius:11,color:hlColor,fillColor:hlColor,fillOpacity:0.85,weight:3}).addTo(map);
    map.setView(hl,16);
  } else {
    map.fitBounds(L.polyline(latlngs).getBounds().pad(0.15));
  }
} else {
  map.setView([46.2276,2.2137],6);
}

window.recenter=function(){
  if(ptsData.length>0){
    var ll=ptsData.map(function(p){return[p.lat,p.lng];});
    map.fitBounds(L.polyline(ll).getBounds().pad(0.15));
  } else {
    map.setView([46.2276,2.2137],6);
  }
};

map.on('contextmenu',function(e){
  if(window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'mapLongPress',lat:e.latlng.lat,lng:e.latlng.lng}));
  }
});
</script>
</body>
</html>`;
}

function buildReplayHtml(points: LocationPoint[]): string {
  const ptsJSON = JSON.stringify(
    points.map(p => ({ lat: p.lat, lng: p.lng, ts: p.timestamp, activity: p.activity ?? 'unknown' })),
  );

  return `<!DOCTYPE html>
<html>
<head>${LEAFLET_HEAD}
<style>${LEAFLET_BASE_CSS}
  #replay-time{
    position:fixed;top:14px;left:50%;transform:translateX(-50%);
    background:#1E1E1EE8;color:#FFC107;font-size:24px;font-weight:700;
    font-family:sans-serif;padding:6px 20px;border-radius:28px;
    border:1px solid #FFC10755;letter-spacing:3px;
    pointer-events:none;display:none;z-index:9999;
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="replay-time"></div>
<script>
var map=L.map('map',{zoomControl:true,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);

var pts=${ptsJSON};
var COLORS={walk:'#4CAF50',car:'#2196F3',unknown:'#FFC107'};

function colorFor(a){return COLORS[a]||'#FFC107';}
function fmtTs(ts){
  var d=new Date(ts);
  return String(d.getHours()).padStart(2,'0')+'h'+String(d.getMinutes()).padStart(2,'0');
}

var timeEl=document.getElementById('replay-time');

if(pts.length>0){
  var ghost=pts.map(function(p){return[p.lat,p.lng];});
  L.polyline(ghost,{color:'#555',weight:2,opacity:0.35,interactive:false}).addTo(map);
  map.fitBounds(L.polyline(ghost).getBounds().pad(0.15));
  L.circleMarker(ghost[0],{radius:7,color:'#4CAF50',fillColor:'#4CAF50',fillOpacity:1,weight:2}).addTo(map);
  if(ghost.length>1){
    L.circleMarker(ghost[ghost.length-1],{radius:7,color:'#F44336',fillColor:'#F44336',fillOpacity:1,weight:2}).addTo(map);
  }
} else {
  map.setView([46.2276,2.2137],6);
}

var mover=pts.length>0
  ?L.circleMarker([pts[0].lat,pts[0].lng],{radius:11,color:'#FFC107',fillColor:'#FFC107',fillOpacity:1,weight:3}).addTo(map)
  :null;

var drawnUpTo=0;
var startWall=null;
var totalPausedMs=0;
var pauseStartWall=null;
var rafId=null;
var isPlaying=false;
var lastMsgMs=-9999;
window._replayDur=30000;
window._replayFollow=false;

function tick(){
  if(!isPlaying)return;
  var now=performance.now();
  var elapsed=now-startWall-totalPausedMs;
  var progress=Math.min(elapsed/window._replayDur,1);

  if(pts.length<2){progress=1;}

  var minTs=pts[0].ts;
  var maxTs=pts[pts.length-1].ts;
  var simTs=minTs+progress*(maxTs-minTs);

  while(drawnUpTo<pts.length-1&&pts[drawnUpTo+1].ts<=simTs){
    var a=pts[drawnUpTo],b=pts[drawnUpTo+1];
    L.polyline([[a.lat,a.lng],[b.lat,b.lng]],{
      color:colorFor(a.activity),weight:4,opacity:0.95,interactive:false
    }).addTo(map);
    drawnUpTo++;
  }

  if(mover&&pts.length>=2){
    var si=0;
    for(var i=0;i<pts.length-1;i++){
      if(pts[i].ts<=simTs)si=i;
      else break;
    }
    var p0=pts[si],p1=pts[Math.min(si+1,pts.length-1)];
    var sr=p1.ts-p0.ts;
    var f=sr>0?(simTs-p0.ts)/sr:0;
    var newLat=p0.lat+f*(p1.lat-p0.lat),newLng=p0.lng+f*(p1.lng-p0.lng);
    mover.setLatLng([newLat,newLng]);
    if(window._replayFollow){map.panTo([newLat,newLng],{animate:true,duration:0.3});}
  }

  var t=fmtTs(simTs);
  if(timeEl){timeEl.style.display='block';timeEl.textContent=t;}

  if(now-lastMsgMs>500&&window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'replay_progress',time:t}));
    lastMsgMs=now;
  }

  if(progress>=1){
    isPlaying=false;
    if(timeEl)timeEl.style.display='none';
    if(window.ReactNativeWebView){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'replay_done'}));
    }
    return;
  }
  rafId=requestAnimationFrame(tick);
}

window.startReplay=function(dur){
  window._replayDur=dur;
  drawnUpTo=0;
  startWall=performance.now();
  totalPausedMs=0;
  pauseStartWall=null;
  lastMsgMs=-9999;
  isPlaying=true;
  rafId=requestAnimationFrame(tick);
};
window.pauseReplay=function(){
  if(!isPlaying)return;
  isPlaying=false;
  pauseStartWall=performance.now();
  if(rafId){cancelAnimationFrame(rafId);rafId=null;}
};
window.resumeReplay=function(){
  if(isPlaying||pauseStartWall===null)return;
  totalPausedMs+=performance.now()-pauseStartWall;
  pauseStartWall=null;
  isPlaying=true;
  rafId=requestAnimationFrame(tick);
};
window.stopReplay=function(){
  isPlaying=false;
  if(rafId){cancelAnimationFrame(rafId);rafId=null;}
  if(timeEl)timeEl.style.display='none';
};
</script>
</body>
</html>`;
}

// ── Trip route injection (Leaflet JS) ─────────────────────────────────────────

function buildTripInjectScript(
  points: Array<{ lat: number; lng: number }>,
  color: string,
  editable: boolean,
): string {
  const ptsJSON = JSON.stringify(points);
  const editFlag = editable ? 'true' : 'false';
  return '(function(){'
    + 'if(window._tripLayers){window._tripLayers.forEach(function(l){l.remove();});}'
    + 'window._tripLayers=[];'
    + 'window._tripEditPts=' + ptsJSON + ';'
    + "var C='" + color + "';"
    + 'var EDIT=' + editFlag + ';'

    + 'function mkHandleIcon(){'
    + "return L.divIcon({className:'',html:'<div style=\"width:16px;height:16px;background:#fff;border-radius:50%;border:2.5px solid "+color+";box-shadow:0 2px 6px rgba(0,0,0,0.55);margin:-8px 0 0 -8px\"></div>',iconSize:[16,16],iconAnchor:[8,8]});}"

    + 'function mkGhostIcon(){'
    + "return L.divIcon({className:'',html:'<div style=\"width:10px;height:10px;background:rgba(255,255,255,0.4);border-radius:50%;border:1.5px solid "+color+";margin:-5px 0 0 -5px\"></div>',iconSize:[10,10],iconAnchor:[5,5]});}"

    + 'function sendEdited(){'
    + 'if(window.ReactNativeWebView){'
    + "window.ReactNativeWebView.postMessage(JSON.stringify({type:'routeEdited',points:window._tripEditPts}));}}"

    + 'function redraw(){'
    + 'window._tripLayers.forEach(function(l){l.remove();});window._tripLayers=[];'
    + 'var pts=window._tripEditPts;if(!pts||pts.length<1)return;'
    + 'var ll=pts.map(function(p){return[p.lat,p.lng];});'
    + 'var poly=L.polyline(ll,{color:C,weight:5,opacity:0.95,interactive:false}).addTo(map);window._tripLayers.push(poly);'
    + 'var sm=L.circleMarker(ll[0],{radius:8,color:"#4CAF50",fillColor:"#4CAF50",fillOpacity:1,weight:2,interactive:false}).addTo(map);window._tripLayers.push(sm);'
    + 'if(pts.length>1){var em=L.circleMarker(ll[ll.length-1],{radius:8,color:C,fillColor:C,fillOpacity:1,weight:2,interactive:false}).addTo(map);window._tripLayers.push(em);}'

    + 'if(!EDIT)return;'

    + 'for(var j=0;j<pts.length-1;j++){'
    + '(function(si){'
    + 'var ml=(pts[si].lat+pts[si+1].lat)/2,mlg=(pts[si].lng+pts[si+1].lng)/2;'
    + 'var gm=L.marker([ml,mlg],{icon:mkGhostIcon(),interactive:true,keyboard:false,zIndexOffset:-100}).addTo(map);'
    + 'window._tripLayers.push(gm);'
    + 'gm.on("click",function(e){L.DomEvent.stopPropagation(e);window._tripEditPts.splice(si+1,0,{lat:ml,lng:mlg});redraw();sendEdited();});'
    + '})(j);}'

    + 'for(var i=0;i<pts.length;i++){'
    + '(function(idx){'
    + 'var mk=L.marker([pts[idx].lat,pts[idx].lng],{icon:mkHandleIcon(),draggable:true,keyboard:false}).addTo(map);'
    + 'window._tripLayers.push(mk);'
    + 'var lpT=null;'
    + 'mk.on("mousedown",function(){lpT=setTimeout(function(){lpT=null;if(window._tripEditPts.length<=2)return;window._tripEditPts.splice(idx,1);redraw();sendEdited();},700);});'
    + 'mk.on("mouseup",function(){if(lpT){clearTimeout(lpT);lpT=null;}});'
    + 'mk.on("dragstart",function(){if(lpT){clearTimeout(lpT);lpT=null;}});'
    + 'mk.on("dragend",function(e){var ll=e.target.getLatLng();window._tripEditPts[idx]={lat:ll.lat,lng:ll.lng};redraw();sendEdited();});'
    + '})(i);}}'

    + 'redraw();'
    + 'if(window._tripEditPts&&window._tripEditPts.length>0){'
    + 'var b=L.polyline(window._tripEditPts.map(function(p){return[p.lat,p.lng];})).getBounds();'
    + 'map.fitBounds(b.pad(0.15));}'
    + '})();true;';
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

function Stepper({
  label, onDec, onInc, colors,
}: {
  label: string; onDec: () => void; onInc: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onDec} hitSlop={10} style={styles.stepperBtn}>
        <MaterialCommunityIcons name="chevron-left" size={22} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.stepperVal, { color: colors.foreground }]}>{label}</Text>
      <Pressable onPress={onInc} hitSlop={10} style={styles.stepperBtn}>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

// ── Duration options ──────────────────────────────────────────────────────────

const DURATIONS: { label: string; ms: number }[] = [
  { label: '10 s', ms: 10_000 },
  { label: '30 s', ms: 30_000 },
  { label: '1 min', ms: 60_000 },
  { label: '3 min', ms: 180_000 },
];

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

  const [search, setSearch]                   = useState('');
  const [highlightPt, setHighlightPt]         = useState<LocationPoint | null>(null);
  const pendingTimeRef                         = useRef<string | null>(null);
  const [correctionCount, setCorrectionCount] = useState(0);

  // ── Trip state ───────────────────────────────────────────────────────────────
  const [dayTrips, setDayTrips]               = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId]   = useState<string | null>(null);
  const [pendingRoute, setPendingRoute]        = useState<RoutePoint[] | null>(null);
  const [originalRoute, setOriginalRoute]     = useState<RoutePoint[] | null>(null);

  // ── Place state ─────────────────────────────────────────────────────────────
  const [longPressCoords, setLongPressCoords]   = useState<{ lat: number; lng: number } | null>(null);
  const [placeSheetVisible, setPlaceSheetVisible] = useState(false);
  const [placeCategories, setPlaceCategories]   = useState<PlaceCategory[]>([]);
  const [newPlaceName, setNewPlaceName]         = useState('');
  const [newPlaceCatId, setNewPlaceCatId]       = useState('');
  const [placeSheetSaving, setPlaceSheetSaving] = useState(false);

  // ── Panel collapse state ─────────────────────────────────────────────────────
  const [panelExpanded, setPanelExpanded] = useState(false);

  // ── Replay state ────────────────────────────────────────────────────────────
  const [replayOpen, setReplayOpen]           = useState(false);
  const [replayStartDay, setReplayStartDay]   = useState('');
  const [replayStartHour, setReplayStartHour] = useState(0);
  const [replayEndDay, setReplayEndDay]       = useState('');
  const [replayEndHour, setReplayEndHour]     = useState(23);
  const [replayDurMs, setReplayDurMs]         = useState(30_000);
  const [replayMode, setReplayMode]           = useState(false);
  const [replayPlaying, setReplayPlaying]     = useState(false);
  const [replayIsPaused, setReplayIsPaused]   = useState(false);
  const [replayCurrentTime, setReplayCurrentTime] = useState('');
  const [replayPoints, setReplayPoints]       = useState<LocationPoint[]>([]);
  const [replayFollow, setReplayFollow]       = useState(false);
  const pendingReplayRef = useRef<number | null>(null);

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

  useEffect(() => {
    setSelectedTripId(null);
    setPendingRoute(null);
    setOriginalRoute(null);
    getTrips().then(trips => {
      const dayStart = new Date(selectedDay + 'T00:00:00').getTime();
      const dayEnd   = new Date(selectedDay + 'T23:59:59').getTime();
      setDayTrips(trips.filter(t => t.startTime >= dayStart && t.startTime <= dayEnd));
    }).catch(() => setDayTrips([]));
  }, [selectedDay]);

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
      Alert.alert('Erreur', "Impossible d'exporter les données.");
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
      Alert.alert('Erreur', "Impossible d'importer le fichier.");
    } finally {
      setBackupBusy(false);
    }
  }, [backupBusy, refresh]);

  const handleDeleteDay = useCallback(() => {
    if (dayStats.points.length === 0) return;
    const label = fmtReplayDay(selectedDay);
    Alert.alert(
      'Effacer ce jour',
      `Effacer les ${dayStats.points.length} point${dayStats.points.length > 1 ? 's' : ''} du ${label} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Effacer',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await deleteDayPoints(selectedDay);
            refresh();
          },
        },
      ],
    );
  }, [dayStats.points.length, selectedDay, refresh]);

  // ── Trip handlers ───────────────────────────────────────────────────────────

  const handleTripSelect = useCallback((trip: Trip) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedTripId === trip.id) {
      setSelectedTripId(null);
      setPendingRoute(null);
      setOriginalRoute(null);
      webRef.current?.injectJavaScript(
        'if(window._tripLayers){window._tripLayers.forEach(function(l){l.remove();});window._tripLayers=null;}true;',
      );
      return;
    }
    const route = trip.route ?? [];
    const color = trip.vehicle === 'moto' ? '#FFC107' : '#2196F3';
    setSelectedTripId(trip.id);
    setPendingRoute(null);

    if (route.length >= 2) {
      setOriginalRoute(route);
      webRef.current?.injectJavaScript(buildTripInjectScript(route, color, true));
    } else if (trip.startLat && trip.startLon && trip.endLat && trip.endLon) {
      // Manual trip with no stored route — show editable 2-point line from coords
      const fallback: RoutePoint[] = [
        { lat: trip.startLat, lng: trip.startLon },
        { lat: trip.endLat, lng: trip.endLon },
      ];
      setOriginalRoute(fallback);
      webRef.current?.injectJavaScript(buildTripInjectScript(fallback, color, true));
    } else {
      setOriginalRoute(route);
    }
  }, [selectedTripId]);

  const handleConfirmEdit = useCallback(async () => {
    if (!pendingRoute || !selectedTripId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    let distKm = 0;
    for (let i = 0; i < pendingRoute.length - 1; i++) {
      distKm += haversineKm(
        pendingRoute[i]!.lat, pendingRoute[i]!.lng,
        pendingRoute[i + 1]!.lat, pendingRoute[i + 1]!.lng,
      );
    }
    distKm = Math.round(distKm * 10) / 10;
    await updateTrip(selectedTripId, { route: pendingRoute, distanceKm: distKm });
    setDayTrips(prev =>
      prev.map(t =>
        t.id === selectedTripId ? { ...t, route: pendingRoute, distanceKm: distKm } : t,
      ),
    );
    setOriginalRoute(pendingRoute);
    setPendingRoute(null);
  }, [pendingRoute, selectedTripId]);

  const handleCancelEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingRoute(null);
    if (!selectedTripId || !originalRoute) return;
    const trip = dayTrips.find(t => t.id === selectedTripId);
    if (trip) {
      const color = trip.vehicle === 'moto' ? '#FFC107' : '#2196F3';
      webRef.current?.injectJavaScript(buildTripInjectScript(originalRoute, color, true));
    }
  }, [selectedTripId, originalRoute, dayTrips]);

  // ── Replay handlers ─────────────────────────────────────────────────────────

  const handleOpenReplay = useCallback(() => {
    setReplayStartDay(selectedDay);
    setReplayStartHour(0);
    setReplayEndDay(selectedDay);
    setReplayEndHour(23);
    setReplayOpen(true);
  }, [selectedDay]);

  const handleCloseReplay = useCallback(() => {
    setReplayOpen(false);
  }, []);

  const handleLancer = useCallback(async () => {
    const startTs = new Date(
      `${replayStartDay}T${String(replayStartHour).padStart(2, '0')}:00:00`,
    ).getTime();
    const endTs = new Date(
      `${replayEndDay}T${String(replayEndHour).padStart(2, '0')}:59:59`,
    ).getTime();

    if (endTs <= startTs) {
      Alert.alert('Période invalide', 'La fin doit être après le début.');
      return;
    }

    const pts = await loadMultiDayPoints(startTs, endTs);
    if (pts.length < 2) {
      Alert.alert('Pas de données', 'Aucun point GPS enregistré dans cette période.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReplayPoints(pts);
    pendingReplayRef.current = replayDurMs;
    setReplayMode(true);
    setReplayPlaying(true);
    setReplayIsPaused(false);
    setReplayCurrentTime('');
    setReplayOpen(false);
  }, [replayStartDay, replayStartHour, replayEndDay, replayEndHour, replayDurMs]);

  const handleWebViewLoad = useCallback(() => {
    if (pendingReplayRef.current !== null) {
      const dur = pendingReplayRef.current;
      pendingReplayRef.current = null;
      webRef.current?.injectJavaScript(`window.startReplay(${dur}); true;`);
    }
  }, []);

  const handleReplayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    webRef.current?.injectJavaScript('window.pauseReplay && window.pauseReplay(); true;');
    setReplayIsPaused(true);
    setReplayPlaying(false);
  }, []);

  const handleReplayResume = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    webRef.current?.injectJavaScript('window.resumeReplay && window.resumeReplay(); true;');
    setReplayIsPaused(false);
    setReplayPlaying(true);
  }, []);

  const handleToggleFollow = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReplayFollow(f => {
      const next = !f;
      webRef.current?.injectJavaScript(`window._replayFollow=${next};true;`);
      return next;
    });
  }, []);

  const handleReplayStop = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    webRef.current?.injectJavaScript('window.stopReplay && window.stopReplay(); true;');
    pendingReplayRef.current = null;
    setReplayMode(false);
    setReplayPlaying(false);
    setReplayIsPaused(false);
    setReplayCurrentTime('');
    setReplayPoints([]);
    setReplayFollow(false);
  }, []);

  // ── WebView message handler ─────────────────────────────────────────────────

  const handleWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type: string;
        ts?: number;
        activity?: string;
        time?: string;
        points?: Array<{ lat: number; lng: number }>;
        lat?: number;
        lng?: number;
      };

      if (msg.type === 'replay_progress') {
        setReplayCurrentTime(msg.time ?? '');
        return;
      }
      if (msg.type === 'replay_done') {
        setReplayPlaying(false);
        setReplayIsPaused(false);
        return;
      }
      if (msg.type === 'routeEdited') {
        if (msg.points && msg.points.length >= 2) {
          setPendingRoute(msg.points as RoutePoint[]);
        }
        return;
      }
      if (msg.type === 'mapLongPress') {
        if (replayMode) return;
        getPlaceCategories().then(cats => {
          setPlaceCategories(cats);
          setNewPlaceCatId(cats[0]?.id ?? '');
        });
        setLongPressCoords({ lat: msg.lat!, lng: msg.lng! });
        setNewPlaceName('');
        setPlaceSheetVisible(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        return;
      }

      if (msg.type !== 'longpress' || replayMode) return;

      const ts  = msg.ts!;
      const day = selectedDay;

      const applyCorrection = async (newActivity: ActivityType) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const ok = await correctActivity(day, ts, newActivity);
        if (ok) {
          await refresh();
          setCorrectionCount(c => c + 1);
        } else {
          Alert.alert('Erreur', 'Impossible de modifier ce point.');
        }
      };

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Annuler', 'Marquer comme Marche', 'Marquer comme Voiture'],
            cancelButtonIndex: 0,
          },
          buttonIndex => {
            if (buttonIndex === 1) applyCorrection('walk');
            else if (buttonIndex === 2) applyCorrection('car');
          },
        );
      } else {
        Alert.alert(
          "Corriger l'activité",
          "Choisissez le type d'activité pour ce segment.",
          [
            { text: 'Annuler', style: 'cancel' },
            { text: '🚶 Marquer comme Marche', onPress: () => applyCorrection('walk') },
            { text: '🚗 Marquer comme Voiture', onPress: () => applyCorrection('car') },
          ],
        );
      }
    } catch {
      // ignore malformed messages
    }
  }, [selectedDay, refresh, replayMode]);

  // ── Map HTML / key ──────────────────────────────────────────────────────────

  const mapHtml = replayMode
    ? buildReplayHtml(replayPoints)
    : buildMapHtml(dayStats.points, colors.primary, highlightPt);

  const mapKey = replayMode
    ? `replay-${replayPoints.length}-${replayPoints[0]?.timestamp ?? 0}`
    : `${selectedDay}-${highlightPt?.timestamp ?? 'none'}-${correctionCount}`;

  // ── Render ──────────────────────────────────────────────────────────────────

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
        onLoadEnd={handleWebViewLoad}
      />

      {/* ── Top overlay (hidden during replay) ── */}
      {!replayMode && (
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
      )}

      {/* ── Recenter button ── */}
      {!replayMode && (
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
      )}

      {/* ── Edit confirm bandeau ── */}
      {!!pendingRoute && !replayMode && (
        <View style={[styles.editBandeau, { borderTopColor: colors.border }]}>
          <MaterialCommunityIcons name="pencil-outline" size={15} color="#FFC107" />
          <Text style={styles.editBandeauTxt}>Trajet modifié</Text>
          <Pressable
            style={[styles.editBandeauBtn, { borderColor: '#4CAF50', backgroundColor: '#4CAF5018' }]}
            onPress={handleConfirmEdit}
          >
            <MaterialCommunityIcons name="check" size={14} color="#4CAF50" />
            <Text style={[styles.editBandeauBtnTxt, { color: '#4CAF50' }]}>Confirmer</Text>
          </Pressable>
          <Pressable
            style={[styles.editBandeauBtn, { borderColor: '#F44336', backgroundColor: '#F4433618' }]}
            onPress={handleCancelEdit}
          >
            <MaterialCommunityIcons name="close" size={14} color="#F44336" />
            <Text style={[styles.editBandeauBtnTxt, { color: '#F44336' }]}>Annuler</Text>
          </Pressable>
        </View>
      )}

      {/* ── Bottom panel ── */}
      <View
        style={[
          styles.bottomPanel,
          { backgroundColor: colors.card + 'F8', borderTopColor: colors.border, paddingBottom: insets.bottom + 8 },
        ]}
      >
        {/* ── Replay playback controls ── */}
        {replayMode ? (
          <View style={styles.replayPlayContainer}>
            <View style={styles.replayStatusRow}>
              <MaterialCommunityIcons
                name={replayPlaying ? 'play-circle' : replayIsPaused ? 'pause-circle' : 'check-circle'}
                size={18}
                color={replayPlaying ? '#F44336' : replayIsPaused ? '#FFC107' : '#4CAF50'}
              />
              <Text style={[styles.replayStatusTxt, { color: colors.foreground }]}>
                {replayPlaying
                  ? 'En lecture'
                  : replayIsPaused
                  ? 'En pause'
                  : 'Terminé'}
                {replayCurrentTime ? `  ·  ${replayCurrentTime}` : ''}
              </Text>
            </View>
            <View style={styles.replayBtnRow}>
              {replayPlaying && (
                <Pressable
                  style={[styles.replayCtrlBtn, { borderColor: '#FFC107', backgroundColor: '#FFC10715' }]}
                  onPress={handleReplayPause}
                >
                  <MaterialCommunityIcons name="pause" size={18} color="#FFC107" />
                  <Text style={[styles.replayCtrlTxt, { color: '#FFC107' }]}>Pause</Text>
                </Pressable>
              )}
              {replayIsPaused && (
                <Pressable
                  style={[styles.replayCtrlBtn, { borderColor: '#4CAF50', backgroundColor: '#4CAF5015' }]}
                  onPress={handleReplayResume}
                >
                  <MaterialCommunityIcons name="play" size={18} color="#4CAF50" />
                  <Text style={[styles.replayCtrlTxt, { color: '#4CAF50' }]}>Reprendre</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.replayCtrlBtn, { borderColor: '#F44336', backgroundColor: '#F4433615' }]}
                onPress={handleReplayStop}
              >
                <MaterialCommunityIcons name="stop" size={18} color="#F44336" />
                <Text style={[styles.replayCtrlTxt, { color: '#F44336' }]}>Stop</Text>
              </Pressable>
            </View>
            <Pressable
              style={[
                styles.replayFollowBtn,
                {
                  borderColor: replayFollow ? colors.primary : colors.border,
                  backgroundColor: replayFollow ? colors.primary + '22' : 'transparent',
                },
              ]}
              onPress={handleToggleFollow}
            >
              <MaterialCommunityIcons
                name={replayFollow ? 'lock' : 'lock-open-variant-outline'}
                size={15}
                color={replayFollow ? colors.primary : colors.mutedForeground}
              />
              <Text style={[styles.replayFollowTxt, { color: replayFollow ? colors.primary : colors.mutedForeground }]}>
                {replayFollow ? 'Suivi activé — carte suit le marqueur' : 'Suivi désactivé'}
              </Text>
            </Pressable>
          </View>

        /* ── Replay settings panel ── */
        ) : replayOpen ? (
          <View style={styles.replayPanel}>
            <View style={styles.replayPanelHeader}>
              <MaterialCommunityIcons name="play-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.replayPanelTitle, { color: colors.foreground }]}>Replay GPS</Text>
              <Pressable onPress={handleCloseReplay} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.replayRow}>
              <View style={styles.replayCol}>
                <Text style={[styles.replayColLabel, { color: colors.mutedForeground }]}>Début</Text>
                <Stepper
                  label={fmtReplayDay(replayStartDay)}
                  onDec={() => setReplayStartDay(d => shiftDay(d, -1))}
                  onInc={() => setReplayStartDay(d => shiftDay(d, 1))}
                  colors={colors}
                />
                <Stepper
                  label={`${String(replayStartHour).padStart(2, '0')}h00`}
                  onDec={() => setReplayStartHour(h => Math.max(0, h - 1))}
                  onInc={() => setReplayStartHour(h => Math.min(23, h + 1))}
                  colors={colors}
                />
              </View>
              <View style={[styles.replayColDivider, { backgroundColor: colors.border }]} />
              <View style={styles.replayCol}>
                <Text style={[styles.replayColLabel, { color: colors.mutedForeground }]}>Fin</Text>
                <Stepper
                  label={fmtReplayDay(replayEndDay)}
                  onDec={() => setReplayEndDay(d => shiftDay(d, -1))}
                  onInc={() => setReplayEndDay(d => shiftDay(d, 1))}
                  colors={colors}
                />
                <Stepper
                  label={`${String(replayEndHour).padStart(2, '0')}h00`}
                  onDec={() => setReplayEndHour(h => Math.max(0, h - 1))}
                  onInc={() => setReplayEndHour(h => Math.min(23, h + 1))}
                  colors={colors}
                />
              </View>
            </View>

            <View style={styles.replayDurRow}>
              {DURATIONS.map(d => (
                <Pressable
                  key={d.ms}
                  onPress={() => setReplayDurMs(d.ms)}
                  style={[
                    styles.replayDurBtn,
                    {
                      borderColor: replayDurMs === d.ms ? colors.primary : colors.border,
                      backgroundColor: replayDurMs === d.ms ? colors.primary + '22' : 'transparent',
                    },
                  ]}
                >
                  <Text style={[
                    styles.replayDurTxt,
                    { color: replayDurMs === d.ms ? colors.primary : colors.mutedForeground },
                  ]}>
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.lancerBtn, { backgroundColor: colors.primary }]}
              onPress={handleLancer}
            >
              <MaterialCommunityIcons name="play" size={16} color="#121212" />
              <Text style={styles.lancerTxt}>Lancer</Text>
            </Pressable>
          </View>

        /* ── Normal panel content ── */
        ) : loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
        ) : (
          <>
            {/* Toggle arrow */}
            {!replayMode && (
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPanelExpanded(e => !e); }}
                style={styles.panelToggle}
                hitSlop={16}
              >
                <MaterialCommunityIcons
                  name={panelExpanded ? 'chevron-down' : 'chevron-up'}
                  size={20}
                  color={colors.mutedForeground}
                />
              </Pressable>
            )}

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

            {panelExpanded && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
                <View style={styles.statsRow}>
                  <StatChip icon="walk" color="#4CAF50" label="À pied" value={`${dayStats.walkKm} km`} colors={colors} />
                  <StatChip icon="car" color="#2196F3" label="Voiture" value={`${dayStats.carKm} km`} colors={colors} />
                  <StatChip icon="map-marker-multiple-outline" color="#9C27B0" label="Points" value={String(dayStats.points.length)} colors={colors} />
                  <StatChip icon="clock-start" color="#4CAF50" label="Premier" value={dayStats.firstTime ?? '—'} colors={colors} />
                  <StatChip icon="clock-end" color="#F44336" label="Dernier" value={dayStats.lastTime ?? '—'} colors={colors} />
                </View>
              </ScrollView>
            )}

            {dayTrips.length > 0 && (
              <View style={[styles.tripSection, { borderTopColor: colors.border }]}>
                <Text style={[styles.tripSectionLabel, { color: colors.mutedForeground }]}>
                  Trajets du jour
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
                  <View style={styles.tripChipRow}>
                    {dayTrips.map(trip => {
                      const isSel   = selectedTripId === trip.id;
                      const vColor  = trip.vehicle === 'moto' ? '#FFC107' : '#2196F3';
                      const vIcon   = trip.vehicle === 'moto' ? 'motorbike' : 'car';
                      const hasRoute = (trip.route?.length ?? 0) >= 2
                        || !!(trip.startLat && trip.startLon && trip.endLat && trip.endLon);
                      return (
                        <Pressable
                          key={trip.id}
                          onPress={() => handleTripSelect(trip)}
                          style={[
                            styles.tripChip,
                            {
                              borderColor: isSel ? vColor : colors.border,
                              backgroundColor: isSel ? vColor + '22' : colors.background,
                              opacity: hasRoute ? 1 : 0.55,
                            },
                          ]}
                        >
                          <MaterialCommunityIcons name={vIcon as any} size={14} color={vColor} />
                          <Text style={[styles.tripChipDist, { color: colors.foreground }]}>
                            {trip.distanceKm.toFixed(1)} km
                          </Text>
                          <Text style={[styles.tripChipTime, { color: colors.mutedForeground }]}>
                            {fmtTripTime(trip.startTime)}→{fmtTripTime(trip.endTime)}
                          </Text>
                          {!hasRoute && (
                            <MaterialCommunityIcons name="map-marker-off-outline" size={12} color={colors.mutedForeground} />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            {panelExpanded && (
              <>
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
                    <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Marche</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#2196F3' }]} />
                    <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Voiture</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#FFC107' }]} />
                    <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Inconnu</Text>
                  </View>
                </View>

                <View style={[styles.avgSection, { borderTopColor: colors.border }]}>
                  <View style={styles.avgGrid}>
                    <View style={styles.avgCell}>
                      <MaterialCommunityIcons name="walk" size={13} color="#4CAF50" />
                      <Text style={[styles.avgPeriod, { color: colors.mutedForeground }]}>7 jours</Text>
                      <Text style={[styles.avgVal, { color: colors.foreground }]}>{periodAvg7.walkAvgKmPerDay} km/j</Text>
                    </View>
                    <View style={[styles.avgDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.avgCell}>
                      <MaterialCommunityIcons name="car" size={13} color="#2196F3" />
                      <Text style={[styles.avgPeriod, { color: colors.mutedForeground }]}>7 jours</Text>
                      <Text style={[styles.avgVal, { color: colors.foreground }]}>{periodAvg7.carAvgKmPerDay} km/j</Text>
                    </View>
                    <View style={[styles.avgDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.avgCell}>
                      <MaterialCommunityIcons name="walk" size={13} color="#4CAF50" />
                      <Text style={[styles.avgPeriod, { color: colors.mutedForeground }]}>30 jours</Text>
                      <Text style={[styles.avgVal, { color: colors.foreground }]}>{periodAvg30.walkAvgKmPerDay} km/j</Text>
                    </View>
                    <View style={[styles.avgDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.avgCell}>
                      <MaterialCommunityIcons name="car" size={13} color="#2196F3" />
                      <Text style={[styles.avgPeriod, { color: colors.mutedForeground }]}>30 jours</Text>
                      <Text style={[styles.avgVal, { color: colors.foreground }]}>{periodAvg30.carAvgKmPerDay} km/j</Text>
                    </View>
                  </View>
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
                  <Pressable
                    style={[styles.backupBtn, { borderColor: colors.primary + '88', backgroundColor: colors.primary + '12' }]}
                    onPress={handleOpenReplay}
                  >
                    <MaterialCommunityIcons name="play-circle-outline" size={15} color={colors.primary} />
                    <Text style={[styles.backupTxt, { color: colors.primary }]}>Replay</Text>
                  </Pressable>
                  {dayStats.points.length > 0 && (
                    <Pressable
                      style={[styles.backupBtn, { borderColor: '#F4433688', backgroundColor: '#F4433612' }]}
                      onPress={handleDeleteDay}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={15} color="#F44336" />
                      <Text style={[styles.backupTxt, { color: '#F44336' }]}>Effacer</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </>
        )}
      </View>

      {/* ── Place creation sheet (map long-press) ── */}
      <Modal visible={placeSheetVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setPlaceSheetVisible(false)} />
          <View style={[styles.placeSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.placeSheetTitle, { color: colors.foreground }]}>📍 Enregistrer ce lieu</Text>
            {longPressCoords && (
              <Text style={[styles.placeSheetCoords, { color: colors.mutedForeground }]}>
                {longPressCoords.lat.toFixed(5)}, {longPressCoords.lng.toFixed(5)}
              </Text>
            )}
            <TextInput
              value={newPlaceName}
              onChangeText={setNewPlaceName}
              placeholder="Nom du lieu…"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.placeSheetInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              autoFocus
              returnKeyType="done"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {placeCategories.map(cat => {
                  const sel = newPlaceCatId === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => setNewPlaceCatId(cat.id)}
                      style={[
                        styles.placeCatChip,
                        {
                          borderColor: sel ? cat.color : colors.border,
                          backgroundColor: sel ? cat.color + '22' : colors.background,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons name={cat.icon as any} size={14} color={sel ? cat.color : colors.mutedForeground} />
                      <Text style={[styles.placeCatTxt, { color: sel ? cat.color : colors.mutedForeground }]}>{cat.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <View style={styles.placeSheetBtns}>
              <Pressable
                onPress={() => setPlaceSheetVisible(false)}
                style={[styles.placeSheetCancel, { borderColor: colors.border }]}
              >
                <Text style={[styles.placeSheetCancelTxt, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!newPlaceName.trim() || !longPressCoords || placeSheetSaving) return;
                  setPlaceSheetSaving(true);
                  const addr = await reverseGeocode(longPressCoords.lat, longPressCoords.lng);
                  await saveKnownPlace({
                    id: Date.now().toString(),
                    name: newPlaceName.trim(),
                    categoryId: newPlaceCatId,
                    lat: longPressCoords.lat,
                    lng: longPressCoords.lng,
                    radiusM: 200,
                    address: addr ?? undefined,
                    createdAt: Date.now(),
                  });
                  setPlaceSheetSaving(false);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setPlaceSheetVisible(false);
                }}
                style={[styles.placeSheetSave, { backgroundColor: colors.primary, opacity: (newPlaceName.trim() && !placeSheetSaving) ? 1 : 0.4 }]}
                disabled={!newPlaceName.trim() || placeSheetSaving}
              >
                {placeSheetSaving
                  ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                  : <Text style={[styles.placeSheetSaveTxt, { color: colors.primaryForeground }]}>Enregistrer</Text>
                }
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    paddingTop: 2,
    gap: 4,
  },
  panelToggle: {
    alignSelf: 'center',
    paddingVertical: 0,
    paddingHorizontal: 24,
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

  avgSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 8,
  },
  avgGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avgCell: { flex: 1, alignItems: 'center', gap: 2 },
  avgPeriod: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  avgVal: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  avgDivider: { width: 1, height: 34, marginHorizontal: 4 },

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

  legendRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },

  // ── Replay styles ────────────────────────────────────────────────────────────

  replayPanel: { gap: 12 },

  replayPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replayPanelTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },

  replayRow: {
    flexDirection: 'row',
    gap: 0,
  },
  replayCol: {
    flex: 1,
    gap: 6,
    alignItems: 'center',
  },
  replayColDivider: {
    width: 1,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  replayColLabel: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  stepperBtn: {
    padding: 4,
  },
  stepperVal: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    minWidth: 72,
    textAlign: 'center',
  },

  replayDurRow: {
    flexDirection: 'row',
    gap: 8,
  },
  replayDurBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  replayDurTxt: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },

  lancerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  lancerTxt: {
    color: '#121212',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },

  replayPlayContainer: { gap: 12 },
  replayStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replayStatusTxt: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  replayBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  replayCtrlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  replayCtrlTxt: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },

  replayFollowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  replayFollowTxt: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },

  // ── Edit confirm bandeau ─────────────────────────────────────────────────────
  editBandeau: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#1C1C1CF2',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  editBandeauTxt: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFC107',
  },
  editBandeauBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  editBandeauBtnTxt: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },

  // ── Trip chips ───────────────────────────────────────────────────────────────
  tripSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 4,
    gap: 4,
  },
  tripSectionLabel: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tripChipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  tripChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  tripChipDist: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  tripChipTime: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
  },

  // ── Place sheet ───────────────────────────────────────────────────────────────
  placeSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 4,
  },
  placeSheetTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    marginBottom: 4,
  },
  placeSheetCoords: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginBottom: 10,
  },
  placeSheetInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginBottom: 12,
  },
  placeCatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  placeCatTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  placeSheetBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  placeSheetCancel: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  placeSheetCancelTxt: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  placeSheetSave: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  placeSheetSaveTxt: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
