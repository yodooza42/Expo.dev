/**
 * Story Période v2 — génère une vidéo de TOUS les trajets d'une période donnée.
 *
 * Animation :
 *  - Phase 1 (0 → vidéoDur-5s) : dot se déplace sur chaque trajet dans l'ordre chrono.
 *    Caméra pré-calculée par trajet : vol fluide (ease in/out, zoom log) vers un cadrage
 *    SERRÉ du trajet actif — même une balade à pied de 500 m remplit l'écran.
 *  - Temps d'écran par trajet ∝ √km : les petits trajets restent visibles.
 *  - Phase 2 (dernières 5s) : dézoome sur la vue globale + récapitulatif stats.
 *
 * opts = {
 *   trips: Array<{
 *     route: Array<{lat:number, lng:number}>,
 *     distKm: number,
 *     durationMs: number,
 *     vehicleType: 'car'|'moto'|'walk',
 *     dateLabel: string,
 *     note?: string,             // remplace le libellé "trajet X/N · date" tant que ce trajet est actif
 *     photos?: Array<{
 *       img: string,             // data URI (base64) de la photo, format original conservé
 *       note?: string,
 *       frac: number,            // 0..1 — position le long du tracé où la lecture doit se figer
 *     }>,
 *   }>,
 *   periodLabel: string,          // e.g. "juil. 2026" ou "1–31 juil. 2026"
 *   tripCountLabel: string,       // e.g. "42 trajets"
 *   driveDurLabel: string,        // e.g. "🚗 12h30"
 *   walkDurLabel: string,         // e.g. "  ·  🚶 3h15"
 *   videoDurationSec: number,
 *   customName?: string,         // e.g. "Road trip La Rochelle" — remplace periodLabel si fourni
 *   dateRangeLabel?: string,     // e.g. "du 13 au 15 Août 2026" — affiché sous customName
 *   theme?: 'dark'|'light'|'satellite', // défaut 'dark'
 * }
 *
 * Photos : quand la progression d'un trajet atteint le point ancré d'une photo, l'animation
 * se fige (durée réelle ajoutée au budget total de la vidéo, sans accélérer le reste) pendant
 * PHOTO_PAUSE_MS, affiche la photo en plein cadre (contain, ratio d'origine préservé) avec sa
 * note éventuelle, puis reprend exactement où elle s'était arrêtée.
 *
 * Thèmes : 'dark' (défaut) et 'light' ne changent que la palette de couleurs (aucune
 * dépendance réseau). 'satellite' télécharge et assemble de vraies tuiles satellite (Esri
 * World Imagery, gratuit, sans clé API) en fond de la zone carte, une mosaïque par trajet
 * (+ une globale pour le récapitulatif final), avant le lancement de l'enregistrement — comme
 * le préchargement des photos existant. La projection est en Web Mercator (comme les tuiles)
 * pour que le tracé reste pixel-aligné avec l'imagerie. Si l'assemblage échoue (réseau,
 * timeout, trop de tuiles), on retombe automatiquement sur le thème 'dark' et on prévient
 * React Native via un message `story_theme_fallback`.
 */
