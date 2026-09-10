/**
 * window.generateStory JS function — MediaRecorder-based story video.
 *
 * v3 — caméra cinématique :
 *  - Intro (0→~8%) : zoom serré sur le point de départ.
 *  - Milieu : follow-cam fluide qui suit le dot à zoom ~1.8.
 *  - Fin (85%→100%) : dézoome sur la vue complète + end card.
 *  - Effet "comète" lumineux derrière le dot, glow sur le tracé, dot pulsant.
 *
 * v2 — time-proportional animation:
 *  - Chart points now carry a `ms` field (elapsed milliseconds from trip start).
 *  - X-axis of speed/altitude charts = real elapsed time → pauses appear as gaps.
 *  - Moving dot position: getKmAtMs(currentMs) → getRouteIdxAtKm(km)
 *    → dot stalls on the map during pauses exactly as in real life.
 *  - Speed display: reads from chart point at current elapsed time.
 */
export const STORY_GENERATE_JS = `
(function(){
  /* ── Cache de tuiles satellite ─────────────────────────────────────────
     Partagé par tous les appels à generateStory() dans cette session WebView
     (déclaré ici, hors de la fonction, donc jamais recréé) : voir
     storyGeneratorPeriod.ts pour le détail (mémoire + localStorage, best-effort,
     jamais un point de défaillance). */
  var TILE_MEM=Object.create(null);
  var TILE_LS_PREFIX='satTile_v1_';
  var TILE_LS_INDEX_KEY='satTileIndex_v1';
  var TILE_LS_MAX=600;
  function lsIndex(){try{return JSON.parse(localStorage.getItem(TILE_LS_INDEX_KEY)||'[]');}catch(e){return [];}}
  function lsGetTile(key){try{return localStorage.getItem(TILE_LS_PREFIX+key);}catch(e){return null;}}
  function lsSetTile(key,dataUrl){
    try{
      localStorage.setItem(TILE_LS_PREFIX+key,dataUrl);
      var idx=lsIndex();
      if(idx.indexOf(key)===-1){
        idx.push(key);
        while(idx.length>TILE_LS_MAX){
          var old=idx.shift();
          try{localStorage.removeItem(TILE_LS_PREFIX+old);}catch(e2){}
        }
        try{localStorage.setItem(TILE_LS_INDEX_KEY,JSON.stringify(idx));}catch(e3){}
      }
    }catch(e){ /* quota dépassée ou stockage indisponible : cache disque ignoré, réseau classique */ }
  }
  function loadTile(z,xx,yy,cctx,dx,dy,onFail,cb){
    var key=z+'/'+xx+'/'+yy;
    var mem=TILE_MEM[key];
    if(mem){
      try{cctx.drawImage(mem,dx,dy,256,256);}catch(e){onFail();}
      cb();
      return;
    }
    var cachedUrl=lsGetTile(key);
    var img=new Image();
    img.crossOrigin='anonymous';
    img.onload=function(){
      try{cctx.drawImage(img,dx,dy,256,256);}catch(e){onFail();}
      TILE_MEM[key]=img;
      if(!cachedUrl){
        try{
          var tc=document.createElement('canvas');tc.width=256;tc.height=256;
          tc.getContext('2d').drawImage(img,0,0);
          lsSetTile(key,tc.toDataURL('image/jpeg',0.82));
        }catch(e2){ /* toDataURL peut échouer (canvas "tainted" si le CORS échoue) : on continue sans cache disque */ }
      }
      cb();
    };
    img.onerror=function(){onFail();cb();};
    img.src=cachedUrl||(SAT_TILE_URL+z+'/'+yy+'/'+xx);
  }
  var SAT_TILE_URL='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';

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
  var rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3200000});
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
  var storyHeaderH=opts.isWalk?230:180;

  // ── Thème ─────────────────────────────────────────────────────────────
  // 'dark'/'light' ne changent que la palette. 'satellite' télécharge et assemble de
  // vraies tuiles satellite (Esri World Imagery, gratuit, sans clé API) en fond de la
  // zone carte avant l'enregistrement ; en cas d'échec (réseau/timeout) on retombe sur
  // 'dark' et on prévient React Native via un message 'story_theme_fallback' —
  // exactement le même comportement que storyGeneratorPeriod.ts.
  var requestedTheme=opts.theme||'dark';
  var effTheme=requestedTheme;
  var PALETTES={
    dark:{
      bgGrad0:'#151820',bgGrad1:'#0A0B0E',gridStroke:'#FFFFFF06',
      headerBg:'#12141Acc',headerSep:'#FFFFFF33',
      titleColor:'#FFFFFF',subColor:'#8A8F99',captionColor:'#565B66',
      ghostStroke:'#FFFFFF2E',footerBg:'#12141A',footerSep:'#FFFFFF22',
      panelBg:'#161920',endBg:'#101218',
    },
    light:{
      bgGrad0:'#F4F5F8',bgGrad1:'#E2E5EB',gridStroke:'#00000008',
      headerBg:'#FFFFFFcc',headerSep:'#00000022',
      titleColor:'#161A20',subColor:'#5B616C',captionColor:'#9198A4',
      ghostStroke:'#0000002E',footerBg:'#FFFFFF',footerSep:'#00000022',
      panelBg:'#E9EBEF',endBg:'#FFFFFF',
    },
  };
  function palette(){return PALETTES[effTheme==='light'?'light':'dark'];}

  // ── Map projection — Web Mercator (aligné avec les tuiles satellite) ────────
  var lats=route.map(function(p){return p.lat;}),lngs=route.map(function(p){return p.lng;});
  var minLat=Math.min.apply(null,lats),maxLat=Math.max.apply(null,lats);
  var minLng=Math.min.apply(null,lngs),maxLng=Math.max.apply(null,lngs);
  var padLa=(maxLat-minLat)*0.1||0.001,padLn=(maxLng-minLng)*0.1||0.001;
  minLat-=padLa;maxLat+=padLa;minLng-=padLn;maxLng+=padLn;
  var lngSpan=maxLng-minLng||0.001;
  // *(180/Math.PI) : ramène le résultat (en radians) à une échelle comparable aux degrés
  // de longitude — sans ça mercSpan est ~57x plus petit que lngSpan, ce qui fait croire
  // à rAsp que le trajet est bien plus large que haut et écrase la carte à quelques px de haut.
  function mercY(lat){return Math.log(Math.tan(Math.PI/4+(lat*Math.PI/180)/2))*(180/Math.PI);}
  var minMerc=mercY(minLat),maxMerc=mercY(maxLat),mercSpan=(maxMerc-minMerc)||0.0001;
  var mT=storyHeaderH+15,mB=780,mL=60,mR=660;
  var mW=mR-mL,mH=mB-mT;
  var rAsp=lngSpan/mercSpan;
  var mapAsp=mW/mH;
  if(rAsp>mapAsp){var nH=mW/rAsp;mT=mT+(mH-nH)/2;mB=mT+nH;mH=nH;}
  else{var nW=mH*rAsp;mL=mL+(mW-nW)/2;mR=mL+nW;mW=nW;}
  function projX(lng){return mL+(lng-minLng)/lngSpan*mW;}
  function projY(lat){return mB-(mercY(lat)-minMerc)/mercSpan*mH;}
  var mCX=(mL+mR)/2,mCY=(mT+mB)/2;

  // ── Imagerie satellite (thème 'satellite') — une seule mosaïque pour tout le trajet ──
  var SAT_MAX_TILES=48;
  var SAT_MOSAIC_TIMEOUT=9000;
  function lngToTileX(lng,z){return (lng+180)/360*Math.pow(2,z);}
  function latToTileY(lat,z){var r=lat*Math.PI/180;return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z);}
  function tileXToLng(x,z){return x/Math.pow(2,z)*360-180;}
  function tileYToLat(y,z){var n=Math.PI-2*Math.PI*y/Math.pow(2,z);return 180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n)));}
  function buildSatMosaic(bbox,targetWpx,targetHpx){
    return new Promise(function(resolve){
      var z=19,xMin,xMax,yMin,yMax,cols=1,rows=1;
      while(z>1){
        xMin=Math.floor(lngToTileX(bbox.lngMin,z));
        xMax=Math.floor(lngToTileX(bbox.lngMax,z));
        yMin=Math.floor(latToTileY(bbox.latMax,z));
        yMax=Math.floor(latToTileY(bbox.latMin,z));
        cols=xMax-xMin+1;rows=yMax-yMin+1;
        var tilePx=Math.min(cols,rows)*256,targetPx=Math.max(targetWpx,targetHpx);
        if(cols*rows<=SAT_MAX_TILES&&tilePx>=targetPx*0.85)break;
        z--;
      }
      if(cols*rows>SAT_MAX_TILES||cols<1||rows<1){resolve(null);return;}
      var canvas=document.createElement('canvas');
      canvas.width=cols*256;canvas.height=rows*256;
      var cctx=canvas.getContext('2d');
      var total=cols*rows,done=0,failed=false,settled=false;
      var to=setTimeout(function(){if(!settled){settled=true;resolve(null);}},SAT_MOSAIC_TIMEOUT);
      function checkDone(){
        done++;
        if(done>=total&&!settled){
          settled=true;clearTimeout(to);
          if(failed){resolve(null);return;}
          resolve({canvas:canvas,
            lngLeft:tileXToLng(xMin,z),lngRight:tileXToLng(xMax+1,z),
            latTop:tileYToLat(yMin,z),latBottom:tileYToLat(yMax+1,z)});
        }
      }
      for(var xx=xMin;xx<=xMax;xx++){
        for(var yy=yMin;yy<=yMax;yy++){
          loadTile(z,xx,yy,cctx,(xx-xMin)*256,(yy-yMin)*256,function(){failed=true;},checkDone);
        }
      }
    });
  }
  var satMosaic=null;

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
  var dScale=Math.max(opts.distKm,0.01)/rawDist;  // scale route distances → actual trip km (clamp: distKm=0 → pas de division par zéro)

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

  // Position (lng,lat) at fractional route index
  function posAtIdx(idx){
    if(!isFinite(idx)||idx<=0)return{lng:route[0].lng,lat:route[0].lat};
    var fi=Math.min(Math.floor(idx),route.length-2);
    var fr=Math.min(idx-fi,1);
    var a=route[fi],b=route[Math.min(fi+1,route.length-1)];
    return{lng:a.lng+(b.lng-a.lng)*fr,lat:a.lat+(b.lat-a.lat)*fr};
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

  // ── Hyperlapse sur les longs trajets ────────────────────────────────────────
  // Au-delà de 50km (autoroute), le trajet ennuie s'il défile à la même vitesse qu'un court
  // trajet urbain : on accélère nettement la révélation du tracé (jusqu'à ~3x plus vite pour
  // les très longs trajets), sans toucher aux trajets courts qui gardent leur rythme normal.
  var HYPERLAPSE_KM=50;
  var hyperSpeed=opts.distKm>HYPERLAPSE_KM?(1+Math.min(2,(opts.distKm-HYPERLAPSE_KM)/75)):1;
  var animMs=((opts.videoDurationSec||18)*1000)/hyperSpeed,t0=null,lastRep=0;
  var maxSpd=opts.maxSpeed||1;
  var altSpan=Math.max(opts.maxAlt-opts.minAlt,1);

  // ── Photos ancrées (comme la Story Période) ──────────────────────────────────
  // opts.photos: [{img, note, frac}] — frac = position (0..1) le long du tableau
  // \`route\` (routeIndex/(route.length-1)), converti ci-dessous en instant précis de
  // l'animation via le vrai timing GPS (km parcourus à cet instant, cf. getKmAtMs).
  var PHOTO_PAUSE_MS=2000;
  function getMsAtKm(km){
    if(!pts||pts.length<2)return 0;
    if(km<=pts[0].km)return pts[0].ms;
    for(var ii=1;ii<pts.length;ii++){
      if(pts[ii].km>=km){
        var span=pts[ii].km-pts[ii-1].km||0.0001;
        var t=(km-pts[ii-1].km)/span;
        return pts[ii-1].ms+(pts[ii].ms-pts[ii-1].ms)*t;
      }
    }
    return pts[pts.length-1].ms;
  }
  var photoMarkers=(opts.photos||[]).map(function(p){
    var idx=Math.max(0,Math.min(1,p.frac))*(route.length-1);
    var fi=Math.min(Math.floor(idx),route.length-2),fr=idx-fi;
    var kmRaw=routeCumKm[fi]+(routeCumKm[Math.min(fi+1,route.length-1)]-routeCumKm[fi])*fr;
    var km=kmRaw*dScale;
    var ms=getMsAtKm(km);
    var aProgAt=totalMs>0?Math.min(1,ms/totalMs):0;
    return{note:p.note||'',src:p.img,imgEl:null,triggered:false,absAEl:aProgAt*animMs};
  }).sort(function(a,b){return a.absAEl-b.absAEl;});
  var totalPauseMs=photoMarkers.length*PHOTO_PAUSE_MS;
  var DUR=animMs+totalPauseMs;
  var pauseActive=null,pauseConsumedMs=0;

  // ── Caméra ────────────────────────────────────────────────────────────────
  var startPos={x:projX(route[0].lng),y:projY(route[0].lat)};
  var cam={cx:startPos.x,cy:startPos.y,zoom:2.4};
  var fullCam={cx:mCX,cy:mCY,zoom:1};
  // Follow zoom : plus la route est petite à l'écran, moins on zoome (elle remplit déjà)
  var FOLLOW_Z=1.8;

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

  function startRecording(){
    rec.start();
    requestAnimationFrame(frame);
  }
  function preloadPhotosThenStart(){
    if(photoMarkers.length===0){startRecording();return;}
    var loaded=0,settled=false;
    var finish=function(){if(settled)return;settled=true;startRecording();};
    var to=setTimeout(finish,6000);
    for(var pmi=0;pmi<photoMarkers.length;pmi++){
      (function(m){
        var img=new Image();
        img.onload=function(){m.imgEl=img;loaded++;if(loaded===photoMarkers.length){clearTimeout(to);finish();}};
        img.onerror=function(){loaded++;if(loaded===photoMarkers.length){clearTimeout(to);finish();}};
        img.src=m.src;
      })(photoMarkers[pmi]);
    }
  }

  if(requestedTheme!=='satellite'){
    preloadPhotosThenStart();
  }else{
    // Marge large : la caméra zoome jusqu'à x2.4 en suivi (FOLLOW_Z/zoom initial), donc la
    // fenêtre visible peut dépasser largement la seule bbox du trajet ; 0.3 laissait apparaître
    // le fond (dégradé) autour de l'imagerie satellite près des extrémités du tracé.
    var satPad=0.6;
    var satBbox={
      latMin:minLat-(maxLat-minLat)*satPad||minLat-0.003,
      latMax:maxLat+(maxLat-minLat)*satPad||maxLat+0.003,
      lngMin:minLng-(maxLng-minLng)*satPad||minLng-0.003,
      lngMax:maxLng+(maxLng-minLng)*satPad||maxLng+0.003,
    };
    var guardTo=setTimeout(function(){
      effTheme='dark';
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_theme_fallback',reason:'timeout'}));
      preloadPhotosThenStart();
    },11000);
    buildSatMosaic(satBbox,mW,mH).then(function(res){
      clearTimeout(guardTo);
      if(!res){
        effTheme='dark';
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_theme_fallback',reason:'tiles'}));
      }else{
        satMosaic=res;
      }
      preloadPhotosThenStart();
    });
  }

  function frame(ts){
    if(!t0)t0=ts;
    var el=ts-t0,prog=Math.min(1,el/DUR);

    // Pause photo en cours : fige la progression de l'animation, avance seulement le temps réel
    if(pauseActive){
      pauseConsumedMs=pauseActive.anchorConsumed+(el-pauseActive.anchorEl);
      if(el-pauseActive.anchorEl>=PHOTO_PAUSE_MS){
        pauseConsumedMs=pauseActive.anchorConsumed+PHOTO_PAUSE_MS;
        pauseActive=null;
      }
    }
    var vEl=Math.max(0,el-pauseConsumedMs);
    var aProg=Math.min(1,vEl/animMs);
    var currentMs=aProg*totalMs;

    // Déclenchement d'une pause photo : dès que l'instant absolu (vEl) d'une photo pas
    // encore montrée est atteint.
    if(!pauseActive){
      for(var pmi2=0;pmi2<photoMarkers.length;pmi2++){
        var pmc=photoMarkers[pmi2];
        if(!pmc.triggered&&vEl>=pmc.absAEl){
          pmc.triggered=true;
          pauseActive={marker:pmc,anchorEl:el,anchorConsumed:pauseConsumedMs};
          break;
        }
      }
    }

    // ── Position du dot (avant caméra) ───────────────────────────────────────
    var curKm=getKmAtMs(currentMs);
    // Snap au point final exact quand l'anim est quasi terminée : évite qu'un léger écart
    // d'arrondi entre l'échelle de \`points\` (chart GPS) et celle de \`route\` (tracé affiché)
    // laisse le trajet visuellement "coupé" juste avant la destination.
    var exactIdx=aProg>=0.999?route.length-1:getRouteIdxAtKm(curKm);
    var dotP=posAtIdx(exactIdx);
    var dotX=projX(dotP.lng),dotY=projY(dotP.lat);

    // ── Update caméra (lerp doux, zoom en log) ───────────────────────────────
    var tgt,lf;
    if(aProg>=0.84){tgt=fullCam;lf=0.085;}
    else{
      var z=aProg<0.05?2.4:FOLLOW_Z;
      tgt={cx:dotX,cy:dotY,zoom:z};lf=0.065;
    }
    cam.cx+=(tgt.cx-cam.cx)*lf;
    cam.cy+=(tgt.cy-cam.cy)*lf;
    cam.zoom=Math.exp(Math.log(cam.zoom)+(Math.log(tgt.zoom)-Math.log(cam.zoom))*lf);

    var THEME=palette();

    // Background : dégradé radial + grille subtile (couvert par l'imagerie satellite
    // dans la zone carte quand ce thème est actif et prêt)
    var bg=ctx.createRadialGradient(cW/2,cH*0.38,80,cW/2,cH*0.38,900);
    bg.addColorStop(0,THEME.bgGrad0);bg.addColorStop(1,THEME.bgGrad1);
    ctx.fillStyle=bg;ctx.fillRect(0,0,cW,cH);
    ctx.strokeStyle=THEME.gridStroke;ctx.lineWidth=1;
    for(var gx=0;gx<cW;gx+=60){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,cH);ctx.stroke();}
    for(var gy=0;gy<cH;gy+=60){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(cW,gy);ctx.stroke();}

    // Header
    ctx.fillStyle=THEME.headerBg;ctx.fillRect(0,0,cW,storyHeaderH);
    ctx.fillStyle=opts.color;ctx.font='bold 50px Arial,sans-serif';ctx.textAlign='center';
    ctx.fillText(opts.vehicleEmoji+'  '+opts.dateLabel,cW/2,72);
    ctx.fillStyle=THEME.subColor;ctx.font='32px Arial,sans-serif';
    ctx.fillText(opts.timeLabel,cW/2,122);
    if(opts.isWalk){
      ctx.fillStyle=THEME.subColor;ctx.font='22px Arial,sans-serif';
      var participantsLabel=(opts.walkParticipants||[]).join(' · ');
      if(participantsLabel)ctx.fillText('Avec '+participantsLabel,cW/2,160,cW-80);
      if(opts.walkSpotName)ctx.fillText('Spot : '+opts.walkSpotName,cW/2,193,cW-80);
    }
    ctx.strokeStyle=THEME.headerSep;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,storyHeaderH);ctx.lineTo(cW,storyHeaderH);ctx.stroke();

    // ── Zone carte : clip + transform caméra ─────────────────────────────────
    ctx.save();
    ctx.beginPath();ctx.rect(30,storyHeaderH+3,660,797-storyHeaderH-3);ctx.clip();
    ctx.translate(mCX,mCY);ctx.scale(cam.zoom,cam.zoom);ctx.translate(-cam.cx,-cam.cy);

    // Imagerie satellite (thème satellite, prête) : dessinée dans le même repère que le
    // tracé pour rester parfaitement alignée pendant les mouvements de caméra.
    if(effTheme==='satellite'&&satMosaic){
      var sx0=projX(satMosaic.lngLeft),sx1=projX(satMosaic.lngRight);
      var sy0=projY(satMosaic.latTop),sy1=projY(satMosaic.latBottom);
      ctx.drawImage(satMosaic.canvas,sx0,sy0,sx1-sx0,sy1-sy0);
      ctx.fillStyle='rgba(6,7,10,0.22)';ctx.fillRect(sx0,sy0,sx1-sx0,sy1-sy0);
    }

    // Aperçu du parcours complet (fantôme coloré, on voit où on va)
    if(route.length>1){
      ctx.beginPath();ctx.moveTo(projX(route[0].lng),projY(route[0].lat));
      for(var ri=1;ri<route.length;ri++)ctx.lineTo(projX(route[ri].lng),projY(route[ri].lat));
      ctx.strokeStyle=opts.color+'2E';ctx.lineWidth=4/cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
      // Marqueur destination
      var rl=route[route.length-1];
      ctx.beginPath();ctx.arc(projX(rl.lng),projY(rl.lat),6/cam.zoom,0,Math.PI*2);
      ctx.strokeStyle=opts.color+'AA';ctx.lineWidth=2/cam.zoom;ctx.stroke();
    }

    // ── Tracé parcouru — glow ────────────────────────────────────────────────
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
      ctx.shadowColor=opts.color;ctx.shadowBlur=14;
      ctx.strokeStyle=opts.color;ctx.lineWidth=6/cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';ctx.globalAlpha=0.95;ctx.stroke();ctx.globalAlpha=1;
      ctx.shadowBlur=0;

      // Effet comète : les derniers ~6% parcourus en surbrillance blanche
      var cometStartIdx=getRouteIdxAtKm(Math.max(0,curKm-Math.max(opts.distKm*0.06,0.02)));
      if(exactIdx-cometStartIdx>0.01){
        var csF=Math.floor(cometStartIdx),csR=cometStartIdx-csF;
        var cp0=posAtIdx(cometStartIdx);
        ctx.beginPath();
        ctx.moveTo(projX(cp0.lng),projY(cp0.lat));
        for(var ri3=csF+1;ri3<=fullPts&&ri3<route.length;ri3++){
          ctx.lineTo(projX(route[ri3].lng),projY(route[ri3].lat));
        }
        ctx.lineTo(projX(dotP.lng),projY(dotP.lat));
        ctx.strokeStyle='rgba(255,255,255,0.55)';ctx.lineWidth=2.5/cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
      }
    }

    // Start dot
    ctx.beginPath();ctx.arc(projX(route[0].lng),projY(route[0].lat),8/cam.zoom,0,Math.PI*2);ctx.fillStyle='#4CAF50';ctx.fill();

    // Moving dot — pulsant + glow
    var pulse=1+0.22*Math.sin(el/150);
    ctx.beginPath();ctx.arc(dotX,dotY,20*pulse/cam.zoom,0,Math.PI*2);ctx.fillStyle=opts.color+'26';ctx.fill();
    ctx.beginPath();ctx.arc(dotX,dotY,10/cam.zoom,0,Math.PI*2);
    ctx.shadowColor=opts.color;ctx.shadowBlur=16;ctx.fillStyle=opts.color;ctx.fill();ctx.shadowBlur=0;
    ctx.beginPath();ctx.arc(dotX,dotY,4/cam.zoom,0,Math.PI*2);ctx.fillStyle='#FFFFFF';ctx.fill();

    ctx.restore(); // fin clip + caméra

    // Scale bar — seulement quand la vue est dézoomée (sinon échelle fausse)
    if(cam.zoom<1.15){
      ctx.strokeStyle=THEME.captionColor;ctx.lineWidth=2.5;ctx.lineCap='butt';
      ctx.beginPath();ctx.moveTo(scBarX1,scBarY);ctx.lineTo(scBarX2,scBarY);ctx.stroke();
      ctx.beginPath();ctx.moveTo(scBarX1,scBarY-7);ctx.lineTo(scBarX1,scBarY+7);ctx.stroke();
      ctx.beginPath();ctx.moveTo(scBarX2,scBarY-7);ctx.lineTo(scBarX2,scBarY+7);ctx.stroke();
      ctx.fillStyle=THEME.captionColor;ctx.font='22px Arial,sans-serif';ctx.textAlign='center';
      ctx.fillText(scLabel,(scBarX1+scBarX2)/2,scBarY-11);
    }

    // ── Stats panel ───────────────────────────────────────────────────────────
    var ci2=getChartIdxAtMs(currentMs);
    var curPt=pts[ci2]||pts[0];
    ctx.fillStyle=THEME.footerBg;ctx.fillRect(0,800,cW,115);
    ctx.strokeStyle=opts.color+'22';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,800);ctx.lineTo(cW,800);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,915);ctx.lineTo(cW,915);ctx.stroke();
    ctx.fillStyle=opts.color;ctx.font='bold 84px Arial,sans-serif';ctx.textAlign='center';
    var spdLabel=opts.showPace?formatPace(curPt.spd):(curPt.spd||0).toFixed(1)+' km/h';
    ctx.fillText(spdLabel,cW/2,882);
    var elSec=Math.round(currentMs/1000);
    var elMin=Math.floor(elSec/60);var elH=Math.floor(elMin/60);
    var elLabel=elH>0?elH+'h'+(elMin%60<10?'0':'')+(elMin%60):(elMin<1?'< 1':elMin)+' min';
    ctx.fillStyle=THEME.captionColor;ctx.font='28px Arial,sans-serif';
    ctx.fillText((curKm||0).toFixed(2)+' km \\xB7 '+elLabel,cW/2,928);

    // ── Speed chart — time axis, pause gaps in line ───────────────────────────
    var sL=50,sR=670,sTop=965,sH=85;
    ctx.fillStyle=THEME.panelBg;ctx.fillRect(sL-5,sTop-5,sR-sL+10,sH+10);
    ctx.fillStyle=THEME.captionColor;ctx.font='20px Arial,sans-serif';ctx.textAlign='left';
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
      ctx.fillStyle=THEME.panelBg;ctx.fillRect(sL-5,aTop-5,sR-sL+10,aH+10);
      ctx.fillStyle=THEME.captionColor;ctx.font='20px Arial,sans-serif';ctx.textAlign='left';ctx.fillText('ALTITUDE',sL,aTop-14);
      var pts3=visPts.filter(function(p){return p.alt!=null;});
      if(pts3.length>1){
        ctx.beginPath();
        ctx.moveTo(sL+(pts3[0].ms/totalMs)*(sR-sL),aTop+aH);
        for(var k=0;k<pts3.length;k++){
          ctx.lineTo(sL+(pts3[k].ms/totalMs)*(sR-sL),aTop+aH-((pts3[k].alt-opts.minAlt)/altSpan)*aH);
        }
        ctx.lineTo(sL+(pts3[pts3.length-1].ms/totalMs)*(sR-sL),aTop+aH);
        ctx.closePath();ctx.fillStyle=THEME.subColor+'22';ctx.fill();
        ctx.beginPath();
        for(var k2=0;k2<pts3.length;k2++){
          var apx2=sL+(pts3[k2].ms/totalMs)*(sR-sL);
          var apy2=aTop+aH-((pts3[k2].alt-opts.minAlt)/altSpan)*aH;
          if(k2===0)ctx.moveTo(apx2,apy2);else ctx.lineTo(apx2,apy2);
        }
        ctx.strokeStyle=THEME.subColor;ctx.lineWidth=2.5;ctx.stroke();
      }
    }

    // End card fade-in
    if(aProg>0.82){
      var fa=Math.min(1,(aProg-0.82)/0.12);ctx.globalAlpha=fa;
      var bY=opts.hasAlt?1235:1165;
      ctx.fillStyle=THEME.endBg;ctx.fillRect(0,bY-52,cW,cH-bY+52);
      ctx.fillStyle=THEME.titleColor;ctx.font='bold 32px Arial,sans-serif';ctx.textAlign='center';
      var bestLabel=opts.showPace?('MEILLEURE '+formatPace(opts.maxSpeed)):('MAX '+opts.maxSpeed.toFixed(1)+' km/h');
      var stats=bestLabel;
      if(opts.gainM>0)stats+=(' \\xB7 +'+opts.gainM+' m');
      stats+=(' \\xB7 '+opts.distKm+' km');
      ctx.fillText(stats,cW/2,bY+2);
      ctx.fillStyle=THEME.captionColor;ctx.font='26px Arial,sans-serif';ctx.fillText(opts.timeLabel,cW/2,bY+42);
      ctx.globalAlpha=1;
    }

    // ── Pause photo : overlay plein cadre, image non déformée + note ───────────
    if(pauseActive&&pauseActive.marker.imgEl){
      var pm3=pauseActive.marker,im=pm3.imgEl;
      ctx.fillStyle='rgba(6,7,10,0.86)';ctx.fillRect(0,0,cW,cH);
      var boxL=50,boxT=220,boxR=cW-50,boxB=cH-220;
      var boxW=boxR-boxL,boxH=boxB-boxT;
      var ir=im.naturalWidth/im.naturalHeight,br=boxW/boxH;
      var dw,dh;
      if(ir>br){dw=boxW;dh=boxW/ir;}else{dh=boxH;dw=boxH*ir;}
      var dx=boxL+(boxW-dw)/2,dy=boxT+(boxH-dh)/2;
      ctx.save();ctx.shadowColor='#000000CC';ctx.shadowBlur=30;
      ctx.drawImage(im,dx,dy,dw,dh);
      ctx.restore();
      ctx.strokeStyle='#FFFFFF22';ctx.lineWidth=2;ctx.strokeRect(dx,dy,dw,dh);
      if(pm3.note){
        ctx.fillStyle='#FFFFFF';ctx.font='30px Arial,sans-serif';ctx.textAlign='center';
        ctx.fillText(pm3.note,cW/2,boxB+56,cW-100);
      }
    }

    if(el-lastRep>400){lastRep=el;window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_progress',p:Math.round(prog*100)}));}
    if(prog<1){requestAnimationFrame(frame);}else{setTimeout(function(){rec.stop();},300);}
  }
};
})();
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
