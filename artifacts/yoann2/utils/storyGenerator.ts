/**
 * window.generateStory JS function — MediaRecorder-based story video.
 *
 * v2 — time-proportional animation:
 *  - Chart points now carry a `ms` field (elapsed milliseconds from trip start).
 *  - X-axis of speed/altitude charts = real elapsed time → pauses appear as gaps.
 *  - Moving dot position: getKmAtMs(currentMs) → getRouteIdxAtKm(km)
 *    → dot stalls on the map during pauses exactly as in real life.
 *  - Speed display: reads from chart point at current elapsed time.
 */
export const STORY_GENERATE_JS = `
window.generateStory=function(opts){
  var cW=720,cH=1280;
  var cv=document.createElement('canvas');
  cv.width=cW;cv.height=cH;
  document.body.appendChild(cv);
  cv.style.position='absolute';cv.style.top='-9999px';cv.style.left='-9999px';
  var ctx=cv.getContext('2d');
  var mimes=['video/mp4;codecs=avc1','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  var mime='video/webm';
  for(var mi=0;mi<mimes.length;mi++){if(MediaRecorder.isTypeSupported(mimes[mi])){mime=mimes[mi];break;}}
  var chunks=[];
  var stream=cv.captureStream(30);
  var rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000});
  rec.ondataavailable=function(e){if(e.data&&e.data.size>0)chunks.push(e.data);};
  rec.onstop=function(){
    document.body.removeChild(cv);
    var blob=new Blob(chunks,{type:mime.split(';')[0]});
    var fr=new FileReader();
    fr.onload=function(){
      var du=fr.result,sepIdx=du.indexOf(',');
      var mimeOut=du.slice(5,du.indexOf(';'));
      var b64=du.slice(sepIdx+1);
      var CHUNK=200000,total=Math.ceil(b64.length/CHUNK);
      for(var i=0;i<total;i++){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_chunk',index:i,total:total,mime:mimeOut,data:b64.slice(i*CHUNK,(i+1)*CHUNK)}));
      }
    };
    fr.readAsDataURL(blob);
  };

  var route=opts.route;

  // ── Map projection ─────────────────────────────────────────────────────────
  var lats=route.map(function(p){return p.lat;}),lngs=route.map(function(p){return p.lng;});
  var minLat=Math.min.apply(null,lats),maxLat=Math.max.apply(null,lats);
  var minLng=Math.min.apply(null,lngs),maxLng=Math.max.apply(null,lngs);
  var latSpan=maxLat-minLat||0.001,lngSpan=maxLng-minLng||0.001;
  var mT=195,mB=780,mL=60,mR=660;
  var mW=mR-mL,mH=mB-mT;
  var rAsp=(lngSpan/latSpan)*Math.cos((minLat+maxLat)/2*Math.PI/180);
  var mapAsp=mW/mH;
  if(rAsp>mapAsp){var nH=mW/rAsp;mT=mT+(mH-nH)/2;mB=mT+nH;mH=nH;}
  else{var nW=mH*rAsp;mL=mL+(mW-nW)/2;mR=mL+nW;mW=nW;}
  function projX(lng){return mL+(lng-minLng)/lngSpan*mW;}
  function projY(lat){return mB-(lat-minLat)/latSpan*mH;}

  // ── Haversine ──────────────────────────────────────────────────────────────
  function hav(p1,p2){
    var R=6371,dLat=(p2.lat-p1.lat)*Math.PI/180,dLng=(p2.lng-p1.lng)*Math.PI/180;
    var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(p1.lat*Math.PI/180)*Math.cos(p2.lat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  // ── Build route cumulative km ──────────────────────────────────────────────
  var routeCumKm=[0];
  for(var si=1;si<route.length;si++){routeCumKm.push(routeCumKm[si-1]+hav(route[si-1],route[si]));}
  var rawDist=routeCumKm[route.length-1]||0.001;
  var dScale=opts.distKm/rawDist;  // scale route distances → actual trip km

  // ── Time axis from chart point timestamps ──────────────────────────────────
  var pts=opts.points;
  var totalMs=pts.length>0?(pts[pts.length-1].ms||0):0;
  if(!totalMs)totalMs=opts.durationSec*1000;
  var totalKm=pts.length>0?pts[pts.length-1].km:opts.distKm;

  // km position at elapsed time (interpolated, pauses = km stays flat)
  function getKmAtMs(timeMs){
    if(!pts||!pts.length)return 0;
    if(timeMs<=pts[0].ms)return pts[0].km;
    for(var ii=1;ii<pts.length;ii++){
      if(pts[ii].ms>=timeMs){
        var span=pts[ii].ms-pts[ii-1].ms||1;
        var t=(timeMs-pts[ii-1].ms)/span;
        return pts[ii-1].km+(pts[ii].km-pts[ii-1].km)*t;
      }
    }
    return pts[pts.length-1].km;
  }

  // Fractional route index at km (binary search in routeCumKm)
  function getRouteIdxAtKm(km){
    var scaledKm=km/dScale;
    if(scaledKm<=0)return 0;
    if(scaledKm>=routeCumKm[route.length-1])return route.length-1;
    var lo=0,hi=routeCumKm.length-1;
    while(lo<hi-1){var mid=Math.floor((lo+hi)/2);if(routeCumKm[mid]<=scaledKm)lo=mid;else hi=mid;}
    var span=routeCumKm[hi]-routeCumKm[lo]||0.0001;
    return lo+(scaledKm-routeCumKm[lo])/span;
  }

  // Last chart point index at or before timeMs
  function getChartIdxAtMs(timeMs){
    if(!pts||!pts.length)return 0;
    var best=0;
    for(var ii=0;ii<pts.length;ii++){if(pts[ii].ms<=timeMs)best=ii;else break;}
    return best;
  }

  // ── Pace helper (km/h → "min:sec/km") ────────────────────────────────────
  function formatPace(spd){
    if(!spd||spd<0.5)return '—';
    var paceMin=60/spd;
    var m=Math.floor(paceMin);
    var s=Math.round((paceMin-m)*60);
    if(s===60){m++;s=0;}
    return m+':'+(s<10?'0':'')+s+'/km';
  }

  var DUR=(opts.videoDurationSec||18)*1000,t0=null,lastRep=0;
  var maxSpd=opts.maxSpeed||1;
  var altSpan=Math.max(opts.maxAlt-opts.minAlt,1);

  // ── Scale bar ──────────────────────────────────────────────────────────────
  var midLatRad=((minLat+maxLat)/2)*Math.PI/180;
  var lngWidthKm=lngSpan*111.32*Math.cos(midLatRad);
  var niceKmVals=[0.05,0.1,0.2,0.5,1,2,5,10,20,50,100];
  var targetKm=lngWidthKm*0.25;
  var scaleKm=niceKmVals[0];
  for(var nki=0;nki<niceKmVals.length;nki++){if(niceKmVals[nki]<=targetKm)scaleKm=niceKmVals[nki];}
  var scalePx=(scaleKm/lngWidthKm)*(mR-mL);
  var scBarX2=mR-18,scBarX1=scBarX2-scalePx,scBarY=mB-22;
  var scLabel=scaleKm<1?Math.round(scaleKm*1000)+' m':scaleKm+' km';

  rec.start();

  function frame(ts){
    if(!t0)t0=ts;
    var el=ts-t0,prog=Math.min(1,el/DUR);
    var currentMs=prog*totalMs;

    // Background + grid
    ctx.fillStyle='#0E0E0E';ctx.fillRect(0,0,cW,cH);
    ctx.strokeStyle='#161616';ctx.lineWidth=1;
    for(var gx=0;gx<cW;gx+=60){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,cH);ctx.stroke();}
    for(var gy=0;gy<cH;gy+=60){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(cW,gy);ctx.stroke();}

    // Header
    ctx.fillStyle='#141414';ctx.fillRect(0,0,cW,180);
    ctx.fillStyle=opts.color;ctx.font='bold 50px Arial,sans-serif';ctx.textAlign='center';
    ctx.fillText(opts.vehicleEmoji+'  '+opts.dateLabel,cW/2,72);
    ctx.fillStyle='#777';ctx.font='32px Arial,sans-serif';
    ctx.fillText(opts.timeLabel,cW/2,122);
    ctx.strokeStyle=opts.color+'33';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,180);ctx.lineTo(cW,180);ctx.stroke();

    // Ghost route
    if(route.length>1){
      ctx.beginPath();ctx.moveTo(projX(route[0].lng),projY(route[0].lat));
      for(var ri=1;ri<route.length;ri++)ctx.lineTo(projX(route[ri].lng),projY(route[ri].lat));
      ctx.strokeStyle='#FFFFFF0A';ctx.lineWidth=4;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    }

    // Scale bar
    ctx.strokeStyle='#999999';ctx.lineWidth=2.5;ctx.lineCap='butt';
    ctx.beginPath();ctx.moveTo(scBarX1,scBarY);ctx.lineTo(scBarX2,scBarY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(scBarX1,scBarY-7);ctx.lineTo(scBarX1,scBarY+7);ctx.stroke();
    ctx.beginPath();ctx.moveTo(scBarX2,scBarY-7);ctx.lineTo(scBarX2,scBarY+7);ctx.stroke();
    ctx.fillStyle='#999999';ctx.font='22px Arial,sans-serif';ctx.textAlign='center';
    ctx.fillText(scLabel,(scBarX1+scBarX2)/2,scBarY-11);

    // ── Animated route — time-proportional, dot stalls during pauses ─────────
    var curKm=getKmAtMs(currentMs);
    var exactIdx=getRouteIdxAtKm(curKm);
    var fullPts=Math.floor(exactIdx);
    var frac=exactIdx-fullPts;
    if(exactIdx>0){
      ctx.beginPath();
      ctx.moveTo(projX(route[0].lng),projY(route[0].lat));
      for(var ri2=1;ri2<=fullPts&&ri2<route.length;ri2++){
        ctx.lineTo(projX(route[ri2].lng),projY(route[ri2].lat));
      }
      if(frac>0&&fullPts+1<route.length){
        var pa=route[fullPts],pb=route[fullPts+1];
        ctx.lineTo(projX(pa.lng+(pb.lng-pa.lng)*frac),projY(pa.lat+(pb.lat-pa.lat)*frac));
      }
      ctx.strokeStyle=opts.color;ctx.lineWidth=6;ctx.lineJoin='round';ctx.lineCap='round';ctx.globalAlpha=0.95;ctx.stroke();ctx.globalAlpha=1;
    }

    // Start dot
    ctx.beginPath();ctx.arc(projX(route[0].lng),projY(route[0].lat),9,0,Math.PI*2);ctx.fillStyle='#4CAF50';ctx.fill();

    // Moving dot — position derived from km, which stalls during pauses
    var dotLng,dotLat;
    if(exactIdx<=0){dotLng=route[0].lng;dotLat=route[0].lat;}
    else{
      var cpI=Math.min(fullPts,route.length-2);
      var cpF=Math.min(exactIdx-cpI,1);
      var cpA=route[cpI],cpB=route[Math.min(cpI+1,route.length-1)];
      dotLng=cpA.lng+(cpB.lng-cpA.lng)*cpF;
      dotLat=cpA.lat+(cpB.lat-cpA.lat)*cpF;
    }
    ctx.beginPath();ctx.arc(projX(dotLng),projY(dotLat),14,0,Math.PI*2);ctx.fillStyle='#FFFFFF22';ctx.fill();
    ctx.beginPath();ctx.arc(projX(dotLng),projY(dotLat),9,0,Math.PI*2);ctx.fillStyle=opts.color;ctx.fill();

    // ── Stats panel ───────────────────────────────────────────────────────────
    var ci2=getChartIdxAtMs(currentMs);
    var curPt=pts[ci2]||pts[0];
    ctx.fillStyle='#141414';ctx.fillRect(0,800,cW,115);
    ctx.strokeStyle=opts.color+'22';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,800);ctx.lineTo(cW,800);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,915);ctx.lineTo(cW,915);ctx.stroke();
    ctx.fillStyle=opts.color;ctx.font='bold 84px Arial,sans-serif';ctx.textAlign='center';
    var spdLabel=opts.showPace?formatPace(curPt.spd):(curPt.spd||0).toFixed(1)+' km/h';
    ctx.fillText(spdLabel,cW/2,882);
    var elSec=Math.round(currentMs/1000);
    var elMin=Math.floor(elSec/60);var elH=Math.floor(elMin/60);
    var elLabel=elH>0?elH+'h'+(elMin%60<10?'0':'')+(elMin%60):(elMin<1?'< 1':elMin)+' min';
    ctx.fillStyle='#555';ctx.font='28px Arial,sans-serif';
    ctx.fillText((curKm||0).toFixed(2)+' km \xB7 '+elLabel,cW/2,928);

    // ── Speed chart — time axis, pause gaps in line ───────────────────────────
    var sL=50,sR=670,sTop=965,sH=85;
    ctx.fillStyle='#161616';ctx.fillRect(sL-5,sTop-5,sR-sL+10,sH+10);
    ctx.fillStyle='#444';ctx.font='20px Arial,sans-serif';ctx.textAlign='left';
    ctx.fillText(opts.showPace?'ALLURE':'VITESSE',sL,sTop-14);
    var visPts=[];
    for(var vi=0;vi<pts.length;vi++){if(pts[vi].ms<=currentMs)visPts.push(pts[vi]);else break;}
    if(visPts.length>1){
      // Area fill (continuous background)
      ctx.beginPath();
      ctx.moveTo(sL+(visPts[0].ms/totalMs)*(sR-sL),sTop+sH);
      for(var j=0;j<visPts.length;j++){
        ctx.lineTo(sL+(visPts[j].ms/totalMs)*(sR-sL),sTop+sH-(visPts[j].spd/maxSpd)*sH);
      }
      ctx.lineTo(sL+(visPts[visPts.length-1].ms/totalMs)*(sR-sL),sTop+sH);
      ctx.closePath();ctx.fillStyle=opts.color+'33';ctx.fill();
      // Line with gaps where speed < 0.5 km/h (pauses)
      var inSeg=false;
      ctx.beginPath();
      for(var j2=0;j2<visPts.length;j2++){
        var vp=visPts[j2];
        if(vp.spd<0.5){inSeg=false;continue;}
        var spx2=sL+(vp.ms/totalMs)*(sR-sL);
        var spy2=sTop+sH-(vp.spd/maxSpd)*sH;
        if(!inSeg){ctx.moveTo(spx2,spy2);inSeg=true;}else ctx.lineTo(spx2,spy2);
      }
      ctx.strokeStyle=opts.color;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke();
    }

    // ── Altitude chart — time axis ────────────────────────────────────────────
    if(opts.hasAlt){
      var aTop=1105,aH=80;
      ctx.fillStyle='#161616';ctx.fillRect(sL-5,aTop-5,sR-sL+10,aH+10);
      ctx.fillStyle='#444';ctx.font='20px Arial,sans-serif';ctx.textAlign='left';ctx.fillText('ALTITUDE',sL,aTop-14);
      var pts3=visPts.filter(function(p){return p.alt!=null;});
      if(pts3.length>1){
        ctx.beginPath();
        ctx.moveTo(sL+(pts3[0].ms/totalMs)*(sR-sL),aTop+aH);
        for(var k=0;k<pts3.length;k++){
          ctx.lineTo(sL+(pts3[k].ms/totalMs)*(sR-sL),aTop+aH-((pts3[k].alt-opts.minAlt)/altSpan)*aH);
        }
        ctx.lineTo(sL+(pts3[pts3.length-1].ms/totalMs)*(sR-sL),aTop+aH);
        ctx.closePath();ctx.fillStyle='#AAAAAA22';ctx.fill();
        ctx.beginPath();
        for(var k2=0;k2<pts3.length;k2++){
          var apx2=sL+(pts3[k2].ms/totalMs)*(sR-sL);
          var apy2=aTop+aH-((pts3[k2].alt-opts.minAlt)/altSpan)*aH;
          if(k2===0)ctx.moveTo(apx2,apy2);else ctx.lineTo(apx2,apy2);
        }
        ctx.strokeStyle='#AAAAAA';ctx.lineWidth=2.5;ctx.stroke();
      }
    }

    // End card fade-in
    if(prog>0.82){
      var fa=Math.min(1,(prog-0.82)/0.12);ctx.globalAlpha=fa;
      var bY=opts.hasAlt?1235:1165;
      ctx.fillStyle='#111';ctx.fillRect(0,bY-52,cW,cH-bY+52);
      ctx.fillStyle='#E0E0E0';ctx.font='bold 32px Arial,sans-serif';ctx.textAlign='center';
      var bestLabel=opts.showPace?('MEILLEURE '+formatPace(opts.maxSpeed)):('MAX '+opts.maxSpeed.toFixed(1)+' km/h');
      var stats=bestLabel;
      if(opts.gainM>0)stats+=(' \xB7 +'+opts.gainM+' m');
      stats+=(' \xB7 '+opts.distKm+' km');
      ctx.fillText(stats,cW/2,bY+2);
      ctx.fillStyle='#555';ctx.font='26px Arial,sans-serif';ctx.fillText(opts.timeLabel,cW/2,bY+42);
      ctx.globalAlpha=1;
    }

    if(el-lastRep>400){lastRep=el;window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_progress',p:Math.round(prog*100)}));}
    if(prog<1){requestAnimationFrame(frame);}else{setTimeout(function(){rec.stop();},300);}
  }
  requestAnimationFrame(frame);
};
`;

/** Minimal HTML page hosting window.generateStory() for the hidden WebView in trip-map.tsx. */
export function buildStoryHtml(): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#000">
<script>
${STORY_GENERATE_JS}
</script>
</body>
</html>`;
}