export const STORY_PERIOD_JS = `
(function(){
  /* ── Cache de tuiles satellite ─────────────────────────────────────────
     Deux niveaux, partagés par tous les appels à generatePeriodStory() dans cette
     session WebView (déclarés dans cette IIFE, hors de la fonction, donc jamais
     recréés) :
       1. Mémoire (TILE_MEM) : Image déjà décodée → réutilisation instantanée,
          sans réseau ni redécodage, tant que la page WebView reste chargée
          (régénérer la même période plusieurs fois de suite, ex. pour ajuster
          le nom ou la durée).
       2. localStorage (best-effort, survit aux rechargements de la page WebView
          et, quand l'origine du WebView est stable, aux redémarrages de l'appli) :
          tuile encodée en JPEG data URI, avec un index FIFO pour plafonner la
          taille et éviter un QuotaExceededError.
     En cas d'échec (quota dépassé, stockage indisponible, canvas "tainted"), on
     retombe silencieusement sur un téléchargement réseau classique : le cache est
     une pure optimisation, jamais un point de défaillance. */
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
  /* Charge une tuile (mémoire → disque → réseau) puis dessine dans cctx à (dx,dy).
     cb() est appelé une fois la tuile traitée (succès ou échec), jamais avant. */
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
  var rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3600000});
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
  var CAM_SLOWDOWN=50; /* facteur de ralenti du curseur pendant le vol de caméra */
  var PHOTO_PAUSE_MS=2000;
  var VCL={car:'#2196F3',moto:'#FF9800',walk:'#4CAF50'};
  var VEMO={car:'\\uD83D\\uDE97',moto:'\\uD83C\\uDFCD',walk:'\\uD83D\\uDEB6'};

  /* ── Thème ─────────────────────────────────────────────────────────────
     'dark'/'light' ne changent que la palette. 'satellite' réutilise la palette
     'dark' (texte lisible sur imagerie photo) et active le dessin de tuiles réelles
     en fond de carte ; en cas d'échec réseau, effTheme retombe sur 'dark'. */
  var requestedTheme=opts.theme||'dark';
  var effTheme=requestedTheme;
  var PALETTES={
    dark:{
      bgGrad0:'#151820',bgGrad1:'#0A0B0E',gridStroke:'#FFFFFF06',
      headerBg:'#12141Acc',headerSep:'#FFFFFF12',
      titleColor:'#FFFFFF',subColor:'#8A8F99',captionColor:'#565B66',
      ghostStroke:'#FFFFFF0C',footerBg:'#101218',footerSep:'#FFFFFF14',
      barBg:'#22252E',gold:'#FFC107',
    },
    light:{
      bgGrad0:'#F4F5F8',bgGrad1:'#E2E5EB',gridStroke:'#00000008',
      headerBg:'#FFFFFFcc',headerSep:'#00000012',
      titleColor:'#161A20',subColor:'#5B616C',captionColor:'#9198A4',
      ghostStroke:'#0000000C',footerBg:'#FFFFFF',footerSep:'#00000014',
      barBg:'#E4E7EC',gold:'#B8860B',
    },
  };
  function palette(){return PALETTES[effTheme==='light'?'light':'dark'];}

  /* ── Photos ancrées — préchargées avant le début de l'enregistrement ──── */
  var photoMarkersRaw=[]; /* [{tripIdx, note, frac, src}] — position absolue calculée plus bas, une fois tStart/tDurOf connus */
  for(var pti=0;pti<trips.length;pti++){
    var tps=(trips[pti].photos||[]).slice().sort(function(a,b){return a.frac-b.frac;});
    for(var pj=0;pj<tps.length;pj++)photoMarkersRaw.push({tripIdx:pti,note:tps[pj].note||'',frac:tps[pj].frac,src:tps[pj].img,imgEl:null,triggered:false});
  }
  var totalPauseMs=photoMarkersRaw.length*PHOTO_PAUSE_MS;

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
  var lngSp=maxLng-minLng;

  /* ── Projection map (zone centrale) — Web Mercator, comme les tuiles satellite ──
     (nécessaire pour que le tracé reste pixel-aligné avec l'imagerie en thème satellite ;
     à l'échelle d'un trajet la différence avec une projection equirectangulaire est
     imperceptible pour les thèmes dark/light). */
  // *(180/Math.PI) : ramène le résultat (en radians) à une échelle comparable aux degrés
  // de longitude — sans ça mercSp est ~57x plus petit que lngSp, ce qui fait croire
  // à rAsp que le trajet est bien plus large que haut et écrase la carte à quelques px de haut.
  function mercY(lat){return Math.log(Math.tan(Math.PI/4+(lat*Math.PI/180)/2))*(180/Math.PI);}
  var minMerc=mercY(minLat),maxMerc=mercY(maxLat),mercSp=(maxMerc-minMerc)||0.0001;

  var headerH=opts.customName?214:180;
  var mT=headerH+5,mB=800,mL=40,mR=680;
  var mW=mR-mL,mH=mB-mT;
  var rAsp=lngSp/mercSp,mapAsp=mW/mH;
  if(rAsp>mapAsp){var nH=mW/rAsp;mT+=(mH-nH)/2;mB=mT+nH;mH=nH;}
  else{var nW=mH*rAsp;mL+=(mW-nW)/2;mR=mL+nW;mW=nW;}
  var mCX=(mL+mR)/2,mCY=(mT+mB)/2;
  function pX(lng){return mL+(lng-minLng)/lngSp*mW;}
  function pY(lat){return mB-(mercY(lat)-minMerc)/mercSp*mH;}

  /* ── Imagerie satellite (thème 'satellite') ──────────────────────────────
     Tuiles XYZ Web Mercator standard, source Esri World Imagery (gratuite, sans clé API,
     CORS activé). Une mosaïque par trajet (bbox du trajet + marge) + une globale pour le
     récapitulatif final, assemblées en canvas offscreen avant l'enregistrement. */
  var SAT_MAX_TILES=36;
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
  function bboxOfTrip(t){
    var rr=t.route,la0=rr[0].lat,la1=la0,ln0=rr[0].lng,ln1=ln0;
    for(var k=1;k<rr.length;k++){var p=rr[k];if(p.lat<la0)la0=p.lat;if(p.lat>la1)la1=p.lat;if(p.lng<ln0)ln0=p.lng;if(p.lng>ln1)ln1=p.lng;}
    var padLa=(la1-la0)*0.3||0.003,padLn=(ln1-ln0)*0.3||0.003;
    return{latMin:la0-padLa,latMax:la1+padLa,lngMin:ln0-padLn,lngMax:ln1+padLn};
  }
  var satMosaics=[]; /* un par trajet */
  var satGlobalMosaic=null;
  var satReady=(requestedTheme!=='satellite');

  /* ── Caméra par trajet — cadrage serré, zoom quasi illimité ──────────── */
  function camForTrip(t){
    var rr=t.route;
    var x0=pX(rr[0].lng),x1=x0,y0=pY(rr[0].lat),y1=y0;
    for(var k=1;k<rr.length;k++){var xx=pX(rr[k].lng),yy=pY(rr[k].lat);if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;}
    var cx=(x0+x1)/2,cy=(y0+y1)/2;
    var pw=(x1-x0)*1.45||8,ph=(y1-y0)*1.45||8;
    var z=Math.min(mW/pw,mH/ph);
    return{cx:cx,cy:cy,zoom:Math.max(1.08,Math.min(z,600))};
  }
  var cams=[];
  for(var ti=0;ti<trips.length;ti++)cams.push(camForTrip(trips[ti]));
  var fullCam={cx:mCX,cy:mCY,zoom:1};

  function easeIO(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
  function lerpCam(a,b,t){
    return{cx:a.cx+(b.cx-a.cx)*t,cy:a.cy+(b.cy-a.cy)*t,
      zoom:Math.exp(Math.log(a.zoom)+(Math.log(b.zoom)-Math.log(a.zoom))*t)};
  }

  /* ── Allocation du temps par trajet (∝ √km → petits trajets visibles) ── */
  var DUR=(opts.videoDurationSec||20)*1000;
  var END_MS=5000;
  var animMs=DUR-END_MS;
  var wts=[],totW=0;
  for(var ti=0;ti<trips.length;ti++){wts.push(Math.sqrt((trips[ti].distKm||0.2)+0.4));totW+=wts[ti];}
  var tStart=[0];
  for(var ti=1;ti<trips.length;ti++)tStart.push(tStart[ti-1]+(wts[ti-1]/totW)*animMs);
  function tDurOf(ti){return(wts[ti]/totW)*animMs;}
  var totKm=0;
  for(var ti=0;ti<trips.length;ti++)totKm+=trips[ti].distKm||0.5;

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

  /* IMPORTANT : seul DUR (budget réel d'enregistrement) grandit avec les pauses photo.
     animMs reste la durée "virtuelle" d'animation (hors pauses) sur laquelle tStart/tDurOf
     sont basés — l'étendre ici désynchroniserait les bornes de trajet (tStart, calculées
     juste au-dessus avec l'ancien animMs) de leur durée (tDurOf, qui lirait le nouvel animMs
     par closure), coupant les trajets trop tôt / les faisant sauter au suivant. */
  DUR+=totalPauseMs;

  /* ── Position absolue (en aEl, temps d'animation hors pauses) de chaque photo ──
     Calculée une fois que tStart/tDurOf sont connus. Utiliser une position absolue plutôt
     que "tripIdx===ci && tProg>=frac" évite la course avec le changement de trajet (une
     photo en frac≈1 ou frac≈0 pouvait ne jamais matcher car ci changeait juste avant/après),
     et permet à plusieurs photos au même endroit de s'enchaîner automatiquement : aEl reste
     figé pendant une pause, donc dès qu'elle se termine, la photo suivante à la même position
     absolue est immédiatement éligible. */
  var photoMarkers=photoMarkersRaw.map(function(m){
    return{tripIdx:m.tripIdx,note:m.note,frac:m.frac,src:m.src,imgEl:null,triggered:false,
      absAEl:tStart[m.tripIdx]+m.frac*tDurOf(m.tripIdx)};
  }).sort(function(a,b){return a.absAEl-b.absAEl;});

  var t0=null,lastRep=0;
  var pauseActive=null; /* {marker, anchorEl, anchorConsumed} */
  var pauseConsumedMs=0;

  function startRecording(){
    rec.start();
    requestAnimationFrame(frame);
  }

  function preloadPhotosThenStart(){
    if(photoMarkers.length===0){startRecording();return;}
    var loaded=0,settled=false;
    var finish=function(){if(settled)return;settled=true;startRecording();};
    var to=setTimeout(finish,6000); /* garde-fou si une image ne charge jamais */
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
    var mosaicPromises=trips.map(function(t){return buildSatMosaic(bboxOfTrip(t),mW,mH);});
    mosaicPromises.push(buildSatMosaic({latMin:minLat,latMax:maxLat,lngMin:minLng,lngMax:maxLng},mW,mH));
    var overallGuard=Math.min(25000,6000+trips.length*1500);
    var guardTo=setTimeout(function(){ /* garde-fou global : si ça traîne trop, on abandonne le satellite */
      effTheme='dark';
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_theme_fallback',reason:'timeout'}));
      preloadPhotosThenStart();
    },overallGuard);
    Promise.all(mosaicPromises).then(function(results){
      clearTimeout(guardTo);
      var ok=results.every(function(r){return r!=null;});
      if(!ok){
        effTheme='dark';
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_theme_fallback',reason:'tiles'}));
      }else{
        satMosaics=results.slice(0,trips.length);
        satGlobalMosaic=results[results.length-1];
      }
      preloadPhotosThenStart();
    });
  }

  /* ── Boucle d'animation ──────────────────────────────────────────────── */
  function frame(ts){
    if(!t0)t0=ts;
    var el=ts-t0,prog=Math.min(1,el/DUR);
    var THEME=palette();

    /* Pause photo en cours : fige la progression, garde le rendu figé, avance seulement le temps réel */
    if(pauseActive){
      pauseConsumedMs=pauseActive.anchorConsumed+(el-pauseActive.anchorEl);
      if(el-pauseActive.anchorEl>=PHOTO_PAUSE_MS){
        pauseConsumedMs=pauseActive.anchorConsumed+PHOTO_PAUSE_MS;
        pauseActive=null;
      }
    }
    var vEl=Math.max(0,el-pauseConsumedMs);
    var isEnd=vEl>=animMs;
    var endProg=isEnd?Math.min(1,(vEl-animMs)/END_MS):0;
    var aEl=Math.min(vEl,animMs);

    /* Trajet courant */
    var ci=trips.length-1;
    for(var ti=0;ti<trips.length-1;ti++){if(aEl<tStart[ti+1]){ci=ti;break;}}
    var tEl=aEl-tStart[ci];
    var tDur=tDurOf(ci);
    var transMs=Math.min(750,tDur*0.38);

    /* Curseur ralenti pendant le vol de caméra (CAM_SLOWDOWN×) : le trajet
       n'avance quasi pas tant que la caméra converge, puis rattrape le
       temps restant à vitesse normale sur le reste du segment. */
    var pEndSlow=(transMs/CAM_SLOWDOWN)/(tDur||1);
    var tProg;
    if(isEnd){
      tProg=1;
    }else if(tEl<=transMs){
      tProg=Math.min(pEndSlow,(tEl/CAM_SLOWDOWN)/(tDur||1));
    }else{
      var remainMs=(tDur-transMs)||1;
      tProg=Math.min(1,pEndSlow+((tEl-transMs)/remainMs)*(1-pEndSlow));
    }

    /* Déclenchement d'une pause photo : dès que la position absolue (aEl) d'une photo
       pas encore montrée est atteinte. Comparaison sur aEl (indépendante de ci/tProg)
       pour ne jamais rater une photo en tout début/fin de trajet, et pour enchaîner
       automatiquement plusieurs photos ancrées au même endroit. */
    if(!pauseActive){
      for(var pmi=0;pmi<photoMarkers.length;pmi++){
        var pm=photoMarkers[pmi];
        if(!pm.triggered&&aEl>=pm.absAEl){
          pm.triggered=true;
          pauseActive={marker:pm,anchorEl:el,anchorConsumed:pauseConsumedMs};
          break;
        }
      }
    }

    /* Caméra : vol eased entre cams pré-calculées (converge TOUJOURS) */
    var cam;
    if(isEnd){
      var eT=Math.min(1,(el-animMs)/1400);
      cam=lerpCam(cams[trips.length-1]||fullCam,fullCam,easeIO(eT));
    }else{
      var prevCam=ci>0?cams[ci-1]:fullCam;
      if(tEl<transMs)cam=lerpCam(prevCam,cams[ci],easeIO(tEl/transMs));
      else cam=cams[ci];
    }

    /* Position exacte sur le tracé actif (réutilisée pour l'heure temps réel + le dessin) */
    var activeRoute=trips[ci].route;
    var exI=0,flI=0,frI=0;
    if(!isEnd&&activeRoute&&activeRoute.length>1){
      exI=idxAtFrac(ci,tProg);flI=Math.floor(exI);frI=exI-flI;
      if(flI>=activeRoute.length-1){flI=activeRoute.length-2;frI=1;}
    }

    /* Background : dégradé radial + grille subtile (couvert par l'imagerie satellite
       dans la zone carte quand ce thème est actif et prêt) */
    var bg=ctx.createRadialGradient(cW/2,cH*0.38,80,cW/2,cH*0.38,900);
    bg.addColorStop(0,THEME.bgGrad0);bg.addColorStop(1,THEME.bgGrad1);
    ctx.fillStyle=bg;ctx.fillRect(0,0,cW,cH);
    ctx.strokeStyle=THEME.gridStroke;ctx.lineWidth=1;
    for(var gx=0;gx<cW;gx+=60){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,cH);ctx.stroke();}
    for(var gy=0;gy<cH;gy+=60){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(cW,gy);ctx.stroke();}

    /* Header */
    ctx.fillStyle=THEME.headerBg;ctx.fillRect(0,0,cW,headerH);
    var dispKm=(isEnd?totKm:(accKm[ci]+(trips[ci].distKm||0)*tProg)).toFixed(1);
    /* Heure temps réel : timestamp GPS exact du point où se trouve le curseur si
       disponible (trace GPS brute), sinon interpolation uniforme sur la durée
       du trajet (tracé OSRM synthétique, sans horodatage par point). */
    var liveTimeStr='';
    if(!isEnd){
      var curMs=null;
      if(activeRoute&&activeRoute.length>1&&activeRoute[flI]&&activeRoute[flI].t!=null&&activeRoute[Math.min(flI+1,activeRoute.length-1)].t!=null){
        var ptA=activeRoute[flI],ptB=activeRoute[Math.min(flI+1,activeRoute.length-1)];
        curMs=ptA.t+(ptB.t-ptA.t)*frI;
      }else if(trips[ci].startTimeMs){
        curMs=trips[ci].startTimeMs+(trips[ci].durationMs||0)*tProg;
      }
      if(curMs!=null){
        var cd=new Date(curMs);
        var hh=cd.getHours(),mm=cd.getMinutes();
        liveTimeStr=(hh<10?'0':'')+hh+':'+(mm<10?'0':'')+mm;
      }
    }
    var captionTxt=isEnd?'R\\xE9capitulatif':trips[ci].note?((VEMO[trips[ci].vehicleType]||'')+'  '+trips[ci].note):((VEMO[trips[ci].vehicleType]||'')+'  '+trips[ci].dateLabel+(liveTimeStr?'  \\xB7  '+liveTimeStr:''));
    if(opts.customName){
      ctx.fillStyle=THEME.titleColor;ctx.font='bold 40px Arial,sans-serif';ctx.textAlign='center';
      ctx.fillText(opts.customName,cW/2,58);
      ctx.fillStyle=THEME.subColor;ctx.font='26px Arial,sans-serif';
      ctx.fillText(opts.dateRangeLabel||'',cW/2,96);
      ctx.fillStyle=THEME.subColor;ctx.font='24px Arial,sans-serif';
      ctx.fillText(opts.tripCountLabel+'  \\xB7  '+totKm.toFixed(1)+' km',cW/2,132);
      ctx.fillStyle=THEME.captionColor;ctx.font='20px Arial,sans-serif';
      ctx.fillText(captionTxt,cW/2,170);
    } else {
      ctx.fillStyle=THEME.titleColor;ctx.font='bold 42px Arial,sans-serif';ctx.textAlign='center';
      ctx.fillText('\\uD83D\\uDDFA\\uFE0F  '+opts.periodLabel,cW/2,65);
      ctx.fillStyle=THEME.subColor;ctx.font='26px Arial,sans-serif';
      ctx.fillText(opts.tripCountLabel+'  \\xB7  '+dispKm+' km',cW/2,105);
      ctx.fillStyle=THEME.captionColor;ctx.font='22px Arial,sans-serif';
      ctx.fillText(captionTxt,cW/2,142);
    }
    ctx.strokeStyle=THEME.headerSep;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,headerH);ctx.lineTo(cW,headerH);ctx.stroke();

    /* Zone carte avec clip + transform caméra */
    ctx.save();
    ctx.beginPath();ctx.rect(38,mT-2,684,mB-mT+7);ctx.clip();
    ctx.translate(mCX,mCY);ctx.scale(cam.zoom,cam.zoom);ctx.translate(-cam.cx,-cam.cy);

    /* Imagerie satellite (thème satellite, prête) : dessinée dans le même repère que
       le tracé (translate/scale ci-dessus) pour rester parfaitement alignée pendant
       le vol de caméra. */
    if(effTheme==='satellite'){
      var mosaic=isEnd?satGlobalMosaic:(satMosaics[ci]||satGlobalMosaic);
      if(mosaic){
        var sx0=pX(mosaic.lngLeft),sx1=pX(mosaic.lngRight);
        var sy0=pY(mosaic.latTop),sy1=pY(mosaic.latBottom);
        ctx.drawImage(mosaic.canvas,sx0,sy0,sx1-sx0,sy1-sy0);
        ctx.fillStyle='rgba(6,7,10,0.22)';ctx.fillRect(sx0,sy0,sx1-sx0,sy1-sy0);
      }
    }

    /* Ghost (tous les tracés, très transparent) */
    for(var ti=0;ti<trips.length;ti++){
      var rr=trips[ti].route;if(rr.length<2)continue;
      ctx.beginPath();ctx.moveTo(pX(rr[0].lng),pY(rr[0].lat));
      for(var ri=1;ri<rr.length;ri++)ctx.lineTo(pX(rr[ri].lng),pY(rr[ri].lat));
      ctx.strokeStyle=THEME.ghostStroke;ctx.lineWidth=2.5/cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    }

    /* Trajets terminés */
    var compLimit=isEnd?trips.length:ci;
    for(var ti=0;ti<compLimit;ti++){
      var rr=trips[ti].route;if(rr.length<2)continue;
      var col=VCL[trips[ti].vehicleType]||'#2196F3';
      ctx.beginPath();ctx.moveTo(pX(rr[0].lng),pY(rr[0].lat));
      for(var ri=1;ri<rr.length;ri++)ctx.lineTo(pX(rr[ri].lng),pY(rr[ri].lat));
      ctx.strokeStyle=col;ctx.lineWidth=(isEnd?5:3.5)/cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';
      ctx.globalAlpha=isEnd?0.85:0.5;ctx.stroke();ctx.globalAlpha=1;
      ctx.beginPath();ctx.arc(pX(rr[0].lng),pY(rr[0].lat),5/cam.zoom,0,Math.PI*2);ctx.fillStyle=col+'99';ctx.fill();
    }

    /* Trajet actif */
    if(!isEnd){
      var rr=trips[ci].route;
      var col=VCL[trips[ci].vehicleType]||'#2196F3';

      /* Aperçu du parcours complet (fantôme coloré) */
      if(rr.length>=2){
        ctx.beginPath();ctx.moveTo(pX(rr[0].lng),pY(rr[0].lat));
        for(var ri=1;ri<rr.length;ri++)ctx.lineTo(pX(rr[ri].lng),pY(rr[ri].lat));
        ctx.strokeStyle=col+'38';ctx.lineWidth=4/cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
        /* Marqueur destination */
        var rl=rr[rr.length-1];
        ctx.beginPath();ctx.arc(pX(rl.lng),pY(rl.lat),6/cam.zoom,0,Math.PI*2);
        ctx.strokeStyle=col+'AA';ctx.lineWidth=2/cam.zoom;ctx.stroke();
      }

      /* Tracé révélé progressivement — avec glow (exI/flI/frI déjà calculés ci-dessus) */
      if(exI>0){
        ctx.beginPath();ctx.moveTo(pX(rr[0].lng),pY(rr[0].lat));
        for(var ri=1;ri<=flI&&ri<rr.length;ri++)ctx.lineTo(pX(rr[ri].lng),pY(rr[ri].lat));
        if(frI>0&&flI+1<rr.length){var pa=rr[flI],pb=rr[flI+1];ctx.lineTo(pX(pa.lng+(pb.lng-pa.lng)*frI),pY(pa.lat+(pb.lat-pa.lat)*frI));}
        ctx.shadowColor=col;ctx.shadowBlur=14;
        ctx.strokeStyle=col;ctx.lineWidth=6.5/cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';ctx.globalAlpha=0.95;ctx.stroke();ctx.globalAlpha=1;
        ctx.shadowBlur=0;
      }
      /* Dot départ */
      ctx.beginPath();ctx.arc(pX(rr[0].lng),pY(rr[0].lat),7/cam.zoom,0,Math.PI*2);ctx.fillStyle='#4CAF50';ctx.fill();
      /* Dot mobile pulsant */
      var dLn,dLa;
      if(exI<=0){dLn=rr[0].lng;dLa=rr[0].lat;}
      else{
        var cpI=Math.min(flI,rr.length-2),cpF=Math.min(exI-cpI,1);
        var cpA=rr[cpI],cpB=rr[Math.min(cpI+1,rr.length-1)];
        dLn=cpA.lng+(cpB.lng-cpA.lng)*cpF;dLa=cpA.lat+(cpB.lat-cpA.lat)*cpF;
      }
      var pulse=1+0.22*Math.sin(el/150);
      ctx.beginPath();ctx.arc(pX(dLn),pY(dLa),20*pulse/cam.zoom,0,Math.PI*2);ctx.fillStyle=col+'26';ctx.fill();
      ctx.beginPath();ctx.arc(pX(dLn),pY(dLa),11/cam.zoom,0,Math.PI*2);
      ctx.shadowColor=col;ctx.shadowBlur=16;ctx.fillStyle=col;ctx.fill();ctx.shadowBlur=0;
      ctx.beginPath();ctx.arc(pX(dLn),pY(dLa),4/cam.zoom,0,Math.PI*2);ctx.fillStyle='#FFFFFF';ctx.fill();
    }

    ctx.restore(); /* fin clip + caméra */

    /* ── Panneau stats bas ────────────────────────────────────────────── */
    ctx.fillStyle=THEME.footerBg;ctx.fillRect(0,800,cW,cH-800);
    ctx.strokeStyle=THEME.footerSep;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,800);ctx.lineTo(cW,800);ctx.stroke();

    if(!isEnd){
      /* Phase animation : km courant + infos trajet */
      var col=VCL[trips[ci].vehicleType]||'#2196F3';
      ctx.fillStyle=col;ctx.font='bold 80px Arial,sans-serif';ctx.textAlign='center';
      ctx.fillText((accKm[ci]+(trips[ci].distKm||0)*tProg).toFixed(1)+' km',cW/2,884);
      ctx.fillStyle=THEME.captionColor;ctx.font='26px Arial,sans-serif';
      ctx.fillText('trajet '+(ci+1)+' / '+trips.length+'  \\xB7  '+trips[ci].dateLabel,cW/2,928);

      /* Barre de progression segmentée (1 segment par trajet) */
      var barL=60,barR=660,barY=966,barH=10,barW=barR-barL;
      var bx=barL;
      for(var si=0;si<trips.length;si++){
        var segW=(wts[si]/totW)*barW;
        var sCol=VCL[trips[si].vehicleType]||'#2196F3';
        ctx.fillStyle=THEME.barBg;
        ctx.fillRect(bx,barY,Math.max(segW-2,1),barH);
        if(si<ci){ctx.fillStyle=sCol;ctx.fillRect(bx,barY,Math.max(segW-2,1),barH);}
        else if(si===ci){ctx.fillStyle=sCol;ctx.fillRect(bx,barY,Math.max((segW-2)*tProg,0),barH);}
        bx+=segW;
      }

      /* Légende par véhicule */
      var lIt=[],lY=1030;
      if(cKm>0)lIt.push({t:'\\uD83D\\uDE97 '+cKm.toFixed(0)+' km',c:'#2196F3'});
      if(mKm>0)lIt.push({t:'\\uD83C\\uDFCD '+mKm.toFixed(0)+' km',c:'#FF9800'});
      if(wKm>0)lIt.push({t:'\\uD83D\\uDEB6 '+wKm.toFixed(0)+' km',c:'#4CAF50'});
      var iW=cW/(lIt.length||1);
      for(var si=0;si<lIt.length;si++){ctx.fillStyle=lIt[si].c;ctx.font='24px Arial,sans-serif';ctx.fillText(lIt[si].t,iW*(si+0.5),lY);}
    } else {
      /* Phase end card : recap complet, fade-in */
      var fa=Math.min(1,endProg*2.2);ctx.globalAlpha=fa;
      ctx.fillStyle=THEME.titleColor;ctx.font='bold 46px Arial,sans-serif';ctx.textAlign='center';
      ctx.fillText(opts.periodLabel,cW/2,856);
      ctx.fillStyle=THEME.gold;ctx.font='bold 100px Arial,sans-serif';
      ctx.fillText(totKm.toFixed(0)+' km',cW/2,968);
      ctx.fillStyle=THEME.subColor;ctx.font='28px Arial,sans-serif';
      ctx.fillText(opts.tripCountLabel,cW/2,1012);

      /* Détail par véhicule — apparition décalée */
      var eIt=[],eY=1082;
      if(cKm>0)eIt.push({t:'\\uD83D\\uDE97 '+cKm.toFixed(0)+' km',c:'#2196F3'});
      if(mKm>0)eIt.push({t:'\\uD83C\\uDFCD '+mKm.toFixed(0)+' km',c:'#FF9800'});
      if(wKm>0)eIt.push({t:'\\uD83D\\uDEB6 '+wKm.toFixed(0)+' km',c:'#4CAF50'});
      var eW=cW/(eIt.length||1);
      for(var si=0;si<eIt.length;si++){
        var sf=Math.max(0,Math.min(1,(endProg-0.12-si*0.1)*3));
        ctx.globalAlpha=fa*sf;
        ctx.fillStyle=eIt[si].c;ctx.font='bold 30px Arial,sans-serif';ctx.fillText(eIt[si].t,eW*(si+0.5),eY);
      }
      ctx.globalAlpha=fa;

      /* Durées */
      var durLine=(opts.driveDurLabel||'')+(opts.walkDurLabel||'');
      if(durLine){ctx.fillStyle=THEME.captionColor;ctx.font='24px Arial,sans-serif';ctx.fillText(durLine,cW/2,1142);}

      ctx.globalAlpha=1;
    }

    /* ── Pause photo : overlay plein cadre, image non déformée + note ───── */
    if(pauseActive&&pauseActive.marker.imgEl){
      var pm2=pauseActive.marker,im=pm2.imgEl;
      ctx.fillStyle='rgba(6,7,10,0.86)';ctx.fillRect(0,0,cW,cH);
      var boxL=50,boxT=headerH+40,boxR=cW-50,boxB=cH-220;
      var boxW=boxR-boxL,boxH=boxB-boxT;
      var ir=im.naturalWidth/im.naturalHeight,br=boxW/boxH;
      var dw,dh;
      if(ir>br){dw=boxW;dh=boxW/ir;}else{dh=boxH;dw=boxH*ir;}
      var dx=boxL+(boxW-dw)/2,dy=boxT+(boxH-dh)/2;
      ctx.save();ctx.shadowColor='#000000CC';ctx.shadowBlur=30;
      ctx.drawImage(im,dx,dy,dw,dh);
      ctx.restore();
      ctx.strokeStyle='#FFFFFF22';ctx.lineWidth=2;ctx.strokeRect(dx,dy,dw,dh);
      if(pm2.note){
        ctx.fillStyle='#FFFFFF';ctx.font='30px Arial,sans-serif';ctx.textAlign='center';
        ctx.fillText(pm2.note,cW/2,boxB+56,cW-100);
      }
    }

    if(el-lastRep>400){lastRep=el;window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_progress',p:Math.round(prog*100)}));}
    if(prog<1){requestAnimationFrame(frame);}else{setTimeout(function(){rec.stop();},300);}
  }
};
})();
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
