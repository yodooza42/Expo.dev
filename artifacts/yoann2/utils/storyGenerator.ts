/**
 * Minimal HTML page hosting window.generateStory() for MediaRecorder-based
 * story (video) generation. Used by both map.native.tsx (injected into the
 * existing Leaflet WebView) and trip-map.tsx (dedicated hidden WebView).
 */
export function buildStoryHtml(): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#000">
<script>
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
      var du=fr.result,ci=du.indexOf(',');
      var mimeOut=du.slice(5,du.indexOf(';'));
      var b64=du.slice(ci+1);
      var CHUNK=200000,total=Math.ceil(b64.length/CHUNK);
      for(var i=0;i<total;i++){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_chunk',index:i,total:total,mime:mimeOut,data:b64.slice(i*CHUNK,(i+1)*CHUNK)}));
      }
    };
    fr.readAsDataURL(blob);
  };
  var route=opts.route;
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
  var DUR=18000,t0=null,lastRep=0;
  var maxSpd=opts.maxSpeed||1;
  var altSpan=Math.max(opts.maxAlt-opts.minAlt,1);
  var totalKm=opts.points.length>0?opts.points[opts.points.length-1].km:1;
  rec.start();
  function frame(ts){
    if(!t0)t0=ts;
    var el=ts-t0,prog=Math.min(1,el/DUR);
    ctx.fillStyle='#0E0E0E';ctx.fillRect(0,0,cW,cH);
    ctx.strokeStyle='#161616';ctx.lineWidth=1;
    for(var gx=0;gx<cW;gx+=60){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,cH);ctx.stroke();}
    for(var gy=0;gy<cH;gy+=60){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(cW,gy);ctx.stroke();}
    ctx.fillStyle='#141414';ctx.fillRect(0,0,cW,180);
    ctx.fillStyle=opts.color;ctx.font='bold 50px Arial,sans-serif';ctx.textAlign='center';
    ctx.fillText(opts.vehicleEmoji+'  '+opts.dateLabel,cW/2,72);
    ctx.fillStyle='#777';ctx.font='32px Arial,sans-serif';
    ctx.fillText(opts.timeLabel,cW/2,122);
    ctx.strokeStyle=opts.color+'33';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,180);ctx.lineTo(cW,180);ctx.stroke();
    if(route.length>1){
      ctx.beginPath();ctx.moveTo(projX(route[0].lng),projY(route[0].lat));
      for(var ri=1;ri<route.length;ri++)ctx.lineTo(projX(route[ri].lng),projY(route[ri].lat));
      ctx.strokeStyle='#FFFFFF0A';ctx.lineWidth=4;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    }
    var nPts=Math.max(2,Math.floor(route.length*prog));
    if(nPts>1){
      ctx.beginPath();ctx.moveTo(projX(route[0].lng),projY(route[0].lat));
      for(var ri2=1;ri2<nPts;ri2++)ctx.lineTo(projX(route[ri2].lng),projY(route[ri2].lat));
      ctx.strokeStyle=opts.color;ctx.lineWidth=6;ctx.lineJoin='round';ctx.lineCap='round';ctx.globalAlpha=0.95;ctx.stroke();ctx.globalAlpha=1;
    }
    ctx.beginPath();ctx.arc(projX(route[0].lng),projY(route[0].lat),9,0,Math.PI*2);ctx.fillStyle='#4CAF50';ctx.fill();
    var cp=route[Math.min(nPts-1,route.length-1)];
    ctx.beginPath();ctx.arc(projX(cp.lng),projY(cp.lat),14,0,Math.PI*2);ctx.fillStyle='#FFFFFF22';ctx.fill();
    ctx.beginPath();ctx.arc(projX(cp.lng),projY(cp.lat),9,0,Math.PI*2);ctx.fillStyle=opts.color;ctx.fill();
    var ci2=Math.min(Math.floor(opts.points.length*prog),opts.points.length-1);
    var curPt=opts.points[ci2]||opts.points[0];
    ctx.fillStyle='#141414';ctx.fillRect(0,800,cW,115);
    ctx.strokeStyle=opts.color+'22';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,800);ctx.lineTo(cW,800);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,915);ctx.lineTo(cW,915);ctx.stroke();
    ctx.fillStyle=opts.color;ctx.font='bold 84px Arial,sans-serif';ctx.textAlign='center';
    ctx.fillText((curPt.spd||0)+' km/h',cW/2,882);
    ctx.fillStyle='#555';ctx.font='28px Arial,sans-serif';
    ctx.fillText((curPt.km||0).toFixed(1)+' km \xB7 '+opts.durationLabel,cW/2,928);
    var sL=50,sR=670,sTop=965,sH=85;
    ctx.fillStyle='#161616';ctx.fillRect(sL-5,sTop-5,sR-sL+10,sH+10);
    ctx.fillStyle='#444';ctx.font='20px Arial,sans-serif';ctx.textAlign='left';
    ctx.fillText('VITESSE',sL,sTop-14);
    var ni=Math.max(2,Math.floor(opts.points.length*prog));
    if(ni>1){
      var pts2=opts.points.slice(0,ni);
      ctx.beginPath();ctx.moveTo(sL,sTop+sH);
      for(var j=0;j<pts2.length;j++){var spx=sL+(pts2[j].km/totalKm)*(sR-sL),spy=sTop+sH-(pts2[j].spd/maxSpd)*sH;ctx.lineTo(spx,spy);}
      ctx.lineTo(sL+(pts2[pts2.length-1].km/totalKm)*(sR-sL),sTop+sH);ctx.closePath();ctx.fillStyle=opts.color+'33';ctx.fill();
      ctx.beginPath();
      for(var j2=0;j2<pts2.length;j2++){var spx2=sL+(pts2[j2].km/totalKm)*(sR-sL),spy2=sTop+sH-(pts2[j2].spd/maxSpd)*sH;if(j2===0)ctx.moveTo(spx2,spy2);else ctx.lineTo(spx2,spy2);}
      ctx.strokeStyle=opts.color;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke();
    }
    if(opts.hasAlt){
      var aTop=1105,aH=80;
      ctx.fillStyle='#161616';ctx.fillRect(sL-5,aTop-5,sR-sL+10,aH+10);
      ctx.fillStyle='#444';ctx.font='20px Arial,sans-serif';ctx.textAlign='left';ctx.fillText('ALTITUDE',sL,aTop-14);
      var pts3=opts.points.slice(0,ni).filter(function(p){return p.alt!=null;});
      if(pts3.length>1){
        ctx.beginPath();ctx.moveTo(sL,aTop+aH);
        for(var k=0;k<pts3.length;k++){var apx=sL+(pts3[k].km/totalKm)*(sR-sL),apy=aTop+aH-((pts3[k].alt-opts.minAlt)/altSpan)*aH;ctx.lineTo(apx,apy);}
        ctx.lineTo(sL+(pts3[pts3.length-1].km/totalKm)*(sR-sL),aTop+aH);ctx.closePath();ctx.fillStyle='#AAAAAA22';ctx.fill();
        ctx.beginPath();
        for(var k2=0;k2<pts3.length;k2++){var apx2=sL+(pts3[k2].km/totalKm)*(sR-sL),apy2=aTop+aH-((pts3[k2].alt-opts.minAlt)/altSpan)*aH;if(k2===0)ctx.moveTo(apx2,apy2);else ctx.lineTo(apx2,apy2);}
        ctx.strokeStyle='#AAAAAA';ctx.lineWidth=2.5;ctx.stroke();
      }
    }
    if(prog>0.82){
      var fa=Math.min(1,(prog-0.82)/0.12);ctx.globalAlpha=fa;
      var bY=opts.hasAlt?1235:1165;
      ctx.fillStyle='#111';ctx.fillRect(0,bY-52,cW,cH-bY+52);
      ctx.fillStyle='#E0E0E0';ctx.font='bold 32px Arial,sans-serif';ctx.textAlign='center';
      var stats='MAX '+opts.maxSpeed+' km/h';
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
</script>
</body>
</html>`;
}
