import type { Trip, Vehicle } from '@/types/trips';
import { activityForTrip, activityInfo } from '@/utils/activities';

export interface ActivityMapProps {
  html: string;
  onTripPress?: (id: string) => void;
  onPointPress?: (routeIndex: number) => void;
}

export function activityMapHtml(trips: Trip[], vehicles: Vehicle[], background: string, selectable = false): string {
  const routes = trips.map(trip => {
    const route = trip.route ?? [];
    const step = Math.max(1, Math.ceil(route.length / 400));
    const points = route.flatMap((point, index) =>
      (index % step === 0 || index === route.length - 1) &&
      Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
      Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
        ? [{ lat: point.lat, lng: point.lng, index }] : []);
    const kind = activityForTrip(trip, vehicles) ?? 'walk';
    return {
      id: trip.id, points, color: activityInfo(kind).color,
      moments: (trip.activityMoments ?? []).filter(moment => Number.isFinite(moment.lat) && Number.isFinite(moment.lng)),
    };
  }).filter(route => route.points.length >= 2);
  const data = JSON.stringify(routes).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0;background:${background}}.leaflet-control-attribution{font-size:9px}</style></head>
<body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
var routes=${data};var map=L.map('map',{zoomControl:true}).setView([46.6,2.4],5);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{
maxZoom:19,attribution:'Tiles © Esri — Sources: Esri, HERE, Garmin, USGS, IGN, OpenStreetMap contributors'
}).addTo(map);
function send(value){var text=JSON.stringify(value);if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(text);else window.parent.postMessage(text,'*');}
var bounds=[];
routes.forEach(function(route){
var points=route.points.map(function(point){return [point.lat,point.lng];});bounds=bounds.concat(points);
var line=L.polyline(points,{color:route.color,weight:4,opacity:0.8}).addTo(map);
if(!${selectable})line.on('click',function(event){L.DomEvent.stopPropagation(event);send({type:'trip',id:route.id});});
route.moments.forEach(function(moment){var label=document.createElement('span');label.textContent=moment.note||'Souvenir';L.circleMarker([moment.lat,moment.lng],{radius:6,color:route.color,fillOpacity:1}).addTo(map).bindPopup(label);});
});
if(bounds.length)map.fitBounds(bounds,{padding:[24,24],maxZoom:16});
var chosen=null;
if(${selectable})map.on('click',function(event){
var nearest=null;var distance=Infinity;
routes.forEach(function(route){route.points.forEach(function(point){var delta=map.distance(event.latlng,[point.lat,point.lng]);if(delta<distance){distance=delta;nearest=point;}});});
if(nearest){if(chosen)map.removeLayer(chosen);chosen=L.circleMarker([nearest.lat,nearest.lng],{radius:9,color:'#FFFFFF',fillColor:'#2196F3',fillOpacity:1}).addTo(map);send({type:'point',index:nearest.index});}
});
</script></body></html>`;
}
