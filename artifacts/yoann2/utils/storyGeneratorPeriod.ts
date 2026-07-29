/**
 * Story Période — génère une vidéo de TOUS les trajets d'une période donnée.
 *
 * Animation :
 *  - Phase 1 (0 → vidéoDur-5s) : dot se déplace sur chaque trajet dans l'ordre chrono.
 *    La carte zoome automatiquement sur le trajet actif (lerp caméra).
 *  - Phase 2 (dernières 5s) : dézoome sur la vue globale + récapitulatif stats.
 *
 * opts = {
 *   trips: Array<{
 *     route: Array<{lat:number, lng:number}>,
 *     distKm: number,
 *     durationMs: number,
 *     vehicleType: 'car'|'moto'|'walk',
 *     dateLabel: string,
 *   }>,
 *   periodLabel: string,          // e.g. "juil. 2026" ou "1–31 juil. 2026"
 *   tripCountLabel: string,       // e.g. "42 trajets"
 *   driveDurLabel: string,        // e.g. "🚗 12h30"
 *   walkDurLabel: string,         // e.g. "  ·  🚶 3h15"
 *   videoDurationSec: number,
 * }
 */
export const STORY_PERIOD_JS = `
window.generatePeriodStory=function(opts){
  var cW=720,cH=1280;
  var cv=document.createElement('canvas');
  cv.width=cW;cv.height=cH;
  document.body.appendChild(cv);
  cv.style.cssText='position:absolute;top:-9999px;left:-9999px;';
  var ctx=cv.getContext('2d');
  var mimes=['video/mp4;codecs=avc1','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  var mime='video/webm';
  for(var mi=0;mi<mimes.length;mi++){if(MediaRecorder.isTypeSupported(mimes[mi])){mime=mimes[mi];break;}}
  var chunks=[];
  var stream=cv.captureStream(30);
  var rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3200000});
  rec.ondataavailable=function(e){if(e.data&&e.data.size>0)chunks.push(e.data);};
  rec.onstop=function(){
    document.body.removeChild(cv);
    var blob=new Blob(chunks,{type:mime.split(';')[0]});
    var fr=new FileReader();
    fr.onload=function(){
      var du=fr.result,sep=du.indexOf(',');
      var mO=du.slice(5,du.indexOf(';')),b64=du.slice(sep+1);
      var C=200000,tot=Math.ceil(b64.length/C);
      for(var ci=0;ci<tot;ci++)window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_chunk',index:ci,total:tot,mime:mO,data:b64.slice(ci*C,(ci+1)*C)}));
    };
    fr.readAsDataURL(blob);
  };

  var trips=opts.trips;
  var VCL={car:'#2196F3',moto:'#FF9800',walk:'#4CAF50'};

  /* ── Bounding box globale ─────────────────────────────────────────────── */
  var gLats=[],gLngs=[];
  for(var ti=0;ti<trips.length;ti++){var rr=trips[ti].route;for(var ri=0;ri<rr.length;ri++){gLats.push(rr[ri].lat);gLngs.push(rr[ri].lng);}}
  var minLat=gLats[0],maxLat=gLats[0],minLng=gLngs[0],maxLng=gLngs[0];
  for(var ki=0;ki<gLats.length;ki++){
    if(gLats[ki]<minLat)minLat=gLats[ki];if(gLats[ki]>maxLat)maxLat=gLats[ki];
    if(gLngs[ki]<minLng)minLng=gLngs[ki];if(gLngs[ki]>maxLng)maxLng=gLngs[ki];
  }
  var pLa=(maxLat-minLat)*0.18||0.01,pLn=(maxLng-minLng)*0.18||0.01;
  minLat-=pLa;maxLat+=pLa;minLng-=pLn;maxLng+=pLn;
  var latSp=maxLat-minLat,lngSp=maxLng-minLng;

  /* ── Projection map (zone centrale) ──────────────────────────────────── */
  var mT=185,mB=800,mL=40,mR=680;
  var mW=mR-mL,mH=mB-mT;
  var midLR=((minLat+maxLat)/2)*Math.PI/180;
  var rAsp=(lngSp/latSp)*Math.cos(midLR),mapAsp=mW/mH;
  if(rAsp>mapAsp){var nH=mW/rAsp;mT+=(mH-nH)/2;mB=mT+nH;mH=nH;}
  else{var nW=mH*rAsp;mL+=(mW-nW)/2;mR=mL+nW;mW=nW;}
  var mCX=(mL+mR)/2,mCY=(mT+mB)/2;
  function pX(lng){return mL+(lng-minLng)/lngSp*mW;}
  function pY(lat){return mB-(lat-minLat)/latSp*mH;}

  /* ── Caméra par trajet ────────────────────────────────────────────────── */
  function camForTrip(t){
    var rr=t.route;
    var x0=pX(rr[0].lng),x1=x0,y0=pY(rr[0].lat),y1=y0;
    for(var k=1;k<rr.length;k++){var xx=pX(rr[k].lng),yy=pY(rr[k].lat);if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;}
    var cx=(x0+x1)/2,cy=(y0+y1)/2;
    var pw=(x1-x0)*1.7||30,ph=(y1-y0)*1.7||30;
    var z=Math.min(mW/pw,mH/ph);
    return{cx:cx,cy:cy,zoom:Math.max(1.1,Math.min(z,14))};
  }
  var fullCam={cx:mCX,cy:mCY,zoom:1};
  var cam={cx:mCX,cy:mCY,zoom:1};

  /* ── Allocation du temps par trajet (proportionnel aux km) ───────────── */
  var DUR=(opts.videoDurationSec||20)*1000;
  var END_MS=5000;
  var animMs=DUR-END_MS;
  var totKm=0;
  for(var ti=0;ti<trips.length;ti++)totKm+=trips[ti].distKm||0.5;
  var tStart=[0];
  for(var ti=1;ti<trips.length;ti++)tStart.push(tStart[ti-1]+((trips[ti-1].distKm||0.5)/totKm)*animMs);

  /* ── Km cumulés par route (pour positionner le dot) ──────────────────── */
  var cumKm=[];
  for(var ti=0;ti<trips.length;ti++){
    var rr=trips[ti].route,c=[0];
    for(var ri=1;ri<rr.length;ri++){
      var p1=rr[ri-1],p2=rr[ri];
      var dLa=(p2.lat-p1.lat)*Math.PI/180,dLn=(p2.lng-p1.lng)*Math.PI/180;
      var aH=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(p1.lat*Math.PI/180)*Math.cos(p2.lat*Math.PI/180)*Math.sin(dLn/2)*Math.sin(dLn/2);
      c.push(c[ri-1]+6371*2*Math.atan2(Math.sqrt(aH),Math.sqrt(1-aH)));
    }
    cumKm.push(c);
  }
  function idxAtFrac(ti,fr){
    var c=cumKm[ti],tot=c[c.length-1]||0.001,tgt=fr*tot;
    var lo=0,hi=c.length-1;
    while(lo<hi-1){var mid=Math.floor((lo+hi)/2);if(c[mid]<=tgt)lo=mid;else hi=mid;}
    return lo+(tgt-c[lo])/(c[hi]-c[lo]||0.001);
  }

  /* ── Km accumulés au début de chaque trajet ──────────────────────────── */
  var accKm=[0];
  for(var ti=0;ti<trips.length;ti++)accKm.push(accKm[ti]+(trips[ti].distKm||0));

  /* ── Stats totaux (calculés une fois) ────────────────────────────────── */
  var cKm=0,mKm=0,wKm=0;
  for(var ti=0;ti<trips.length;ti++){
    var dk=trips[ti].distKm||0;
    if(trips[ti].vehicleType==='moto')mKm+=dk;
    else if(trips[ti].vehicleType==='walk')wKm+=dk;
    else cKm+=dk;
  }

  var t0=null,lastRep=0;
  rec.start();

  /* ── Boucle d'animation ──────────────────────────────────────────────── */
  function frame(ts){
    if(!t0)t0=ts;
    var el=ts-t0,prog=Math.min(1,el/DUR);
    var isEnd=el>=animMs;
    var endProg=isEnd?Math.min(1,(el-animMs)/END_MS):0;
    var aEl=Math.min(el,animMs);

    /* Trajet courant */
    var ci=trips.length-1;
    for(var ti=0;ti<trips.length-1;ti++){if(aEl<tStart[ti+1]){ci=ti;break;}}
    var tEl=aEl-tStart[ci];
    var tDur=((trips[ci].distKm||0.5)/totKm)*animMs;
    var tProg=isEnd?1:Math.min(1,tEl/(tDur||1));

    /* Lerp caméra */
    var tgt=isEnd?fullCam:camForTrip(trips[ci]);
    var lf=isEnd?0.055:0.038;
    cam.cx+=(tgt.cx-cam.cx)*lf;
    cam.cy+=(tgt.cy-cam.cy)*lf;
    cam.zoom+=(tgt.zoom-cam.zoom)*lf;

    /* Background + grille */
    ctx.fillStyle='#0E0E0E';ctx.fillRect(0,0,cW,cH);
    ctx.strokeStyle='#161616';ctx.lineWidth=1;
    for(var gx=0;gx<cW;gx+=60){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,cH);ctx.stroke();}
    for(var gy=0;gy<cH;gy+=60){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(cW,gy);ctx.stroke();}

    /* Header */
    ctx.fillStyle='#141414';ctx.fillRect(0,0,cW,180);
    ctx.fillStyle='#FFFFFF';ctx.font='bold 42px Arial,sans-serif';ctx.textAlign='center';
    ctx.fillText('\uD83D\uDDFA\uFE0F  '+opts.periodLabel,cW/2,65);
    ctx.fillStyle='#666';ctx.font='26px Arial,sans-serif';
    var dispKm=(isEnd?totKm:(accKm[ci]+(trips[ci].distKm||0)*tProg)).toFixed(1);
    ctx.fillText(opts.tripCountLabel+'  \xB7  '+dispKm+' km',cW/2,105);
    ctx.fillStyle='#333';ctx.font='22px Arial,sans-serif';
    ctx.fillText(isEnd?'R\xE9capitulatif':trips[ci].dateLabel,cW/2,142);
    ctx.strokeStyle='#222';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,180);ctx.lineTo(cW,180);ctx.stroke();

    /* Zone carte avec clip + transform caméra */
    ctx.save();
    ctx.beginPath();ctx.rect(38,183,684,622);ctx.clip();
    ctx.translate(mCX,mCY);ctx.scale(cam.zoom,cam.zoom);ctx.translate(-cam.cx,-cam.cy);

    /* Ghost (tous les tracés, très transparent) */
    for(var ti=0;ti<trips.length;ti++){
      var rr=trips[ti].route;if(rr.length<2)continue;
      ctx.beginPath();ctx.moveTo(pX(rr[0].lng),pY(rr[0].lat));
      for(var ri=1;ri<rr.length;ri++)ctx.lineTo(pX(rr[ri].lng),pY(rr[ri].lat));
      ctx.strokeStyle='#FFFFFF08';ctx.lineWidth=3/cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    }

    /* Trajets terminés */
    var compLimit=isEnd?trips.length:ci;
    for(var ti=0;ti<compLimit;ti++){
      var rr=trips[ti].route;if(rr.length<2)continue;
      var col=VCL[trips[ti].vehicleType]||'#2196F3';
      ctx.beginPath();ctx.moveTo(pX(rr[0].lng),pY(rr[0].lat));
      for(var ri=1;ri<rr.length;ri++)ctx.lineTo(pX(rr[ri].lng),pY(rr[ri].lat));
      ctx.strokeStyle=col+(isEnd?'BB':'55');ctx.lineWidth=(isEnd?5:3)/cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';
      ctx.globalAlpha=isEnd?0.82:0.42;ctx.stroke();ctx.globalAlpha=1;
      ctx.beginPath();ctx.arc(pX(rr[0].lng),pY(rr[0].lat),6/cam.zoom,0,Math.PI*2);ctx.fillStyle=col+'99';ctx.fill();
    }

    /* Trajet actif — révélé progressivement */
    if(!isEnd){
      var rr=trips[ci].route;
      var col=VCL[trips[ci].vehicleType]||'#2196F3';
      var exI=idxAtFrac(ci,tProg);
      var flI=Math.floor(exI),frI=exI-flI;
      if(exI>0){
        ctx.beginPath();ctx.moveTo(pX(rr[0].lng),pY(rr[0].lat));
        for(var ri=1;ri<=flI&&ri<rr.length;ri++)ctx.lineTo(pX(rr[ri].lng),pY(rr[ri].lat));
        if(frI>0&&flI+1<rr.length){var pa=rr[flI],pb=rr[flI+1];ctx.lineTo(pX(pa.lng+(pb.lng-pa.lng)*frI),pY(pa.lat+(pb.lat-pa.lat)*frI));}
        ctx.strokeStyle=col;ctx.lineWidth=7/cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';ctx.globalAlpha=0.95;ctx.stroke();ctx.globalAlpha=1;
      }
      /* Dot départ */
      ctx.beginPath();ctx.arc(pX(rr[0].lng),pY(rr[0].lat),9/cam.zoom,0,Math.PI*2);ctx.fillStyle='#4CAF50';ctx.fill();
      /* Dot mobile */
      var dLn,dLa;
      if(exI<=0){dLn=rr[0].lng;dLa=rr[0].lat;}
      else{
        var cpI=Math.min(flI,rr.length-2),cpF=Math.min(exI-cpI,1);
        var cpA=rr[cpI],cpB=rr[Math.min(cpI+1,rr.length-1)];
        dLn=cpA.lng+(cpB.lng-cpA.lng)*cpF;dLa=cpA.lat+(cpB.lat-cpA.lat)*cpF;
      }
      ctx.beginPath();ctx.arc(pX(dLn),pY(dLa),18/cam.zoom,0,Math.PI*2);ctx.fillStyle='#FFFFFF22';ctx.fill();
      ctx.beginPath();ctx.arc(pX(dLn),pY(dLa),11/cam.zoom,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
    }

    ctx.restore(); /* fin clip + caméra */

    /* ── Panneau stats bas ────────────────────────────────────────────── */
    ctx.fillStyle='#111111';ctx.fillRect(0,800,cW,cH-800);
    ctx.strokeStyle='#1E1E1E';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,800);ctx.lineTo(cW,800);ctx.stroke();

    if(!isEnd){
      /* Phase animation : km courant + infos trajet */
      var col=VCL[trips[ci].vehicleType]||'#2196F3';
      ctx.fillStyle=col;ctx.font='bold 80px Arial,sans-serif';ctx.textAlign='center';
      ctx.fillText((accKm[ci]+(trips[ci].distKm||0)*tProg).toFixed(1)+' km',cW/2,882);
      ctx.fillStyle='#444';ctx.font='26px Arial,sans-serif';
      ctx.fillText('trajet '+(ci+1)+' / '+trips.length+'  \xB7  '+trips[ci].dateLabel,cW/2,926);

      /* Légende par véhicule */
      var lIt=[],lY=990;
      if(cKm>0)lIt.push({t:'\uD83D\uDE97 '+cKm.toFixed(0)+' km',c:'#2196F3'});
      if(mKm>0)lIt.push({t:'\uD83C\uDFCD '+mKm.toFixed(0)+' km',c:'#FF9800'});
      if(wKm>0)lIt.push({t:'\uD83D\uDEB6 '+wKm.toFixed(0)+' km',c:'#4CAF50'});
      var iW=cW/(lIt.length||1);
      for(var si=0;si<lIt.length;si++){ctx.fillStyle=lIt[si].c;ctx.font='24px Arial,sans-serif';ctx.fillText(lIt[si].t,iW*(si+0.5),lY);}
    } else {
      /* Phase end card : recap complet, fade-in */
      var fa=Math.min(1,endProg*2.2);ctx.globalAlpha=fa;
      ctx.fillStyle='#FFFFFF';ctx.font='bold 46px Arial,sans-serif';ctx.textAlign='center';
      ctx.fillText(opts.periodLabel,cW/2,856);
      ctx.fillStyle='#FFC107';ctx.font='bold 100px Arial,sans-serif';
      ctx.fillText(totKm.toFixed(0)+' km',cW/2,968);
      ctx.fillStyle='#555';ctx.font='28px Arial,sans-serif';
      ctx.fillText(opts.tripCountLabel,cW/2,1012);

      /* Détail par véhicule */
      var eIt=[],eY=1082;
      if(cKm>0)eIt.push({t:'\uD83D\uDE97 '+cKm.toFixed(0)+' km',c:'#2196F3'});
      if(mKm>0)eIt.push({t:'\uD83C\uDFCD '+mKm.toFixed(0)+' km',c:'#FF9800'});
      if(wKm>0)eIt.push({t:'\uD83D\uDEB6 '+wKm.toFixed(0)+' km',c:'#4CAF50'});
      var eW=cW/(eIt.length||1);
      for(var si=0;si<eIt.length;si++){ctx.fillStyle=eIt[si].c;ctx.font='bold 30px Arial,sans-serif';ctx.fillText(eIt[si].t,eW*(si+0.5),eY);}

      /* Durées */
      var durLine=(opts.driveDurLabel||'')+(opts.walkDurLabel||'');
      if(durLine){ctx.fillStyle='#444';ctx.font='24px Arial,sans-serif';ctx.fillText(durLine,cW/2,1142);}

      ctx.globalAlpha=1;
    }

    if(el-lastRep>400){lastRep=el;window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_progress',p:Math.round(prog*100)}));}
    if(prog<1){requestAnimationFrame(frame);}else{setTimeout(function(){rec.stop();},300);}
  }

  requestAnimationFrame(frame);
};
`;

/** HTML minimal hébergeant generatePeriodStory() dans le WebView caché. */
export function buildStoryPeriodHtml(): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#000">
<script>
${STORY_PERIOD_JS}
</script>
</body>
</html>`;
}
