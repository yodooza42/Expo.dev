/**
 * Story Période v2 — génère une vidéo de TOUS les trajets d'une période donnée.
 *
 * Animation :
 *  - Phase 1 (0 → vidéoDur-5s) : dot se déplace sur chaque trajet dans l'ordre chrono.
 *    Caméra pré-calculée par trajet : vol fluide (ease in/out, zoom log) vers un cadrage
 *    SERRÉ du trajet actif — même une balade à pied de 500 m remplit l'écran.
 *  - Temps d'écran par trajet ∝ durée réelle : une heure à pied et une heure
 *    en voiture reçoivent le même temps d'affichage.
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
 *   familyStory?: boolean,       // intro + grouped chapters + discreet recap
 *   chapters?: Array<{id:string,title:string,tripIds:string[],durationSec:number}>,
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
     Deux niveaux, utilisables pendant une génération dans ce document WebView :
        1. Mémoire (TILE_MEM) : Image déjà décodée → réutilisation instantanée,
           avec un LRU très court. Le cycle natif emploie un WebView frais par
           génération : ce cache ne porte donc aucune promesse inter-story.
        2. localStorage (best-effort) :
          tuile encodée en JPEG data URI, avec un index FIFO pour plafonner la
          taille et éviter un QuotaExceededError.
     En cas d'échec (quota dépassé, stockage indisponible, canvas "tainted"), on
     retombe silencieusement sur un téléchargement réseau classique : le cache est
     une pure optimisation, jamais un point de défaillance. */
  /* Images decoded by the browser are expensive: keep a deliberately tiny LRU.
     localStorage remains the larger, encoded, best-effort cache. */
  var TILE_MEM=Object.create(null);
  var TILE_MEM_LRU=[];
  var TILE_MEM_MAX=24;
  var ACTIVE_PERIOD_JOB=null;
  function clearTileMemory(){
    for(var k in TILE_MEM){
      try{TILE_MEM[k].onload=null;TILE_MEM[k].onerror=null;TILE_MEM[k].src='';}catch(e){}
      delete TILE_MEM[k];
    }
    TILE_MEM_LRU.length=0;
  }
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
  function touchTile(key,img){
    var old=TILE_MEM_LRU.indexOf(key);
    if(old!==-1)TILE_MEM_LRU.splice(old,1);
    TILE_MEM_LRU.push(key);TILE_MEM[key]=img;
    while(TILE_MEM_LRU.length>TILE_MEM_MAX){
      var drop=TILE_MEM_LRU.shift(),oldImg=TILE_MEM[drop];
      delete TILE_MEM[drop];
      /* Detaching a data URL is safe only for cache-owned images. */
      if(oldImg){try{oldImg.onload=null;oldImg.onerror=null;oldImg.src='';}catch(e){}}
    }
  }
  /* Returns a cancel function.  The caller owns all pending Image objects, so a
     cancellation really aborts network/decode work instead of merely ignoring it. */
  function loadTile(z,xx,yy,cctx,dx,dy,job,done){
    var key=z+'/'+xx+'/'+yy;
    var mem=TILE_MEM[key];
    if(mem){
      try{cctx.drawImage(mem,dx,dy,256,256);touchTile(key,mem);done(true);}catch(e){done(false);}
      return function(){};
    }
    var cachedUrl=lsGetTile(key);
    var img=new Image();
    var ended=false;
    function finish(ok){
      if(ended)return;ended=true;
      var pi=job.pendingImages.indexOf(img);if(pi!==-1)job.pendingImages.splice(pi,1);
      if(!job.cancelled)done(ok);
    }
    job.pendingImages.push(img);
    img.crossOrigin='anonymous';
    img.onload=function(){
      if(job.cancelled){finish(false);return;}
      try{cctx.drawImage(img,dx,dy,256,256);}catch(e){finish(false);return;}
      touchTile(key,img);
      if(!cachedUrl){
        try{
          var tc=document.createElement('canvas');tc.width=256;tc.height=256;
          tc.getContext('2d').drawImage(img,0,0);
          lsSetTile(key,tc.toDataURL('image/jpeg',0.82));
        }catch(e2){ /* toDataURL peut échouer (canvas "tainted" si le CORS échoue) : on continue sans cache disque */ }
      }
      finish(true);
    };
    img.onerror=function(){finish(false);};
    try{img.src=cachedUrl||(SAT_TILE_URL+z+'/'+yy+'/'+xx);}catch(e){finish(false);}
    return function(){
      /* Once loaded, TILE_MEM owns this decoded image. A mosaic completing must
         not blank its src while later mosaics can still reuse it. */
      if(ended)return;
      try{img.onload=null;img.onerror=null;img.src='';}catch(e){}
      finish(false);
    };
  }
  var SAT_TILE_URL='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';

  window.generatePeriodStory=function(opts){
   opts=opts||{};
   var jobId=typeof opts.jobId==='string'?opts.jobId:'';
   function post(message){
     message.jobId=jobId;
     try{if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage)window.ReactNativeWebView.postMessage(JSON.stringify(message));}catch(e){}
   }
   var job={jobId:jobId,cancelled:false,started:false,terminal:false,pendingImages:[],mosaicCancels:[],mosaicOutputs:[],timers:[],raf:0,cv:null,stream:null,rec:null,reader:null,prepTimer:0,recordTimer:0,exportTimer:0};
   function clearJobTimer(id){try{clearTimeout(id);}catch(e){}}
   function abandonCanvas(canvas){if(!canvas)return;try{canvas.width=0;canvas.height=0;}catch(e){}}
   function cleanup(stopRecorder){
     for(var i=0;i<job.timers.length;i++)clearJobTimer(job.timers[i]);
     job.timers=[];
     if(job.raf){try{cancelAnimationFrame(job.raf);}catch(e){}job.raf=0;}
     var imgs=job.pendingImages.slice();job.pendingImages.length=0;
     for(var j=0;j<imgs.length;j++){try{imgs[j].onload=null;imgs[j].onerror=null;imgs[j].src='';}catch(e2){}}
     if(job.reader){try{job.reader.onload=null;job.reader.onerror=null;job.reader.abort();}catch(eReader){}job.reader=null;}
     var mosaics=job.mosaicCancels.slice();job.mosaicCancels.length=0;
     for(var m=0;m<mosaics.length;m++)mosaics[m]();
     for(var mo=0;mo<job.mosaicOutputs.length;mo++)abandonCanvas(job.mosaicOutputs[mo]);
     job.mosaicOutputs.length=0;
     clearTileMemory();
     if(typeof photoMarkers!=='undefined'){
       for(var photoCleanup=0;photoCleanup<photoMarkers.length;photoCleanup++){
         if(photoMarkers[photoCleanup].imgEl){try{photoMarkers[photoCleanup].imgEl.src='';}catch(ePhoto){}photoMarkers[photoCleanup].imgEl=null;}
       }
     }
     if(stopRecorder&&job.rec&&job.rec.state==='recording'){try{job.rec.stop();}catch(e3){}}
     if(job.stream&&job.stream.getTracks){try{job.stream.getTracks().forEach(function(t){t.stop();});}catch(e4){}}
   }
   function fail(message){
     if(job.terminal||job.cancelled)return;
     job.terminal=true;cleanup(true);
     if(job.cv&&job.cv.parentNode){try{job.cv.parentNode.removeChild(job.cv);}catch(e){}}
     abandonCanvas(job.cv);post({type:'story_error',message:message||'Impossible de générer la story.'});
   }
   job.cancel=function(){
     if(job.cancelled||job.terminal)return;
     job.cancelled=true;cleanup(true);
     if(job.cv&&job.cv.parentNode){try{job.cv.parentNode.removeChild(job.cv);}catch(e){}}
     abandonCanvas(job.cv);
   };
   if(ACTIVE_PERIOD_JOB)ACTIVE_PERIOD_JOB.cancel();
   ACTIVE_PERIOD_JOB=job;
   if(!jobId){fail('Identifiant de génération manquant.');return;}
   if(!Array.isArray(opts.trips)||opts.trips.length===0){fail('Aucun trajet exploitable pour la story.');return;}
   var trips=opts.trips;
   for(var validTi=0;validTi<trips.length;validTi++){
     if(!trips[validTi]||!Array.isArray(trips[validTi].route)||trips[validTi].route.length<2){fail('Un trajet ne contient pas de tracé exploitable.');return;}
   }
   try{
    if(!window.MediaRecorder||!document.createElement){fail('L’enregistrement vidéo n’est pas pris en charge.');return;}
  var cW=720,cH=1280;
  var cv=document.createElement('canvas');
   job.cv=cv;
  cv.width=cW;cv.height=cH;
  document.body.appendChild(cv);
  cv.style.cssText='position:absolute;top:-9999px;left:-9999px;';
  var ctx=cv.getContext('2d');
   if(!ctx||!cv.captureStream){fail('Le canevas vidéo n’est pas disponible.');return;}
  var mimes=['video/mp4;codecs=avc1','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  var mime='video/webm';
   for(var mi=0;mi<mimes.length;mi++){if(!MediaRecorder.isTypeSupported||MediaRecorder.isTypeSupported(mimes[mi])){mime=mimes[mi];break;}}
  var chunks=[];
  var stream=cv.captureStream(30);
   job.stream=stream;
  var rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3600000});
   job.rec=rec;
   rec.onerror=function(){fail('L’enregistrement vidéo a échoué.');};
   rec.ondataavailable=function(e){if(!job.cancelled&&!job.terminal&&e.data&&e.data.size>0)chunks.push(e.data);};
  rec.onstop=function(){
     try{
     if(job.cancelled||job.terminal)return;
     if(job.recordTimer){clearTimeout(job.recordTimer);job.recordTimer=0;}
     cleanup(false);
     if(cv.parentNode){try{cv.parentNode.removeChild(cv);}catch(e){}}
     abandonCanvas(cv);
     for(var releaseMi=0;releaseMi<satMosaics.length;releaseMi++)if(satMosaics[releaseMi])abandonCanvas(satMosaics[releaseMi].canvas);
     if(satGlobalMosaic)abandonCanvas(satGlobalMosaic.canvas);
     satMosaics=[];satGlobalMosaic=null;
     for(var releasePi=0;releasePi<photoMarkers.length;releasePi++){
       if(photoMarkers[releasePi].imgEl){try{photoMarkers[releasePi].imgEl.src='';}catch(e2){}photoMarkers[releasePi].imgEl=null;}
     }
    var blob=new Blob(chunks,{type:mime.split(';')[0]});
     chunks.length=0;
     if(!blob||!blob.size){fail('La vidéo générée est vide.');return;}
     /* Each byte slice is divisible by three.  Concatenating independently
        encoded chunks is therefore valid base64 without a full-video copy. */
     var BYTES_PER_CHUNK=150000,total=Math.ceil(blob.size/BYTES_PER_CHUNK),index=0,mimeOut=mime.split(';')[0];
     post({type:'story_phase',phase:'export',completed:0,total:total});
     function refreshExportIdleDeadline(){
       if(job.exportTimer)clearTimeout(job.exportTimer);
       job.exportTimer=setTimeout(function(){fail('L’export de la vidéo a dépassé le délai.');},30000);
       job.timers.push(job.exportTimer);
     }
     refreshExportIdleDeadline();
     function exportNext(){
       try{
       if(job.cancelled||job.terminal)return;
       if(index>=total){if(job.exportTimer){clearTimeout(job.exportTimer);job.exportTimer=0;}job.terminal=true;ACTIVE_PERIOD_JOB=ACTIVE_PERIOD_JOB===job?null:ACTIVE_PERIOD_JOB;return;}
       var fr;
       try{fr=new FileReader();}catch(e){fail('Export vidéo indisponible.');return;}
       job.reader=fr;
       fr.onerror=function(){fail('Impossible d’exporter la vidéo.');};
       fr.onload=function(){
         try{
         if(job.cancelled||job.terminal)return;
         job.reader=null;
         var value=typeof fr.result==='string'?fr.result:'',comma=value.indexOf(',');
         if(comma<0){fail('Impossible d’exporter la vidéo.');return;}
         post({type:'story_chunk',index:index,total:total,mime:mimeOut,data:value.slice(comma+1)});
         index++;
         post({type:'story_phase',phase:'export',completed:index,total:total});
         refreshExportIdleDeadline();
         var id=setTimeout(exportNext,0);job.timers.push(id);
         }catch(readerError){fail('Impossible d’exporter la vidéo.');}
       };
       try{fr.readAsDataURL(blob.slice(index*BYTES_PER_CHUNK,Math.min(blob.size,(index+1)*BYTES_PER_CHUNK),mimeOut));}catch(e2){fail('Impossible d’exporter la vidéo.');}
       }catch(exportError){fail('Impossible d’exporter la vidéo.');}
     }
     exportNext();
     }catch(stopError){fail('Impossible de finaliser la vidéo.');}
  };
   }catch(setupError){fail('Impossible de préparer la vidéo.');return;}
   try{
  var CAM_SLOWDOWN=50; /* facteur de ralenti du curseur pendant le vol de caméra */
  var requestedPhotoPauseSec=Number(opts.photoPauseSecPerPhoto);
  var PHOTO_PAUSE_MS=Number.isFinite(requestedPhotoPauseSec)?Math.max(0,requestedPhotoPauseSec*1000):2000;
  var VCL={car:'#2196F3',moto:'#FF9800',walk:'#4CAF50'};
  var VEMO={car:'\\uD83D\\uDE97',moto:'\\uD83C\\uDFCD',walk:'\\uD83D\\uDEB6'};
   function formatElapsed(ms){
     var totalSeconds=Math.max(0,Math.floor((Number(ms)||0)/1000));
     var hours=Math.floor(totalSeconds/3600);
     var minutes=Math.floor((totalSeconds%3600)/60);
     var seconds=totalSeconds%60;
     function pad(value){return value<10?'0'+value:String(value);}
     return hours>0?pad(hours)+':'+pad(minutes)+':'+pad(seconds):pad(minutes)+':'+pad(seconds);
   }

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

   var familyStory=opts.familyStory===true;
   var FAMILY_OPENING_MS=familyStory?3000:0;
   var FAMILY_RECAP_MS=familyStory?3000:0;
   function familyFitFont(value,basePx,minPx,maxWidth,weight){
     var text=String(value||''),size=basePx;
     if(familyStory&&ctx.measureText){
       while(size>minPx){
         ctx.font=weight+' '+size+'px Arial,sans-serif';
         var measured=ctx.measureText(text);
         if(!measured||!Number.isFinite(measured.width)||measured.width<=maxWidth)break;
         size--;
       }
     }
     return weight+' '+size+'px Arial,sans-serif';
   }
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
   var SAT_MOSAIC_TIMEOUT=7000;
   var SAT_TILE_CONCURRENCY=4;
   var SAT_TOTAL_OUTPUT_PIXELS=5000000;
  function lngToTileX(lng,z){return (lng+180)/360*Math.pow(2,z);}
  function latToTileY(lat,z){var r=lat*Math.PI/180;return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z);}
  function tileXToLng(x,z){return x/Math.pow(2,z)*360-180;}
  function tileYToLat(y,z){var n=Math.PI-2*Math.PI*y/Math.pow(2,z);return 180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n)));}

   function buildSatMosaic(bbox,targetWpx,targetHpx,outputBudget){
    return new Promise(function(resolve){
       if(job.cancelled||job.mapAbort){resolve(null);return;}
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
       /* The scratch canvas exists for one mosaic only. Retained mosaics use an
          adaptive share of the aggregate decoded-pixel budget: long periods get
          less satellite detail, never different geography. Their geographic
          bounds stay unchanged, so projection/map alignment is exact. */
       var canvas=document.createElement('canvas');
       canvas.width=cols*256;canvas.height=rows*256;
      var cctx=canvas.getContext('2d');
       if(!cctx){abandonCanvas(canvas);resolve(null);return;}
       var total=cols*rows,done=0,failed=false,settled=false,next=0,running=0,cancellers=[];
       var to=setTimeout(function(){finish(null);},SAT_MOSAIC_TIMEOUT);job.timers.push(to);
       function finish(result){
         if(settled)return;settled=true;clearTimeout(to);
         var mc=job.mosaicCancels.indexOf(cancelMosaic);if(mc!==-1)job.mosaicCancels.splice(mc,1);
         for(var q=0;q<cancellers.length;q++)cancellers[q]();
         cancellers.length=0;
         if(!result)abandonCanvas(canvas);
         resolve(result);
       }
       function cancelMosaic(){finish(null);}
       job.mosaicCancels.push(cancelMosaic);
       function complete(ok){
         if(settled)return;
         running--;done++;if(!ok)failed=true;
         if(job.cancelled||job.mapAbort){finish(null);return;}
         if(done>=total){
           if(failed){finish(null);return;}
           var sw=canvas.width,sh=canvas.height,scale=Math.min(1,Math.sqrt(outputBudget/(sw*sh)));
           var out=document.createElement('canvas');
           out.width=Math.max(1,Math.round(sw*scale));out.height=Math.max(1,Math.round(sh*scale));
           var outCtx=out.getContext('2d');
           try{outCtx.drawImage(canvas,0,0,out.width,out.height);}catch(e){abandonCanvas(out);finish(null);return;}
           abandonCanvas(canvas);
           job.mosaicOutputs.push(out);
           finish({canvas:out,lngLeft:tileXToLng(xMin,z),lngRight:tileXToLng(xMax+1,z),
             latTop:tileYToLat(yMin,z),latBottom:tileYToLat(yMax+1,z)});
           return;
        }
         pump();
      }
       function pump(){
         while(!settled&&!job.cancelled&&!job.mapAbort&&running<SAT_TILE_CONCURRENCY&&next<total){
           var tx=xMin+(next%cols),ty=yMin+Math.floor(next/cols);next++;running++;
           cancellers.push(loadTile(z,tx,ty,cctx,(tx-xMin)*256,(ty-yMin)*256,job,complete));
        }
      }
       pump();
    });
  }
  function bboxOfTrip(t){
    var rr=t.route,la0=rr[0].lat,la1=la0,ln0=rr[0].lng,ln1=ln0;
    for(var k=1;k<rr.length;k++){var p=rr[k];if(p.lat<la0)la0=p.lat;if(p.lat>la1)la1=p.lat;if(p.lng<ln0)ln0=p.lng;if(p.lng>ln1)ln1=p.lng;}
    // Marge large (voir storyGenerator.ts) : la caméra par trajet peut zoomer très fort
    // (camForTrip, jusqu'à x600), donc une marge de 30% laissait apparaître le fond autour
    // de l'imagerie satellite près des extrémités du tracé.
    var rawLa=la1-la0,rawLn=ln1-ln0;
    var padLa=rawLa*0.6||0.006,padLn=rawLn*0.6||0.006;
    /* The camera fits the route's long axis. Extend the short axis enough for
       the satellite mosaic to cover the whole camera viewport, otherwise the
       route can leave the image and appear to float over the dark background. */
    var desiredLa=(rawLn*1.45)*(mH/mW);
    var desiredLn=(rawLa*1.45)*(mW/mH);
    if(rawLa+2*padLa<desiredLa)padLa=(desiredLa-rawLa)/2;
    if(rawLn+2*padLn<desiredLn)padLn=(desiredLn-rawLn)/2;
    return{latMin:la0-padLa,latMax:la1+padLa,lngMin:ln0-padLn,lngMax:ln1+padLn};
  }
   var satMosaics=[]; /* un par trajet, volontairement basse résolution si période longue */
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
   /* Static polylines use preprojected paths: no repeated Mercator/log work per
      frame.  Dynamic revealed segments keep the original point-by-point geometry. */
   var routePaths=[];
   for(var pathTi=0;pathTi<trips.length;pathTi++){
     var pathRoute=trips[pathTi].route,path=null;
     if(window.Path2D&&pathRoute.length>=2){
       path=new window.Path2D();path.moveTo(pX(pathRoute[0].lng),pY(pathRoute[0].lat));
       for(var pathRi=1;pathRi<pathRoute.length;pathRi++)path.lineTo(pX(pathRoute[pathRi].lng),pY(pathRoute[pathRi].lat));
     }
     routePaths.push(path);
   }

  function easeIO(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
  function lerpCam(a,b,t){
    return{cx:a.cx+(b.cx-a.cx)*t,cy:a.cy+(b.cy-a.cy)*t,
      zoom:Math.exp(Math.log(a.zoom)+(Math.log(b.zoom)-Math.log(a.zoom))*t)};
  }

   /*
    * Family stories have a fixed 3s introduction and a fixed 3s discreet
    * recap. videoDurationSec is the base duration before photo pauses;
    * photoPauseSecPerPhoto controls the pause used by compressed modes.
    * Legacy requests intentionally keep the old five-second recap and timing
    * formula byte-for-byte in spirit.
    */
   var requestedDurationMs=(opts.videoDurationSec||20)*1000;
   var baseDUR=familyStory?Math.max(FAMILY_OPENING_MS+FAMILY_RECAP_MS,requestedDurationMs):requestedDurationMs;
   var DUR=baseDUR;
   var END_MS=familyStory?FAMILY_RECAP_MS:5000;
   var animMs=familyStory?Math.max(0,baseDUR-FAMILY_OPENING_MS-FAMILY_RECAP_MS):DUR-END_MS;
   var chapterDefs=[];
   var chapterForTrip=[];
   var tripIdIndex=Object.create(null);
   for(var tripIdIdx=0;tripIdIdx<trips.length;tripIdIdx++){
     if(trips[tripIdIdx]&&trips[tripIdIdx].id!=null)tripIdIndex[String(trips[tripIdIdx].id)]=tripIdIdx;
   }
   if(familyStory&&Array.isArray(opts.chapters)){
     for(var chapterIdx=0;chapterIdx<opts.chapters.length;chapterIdx++){
       var suppliedChapter=opts.chapters[chapterIdx];
       if(!suppliedChapter||typeof suppliedChapter!=='object'||!Array.isArray(suppliedChapter.tripIds))continue;
       var memberIndices=[];
       for(var chapterTripIdx=0;chapterTripIdx<suppliedChapter.tripIds.length;chapterTripIdx++){
         var mappedIndex=tripIdIndex[String(suppliedChapter.tripIds[chapterTripIdx])];
         if(mappedIndex==null||chapterForTrip[mappedIndex]!=null)continue;
         memberIndices.push(mappedIndex);chapterForTrip[mappedIndex]=chapterDefs.length;
       }
       if(memberIndices.length){
         memberIndices.sort(function(a,b){return a-b;});
         chapterDefs.push({
           id:String(suppliedChapter.id),
           title:String(suppliedChapter.title||suppliedChapter.id),
           tripIds:memberIndices.map(function(memberIndex){return trips[memberIndex].id;}),
           durationSec:Number.isFinite(Number(suppliedChapter.durationSec))?Math.max(0,Number(suppliedChapter.durationSec)):0,
           members:memberIndices,
         });
       }
     }
   }
   /* A family request must never lose a selected trip whose chapter metadata
      is stale.  Keep it in a visible fallback chapter instead. */
   var unassigned=[];
   for(var unassignedIdx=0;unassignedIdx<trips.length;unassignedIdx++){
     if(chapterForTrip[unassignedIdx]==null)unassigned.push(unassignedIdx);
   }
   if(unassigned.length){
     chapterDefs.push({
       id:'unassigned',
       title:opts.periodLabel||'Trajets',
       tripIds:unassigned.map(function(unassignedTrip){return trips[unassignedTrip].id;}),
       durationSec:0,
       members:unassigned,
     });
     var fallbackChapterIndex=chapterDefs.length-1;
     for(var unassignedSet=0;unassignedSet<unassigned.length;unassignedSet++)chapterForTrip[unassigned[unassignedSet]]=fallbackChapterIndex;
   }
   if(familyStory&&!chapterDefs.length){
     chapterDefs=[{
       id:'period',
       title:opts.periodLabel||'Trajets',
       tripIds:trips.map(function(periodTrip){return periodTrip.id;}),
       durationSec:1,
       members:trips.map(function(_,periodTripIndex){return periodTripIndex;}),
     }];
     for(var periodTripIndex=0;periodTripIndex<trips.length;periodTripIndex++)chapterForTrip[periodTripIndex]=0;
   }
   var chapterWeights=[],totalChapterWeight=0;
   if(familyStory){
     for(var chapterWeightIndex=0;chapterWeightIndex<chapterDefs.length;chapterWeightIndex++){
       var chapterWeight=Math.max(0,Number(chapterDefs[chapterWeightIndex].durationSec)||0);
       chapterWeights.push(chapterWeight);totalChapterWeight+=chapterWeight;
     }
     if(totalChapterWeight<=0){
       totalChapterWeight=chapterDefs.length||1;
       for(var equalChapterIndex=0;equalChapterIndex<chapterDefs.length;equalChapterIndex++)chapterWeights[equalChapterIndex]=1;
     }
   }
   var chapterStart=[],chapterDurations=[];
   if(familyStory){
     var chapterCursor=0;
     for(var chapterTimingIndex=0;chapterTimingIndex<chapterDefs.length;chapterTimingIndex++){
       chapterStart.push(chapterCursor);
       var allocatedChapterMs=chapterDefs.length
         ? animMs*chapterWeights[chapterTimingIndex]/totalChapterWeight : 0;
       chapterDurations.push(allocatedChapterMs);chapterCursor+=allocatedChapterMs;
     }
   }
   /* Every real trip hour is represented by three virtual seconds. This is a
      weight, so requested 1/2 minute exports can still scale all trips down
      proportionally while Auto keeps the duration ratio between them. */
   function tripTimeWeight(trip){
     var durationMs=Number(trip&&trip.durationMs);
     return Number.isFinite(durationMs)&&durationMs>=0
       ? Math.max(1000,(durationMs/3600000)*3000)
       : 3000;
   }
   var wts=[],totW=0,tStart=[],tripDurations=[];
   if(familyStory){
     for(var familyChapterIndex=0;familyChapterIndex<chapterDefs.length;familyChapterIndex++){
        var familyMembers=chapterDefs[familyChapterIndex].members,totalFamilyTime=0,familyChapterOffset=0;
       for(var familyMemberIndex=0;familyMemberIndex<familyMembers.length;familyMemberIndex++){
          var memberWeight=tripTimeWeight(trips[familyMembers[familyMemberIndex]]);
          totalFamilyTime+=memberWeight;
       }
        if(totalFamilyTime<=0)totalFamilyTime=familyMembers.length||1;
       for(var familyTripOffset=0;familyTripOffset<familyMembers.length;familyTripOffset++){
          var familyTripIndex=familyMembers[familyTripOffset];
          var routeWeight=tripTimeWeight(trips[familyTripIndex]);
         wts[familyTripIndex]=routeWeight;
         tStart[familyTripIndex]=chapterStart[familyChapterIndex]+familyChapterOffset;
          tripDurations[familyTripIndex]=(chapterDurations[familyChapterIndex]||0)*routeWeight/totalFamilyTime;
         familyChapterOffset+=tripDurations[familyTripIndex];
       }
     }
     for(var familyDurationIndex=0;familyDurationIndex<trips.length;familyDurationIndex++){
       if(!Number.isFinite(tStart[familyDurationIndex]))tStart[familyDurationIndex]=0;
       if(!Number.isFinite(tripDurations[familyDurationIndex]))tripDurations[familyDurationIndex]=0;
     }
     totW=1;
   }else{
      for(var ti=0;ti<trips.length;ti++){wts.push(tripTimeWeight(trips[ti]));totW+=wts[ti];}
     tStart=[0];
     for(var ti=1;ti<trips.length;ti++)tStart.push(tStart[ti-1]+(wts[ti-1]/totW)*animMs);
     for(var legacyDurationIndex=0;legacyDurationIndex<trips.length;legacyDurationIndex++)tripDurations[legacyDurationIndex]=(wts[legacyDurationIndex]/totW)*animMs;
   }
   function tDurOf(ti){return familyStory?tripDurations[ti]:(wts[ti]/totW)*animMs;}
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

   function categoryKmAt(activeIndex,activeProgress,complete){
     var totals={car:0,moto:0,walk:0};
     for(var categoryIndex=0;categoryIndex<trips.length;categoryIndex++){
       var categoryFraction=complete?1:categoryIndex<activeIndex?1:categoryIndex===activeIndex?Math.max(0,Math.min(1,activeProgress)):0;
       var category=trips[categoryIndex].vehicleType==='moto'?'moto':trips[categoryIndex].vehicleType==='walk'?'walk':'car';
       totals[category]+=(Number(trips[categoryIndex].distKm)||0)*categoryFraction;
     }
     return totals;
   }

  /* IMPORTANT : seul DUR (budget réel d'enregistrement) grandit avec les pauses photo.
     animMs reste la durée "virtuelle" d'animation (hors pauses) sur laquelle tStart/tDurOf
     sont basés — l'étendre ici désynchroniserait les bornes de trajet (tStart, calculées
     juste au-dessus avec l'ancien animMs) de leur durée (tDurOf, qui lirait le nouvel animMs
     par closure), coupant les trajets trop tôt / les faisant sauter au suivant. */
  DUR+=totalPauseMs;

  /* ── Position absolue (hors pauses, après l'intro familiale si présente) ──
     Calculée une fois que tStart/tDurOf sont connus. Utiliser une position absolue plutôt
     que "tripIdx===ci && tProg>=frac" évite la course avec le changement de trajet (une
     photo en frac≈1 ou frac≈0 pouvait ne jamais matcher car ci changeait juste avant/après),
     et permet à plusieurs photos au même endroit de s'enchaîner automatiquement : aEl reste
     figé pendant une pause, donc dès qu'elle se termine, la photo suivante à la même position
     absolue est immédiatement éligible. Les limites d'un chapitre restent donc indépendantes
     du temps ajouté par les photos. */
  var photoMarkers=photoMarkersRaw.map(function(m){
    return{tripIdx:m.tripIdx,note:m.note,frac:m.frac,src:m.src,imgEl:null,triggered:false,
      absAEl:(familyStory?FAMILY_OPENING_MS:0)+tStart[m.tripIdx]+m.frac*tDurOf(m.tripIdx)};
  }).sort(function(a,b){return a.absAEl-b.absAEl;});
  if(familyStory){
    post({type:'story_timing',baseDurationSec:baseDUR/1000,openingSec:FAMILY_OPENING_MS/1000,
      recapSec:FAMILY_RECAP_MS/1000,chapterAnimationSec:animMs/1000,
      photoPauseSec:totalPauseMs/1000,totalDurationSec:DUR/1000,
       photos:photoMarkers.map(function(marker){return{tripId:trips[marker.tripIdx].id,frac:marker.frac,atSec:marker.absAEl/1000};}),
       trips:trips.map(function(trip,tripTimingIndex){return{id:trip.id,startSec:(FAMILY_OPENING_MS+tStart[tripTimingIndex])/1000,durationSec:(tDurOf(tripTimingIndex)||0)/1000};}),
      chapters:chapterDefs.map(function(chapter,chapterTimingIndex){
        return{id:chapter.id,title:chapter.title,tripIds:chapter.tripIds,
          startSec:(FAMILY_OPENING_MS+chapterStart[chapterTimingIndex])/1000,
          durationSec:(chapterDurations[chapterTimingIndex]||0)/1000};
      })});
  }

  var t0=null,lastRep=0;
  var pauseActive=null; /* {marker, anchorEl, anchorConsumed} */
  var pauseConsumedMs=0;
   var lastFrameTs=0,recordingStarted=false,themeFallbackSent=false,stopping=false,photoPreloading=false;
   var PREPARATION_DEADLINE_MS=45000;
   function fallbackTheme(reason){
     if(themeFallbackSent)return;
     themeFallbackSent=true;effTheme='dark';
     post({type:'story_theme_fallback',reason:reason});
   }
   job.prepTimer=setTimeout(function(){
     if(job.cancelled||job.terminal)return;
     if(!recordingStarted){
       fallbackTheme('timeout');
       /* A map fallback can already have started its six-second photo batch;
          the one-shot guard keeps this deadline from duplicating it. */
       if(!photoPreloading)preloadPhotosThenStart();
     }
   },PREPARATION_DEADLINE_MS);job.timers.push(job.prepTimer);

  function startRecording(){
     if(job.cancelled||job.terminal||job.started)return;
     job.started=true;recordingStarted=true;post({type:'story_phase',phase:'recording'});post({type:'story_progress',p:0});
     if(job.prepTimer){clearTimeout(job.prepTimer);job.prepTimer=0;}
     /* The recording gets its own deadline after all photo pauses have been
        included in DUR.  It must never inherit the preparation timeout. */
     job.recordTimer=setTimeout(function(){fail('La génération de la story a dépassé le délai.');},DUR+15000);
     job.timers.push(job.recordTimer);
     try{rec.start();job.raf=requestAnimationFrame(frame);}catch(e){fail('Impossible de démarrer l’enregistrement vidéo.');}
  }

  function preloadPhotosThenStart(){
     if(job.cancelled||job.terminal||job.started||photoPreloading)return;
     photoPreloading=true;
     post({type:'story_phase',phase:'photos',completed:0,total:photoMarkers.length});
    if(photoMarkers.length===0){startRecording();return;}
     var loaded=0,settled=false,batch=[];
     var finish=function(){
       if(settled)return;settled=true;photoPreloading=false;clearTimeout(to);
       /* A photo timeout must not leave decoders/network requests alive. */
       for(var bi=0;bi<batch.length;bi++){
         var pendingPhoto=batch[bi];if(pendingPhoto.done)continue;
         pendingPhoto.done=true;
         var bp=job.pendingImages.indexOf(pendingPhoto.img);if(bp!==-1)job.pendingImages.splice(bp,1);
         try{pendingPhoto.img.onload=null;pendingPhoto.img.onerror=null;pendingPhoto.img.src='';}catch(e){}
       }
       startRecording();
     };
     var to=setTimeout(finish,6000);job.timers.push(to); /* garde-fou si une image ne charge jamais */
    for(var pmi=0;pmi<photoMarkers.length;pmi++){
      (function(m){
        var img=new Image();
         var entry={img:img,done:false};batch.push(entry);
         job.pendingImages.push(img);
         function photoDone(ok){
           if(entry.done)return;entry.done=true;
           var pos=job.pendingImages.indexOf(img);if(pos!==-1)job.pendingImages.splice(pos,1);
           if(job.cancelled||settled)return;
           if(ok)m.imgEl=img;
           loaded++;post({type:'story_phase',phase:'photos',completed:loaded,total:photoMarkers.length});
           if(loaded===photoMarkers.length){clearTimeout(to);finish();}
         }
         img.onload=function(){photoDone(true);};img.onerror=function(){photoDone(false);};
         try{img.src=m.src;}catch(e){photoDone(false);}
      })(photoMarkers[pmi]);
    }
  }

  if(requestedTheme!=='satellite'){
    preloadPhotosThenStart();
  }else{
     var mapTotal=trips.length+1,mapDone=0,mapResults=[],mapGuard,mapFinished=false;
     post({type:'story_phase',phase:'maps',completed:0,total:mapTotal});
     function mapComplete(result){
       if(job.cancelled||job.terminal||mapFinished)return;
       mapResults.push(result);mapDone++;
       post({type:'story_phase',phase:'maps',completed:mapDone,total:mapTotal});
       if(!result){fallbackTheme('tiles');finishMaps();return;}
       if(mapDone>=mapTotal){satMosaics=mapResults.slice(0,trips.length);satGlobalMosaic=mapResults[trips.length];finishMaps();return;}
       runNextMap();
     }
     function finishMaps(){
       if(mapFinished)return;mapFinished=true;
       if(mapGuard){clearTimeout(mapGuard);mapGuard=0;}
       /* Release any successful mosaics if satellite was abandoned mid-queue. */
       if(effTheme!=='satellite'){
         job.mapAbort=true;
         var mapCancels=job.mosaicCancels.slice();
         for(var pi2=0;pi2<mapCancels.length;pi2++)mapCancels[pi2]();
         for(var mi2=0;mi2<mapResults.length;mi2++)if(mapResults[mi2])abandonCanvas(mapResults[mi2].canvas);satMosaics=[];satGlobalMosaic=null;
         for(var outMi=0;outMi<job.mosaicOutputs.length;outMi++)abandonCanvas(job.mosaicOutputs[outMi]);
         job.mosaicOutputs.length=0;
       }
       /* Mosaics are already rasterized; decoded individual tiles are no longer
          useful once preparation has ended. */
       clearTileMemory();
       preloadPhotosThenStart();
     }
     function runNextMap(){
       if(job.cancelled||job.terminal||mapFinished)return;
       var bbox=mapDone<trips.length?bboxOfTrip(trips[mapDone]):{latMin:minLat,latMax:maxLat,lngMin:minLng,lngMax:maxLng};
       buildSatMosaic(bbox,mW,mH,Math.max(1,Math.floor(SAT_TOTAL_OUTPUT_PIXELS/mapTotal))).then(mapComplete,function(){mapComplete(null);});
     }
     mapGuard=setTimeout(function(){if(!job.cancelled&&!job.terminal){fallbackTheme('timeout');finishMaps();}},40000);job.timers.push(mapGuard);
     runNextMap();
  }

  /* ── Boucle d'animation ──────────────────────────────────────────────── */
  function frame(ts){
     try{
     if(job.cancelled||job.terminal)return;
     /* captureStream is 30 fps: drawing more often only burns CPU and allocations. */
     if(lastFrameTs&&ts-lastFrameTs<1000/30){
       job.raf=requestAnimationFrame(frame);return;
     }
     lastFrameTs=ts;
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
     var isOpening=familyStory&&vEl<FAMILY_OPENING_MS;
     var familyAnimationEl=familyStory?Math.max(0,vEl-FAMILY_OPENING_MS):vEl;
     var familyEndAt=familyStory?FAMILY_OPENING_MS+animMs:animMs;
     var isEnd=vEl>=familyEndAt;
     var endProg=isEnd?Math.min(1,(vEl-familyEndAt)/(END_MS||1)):0;
     var aEl=Math.min(familyAnimationEl,animMs);

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
         var photoTimelineEl=familyStory?vEl:aEl;
         if(!pm.triggered&&photoTimelineEl>=pm.absAEl){
          pm.triggered=true;
          pauseActive={marker:pm,anchorEl:el,anchorConsumed:pauseConsumedMs};
          break;
        }
      }
    }
    /* A photo anchored at frac=1 belongs to the preceding chapter even when
       the virtual clock has just reached the next chapter boundary. */
    var displayTripIndex=pauseActive?pauseActive.marker.tripIdx:ci;

    /* Caméra : vol eased entre cams pré-calculées (converge TOUJOURS) */
     var cam;
    if(isOpening){
       cam=fullCam;
     }else if(isEnd){
      var recapElapsed=familyStory?vEl-familyEndAt:el-animMs;
      var eT=Math.min(1,recapElapsed/1400);
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
     var activeChapter=familyStory&&!isOpening&&!isEnd&&chapterDefs[chapterForTrip[displayTripIndex]];
     var captionTxt=isOpening?'Introduction':isEnd?'R\\xE9capitulatif':(trips[ci].vehicleLabel||trips[ci].dateLabel);
    if(opts.customName){
      ctx.fillStyle=THEME.titleColor;ctx.font=familyStory?familyFitFont(opts.customName,40,24,640,'bold'):'bold 40px Arial,sans-serif';ctx.textAlign='center';
      ctx.fillText(opts.customName,cW/2,58);
      ctx.fillStyle=THEME.subColor;ctx.font=familyStory?familyFitFont(opts.dateRangeLabel||'',26,18,640,'normal'):'26px Arial,sans-serif';
      ctx.fillText(opts.dateRangeLabel||'',cW/2,96);
      ctx.fillStyle=THEME.subColor;ctx.font='24px Arial,sans-serif';
      ctx.fillText(opts.tripCountLabel+'  \\xB7  '+totKm.toFixed(1)+' km',cW/2,132);
       ctx.fillStyle=THEME.captionColor;ctx.font='20px Arial,sans-serif';
       String(captionTxt).split('\\n').forEach(function(line,lineIndex){ctx.fillText(line,cW/2,170+lineIndex*24);});
    } else {
      ctx.fillStyle=THEME.titleColor;ctx.font=familyStory?familyFitFont('\\uD83D\\uDDFA\\uFE0F  '+opts.periodLabel,42,24,640,'bold'):'bold 42px Arial,sans-serif';ctx.textAlign='center';
      ctx.fillText('\\uD83D\\uDDFA\\uFE0F  '+opts.periodLabel,cW/2,65);
      ctx.fillStyle=THEME.subColor;ctx.font='26px Arial,sans-serif';
      ctx.fillText(opts.tripCountLabel+'  \\xB7  '+dispKm+' km',cW/2,105);
       ctx.fillStyle=THEME.captionColor;ctx.font='22px Arial,sans-serif';
       String(captionTxt).split('\\n').forEach(function(line,lineIndex){ctx.fillText(line,cW/2,142+lineIndex*26);});
    }
     /* Keep the renderer's legacy direct callers compatible. The period screen
        supplies vehicleLabel and intentionally omits the chapter title here. */
     if(familyStory&&!trips[ci].vehicleLabel&&!isOpening&&!isEnd&&activeChapter){
       ctx.fillStyle=THEME.gold;ctx.font=familyFitFont(activeChapter.title,24,16,640,'bold');ctx.textAlign='center';
       ctx.fillText(activeChapter.title,cW/2,headerH-10);
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
       ctx.strokeStyle=THEME.ghostStroke;ctx.lineWidth=2.5/cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';
       if(routePaths[ti])ctx.stroke(routePaths[ti]);else{ctx.beginPath();ctx.moveTo(pX(rr[0].lng),pY(rr[0].lat));for(var ri=1;ri<rr.length;ri++)ctx.lineTo(pX(rr[ri].lng),pY(rr[ri].lat));ctx.stroke();}
    }

    /* Trajets terminés */
    var compLimit=isEnd?trips.length:ci;
    for(var ti=0;ti<compLimit;ti++){
      var rr=trips[ti].route;if(rr.length<2)continue;
      var col=VCL[trips[ti].vehicleType]||'#2196F3';
      ctx.strokeStyle=col;ctx.lineWidth=(isEnd?5:3.5)/cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';
       ctx.globalAlpha=isEnd?0.85:0.5;
       if(routePaths[ti])ctx.stroke(routePaths[ti]);else{ctx.beginPath();ctx.moveTo(pX(rr[0].lng),pY(rr[0].lat));for(var ri=1;ri<rr.length;ri++)ctx.lineTo(pX(rr[ri].lng),pY(rr[ri].lat));ctx.stroke();}
       ctx.globalAlpha=1;
      ctx.beginPath();ctx.arc(pX(rr[0].lng),pY(rr[0].lat),5/cam.zoom,0,Math.PI*2);ctx.fillStyle=col+'99';ctx.fill();
    }

    /* Trajet actif */
    if(!isEnd&&!isOpening){
      var rr=trips[ci].route;
      var col=VCL[trips[ci].vehicleType]||'#2196F3';

      /* Aperçu du parcours complet (fantôme coloré) */
      if(rr.length>=2){
         ctx.strokeStyle=col+'38';ctx.lineWidth=4/cam.zoom;ctx.lineJoin='round';ctx.lineCap='round';
         if(routePaths[ci])ctx.stroke(routePaths[ci]);else{ctx.beginPath();ctx.moveTo(pX(rr[0].lng),pY(rr[0].lat));for(var ri=1;ri<rr.length;ri++)ctx.lineTo(pX(rr[ri].lng),pY(rr[ri].lat));ctx.stroke();}
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

    if(isOpening){
      /* Opening card: keep it quiet, but make the generated monthly/event
         title and selected date range unambiguous before the map appears. */
      ctx.fillStyle=THEME.titleColor;ctx.font=familyStory?familyFitFont(opts.customName||opts.periodLabel,56,28,640,'bold'):'bold 56px Arial,sans-serif';ctx.textAlign='center';
      ctx.fillText(opts.customName||opts.periodLabel,cW/2,900);
      if(opts.dateRangeLabel){
        ctx.fillStyle=THEME.subColor;ctx.font=familyFitFont(opts.dateRangeLabel,30,18,640,'normal');
        ctx.fillText(opts.dateRangeLabel,cW/2,950);
      }
      ctx.fillStyle=THEME.captionColor;ctx.font='26px Arial,sans-serif';
      ctx.fillText(opts.tripCountLabel+'  ·  '+totKm.toFixed(1)+' km',cW/2,1010);
      ctx.fillText('Introduction',cW/2,1060);
    }else if(!isEnd){
       /* Phase animation : durée du trajet + infos trajet */
      var col=VCL[trips[ci].vehicleType]||'#2196F3';
      ctx.fillStyle=col;ctx.font='bold 80px Arial,sans-serif';ctx.textAlign='center';
       ctx.fillText(formatElapsed((trips[ci].durationMs||0)*tProg),cW/2,884);
      ctx.fillStyle=THEME.captionColor;ctx.font='26px Arial,sans-serif';
       ctx.fillText('durée du trajet  \\xB7  trajet '+(ci+1)+' / '+trips.length+'  \\xB7  '+trips[ci].dateLabel,cW/2,928);
      /* Barre de progression segmentée (1 segment par trajet) */
      var barL=60,barR=660,barY=966,barH=10,barW=barR-barL;
      var bx=barL;
      for(var si=0;si<trips.length;si++){
        var segW=(familyStory?(tripDurations[si]/(animMs||1)):(wts[si]/totW))*barW;
        var sCol=VCL[trips[si].vehicleType]||'#2196F3';
        ctx.fillStyle=THEME.barBg;
        ctx.fillRect(bx,barY,Math.max(segW-2,1),barH);
        if(si<ci){ctx.fillStyle=sCol;ctx.fillRect(bx,barY,Math.max(segW-2,1),barH);}
        else if(si===ci){ctx.fillStyle=sCol;ctx.fillRect(bx,barY,Math.max((segW-2)*tProg,0),barH);}
        bx+=segW;
      }

       /* Kilomètres par catégorie : chaque compteur suit uniquement les trajets déjà vus. */
       var shownKm=categoryKmAt(ci,tProg,false);
       var lIt=[
         {t:'\\uD83D\\uDE97 '+shownKm.car.toFixed(0)+' km',c:'#2196F3'},
         {t:'\\uD83C\\uDFCD '+shownKm.moto.toFixed(0)+' km',c:'#FF9800'},
         {t:'\\uD83D\\uDEB6 '+shownKm.walk.toFixed(0)+' km',c:'#4CAF50'},
       ];
       var iW=cW/lIt.length;
       for(var si=0;si<lIt.length;si++){ctx.fillStyle=lIt[si].c;ctx.font='24px Arial,sans-serif';ctx.fillText(lIt[si].t,iW*(si+0.5),1030);}
    } else {
      /* Phase end card : recap complet, fade-in */
      var fa=Math.min(1,endProg*2.2);ctx.globalAlpha=fa;
      ctx.fillStyle=THEME.titleColor;ctx.font=familyStory?familyFitFont(opts.customName||opts.periodLabel,38,24,640,'bold'):'bold 46px Arial,sans-serif';ctx.textAlign='center';
      ctx.fillText(familyStory?(opts.customName||opts.periodLabel):opts.periodLabel,cW/2,856);
      if(familyStory&&opts.dateRangeLabel){
        ctx.fillStyle=THEME.subColor;ctx.font='21px Arial,sans-serif';
        ctx.fillText(opts.dateRangeLabel,cW/2,895);
      }
       ctx.fillStyle=THEME.gold;ctx.font=familyStory?'bold 72px Arial,sans-serif':'bold 100px Arial,sans-serif';
       var totalDurationMs=trips.reduce(function(sum,trip){return sum+(Number(trip.durationMs)||0);},0);
       ctx.fillText(formatElapsed(totalDurationMs),cW/2,968);
      ctx.fillStyle=THEME.subColor;ctx.font=familyStory?'24px Arial,sans-serif':'28px Arial,sans-serif';
       ctx.fillText('durée totale  ·  '+opts.tripCountLabel,cW/2,1012);

      /* Détail par véhicule — apparition décalée */
       var finalKm=categoryKmAt(0,1,true),eY=1082;
       var eIt=[
         {t:'\\uD83D\\uDE97 '+finalKm.car.toFixed(0)+' km',c:'#2196F3'},
         {t:'\\uD83C\\uDFCD '+finalKm.moto.toFixed(0)+' km',c:'#FF9800'},
         {t:'\\uD83D\\uDEB6 '+finalKm.walk.toFixed(0)+' km',c:'#4CAF50'},
       ];
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
        var captionWords=String(pm2.note).trim().split(/\\s+/),captionLines=[],captionLine='';
        var captionWidth=function(text){
          try{
            var measured=ctx.measureText&&ctx.measureText(text);
            if(measured&&Number.isFinite(measured.width))return measured.width;
          }catch(eMeasure){}
          return text.length*16;
        };
        for(var captionWordIndex=0;captionWordIndex<captionWords.length;captionWordIndex++){
          var captionTest=captionLine?captionLine+' '+captionWords[captionWordIndex]:captionWords[captionWordIndex];
          if(captionWidth(captionTest)<=cW-100||!captionLine){captionLine=captionTest;}
          else{captionLines.push(captionLine);captionLine=captionWords[captionWordIndex];}
        }
        if(captionLine)captionLines.push(captionLine);
        if(captionLines.length>2){
          captionLines=captionLines.slice(0,2);
          while(captionLines[1].length>1&&captionWidth(captionLines[1]+'…')>cW-100)captionLines[1]=captionLines[1].slice(0,-1);
          captionLines[1]+='…';
        }
        for(var captionLineIndex=0;captionLineIndex<captionLines.length;captionLineIndex++){
          ctx.fillText(captionLines[captionLineIndex],cW/2,boxB+48+captionLineIndex*38,cW-100);
        }
      }
    }

    if(el-lastRep>400){lastRep=el;post({type:'story_progress',p:Math.round(prog*100)});}
    if(prog<1){job.raf=requestAnimationFrame(frame);}
    else if(!stopping){
      stopping=true;
      post({type:'story_progress',p:100});
      var stopTimer=setTimeout(function(){if(!job.cancelled&&!job.terminal){try{rec.stop();}catch(e){fail('Impossible de finaliser la vidéo.');}}},300);
      job.timers.push(stopTimer);
    }
     }catch(frameError){fail('Une erreur est survenue pendant le rendu.');}
  }
   }catch(renderSetupError){fail('Impossible de préparer le rendu de la story.');}
  };
  window.cancelPeriodStory=function(jobId){
    if(ACTIVE_PERIOD_JOB&&ACTIVE_PERIOD_JOB.jobId===jobId)ACTIVE_PERIOD_JOB.cancel();
  };
  try{if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage)window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_ready'}));}catch(e){}
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
