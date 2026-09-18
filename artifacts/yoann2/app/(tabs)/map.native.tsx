import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { STORY_GENERATE_JS } from '../../utils/storyGenerator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Dimensions,
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
import Svg, {
  Circle,
  Defs,
  Line as SvgLine,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { useColors } from '@/hooks/useColors';
import { useLocationHistory } from '@/hooks/useLocationHistory';
import { correctActivity, loadMultiDayPoints } from '@/utils/locationTracking';
import type { ActivityType, LocationPoint } from '@/utils/locationTracking';
import { haversineKm } from '@/utils/haversine';
import { simplifyRoute } from '@/utils/routeSimplification';
import { getTrips, getVehicleSettings, updateTrip } from '@/utils/tripStorage';
import type { Trip, RoutePoint, Vehicle } from '@/types/trips';
import type { PlaceCategory } from '@/types/places';
import { getPlaceCategories, saveKnownPlace } from '@/utils/placesStorage';
import { reverseGeocode } from '@/utils/geocoding';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Résout le type, la couleur, l'icône MCI et l'emoji d'un véhicule à partir de son ID. */
function vehicleInfoFromList(vehicleId: string | null, vehicles: Vehicle[]) {
  const v = vehicles.find(v => v.id === vehicleId);
  const type = v?.type ?? 'car';
  const color      = type === 'moto' ? '#FFC107' : type === 'walk' ? '#4CAF50' : type === 'other' ? '#9E9E9E' : '#2196F3';
  const iconName   = type === 'moto' ? 'motorbike' : type === 'walk' ? 'walk' : 'car';
  const emoji      = type === 'moto' ? '🏍' : type === 'walk' ? '🚶' : type === 'other' ? '🚙' : '🚗';
  return { type, color, iconName, emoji };
}

function formatDayLabel(day: string): string {
  const d = new Date(day + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function fmtTripTime(ts: number): string {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0');
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

// ── Thème de carte (identique aux stories : Nuit/Jour/Satellite) ──────────────
type MapTheme = 'dark' | 'light' | 'satellite';
const MAP_THEME_KEY = '@yoann2_map_theme';
const MAP_THEMES: { key: MapTheme; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { key: 'dark',      label: 'Nuit',      icon: 'weather-night' },
  { key: 'light',     label: 'Jour',      icon: 'weather-sunny' },
  { key: 'satellite', label: 'Satellite', icon: 'satellite-variant' },
];
// Injecté dans le HTML Leaflet : bascule la tuile de fond sans recharger la page.
const TILE_THEME_JS = `
var TILE_URLS={
  dark:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  satellite:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
};
var _curTileLayer=null;
function _applyMapTheme(theme){
  var url=TILE_URLS[theme]||TILE_URLS.dark;
  if(_curTileLayer)map.removeLayer(_curTileLayer);
  _curTileLayer=L.tileLayer(url,{maxZoom:19,maxNativeZoom:theme==='satellite'?19:19}).addTo(map);
}
window.setMapTheme=function(theme){_applyMapTheme(theme);};
`;

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
  tripIntervals: Array<{ s: number; e: number }> = [],
  mapTheme: MapTheme = 'dark',
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
  const tripIntervalsJSON = JSON.stringify(tripIntervals);

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
${TILE_THEME_JS}
_applyMapTheme('${mapTheme}');

var ptsData=${ptsData};
var hl=${highlight};
var hlColor='${highlightColor}';
var tripIntervals=${tripIntervalsJSON};

var COLORS={walk:'#4CAF50',car:'#2196F3',unknown:'#FFC107'};
var ACT_LABELS={walk:'🚶 Marche',car:'🚗 Voiture',unknown:'❓ Inconnu'};

function colorFor(act){return COLORS[act]||'#FFC107';}

function fmtTime(ts){
  var d=new Date(ts);
  var h=String(d.getHours()).padStart(2,'0');
  var m=String(d.getMinutes()).padStart(2,'0');
  return h+'h'+m;
}

function inTrip(ts){
  for(var k=0;k<tripIntervals.length;k++){
    if(ts>=tripIntervals[k].s&&ts<=tripIntervals[k].e)return true;
  }
  return false;
}

var GHOST_MIN_D2_DAY=0.0009*0.0009;
var GHOST_FAR_D2_DAY=0.027*0.027;
var GHOST_ANGLE_DAY=110;
function isDayGhost(i){
  var a=ptsData[i],b=ptsData[i+1];
  var d0=a.lat-b.lat,d1=a.lng-b.lng,d2=d0*d0+d1*d1;
  if(d2>GHOST_FAR_D2_DAY)return true;
  if(d2<GHOST_MIN_D2_DAY)return false;
  if(i<1||i+1>=ptsData.length-1)return false;
  var prev=ptsData[i-1];
  var capBefore=Math.atan2(a.lng-prev.lng,a.lat-prev.lat)*180/Math.PI;
  var capAfter=Math.atan2(b.lng-a.lng,b.lat-a.lat)*180/Math.PI;
  var diff=Math.abs(capBefore-capAfter)%360;
  return(diff>180?360-diff:diff)>=GHOST_ANGLE_DAY;
}

function makeSeg(i){
  var seg=[[ptsData[i].lat,ptsData[i].lng],[ptsData[i+1].lat,ptsData[i+1].lng]];
  var col=colorFor(ptsData[i].activity);
  var covered=inTrip(ptsData[i].ts)||inTrip(ptsData[i+1].ts);
  var ghost=isDayGhost(i);
  var visOpacity=ghost?0.1:(covered?0.9:0.13);
  var visWeight=ghost?2:(covered?4:2);
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
  var visOpts={color:col,weight:visWeight,opacity:visOpacity,interactive:false};
  if(ghost)visOpts.dashArray='5 10';
  L.polyline(seg,visOpts).addTo(map);
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

var _scrubMk=null;
window.moveScrubMarker=function(lat,lng){
  if(_scrubMk){_scrubMk.setLatLng([lat,lng]);}
  else{_scrubMk=L.circleMarker([lat,lng],{radius:10,color:'#FF9800',fillColor:'#FF9800',fillOpacity:0.9,weight:3,zIndexOffset:1000,interactive:false}).addTo(map);}
};
window.clearScrubMarker=function(){
  if(_scrubMk){_scrubMk.remove();_scrubMk=null;}
};

${STORY_GENERATE_JS}
</script>
</body>
</html>`;
}

function buildReplayHtml(points: LocationPoint[], mapTheme: MapTheme = 'dark'): string {
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
${TILE_THEME_JS}
_applyMapTheme('${mapTheme}');

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
  const js = `
(function(){
  if(window._tripLayers){window._tripLayers.forEach(function(l){l.remove();});}
  window._tripLayers=[];
  window._tripEditPts=${ptsJSON};
  window._selectMode=false;
  window._selectedIndices={};
  var C='${color}';
  var EDIT=${editable};

  function mkHandleIcon(){
    return L.divIcon({className:'',html:'<div style="width:16px;height:16px;background:#fff;border-radius:50%;border:2.5px solid ${color};box-shadow:0 2px 6px rgba(0,0,0,0.55);margin:-8px 0 0 -8px"></div>',iconSize:[16,16],iconAnchor:[8,8]});
  }
  function mkGhostIcon(){
    return L.divIcon({className:'',html:'<div style="width:10px;height:10px;background:rgba(255,255,255,0.4);border-radius:50%;border:1.5px solid ${color};margin:-5px 0 0 -5px"></div>',iconSize:[10,10],iconAnchor:[5,5]});
  }
  function sendEdited(){
    if(window.ReactNativeWebView){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'routeEdited',points:window._tripEditPts}));
    }
  }

  // Détection des jonctions fantômes inter-segments OSRM :
  // un connecteur parasite se reconnaît à un changement de cap brutal (≥110°)
  // combiné à une distance minimale (>100 m). Une longue ligne droite à 130 km/h
  // ne change jamais de cap → pas de faux positifs sur autoroute.
  // Fallback : segment très long (>3 km) même sans changement de cap détectable.
  var GHOST_MIN_D2=0.0009*0.0009; // 100 m en degrés²
  var GHOST_FAR_D2=0.027*0.027;   // 3 km — fantôme certain sans contexte angulaire
  var GHOST_ANGLE=110;            // degrés de changement de cap minimum

  function ptDist2(a,b){var d0=a[0]-b[0],d1=a[1]-b[1];return d0*d0+d1*d1;}
  function capDeg(a,b){return Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;}
  function angleDiff(x,y){var d=Math.abs(x-y)%360;return d>180?360-d:d;}

  function isGhostSeg(ll,i){
    var d2=ptDist2(ll[i-1],ll[i]);
    if(d2>GHOST_FAR_D2)return true;                        // très long → fantôme certain
    if(d2<GHOST_MIN_D2)return false;                       // trop court → segment normal
    if(i<2||i>=ll.length-1)return false;                   // pas assez de contexte angulaire
    var capBefore=capDeg(ll[i-2],ll[i-1]);
    var capAfter=capDeg(ll[i-1],ll[i]);
    return angleDiff(capBefore,capAfter)>=GHOST_ANGLE;     // cap brutal → fantôme
  }

  // Dessine la polyligne en découpant aux jonctions fantômes détectées
  function drawRoutePoly(ll){
    if(ll.length<2)return;
    var cur=[ll[0]];
    for(var i=1;i<ll.length;i++){
      if(isGhostSeg(ll,i)){
        if(cur.length>=2){var p=L.polyline(cur,{color:C,weight:5,opacity:0.95,interactive:false}).addTo(map);window._tripLayers.push(p);}
        var gp=L.polyline([ll[i-1],ll[i]],{color:C,weight:2,opacity:0.1,dashArray:'5 10',interactive:false}).addTo(map);window._tripLayers.push(gp);
        cur=[ll[i]];
      } else {
        cur.push(ll[i]);
      }
    }
    if(cur.length>=2){var p=L.polyline(cur,{color:C,weight:5,opacity:0.95,interactive:false}).addTo(map);window._tripLayers.push(p);}
  }

  function redraw(){
    window._tripLayers.forEach(function(l){l.remove();}); window._tripLayers=[];
    var pts=window._tripEditPts; if(!pts||pts.length<1)return;
    var ll=pts.map(function(p){return[p.lat,p.lng];});
    drawRoutePoly(ll);
    var sm=L.circleMarker(ll[0],{radius:8,color:'#4CAF50',fillColor:'#4CAF50',fillOpacity:1,weight:2,interactive:false}).addTo(map); window._tripLayers.push(sm);
    if(pts.length>1){
      var em=L.circleMarker(ll[ll.length-1],{radius:8,color:C,fillColor:C,fillOpacity:1,weight:2,interactive:false}).addTo(map); window._tripLayers.push(em);
    }
    if(!EDIT)return;
    for(var j=0;j<pts.length-1;j++){
      (function(si){
        var ml=(pts[si].lat+pts[si+1].lat)/2,mlg=(pts[si].lng+pts[si+1].lng)/2;
        var gm=L.marker([ml,mlg],{icon:mkGhostIcon(),interactive:true,keyboard:false,zIndexOffset:-100}).addTo(map);
        window._tripLayers.push(gm);
        gm.on('click',function(e){L.DomEvent.stopPropagation(e);window._tripEditPts.splice(si+1,0,{lat:ml,lng:mlg});redraw();sendEdited();});
      })(j);
    }
    for(var i=0;i<pts.length;i++){
      (function(idx){
        var mk=L.marker([pts[idx].lat,pts[idx].lng],{icon:mkHandleIcon(),draggable:true,keyboard:false}).addTo(map);
        window._tripLayers.push(mk);
        var lpT=null;
        mk.on('mousedown',function(){lpT=setTimeout(function(){lpT=null;if(window._tripEditPts.length<=2)return;window._tripEditPts.splice(idx,1);redraw();sendEdited();},700);});
        mk.on('mouseup',function(){if(lpT){clearTimeout(lpT);lpT=null;}});
        mk.on('dragstart',function(){if(lpT){clearTimeout(lpT);lpT=null;}});
        mk.on('dragend',function(e){var ll=e.target.getLatLng();window._tripEditPts[idx]={lat:ll.lat,lng:ll.lng};redraw();sendEdited();});
      })(i);
    }
  }

  function redrawSelect(){
    window._tripLayers.forEach(function(l){l.remove();}); window._tripLayers=[];
    var pts=window._tripEditPts; if(!pts||pts.length<1)return;
    var ll=pts.map(function(p){return[p.lat,p.lng];});
    drawRoutePoly(ll);
    var sm=L.circleMarker(ll[0],{radius:8,color:'#4CAF50',fillColor:'#4CAF50',fillOpacity:1,weight:2,interactive:false}).addTo(map); window._tripLayers.push(sm);
    if(pts.length>1){
      var em=L.circleMarker(ll[ll.length-1],{radius:8,color:C,fillColor:C,fillOpacity:1,weight:2,interactive:false}).addTo(map); window._tripLayers.push(em);
    }
    for(var i=1;i<pts.length-1;i++){
      (function(idx){
        var sel=!!window._selectedIndices[idx];
        var mk=L.circleMarker([pts[idx].lat,pts[idx].lng],{
          radius:11,color:sel?'#F44336':'#ffffff',
          fillColor:sel?'#F44336':'#ffffff',fillOpacity:0.92,weight:3,interactive:true
        }).addTo(map);
        window._tripLayers.push(mk);
        mk.on('click',function(e){
          L.DomEvent.stopPropagation(e);
          if(window._selectedIndices[idx]){delete window._selectedIndices[idx];}
          else{window._selectedIndices[idx]=true;}
          var cnt=Object.keys(window._selectedIndices).length;
          if(window.ReactNativeWebView){
            window.ReactNativeWebView.postMessage(JSON.stringify({type:'selectCount',count:cnt}));
          }
          redrawSelect();
        });
      })(i);
    }
  }

  window.enterSelectMode=function(){
    window._selectMode=true; window._selectedIndices={};
    redrawSelect();
  };
  window.exitSelectMode=function(){
    window._selectMode=false; window._selectedIndices={};
    redraw();
  };
  window.deleteSelectedPoints=function(){
    var indices=Object.keys(window._selectedIndices).map(Number).sort(function(a,b){return b-a;});
    indices.forEach(function(i){window._tripEditPts.splice(i,1);});
    window._selectMode=false; window._selectedIndices={};
    redraw(); sendEdited();
  };

  redraw();
  if(window._tripEditPts&&window._tripEditPts.length>0){
    var b=L.polyline(window._tripEditPts.map(function(p){return[p.lat,p.lng];})).getBounds();
    map.fitBounds(b.pad(0.15));
  }
})();true;`.trim();
  return js;
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


// ── Trip speed chart (Strava-style) ──────────────────────────────────────────

function fmtChartDur(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h${String(m % 60).padStart(2, '0')}`;
  return `${m}min`;
}

function filterGpsOutliers(pts: LocationPoint[]): LocationPoint[] {
  if (pts.length === 0) return pts;
  const result: LocationPoint[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const prev = result[result.length - 1]!;
    const curr = pts[i]!;
    const dtH = (curr.timestamp - prev.timestamp) / 3_600_000;
    if (dtH <= 0) continue;
    const dKm = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
    if (dKm / dtH < 250) result.push(curr);
  }
  return result;
}

const ALT_GAIN_THRESHOLD_M = 5;

function TripSpeedChart({
  points,
  color,
  onScrub,
}: {
  points: LocationPoint[];
  color: string;
  onScrub: (pt: LocationPoint | null) => void;
}) {
  const colors = useColors();
  const [scrubX, setScrubX] = useState<number | null>(null);

  const chartData = useMemo(() => {
    const pts = filterGpsOutliers(points.filter(p => p.speedKmh != null && (p.speedKmh as number) >= 0));
    if (pts.length < 2) return null;
    let cumDist = 0;
    const data: Array<{ km: number; spd: number; lat: number; lng: number; ts: number }> = [];
    data.push({ km: 0, spd: pts[0]!.speedKmh ?? 0, lat: pts[0]!.lat, lng: pts[0]!.lng, ts: pts[0]!.timestamp });
    for (let i = 1; i < pts.length; i++) {
      cumDist += haversineKm(pts[i - 1]!.lat, pts[i - 1]!.lng, pts[i]!.lat, pts[i]!.lng);
      data.push({ km: cumDist, spd: pts[i]!.speedKmh ?? 0, lat: pts[i]!.lat, lng: pts[i]!.lng, ts: pts[i]!.timestamp });
    }
    const rawMax = Math.max(...data.map(d => d.spd), 1);
    const maxSpd = Math.ceil(rawMax / 10) * 10;
    const avgSpd = data.reduce((s, d) => s + d.spd, 0) / data.length;
    const totalKm = Math.max(cumDist, 0.001);
    const durationMs = pts[pts.length - 1]!.timestamp - pts[0]!.timestamp;
    return { data, maxSpd, avgSpd, totalKm, durationMs };
  }, [points]);

  const findNearest = useCallback((x: number, cData: typeof chartData) => {
    if (!cData) return null;
    const { data, totalKm } = cData;
    const W = Dimensions.get('window').width - 32;
    const PL = 30; const PR = 8; const cW = W - PL - PR;
    const frac = Math.max(0, Math.min(1, (x - PL) / cW));
    const targetKm = frac * totalKm;
    let best = data[0]!;
    let bestD = Math.abs(best.km - targetKm);
    for (const d of data) {
      const dd = Math.abs(d.km - targetKm);
      if (dd < bestD) { best = d; bestD = dd; }
    }
    return best;
  }, []);

  if (!chartData) return null;
  const { data, maxSpd, avgSpd, totalKm, durationMs } = chartData;

  const W = Dimensions.get('window').width - 32;
  const H = 84;
  const PL = 30; const PR = 8; const PT = 8; const PB = 16;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  const mx = (km: number) => PL + (km / totalKm) * cW;
  const my = (spd: number) => PT + (1 - spd / maxSpd) * cH;

  const pts2 = data.map(d => `${mx(d.km).toFixed(1)},${my(d.spd).toFixed(1)}`);
  const linePath = `M ${pts2.join(' L ')}`;
  const areaPath = `${linePath} L ${mx(totalKm).toFixed(1)},${(PT + cH).toFixed(1)} L ${PL},${(PT + cH).toFixed(1)} Z`;

  const scrubPt = scrubX !== null ? findNearest(scrubX, chartData) : null;

  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 6, paddingBottom: 4 }}>
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={e => {
          const x = e.nativeEvent.locationX;
          setScrubX(x);
          const nearest = findNearest(x, chartData);
          onScrub(nearest ? (points.find(p => p.timestamp === nearest.ts) ?? null) : null);
        }}
        onResponderMove={e => {
          const x = e.nativeEvent.locationX;
          setScrubX(x);
          const nearest = findNearest(x, chartData);
          onScrub(nearest ? (points.find(p => p.timestamp === nearest.ts) ?? null) : null);
        }}
        onResponderRelease={() => { setScrubX(null); onScrub(null); }}
        onResponderTerminate={() => { setScrubX(null); onScrub(null); }}
      >
        <Svg width={W} height={H}>
          <Defs>
            <LinearGradient id="spd_grad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.45" />
              <Stop offset="1" stopColor={color} stopOpacity="0.04" />
            </LinearGradient>
          </Defs>
          <Path d={areaPath} fill="url(#spd_grad)" />
          <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
          <SvgLine x1={PL} y1={my(avgSpd)} x2={W - PR} y2={my(avgSpd)} stroke="#FFFFFF55" strokeWidth={1} strokeDasharray="3 4" />
          {scrubPt !== null && scrubX !== null && (
            <>
              <SvgLine x1={mx(scrubPt.km)} y1={PT} x2={mx(scrubPt.km)} y2={PT + cH} stroke="#FFFFFFCC" strokeWidth={1.5} />
              <Circle cx={mx(scrubPt.km)} cy={my(scrubPt.spd)} r={5} fill="#FFFFFF" stroke={color} strokeWidth={2} />
            </>
          )}
          <SvgText x={PL - 3} y={PT + 5} textAnchor="end" fontSize={8} fill="#666">{maxSpd}</SvgText>
          <SvgText x={PL - 3} y={PT + cH + 1} textAnchor="end" fontSize={8} fill="#666">0</SvgText>
          <SvgText x={PL - 3} y={PT + cH / 2 + 3} textAnchor="end" fontSize={7} fill="#444">km/h</SvgText>
          <SvgText x={PL + 1} y={H - 2} textAnchor="start" fontSize={8} fill="#666">0</SvgText>
          <SvgText x={W - PR} y={H - 2} textAnchor="end" fontSize={8} fill="#666">{totalKm.toFixed(1)} km</SvgText>
        </Svg>
      </View>

      {scrubPt ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 2, paddingTop: 2 }}>
          <Text style={{ color, fontFamily: 'Inter_700Bold', fontSize: 18, lineHeight: 22 }}>
            {Math.round(scrubPt.spd)} km/h
          </Text>
          <Text style={{ color: '#555', fontSize: 12 }}>·</Text>
          <Text style={{ color: '#888', fontFamily: 'Inter_400Regular', fontSize: 12 }}>
            {scrubPt.km.toFixed(2)} km
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 20, paddingHorizontal: 2, paddingTop: 2 }}>
          <View>
            <Text style={{ color: '#555', fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 }}>MOY</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{Math.round(avgSpd)} km/h</Text>
          </View>
          <View>
            <Text style={{ color: '#555', fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 }}>MAX</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{Math.round(maxSpd)} km/h</Text>
          </View>
          <View>
            <Text style={{ color: '#555', fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 }}>DURÉE</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{fmtChartDur(durationMs)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Trip altitude chart ───────────────────────────────────────────────────────

function TripAltitudeChart({
  points,
  color,
  onScrub,
}: {
  points: LocationPoint[];
  color: string;
  onScrub: (pt: LocationPoint | null) => void;
}) {
  const colors = useColors();
  const [scrubX, setScrubX] = useState<number | null>(null);

  const chartData = useMemo(() => {
    const pts = filterGpsOutliers(points.filter(p => p.altitudeM != null));
    if (pts.length < 2) return null;
    let cumDist = 0;
    const data: Array<{ km: number; alt: number; lat: number; lng: number; ts: number }> = [];
    data.push({ km: 0, alt: pts[0]!.altitudeM!, lat: pts[0]!.lat, lng: pts[0]!.lng, ts: pts[0]!.timestamp });
    for (let i = 1; i < pts.length; i++) {
      cumDist += haversineKm(pts[i - 1]!.lat, pts[i - 1]!.lng, pts[i]!.lat, pts[i]!.lng);
      data.push({ km: cumDist, alt: pts[i]!.altitudeM!, lat: pts[i]!.lat, lng: pts[i]!.lng, ts: pts[i]!.timestamp });
    }
    const alts = data.map(d => d.alt);
    const minAlt = Math.min(...alts);
    const maxAlt = Math.max(...alts);
    const totalKm = Math.max(cumDist, 0.001);
    let gainM = 0;
    for (let i = 1; i < data.length; i++) {
      const delta = data[i]!.alt - data[i - 1]!.alt;
      if (delta >= ALT_GAIN_THRESHOLD_M) gainM += delta;
    }
    return { data, minAlt, maxAlt, totalKm, gainM: Math.round(gainM) };
  }, [points]);

  const findNearest = useCallback((x: number, cData: typeof chartData) => {
    if (!cData) return null;
    const { data, totalKm } = cData;
    const W = Dimensions.get('window').width - 32;
    const PL = 34; const PR = 8; const cW = W - PL - PR;
    const frac = Math.max(0, Math.min(1, (x - PL) / cW));
    const targetKm = frac * totalKm;
    let best = data[0]!;
    let bestD = Math.abs(best.km - targetKm);
    for (const d of data) {
      const dd = Math.abs(d.km - targetKm);
      if (dd < bestD) { best = d; bestD = dd; }
    }
    return best;
  }, []);

  if (!chartData) return null;
  const { data, minAlt, maxAlt, totalKm, gainM } = chartData;

  const W = Dimensions.get('window').width - 32;
  const H = 84;
  const PL = 34; const PR = 8; const PT = 8; const PB = 16;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  const span = Math.max(maxAlt - minAlt, 1);
  const mx = (km: number) => PL + (km / totalKm) * cW;
  const my = (alt: number) => PT + (1 - (alt - minAlt) / span) * cH;

  const pts2 = data.map(d => `${mx(d.km).toFixed(1)},${my(d.alt).toFixed(1)}`);
  const linePath = `M ${pts2.join(' L ')}`;
  const areaPath = `${linePath} L ${mx(totalKm).toFixed(1)},${(PT + cH).toFixed(1)} L ${PL},${(PT + cH).toFixed(1)} Z`;

  const scrubPt = scrubX !== null ? findNearest(scrubX, chartData) : null;

  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 6, paddingBottom: 4 }}>
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={e => {
          const x = e.nativeEvent.locationX;
          setScrubX(x);
          const nearest = findNearest(x, chartData);
          onScrub(nearest ? (points.find(p => p.timestamp === nearest.ts) ?? null) : null);
        }}
        onResponderMove={e => {
          const x = e.nativeEvent.locationX;
          setScrubX(x);
          const nearest = findNearest(x, chartData);
          onScrub(nearest ? (points.find(p => p.timestamp === nearest.ts) ?? null) : null);
        }}
        onResponderRelease={() => { setScrubX(null); onScrub(null); }}
        onResponderTerminate={() => { setScrubX(null); onScrub(null); }}
      >
        <Svg width={W} height={H}>
          <Defs>
            <LinearGradient id="alt_grad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#9E9E9E" stopOpacity="0.5" />
              <Stop offset="1" stopColor="#9E9E9E" stopOpacity="0.06" />
            </LinearGradient>
          </Defs>
          <Path d={areaPath} fill="url(#alt_grad)" />
          <Path d={linePath} stroke="#AAAAAA" strokeWidth={2} fill="none" strokeLinejoin="round" />
          {scrubPt !== null && scrubX !== null && (
            <>
              <SvgLine x1={mx(scrubPt.km)} y1={PT} x2={mx(scrubPt.km)} y2={PT + cH} stroke="#FFFFFFCC" strokeWidth={1.5} />
              <Circle cx={mx(scrubPt.km)} cy={my(scrubPt.alt)} r={5} fill="#FFFFFF" stroke="#AAAAAA" strokeWidth={2} />
            </>
          )}
          <SvgText x={PL - 3} y={PT + 5} textAnchor="end" fontSize={8} fill="#666">{maxAlt} m</SvgText>
          <SvgText x={PL - 3} y={PT + cH + 1} textAnchor="end" fontSize={8} fill="#666">{minAlt} m</SvgText>
          <SvgText x={PL + 1} y={H - 2} textAnchor="start" fontSize={8} fill="#666">0</SvgText>
          <SvgText x={W - PR} y={H - 2} textAnchor="end" fontSize={8} fill="#666">{totalKm.toFixed(1)} km</SvgText>
        </Svg>
      </View>

      {scrubPt ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 2, paddingTop: 2 }}>
          <Text style={{ color: '#AAAAAA', fontFamily: 'Inter_700Bold', fontSize: 18, lineHeight: 22 }}>
            {scrubPt.alt} m
          </Text>
          <Text style={{ color: '#555', fontSize: 12 }}>·</Text>
          <Text style={{ color: '#888', fontFamily: 'Inter_400Regular', fontSize: 12 }}>
            {scrubPt.km.toFixed(2)} km
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 20, paddingHorizontal: 2, paddingTop: 2 }}>
          <View>
            <Text style={{ color: '#555', fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 }}>MIN</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{minAlt} m</Text>
          </View>
          <View>
            <Text style={{ color: '#555', fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 }}>MAX</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{maxAlt} m</Text>
          </View>
          <View>
            <Text style={{ color: '#555', fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 }}>DÉNIVELÉ +</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }}>+{gainM} m</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const webRef   = useRef<WebView>(null);
  const {
    selectedDay,
    setSelectedDay,
    dayStats,
    hasPermission,
    loading,
    goToPrevDay,
    goToNextDay,
    enableTracking,
    findPointByTime,
    refresh,
  } = useLocationHistory();

  const [search, setSearch]                   = useState('');
  const [highlightPt, setHighlightPt]         = useState<LocationPoint | null>(null);
  const pendingTimeRef                         = useRef<string | null>(null);
  const [correctionCount, setCorrectionCount] = useState(0);

  // ── Thème de carte (Nuit/Jour/Satellite, comme les stories) ────────────────────
  const [mapTheme, setMapThemeState] = useState<MapTheme>('dark');
  useEffect(() => {
    AsyncStorage.getItem(MAP_THEME_KEY).then(v => {
      if (v === 'light' || v === 'satellite' || v === 'dark') setMapThemeState(v);
    }).catch(() => {});
  }, []);
  const chooseMapTheme = useCallback((theme: MapTheme) => {
    void Haptics.selectionAsync();
    setMapThemeState(theme);
    AsyncStorage.setItem(MAP_THEME_KEY, theme).catch(() => {});
    webRef.current?.injectJavaScript(`window.setMapTheme && window.setMapTheme('${theme}'); true;`);
  }, []);

  // ── Vehicles (pour résoudre type/couleur/icône depuis l'ID du trajet) ──────────
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  useEffect(() => { void getVehicleSettings().then(setVehicles); }, []);

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
  const [panelExpanded, setPanelExpanded] = useState(true);

  // ── Point-selection state (for batch delete) ─────────────────────────────────
  const [selectMode, setSelectMode]   = useState(false);
  const [selectCount, setSelectCount] = useState(0);

  // ── Trip chart / replay state ────────────────────────────────────────────────
  const [tripPoints, setTripPoints]           = useState<LocationPoint[]>([]);
  const [tripReplaySpeed, setTripReplaySpeed] = useState<1|2|5|10>(1);

  // ── Story generation state ───────────────────────────────────────────────────
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [storyProgress, setStoryProgress]         = useState(0);
  const storyChunksRef = useRef<{mime: string; chunks: string[]; total: number}>({mime: 'video/mp4', chunks: [], total: 0});

  // ── Replay state ────────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (!selectedTripId) { setTripPoints([]); return; }
    const trip = dayTrips.find(t => t.id === selectedTripId);
    if (!trip) { setTripPoints([]); return; }
    const raw = dayStats.points.filter(p => p.timestamp >= trip.startTime && p.timestamp <= trip.endTime);
    // Coupure anti-diagonale : on arrête à la première pause > 10 min entre points
    // consécutifs. Empêche d'inclure le trajet retour quand startTime/endTime
    // englobent la journée entière.
    const GAP_MS = 10 * 60 * 1000;
    const pts: typeof raw = [];
    for (let i = 0; i < raw.length; i++) {
      if (i > 0 && raw[i]!.timestamp - raw[i - 1]!.timestamp > GAP_MS) break;
      pts.push(raw[i]!);
    }
    setTripPoints(filterGpsOutliers(pts));
  }, [selectedTripId, dayTrips, dayStats.points]);

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

  const handleTripReplay = useCallback(() => {
    if (tripPoints.length < 2) return;
    const BASE_MS: Record<number, number> = { 1: 60_000, 2: 30_000, 5: 12_000, 10: 6_000 };
    const dur = BASE_MS[tripReplaySpeed] ?? 30_000;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReplayPoints(tripPoints);
    pendingReplayRef.current = dur;
    setReplayMode(true);
    setReplayPlaying(true);
    setReplayIsPaused(false);
    setReplayCurrentTime('');
  }, [tripPoints, tripReplaySpeed]);

  const handleChartScrub = useCallback((pt: LocationPoint | null) => {
    if (pt) {
      webRef.current?.injectJavaScript(
        `window.moveScrubMarker && window.moveScrubMarker(${pt.lat}, ${pt.lng}); true;`,
      );
    } else {
      webRef.current?.injectJavaScript('window.clearScrubMarker && window.clearScrubMarker(); true;');
    }
  }, []);

  // ── Trip handlers ───────────────────────────────────────────────────────────

  const handleTripSelect = useCallback((trip: Trip) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedTripId === trip.id) {
      setSelectedTripId(null);
      setPendingRoute(null);
      setOriginalRoute(null);
      setSelectMode(false);
      setSelectCount(0);
      webRef.current?.injectJavaScript(
        'if(window._tripLayers){window._tripLayers.forEach(function(l){l.remove();});window._tripLayers=null;}window.clearScrubMarker&&window.clearScrubMarker();true;',
      );
      return;
    }
    const route = trip.route ?? [];
    const color = vehicleInfoFromList(trip.vehicle, vehicles).color;
    setSelectedTripId(trip.id);
    setPendingRoute(null);
    setSelectMode(false);
    setSelectCount(0);

    // A GPS trip whose route was previously corrupted by an erroneous OSRM
    // planning call will have routeSource === 'gps' but only 2 points (straight
    // line A→B). Detect and clear it so the trip falls through to the GPS
    // fallback below rather than displaying a phantom route.
    const isCorruptedGpsRoute =
      trip.source !== 'manual' &&
      route.length > 0 &&
      route.length < 5 &&
      trip.routeSource === 'gps';

    if (isCorruptedGpsRoute) {
      updateTrip(trip.id, { route: undefined }).catch(() => {});
      setDayTrips(prev => prev.map(t => t.id === trip.id ? { ...t, route: undefined } : t));
    }

    if (!isCorruptedGpsRoute && route.length >= 2) {
      setOriginalRoute(route);
      webRef.current?.injectJavaScript(buildTripInjectScript(route, color, true));
    } else if (trip.source === 'manual' && trip.startLat && trip.startLon && trip.endLat && trip.endLon) {
      // Manual trip with no stored route — show straight fallback immediately,
      // then fetch real OSRM geometry, persist it, and update the map.
      const fallback: RoutePoint[] = [
        { lat: trip.startLat, lng: trip.startLon },
        { lat: trip.endLat, lng: trip.endLon },
      ];
      setOriginalRoute(fallback);
      webRef.current?.injectJavaScript(buildTripInjectScript(fallback, color, true));

      const tripId = trip.id;
      const { startLat, startLon, endLat, endLon } = trip;
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson`;
      fetch(osrmUrl)
        .then(r => r.json())
        .then((data: { routes?: Array<{ geometry: { coordinates: [number, number][] } }> }) => {
          const coords = data.routes?.[0]?.geometry?.coordinates;
          if (!coords || coords.length < 2) return;
          const pts: RoutePoint[] = simplifyRoute(coords.map(([lng, lat]) => ({ lat, lng })));
          webRef.current?.injectJavaScript(buildTripInjectScript(pts, color, true));
          setOriginalRoute(pts);
          updateTrip(tripId, { route: pts }).catch(() => {});
          setDayTrips(prev => prev.map(t => t.id === tripId ? { ...t, route: pts } : t));
        })
        .catch(() => {});
    } else if (trip.startLat && trip.startLon && trip.endLat && trip.endLon) {
      // GPS trip with no stored route — show a straight-line fallback in memory
      // only. Never call OSRM and never persist this fallback to the DB.
      const fallback: RoutePoint[] = [
        { lat: trip.startLat, lng: trip.startLon },
        { lat: trip.endLat, lng: trip.endLon },
      ];
      setOriginalRoute(fallback);
      webRef.current?.injectJavaScript(buildTripInjectScript(fallback, color, true));
    } else {
      setOriginalRoute(route);
    }
  }, [selectedTripId, vehicles]);

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
    setSelectMode(false);
    setSelectCount(0);
    if (!selectedTripId || !originalRoute) return;
    const trip = dayTrips.find(t => t.id === selectedTripId);
    if (trip) {
      const color = vehicleInfoFromList(trip.vehicle, vehicles).color;
      webRef.current?.injectJavaScript(buildTripInjectScript(originalRoute, color, true));
    }
  }, [selectedTripId, originalRoute, dayTrips, vehicles]);

  const handleEnterSelectMode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectMode(true);
    setSelectCount(0);
    webRef.current?.injectJavaScript('window.enterSelectMode && window.enterSelectMode(); true;');
  }, []);

  const handleCancelSelect = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectMode(false);
    setSelectCount(0);
    webRef.current?.injectJavaScript('window.exitSelectMode && window.exitSelectMode(); true;');
  }, []);

  const handleDeleteSelected = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setSelectMode(false);
    setSelectCount(0);
    webRef.current?.injectJavaScript('window.deleteSelectedPoints && window.deleteSelectedPoints(); true;');
  }, []);

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
        count?: number;
        p?: number;
        index?: number;
        total?: number;
        mime?: string;
        data?: string;
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
      if (msg.type === 'story_progress') {
        setStoryProgress(msg.p ?? 0);
        return;
      }
      if (msg.type === 'story_chunk') {
        const idx   = msg.index ?? 0;
        const total = msg.total ?? 1;
        const mime  = msg.mime  ?? 'video/mp4';
        const data  = msg.data  ?? '';
        if (idx === 0) {
          storyChunksRef.current = { mime, chunks: new Array(total).fill(''), total };
        }
        storyChunksRef.current.chunks[idx] = data;
        const received = storyChunksRef.current.chunks.filter(s => s !== '').length;
        if (received === storyChunksRef.current.total) {
          const { mime: m, chunks } = storyChunksRef.current;
          const ext = m === 'video/mp4' ? 'mp4' : 'webm';
          const path = `${FileSystem.cacheDirectory ?? ''}story_${Date.now()}.${ext}`;
          const b64 = chunks.join('');
          void (async () => {
            try {
              await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
              setIsGeneratingStory(false);
              await Sharing.shareAsync(path, { mimeType: m, dialogTitle: 'Partager la story' });
            } catch {
              setIsGeneratingStory(false);
              Alert.alert('Erreur', 'Impossible de sauvegarder la vidéo.');
            }
          })();
        }
        return;
      }
      if (msg.type === 'story_error') {
        setIsGeneratingStory(false);
        Alert.alert('Erreur', 'Génération de story non supportée sur cet appareil.');
        return;
      }
      if (msg.type === 'routeEdited') {
        if (msg.points && msg.points.length >= 2) {
          setPendingRoute(msg.points as RoutePoint[]);
        }
        return;
      }
      if (msg.type === 'selectCount') {
        setSelectCount(msg.count ?? 0);
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

  // ── Derived ─────────────────────────────────────────────────────────────────

  const selectedTrip = selectedTripId ? (dayTrips.find(t => t.id === selectedTripId) ?? null) : null;
  const selectedTripColor = vehicleInfoFromList(selectedTrip?.vehicle ?? null, vehicles).color;

  const handleGenerateStory = useCallback(() => {
    if (!selectedTrip || tripPoints.length < 2 || isGeneratingStory) return;

    // ── Route : tracé propre stocké (OSRM ou GPS simplifié), fallback GPS brut ──
    const storedRoute = selectedTrip.route ?? [];
    const route: Array<{ lat: number; lng: number }> =
      storedRoute.length >= 2
        ? storedRoute
        : tripPoints
            .filter((_, i) => i % Math.max(1, Math.floor(tripPoints.length / 150)) === 0 || i === tripPoints.length - 1)
            .map(p => ({ lat: p.lat, lng: p.lng }));

    // ── Chart : sous-échantillonnage des points GPS (vitesse + altitude) ────────
    const step = Math.max(1, Math.floor(tripPoints.length / 100));
    const sampled: LocationPoint[] = [];
    for (let i = 0; i < tripPoints.length; i++) {
      if (i % step === 0 || i === tripPoints.length - 1) sampled.push(tripPoints[i]!);
    }

    // Distance GPS brute (peut être gonflée par le bruit) → normaliser sur la vraie distance du trajet
    let rawCumDist = 0;
    const rawChartPts: Array<{ km: number; spd: number; alt: number | null }> = [];
    for (let i = 0; i < sampled.length; i++) {
      if (i > 0) rawCumDist += haversineKm(sampled[i - 1]!.lat, sampled[i - 1]!.lng, sampled[i]!.lat, sampled[i]!.lng);
      rawChartPts.push({ km: rawCumDist, spd: sampled[i]!.speedKmh ?? 0, alt: sampled[i]!.altitudeM ?? null });
    }
    const actualDistKm = selectedTrip.distanceKm;
    const distScale = rawCumDist > 0 ? actualDistKm / rawCumDist : 1;
    const chartPts = rawChartPts.map(p => ({ ...p, km: parseFloat((p.km * distScale).toFixed(3)) }));

    const speeds = tripPoints.map(p => p.speedKmh ?? 0);
    const maxSpeed = Math.max(...speeds, 1);
    const alts = tripPoints.map(p => p.altitudeM).filter((a): a is number => a != null);
    const minAlt = alts.length > 0 ? Math.min(...alts) : 0;
    const maxAlt = alts.length > 0 ? Math.max(...alts) : 0;
    let gainM = 0;
    for (let i = 1; i < tripPoints.length; i++) {
      const a = tripPoints[i]!.altitudeM, b = tripPoints[i - 1]!.altitudeM;
      if (a != null && b != null && a - b >= ALT_GAIN_THRESHOLD_M) gainM += a - b;
    }

    const durationMs = selectedTrip.endTime - selectedTrip.startTime;
    const durationLabel = `${Math.round(durationMs / 60000)} min`;
    const startDate = new Date(selectedTrip.startTime);
    const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const MONTHS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
    const dateLabel = `${DAYS[startDate.getDay()]} ${startDate.getDate()} ${MONTHS[startDate.getMonth()]}`;
    const fmtH = (d: Date) => `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
    const timeLabel = `${fmtH(startDate)} → ${fmtH(new Date(selectedTrip.endTime))}`;
    const vehicleEmoji = vehicleInfoFromList(selectedTrip.vehicle, vehicles).emoji;

    const opts = {
      color: selectedTripColor,
      vehicleEmoji,
      dateLabel,
      timeLabel,
      distKm: parseFloat(actualDistKm.toFixed(1)),
      durationLabel,
      maxSpeed,
      gainM: Math.round(gainM),
      minAlt,
      maxAlt,
      hasAlt: alts.length > 0,
      points: chartPts,
      route,
    };

    setIsGeneratingStory(true);
    setStoryProgress(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    webRef.current?.injectJavaScript(`(function(){window.generateStory(${JSON.stringify(opts)});})();true;`);
  }, [selectedTrip, selectedTripColor, tripPoints, isGeneratingStory]);

  // ── Map HTML / key ──────────────────────────────────────────────────────────

  const mapHtml = replayMode
    ? buildReplayHtml(replayPoints, mapTheme)
    : buildMapHtml(dayStats.points, colors.primary, highlightPt, dayTrips.map(t => ({ s: t.startTime, e: t.endTime })), mapTheme);

  const mapKey = replayMode
    ? `replay-${replayPoints.length}-${replayPoints[0]?.timestamp ?? 0}`
    : `${selectedDay}-${highlightPt?.timestamp ?? 'none'}-${correctionCount}-${dayTrips.length}`;

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

      {/* ── Thème de carte (Nuit/Jour/Satellite) ── */}
      {!replayMode && (
        <View
          style={[
            styles.mapThemeRow,
            { backgroundColor: colors.card + 'F0', borderColor: colors.border },
          ]}
        >
          {MAP_THEMES.map(th => (
            <Pressable
              key={th.key}
              onPress={() => chooseMapTheme(th.key)}
              hitSlop={6}
              style={[
                styles.mapThemeBtn,
                mapTheme === th.key && { backgroundColor: colors.primary + '22' },
              ]}
            >
              <MaterialCommunityIcons
                name={th.icon}
                size={17}
                color={mapTheme === th.key ? colors.primary : colors.mutedForeground}
              />
            </Pressable>
          ))}
        </View>
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
              <View style={[styles.tripSection, { borderTopColor: colors.border, borderTopWidth: panelExpanded ? StyleSheet.hairlineWidth : 0 }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
                  <View style={styles.tripChipRow}>
                    {dayTrips.map(trip => {
                      const isSel   = selectedTripId === trip.id;
                      const { color: vColor, iconName: vIcon } = vehicleInfoFromList(trip.vehicle, vehicles);
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

            {/* Speed chart */}
            {panelExpanded && selectedTripId && !replayMode && tripPoints.length >= 2 && (
              <TripSpeedChart
                points={tripPoints}
                color={selectedTripColor}
                onScrub={handleChartScrub}
              />
            )}

            {/* Altitude chart */}
            {panelExpanded && selectedTripId && !replayMode && tripPoints.length >= 2 && (
              <TripAltitudeChart
                points={tripPoints}
                color={selectedTripColor}
                onScrub={handleChartScrub}
              />
            )}

            {/* Trip replay bar */}
            {selectedTripId && !replayMode && !pendingRoute && tripPoints.length >= 2 && (
              <>
                <View style={styles.tripReplayBar}>
                  <View style={styles.tripReplaySpeedRow}>
                    {([1, 2, 5, 10] as const).map(spd => (
                      <Pressable
                        key={spd}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTripReplaySpeed(spd); }}
                        style={[
                          styles.tripReplaySpeedBtn,
                          {
                            borderColor: tripReplaySpeed === spd ? selectedTripColor : colors.border,
                            backgroundColor: tripReplaySpeed === spd ? selectedTripColor + '22' : 'transparent',
                          },
                        ]}
                      >
                        <Text style={[styles.tripReplaySpeedTxt, { color: tripReplaySpeed === spd ? selectedTripColor : colors.mutedForeground }]}>
                          ×{spd}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    style={[styles.tripReplayPlayBtn, { backgroundColor: selectedTripColor }]}
                    onPress={handleTripReplay}
                  >
                    <MaterialCommunityIcons name="play" size={13} color="#121212" />
                    <Text style={styles.tripReplayPlayTxt}>Replay</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.tripStoryBtn, { borderColor: selectedTripColor, opacity: isGeneratingStory ? 0.5 : 1 }]}
                    onPress={handleGenerateStory}
                    disabled={isGeneratingStory}
                  >
                    <MaterialCommunityIcons name="instagram" size={13} color={selectedTripColor} />
                    <Text style={[styles.tripStoryTxt, { color: selectedTripColor }]}>Story</Text>
                  </Pressable>
                </View>
                {isGeneratingStory && (
                  <View style={styles.storyProgressRow}>
                    <Text style={styles.storyProgressLabel}>Génération… {storyProgress}%</Text>
                    <View style={styles.storyProgressTrack}>
                      <View style={[styles.storyProgressFill, { width: `${storyProgress}%` as `${number}%`, backgroundColor: selectedTripColor }]} />
                    </View>
                  </View>
                )}
              </>
            )}

            {selectedTripId && !replayMode && !pendingRoute && (originalRoute?.length ?? 0) > 2 && (
              <View style={styles.selectRow}>
                {!selectMode ? (
                  <Pressable
                    onPress={handleEnterSelectMode}
                    style={[styles.selectBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
                  >
                    <MaterialCommunityIcons name="cursor-pointer" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.selectBtnTxt, { color: colors.mutedForeground }]}>Sélectionner des points</Text>
                  </Pressable>
                ) : selectCount === 0 ? (
                  <Pressable
                    onPress={handleCancelSelect}
                    style={[styles.selectBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
                  >
                    <MaterialCommunityIcons name="cursor-pointer" size={14} color={colors.primary} />
                    <Text style={[styles.selectBtnTxt, { color: colors.mutedForeground }]}>Tapez des points sur la carte…</Text>
                    <MaterialCommunityIcons name="close" size={14} color={colors.mutedForeground} />
                  </Pressable>
                ) : (
                  <View style={styles.selectBtnGroup}>
                    <Pressable
                      onPress={handleDeleteSelected}
                      style={[styles.selectBtn, { borderColor: '#F44336', backgroundColor: '#F4433618', flex: 1 }]}
                    >
                      <MaterialCommunityIcons name="delete-outline" size={14} color="#F44336" />
                      <Text style={[styles.selectBtnTxt, { color: '#F44336' }]}>Supprimer ({selectCount})</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleCancelSelect}
                      style={[styles.selectBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
                    >
                      <MaterialCommunityIcons name="close" size={14} color={colors.mutedForeground} />
                      <Text style={[styles.selectBtnTxt, { color: colors.mutedForeground }]}>Annuler</Text>
                    </Pressable>
                  </View>
                )}
              </View>
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
  mapThemeRow: {
    position: 'absolute',
    left: 16,
    bottom: 260,
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 2,
    elevation: 4,
  },
  mapThemeBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingTop: 0,
    gap: 2,
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

  // ── Replay styles ────────────────────────────────────────────────────────────

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

  // ── Trip replay bar ──────────────────────────────────────────────────────────
  tripReplayBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
    paddingBottom: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tripReplaySpeedRow: {
    flexDirection: 'row',
    gap: 5,
    flex: 1,
  },
  tripReplaySpeedBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  tripReplaySpeedTxt: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  tripReplayPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tripReplayPlayTxt: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#121212',
  },
  tripStoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  tripStoryTxt: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  storyProgressRow: {
    paddingTop: 6,
    paddingBottom: 2,
    gap: 4,
  },
  storyProgressLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
  },
  storyProgressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#2A2A2A',
    overflow: 'hidden',
  },
  storyProgressFill: {
    height: 3,
    borderRadius: 2,
  },

  // ── Trip chips ───────────────────────────────────────────────────────────────
  tripSection: {
    paddingTop: 2,
    gap: 2,
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

  // ── Select points ─────────────────────────────────────────────────────────────
  selectRow: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  selectBtnGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  selectBtnTxt: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    flex: 1,
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
