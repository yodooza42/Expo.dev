/**
 * "Carnet de bord" — portrait 720x1280 journal film renderer.
 * One source for preview (interactive controls) and export (MediaRecorder).
 * The inner script avoids backticks, template interpolation and backslashes on purpose.
 */
export function buildProjectJournalHtml(): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
html,body{margin:0;height:100%;background:#2B3346;overflow:hidden;font-family:'Courier New',monospace}
#wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px}
#cv{display:block;height:calc(100% - 64px);max-width:100%;aspect-ratio:9/16;object-fit:contain;box-shadow:0 10px 30px rgba(10,14,24,.45);border-radius:4px;background:#EDF0EA}
body.export #cv{height:100%}
#ctl{display:none;align-items:center;gap:10px;width:min(92vw,560px);color:#E9ECE4;font-size:13px}
body.preview #ctl{display:flex}
#pp{width:40px;height:40px;border-radius:20px;border:1.5px solid #E9ECE4;background:transparent;color:#E9ECE4;font:600 13px 'Courier New',monospace;cursor:pointer}
#sk{flex:1;accent-color:#E3B341}
#tm{min-width:92px;text-align:right;font-variant-numeric:tabular-nums}
</style></head><body>
<div id="wrap"><canvas id="cv" width="720" height="1280"></canvas>
<div id="ctl"><button id="pp" aria-label="Lecture">&#9654;</button><input id="sk" type="range" min="0" max="1000" value="0" aria-label="Position"><span id="tm">0:00 / 0:00</span></div></div>
<script>
(function(){
var W=720,H=1280,G=24,MX=72,CX=104,CR=672,PHOTO_GROUP=4,PHOTO_INTERVAL=0.5,FIRST_PHOTO_DELAY=1;
var INK='#1E2A47',INK2='#4A5675',RED='#B8414F',OCHRE='#E3B341',PAPER='#EDF0EA';
var SERIF="'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua','Noto Serif',Georgia,serif";
var MONO="'Courier New','Courier Prime',Courier,monospace";
var cv=document.getElementById('cv'),ctx=cv.getContext('2d');
var pp=document.getElementById('pp'),sk=document.getElementById('sk'),tm=document.getElementById('tm');
var P=null,segs=[],photos=[],dur=0,t=0,playing=false,mode='idle',job=null,paperC=null;
var cache={},lastTick=0,lastFrame=0,rafId=0,ivId=0,dirty=true,seeking=false;

function post(m){try{var s=JSON.stringify(m);
  if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage)window.ReactNativeWebView.postMessage(s);
  else if(window.parent&&window.parent!==window)window.parent.postMessage(m,'*');}catch(e){}}
function clamp(v,a,b){return v<a?a:v>b?b:v}
function ease(x){x=clamp(x,0,1);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2}
function eo(x){x=clamp(x,0,1);return 1-Math.pow(1-x,3)}
function fmt(s){s=Math.max(0,Math.floor(s));return Math.floor(s/60)+':'+(s%60<10?'0':'')+(s%60)}
function str(v){return v==null?'':String(v).trim()}

/* ---------- paper ---------- */
function buildPaper(){
  var c=document.createElement('canvas');c.width=W;c.height=H;var g=c.getContext('2d');
  g.fillStyle=PAPER;g.fillRect(0,0,W,H);
  var seed=7;function rnd(){seed=(seed*16807)%2147483647;return seed/2147483647}
  for(var i=0;i<5200;i++){g.fillStyle='rgba(60,70,90,'+(rnd()*0.05)+')';g.fillRect(rnd()*W,rnd()*H,1.2,1.2)}
  g.strokeStyle='rgba(78,118,166,0.26)';g.lineWidth=1;g.beginPath();
  for(var x=G/2;x<W;x+=G){g.moveTo(Math.round(x)+.5,0);g.lineTo(Math.round(x)+.5,H)}
  for(var y=G/2;y<H;y+=G){g.moveTo(0,Math.round(y)+.5);g.lineTo(W,Math.round(y)+.5)}
  g.stroke();
  g.strokeStyle='rgba(184,65,79,0.55)';g.lineWidth=1.5;g.beginPath();g.moveTo(MX,58);g.lineTo(MX,H);g.stroke();
  var gr=g.createLinearGradient(0,0,0,60);gr.addColorStop(0,'rgba(30,42,71,0.16)');gr.addColorStop(1,'rgba(30,42,71,0)');
  g.fillStyle=gr;g.fillRect(0,0,W,60);
  for(var hx=30;hx<W;hx+=36){
    g.fillStyle='#3A4258';g.beginPath();g.arc(hx,30,6,0,7);g.fill();
    g.strokeStyle='#8C93A3';g.lineWidth=3;g.beginPath();g.arc(hx,22,10,Math.PI*0.95,Math.PI*2.05);g.stroke();
  }
  var vg=g.createRadialGradient(W/2,H/2,H*0.35,W/2,H/2,H*0.8);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(30,42,71,0.10)');
  g.fillStyle=vg;g.fillRect(0,0,W,H);
  return c;
}

/* ---------- text ---------- */
function wrap(text,maxW){
  var words=text.split(' '),lines=[],cur='';
  for(var i=0;i<words.length;i++){var w=words[i];if(!w)continue;
    while(ctx.measureText(w).width>maxW&&w.length>1){var k=w.length-1;while(k>1&&ctx.measureText(w.slice(0,k)+'-').width>maxW)k--;
      if(cur){lines.push(cur);cur=''}lines.push(w.slice(0,k)+'-');w=w.slice(k)}
    var tr=cur?cur+' '+w:w;if(ctx.measureText(tr).width<=maxW)cur=tr;else{lines.push(cur);cur=w}}
  if(cur)lines.push(cur);return lines;
}
function fit(text,font,big,small,maxW,maxLines){
  text=str(text).split(String.fromCharCode(10)).join(' ');
  for(var s=big;s>=small;s-=2){ctx.font=font.replace('#',s);var L=wrap(text,maxW);if(L.length<=maxLines)return{size:s,lines:L}}
  ctx.font=font.replace('#',small);var L2=wrap(text,maxW);
  if(L2.length>maxLines){L2=L2.slice(0,maxLines);var last=L2[maxLines-1];
    while(last.length>1&&ctx.measureText(last+'...').width>maxW)last=last.slice(0,-1);L2[maxLines-1]=last.replace(/ +$/,'')+'...'}
  return{size:small,lines:L2};
}
function lines(f,font,x,y,lh,color,a){ctx.font=font.replace('#',f.size);ctx.fillStyle=color;ctx.textBaseline='alphabetic';
  for(var i=0;i<f.lines.length;i++){ctx.globalAlpha=a*clamp(1,0,1);ctx.fillText(f.lines[i],x,y+i*f.size*lh)}ctx.globalAlpha=1;return y+f.lines.length*f.size*lh}
function one(text,font,size,maxW){ctx.font=font.replace('#',size);text=str(text);if(ctx.measureText(text).width<=maxW)return text;
  while(text.length>1&&ctx.measureText(text+'...').width>maxW)text=text.slice(0,-1);return text+'...'}
function scribble(x,y,w,p,col,lw){if(p<=0)return;ctx.save();ctx.strokeStyle=col;ctx.lineWidth=lw||3;ctx.lineCap='round';ctx.beginPath();
  var n=24,e=Math.max(1,Math.round(n*p));for(var i=0;i<=e;i++){var px=x+w*i/n,py=y+Math.sin(i*1.7)*1.6+i*0.15;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py)}
  ctx.stroke();ctx.restore()}

/* ---------- timeline ---------- */
function build(p){
  segs=[];photos=[];var spp=Math.max(1.5,Number(p.secondsPerPhoto)||3);
  segs.push({k:'intro',d:4});
  (p.entries||[]).forEach(function(e,ei){var ph=e.photos||[];
    var first=photos.length;
    ph.forEach(function(x,pi){photos.push({ei:ei,pi:pi,ph:x,title:e.title,dateLabel:e.dateLabel})});
    var titleDur=Math.max(ph.length?3:4,Math.min(16,2+Math.ceil((str(e.title).length+str(e.caption).length)/24)));
    if(e.recapTasks&&e.recapTasks.length){
      var pages=Math.ceil(e.recapTasks.length/6),rd=Math.max(8,Math.min(16,4+pages*4+Math.ceil(str(e.caption).length/60)));
      for(var rp=0;rp<pages;rp++)segs.push({k:'recap',ei:ei,rp:rp,pages:pages,d:rd});
    }else{
      var firstCount=Math.min(PHOTO_GROUP,ph.length);
      titleDur=Math.max(titleDur,firstCount?FIRST_PHOTO_DELAY+(firstCount-1)*PHOTO_INTERVAL+spp:0);
      segs.push({k:'title',ei:ei,d:titleDur,photoStart:first,photoCount:firstCount,photoDelay:FIRST_PHOTO_DELAY});
    }
    var start=e.recapTasks&&e.recapTasks.length?0:Math.min(PHOTO_GROUP,ph.length);
    for(var pi=start;pi<ph.length;pi+=PHOTO_GROUP){
      var count=Math.min(PHOTO_GROUP,ph.length-pi);
      segs.push({k:'photos',ei:ei,photoStart:first+pi,photoCount:count,
        d:(count-1)*PHOTO_INTERVAL+spp});
    }});
  var comparisonStart=photos.length;
  if(p.finalComparisonImages){
    var beforeItems=p.finalComparisonImages.before||[],afterItems=p.finalComparisonImages.after||[];
    beforeItems.forEach(function(item,pi){photos.push({ei:-1,pi:pi,ph:{id:item.id,img:item.img,caption:''},
      title:p.finalComparisonImages.projectName+' · Avant',dateLabel:item.dateLabel,comparisonSide:'before'})});
    afterItems.forEach(function(item,pi){photos.push({ei:-1,pi:pi,ph:{id:item.id,img:item.img,caption:''},
      title:p.finalComparisonImages.projectName+' · Après',dateLabel:item.dateLabel,comparisonSide:'after'})});
    segs.push({k:'comparison',d:10,photoStart:comparisonStart,photoCount:beforeItems.length+afterItems.length,
      beforeCount:beforeItems.length});
  }
  segs.push({k:'outro',d:4});
  var at=0,ng=photos.length,nc=0;for(var i=segs.length-1;i>=0;i--){
    if(segs[i].photoCount){ng=segs[i].photoStart;nc=segs[i].photoCount}
    segs[i].nextPhotoStart=ng;segs[i].nextPhotoCount=nc;
  }
  segs.forEach(function(s,i){s.s=at;s.i=i;at+=s.d});dur=Math.round(at*1000)/1000;window.journalDuration=dur;
}
function segAt(tt){for(var i=segs.length-1;i>=0;i--)if(tt>=segs[i].s)return segs[i];return segs[0]}

/* ---------- photo loader: current + next only ---------- */
function release(k){var c=cache[k];if(!c)return;clearTimeout(c.to);c.img.onload=c.img.onerror=null;try{c.img.src=''}catch(e){}delete cache[k]}
function releaseAll(){Object.keys(cache).forEach(release)}
function load(gi){
  if(gi<0||gi>=photos.length||cache[gi])return;
  var img=new Image(),c={img:img,st:'loading'};cache[gi]=c;
  var fail=function(why){if(c.st!=='loading')return;c.st='error';clearTimeout(c.to);
     var p=photos[gi],e=p.ei>=0?P.entries[p.ei]:p;c.msg='Photo '+(p.pi+1)+' de "'+str(e.title)+'" ('+str(e.dateLabel)+', entrée '+(e.id||'comparatif')+', photo '+p.ph.id+') : '+why;onLoadError(c.msg)};
  c.to=setTimeout(function(){fail('chargement trop long (10 s).')},10000);
  img.onload=function(){if(c.st!=='loading')return;if(!img.naturalWidth){fail('image vide.');return}
    var done=function(){if(c.st!=='loading')return;clearTimeout(c.to);c.st='ok';dirty=true};
    if(img.decode)img.decode().then(done,function(){fail('décodage impossible.')});else done()};
  img.onerror=function(){fail('image illisible.')};
  img.src=photos[gi].ph.img;
}
function photoIndex(seg,lt){
  var delay=Number(seg.photoDelay)||0,elapsed=Math.max(0,lt-delay);
  return Math.min(seg.photoCount-1,Math.floor(elapsed/PHOTO_INTERVAL));
}
function ensure(seg,lt){
  var keep={},loads={};
  function include(index){if(index<0||index>=photos.length)return;keep[index]=1;loads[index]=1}
  function includeCurrent(target,at){
    if(!target||!target.photoCount)return;
    if(target.k==='comparison'){for(var c=0;c<target.photoCount;c++)include(target.photoStart+c);return}
    var active=photoIndex(target,at),elapsed=Math.max(0,at-(Number(target.photoDelay)||0));
    include(target.photoStart+active);
    if(active>0&&elapsed-active*PHOTO_INTERVAL<0.2)include(target.photoStart+active-1);
    if(active+1<target.photoCount)include(target.photoStart+active+1);
  }
  includeCurrent(seg,lt);
  var prev=segs[seg.i-1];
  if(prev&&lt<TURN)includeCurrent(prev,prev.d-0.001);
  if(!seg.photoCount&&seg.nextPhotoCount)include(seg.nextPhotoStart);
  var next=segs[seg.i+1];
  if(next&&seg.d-lt<1.2){
    if(next.photoCount)include(next.photoStart);
    else if(next.nextPhotoCount)include(next.nextPhotoStart);
  }
  Object.keys(cache).forEach(function(k){if(!keep[k])release(k)});
  Object.keys(loads).forEach(function(k){load(Number(k))});
}
function ready(seg,lt){
  if(!seg.photoCount)return true;
  if(seg.k==='comparison'){
    for(var i=seg.photoStart;i<seg.photoStart+seg.photoCount;i++){var c=cache[i];if(!c||c.st!=='ok')return false}
    return true;
  }
  var active=seg.photoStart+photoIndex(seg,lt),current=cache[active];
  return !!current&&current.st==='ok';
}

/* ---------- drawing ---------- */
function folio(seg){
  var p=dur?t/dur:0;ctx.fillStyle=INK2;ctx.font='16px '+MONO;ctx.textAlign='left';
  ctx.fillText('CARNET DE BORD',CX,H-30);ctx.textAlign='right';
  ctx.fillText('p. '+(seg.i+1)+' / '+segs.length,CR,H-30);ctx.textAlign='left';
  var y=H-60,x0=CX,w=CR-CX;ctx.strokeStyle='rgba(30,42,71,0.35)';ctx.lineWidth=1;ctx.strokeRect(x0+.5,y-5.5,w,11);
  ctx.save();ctx.beginPath();ctx.rect(x0,y-6,w*p,12);ctx.clip();ctx.strokeStyle=INK;ctx.lineWidth=2;ctx.beginPath();
  for(var hx=x0-12;hx<x0+w;hx+=6){ctx.moveTo(hx,y+6);ctx.lineTo(hx+12,y-6)}ctx.stroke();ctx.restore();
}
function stamp(text,x,y,a){ctx.save();ctx.globalAlpha=a;ctx.translate(x,y);ctx.rotate(-0.035);ctx.font='bold 22px '+MONO;
  var tx=one(text.toUpperCase(),'bold #px '+MONO,22,CR-x-30),w=ctx.measureText(tx).width+28;
  ctx.strokeStyle=RED;ctx.lineWidth=2.5;ctx.strokeRect(0,-30,w,42);ctx.fillStyle=RED;ctx.fillText(tx,14,0);ctx.restore()}
function drawIntro(lt,a){
  var p=P,y=150;
  ctx.globalAlpha=a*eo(lt/0.6);ctx.fillStyle=RED;ctx.font='bold 20px '+MONO;ctx.fillText('CARNET DE BORD  /  YOANN2.0',CX,y);
  var tf=fit(p.title||'Carnet de bord','italic bold #px '+SERIF,84,36,CR-CX,3);
  ctx.globalAlpha=1;y=lines(tf,'italic bold #px '+SERIF,CX,y+30+tf.size,1.06,INK,a*eo((lt-0.2)/0.8));
  scribble(CX,y-tf.size*0.6+22,Math.min(CR-CX,360),ease((lt-0.7)/0.9)*a,OCHRE,9);
  var pf=fit(p.periodLabel,'italic #px '+SERIF,36,24,CR-CX,2);y=lines(pf,'italic #px '+SERIF,CX,y+48,1.2,INK2,a*eo((lt-0.9)/0.7));
  var names=(p.projectNames||[]).filter(function(n){return str(n)}),show=names.slice(0,5);y+=40;
  ctx.font='22px '+MONO;
  show.forEach(function(n,i){ctx.globalAlpha=a*eo((lt-1.3-i*0.15)/0.5);ctx.fillStyle=INK;ctx.fillText('-  '+one(n,'#px '+MONO,22,CR-CX-40),CX,y+i*G*2)});
  if(names.length>5){ctx.globalAlpha=a*eo((lt-2.3)/0.5);ctx.fillStyle=INK2;ctx.fillText('+ '+(names.length-5)+' autres projets',CX,y+5*G*2)}
  ctx.globalAlpha=a*eo((lt-2.2)/0.6);ctx.fillStyle=INK;ctx.font='bold 26px '+MONO;
  var ec=Number(p.entryCount)||P.entries.length,pc=Number(p.photoCount)||photos.length;
  ctx.fillText(ec+(ec>1?' ENTRÉES':' ENTRÉE')+'  .  '+pc+(pc>1?' PHOTOS':' PHOTO'),CX,H-140);ctx.globalAlpha=1;
}
function drawPhotoFrame(start,count,lt,a,delay,top,bottom){
  if(!count)return;
  var elapsed=Math.max(0,lt-delay),index=Math.min(count-1,Math.floor(elapsed/PHOTO_INTERVAL));
  var fade=eo((elapsed-index*PHOTO_INTERVAL)/0.18),gi=start+index;
  function paint(photoIndex,alpha){
    var photo=photos[start+photoIndex],c=cache[start+photoIndex],img=c&&c.st==='ok'?c.img:null;
    ctx.save();ctx.globalAlpha=a*alpha;
    if(img){
      /* Preserve the complete source frame and aspect ratio; do not crop, filter, or frame it. */
      var scale=Math.min((CR-CX)/img.naturalWidth,(bottom-top)/img.naturalHeight);
      var iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;
      ctx.drawImage(img,CX+(CR-CX-iw)/2,top+(bottom-top-ih)/2,iw,ih);
    }else{
      ctx.fillStyle=INK2;ctx.font='16px '+MONO;ctx.textAlign='center';
      ctx.fillText(c&&c.st==='error'?'Photo introuvable':'Chargement',(CX+CR)/2,(top+bottom)/2);ctx.textAlign='left';
    }
    var caption=str(photo.ph.caption);
    if(caption){
      var cf=fit(caption,'italic #px '+SERIF,18,13,CR-CX,2);
      lines(cf,'italic #px '+SERIF,CX,bottom+32,1.08,INK,alpha);
    }
    ctx.globalAlpha=a;ctx.fillStyle=RED;ctx.font='bold 12px '+MONO;ctx.textAlign='right';
    ctx.fillText(String(photo.pi+1),CR,bottom+52);ctx.textAlign='left';
    ctx.restore();
  }
  /* Draw the previous photo underneath briefly, then reveal the next one over it. */
  if(index>0&&fade<1)paint(index-1,1);
  paint(index,fade);
}
function drawTitle(seg,lt,a){
  var e=P.entries[seg.ei],y=150,n=seg.ei+1;
  ctx.globalAlpha=a;ctx.save();ctx.translate(MX/2,y+150);ctx.rotate(-Math.PI/2);ctx.fillStyle=RED;ctx.font='bold 20px '+MONO;ctx.textAlign='center';
  ctx.fillText('N° '+(n<10?'0':'')+n,0,6);ctx.restore();
  stamp(str(e.dateLabel)||str(e.dateKey),CX,y,a*eo(lt/0.35));
  ctx.globalAlpha=a*eo((lt-0.1)/0.4);ctx.fillStyle=INK2;ctx.font='bold 20px '+MONO;
  ctx.fillText(one((e.project||'').toUpperCase(),'bold #px '+MONO,20,CR-CX),CX,y+70);
  if(e.parentTaskTitle){ctx.globalAlpha=a*eo((lt-0.12)/0.4);ctx.fillStyle=RED;ctx.font='bold 16px '+MONO;
    ctx.fillText(one('TÂCHE · '+e.parentTaskTitle,'bold #px '+MONO,16,CR-CX),CX,y+104)}
  var tf=fit(e.title||'Sans titre','bold #px '+SERIF,58,28,CR-CX,3),ty=y+(e.parentTaskTitle?154:120)+tf.size*0.8;
  ctx.globalAlpha=1;var yy=lines(tf,'bold #px '+SERIF,CX,ty,1.12,INK,a*eo((lt-0.15)/0.5));
  scribble(CX,yy-tf.size*0.6+28,Math.min(CR-CX,300),ease((lt-0.5)/0.6)*a,OCHRE,7);
  var cap=str(e.caption);yy+=28;
  if(cap){var cf=fit(cap,'italic #px '+SERIF,28,20,CR-CX,3);ctx.globalAlpha=1;yy=lines(cf,'italic #px '+SERIF,CX,yy+cf.size,1.18,INK,a*eo((lt-0.6)/0.6))}
  var ph=(e.photos||[]).length;
  if(seg.photoCount){
    var top=Math.max(500,Math.min(650,yy+36)),bottom=H-174;
    ctx.globalAlpha=a*eo((lt-0.8)/0.4);ctx.fillStyle=INK2;ctx.font='bold 15px '+MONO;
    ctx.fillText('PHOTOS '+(photos[seg.photoStart].pi+1)+'–'+
      (photos[seg.photoStart+seg.photoCount-1].pi+1)+' / '+ph,CX,top-14);
    drawPhotoFrame(seg.photoStart,seg.photoCount,lt,a,seg.photoDelay,top,bottom);
  }else{
    ctx.globalAlpha=a*eo((lt-0.8)/0.5);ctx.fillStyle=INK2;ctx.font='18px '+MONO;
    ctx.fillText((e.kind==='project'?'PROJET':'TÂCHE TERMINÉE')+'  .  sans photo',CX,Math.min(H-110,yy+50));
  }
  ctx.globalAlpha=1;
}
function drawPhotos(seg,lt,a){
  var e=P.entries[seg.ei],count=seg.photoCount,start=seg.photoStart;
  var first=photos[start],last=photos[start+count-1],total=(e.photos||[]).length;
  stamp('SUITE DE L’ETAPE',CX,132,a*eo(lt/0.35));
  ctx.globalAlpha=a*eo((lt-0.1)/0.4);ctx.fillStyle=INK2;ctx.font='bold 18px '+MONO;
  ctx.fillText(one((str(e.dateLabel)+'  .  '+str(e.project)).toUpperCase(),'bold #px '+MONO,18,CR-CX),CX,202);
  if(e.parentTaskTitle){ctx.globalAlpha=a*eo((lt-0.12)/0.4);ctx.fillStyle=RED;ctx.font='bold 14px '+MONO;
    ctx.fillText(one('TÂCHE · '+e.parentTaskTitle,'bold #px '+MONO,14,CR-CX),CX,240)}
  var tf=fit(e.title||'Sans titre','bold #px '+SERIF,42,24,CR-CX,2);
  lines(tf,'bold #px '+SERIF,CX,e.parentTaskTitle?286:270,1.1,INK,a*eo((lt-0.15)/0.45));
  ctx.globalAlpha=a*eo((lt-0.3)/0.4);ctx.fillStyle=RED;ctx.font='bold 16px '+MONO;
  ctx.fillText('PHOTOS '+(first.pi+1)+'–'+(last.pi+1)+' / '+total,CX,370);
  drawPhotoFrame(start,count,lt,a,0,405,H-174);
  ctx.globalAlpha=1;
}
function drawRecap(seg,lt,a){
  var e=P.entries[seg.ei],all=e.recapTasks||[],rows=all.slice(seg.rp*6,seg.rp*6+6);
  stamp('PROJET TERMINÉ',CX,140,a*eo(lt/0.4));
  var tf=fit(e.project,'bold #px '+SERIF,48,26,CR-CX,2);
  lines(tf,'bold #px '+SERIF,CX,218,1.15,INK,a*eo((lt-0.1)/0.4));
  ctx.globalAlpha=a;ctx.fillStyle=INK2;ctx.font='18px '+MONO;
  ctx.fillText(all.length+' / '+all.length+' tâches accomplies'+(seg.pages>1?'  .  '+(seg.rp+1)+' / '+seg.pages:''),CX,312);
  rows.forEach(function(row,i){
    var y=378+i*104,alpha=a*eo((lt-0.25-i*0.1)/0.5);
    ctx.globalAlpha=alpha;ctx.strokeStyle=RED;ctx.lineWidth=2.5;ctx.strokeRect(CX,y-19,23,23);
    ctx.beginPath();ctx.moveTo(CX+4,y-9);ctx.lineTo(CX+10,y-3);ctx.lineTo(CX+22,y-22);ctx.stroke();
    var rf=fit(row.title,'bold #px '+SERIF,25,18,CR-CX-42,2);
    lines(rf,'bold #px '+SERIF,CX+40,y,1.15,INK,alpha);
    ctx.globalAlpha=alpha;ctx.font='15px '+MONO;ctx.fillStyle=INK2;
    ctx.fillText(str(row.dateLabel),CX+40,y+64);
  });
  scribble(CX,1030,CR-CX,ease((lt-0.7)/0.7)*a,OCHRE,4);
  var cf=fit(e.caption,'italic #px '+SERIF,29,20,CR-CX,3);
  lines(cf,'italic #px '+SERIF,CX,1080,1.2,INK,a*eo((lt-0.9)/0.5));ctx.globalAlpha=1;
}
function drawComparison(seg,lt,a){
  var comparison=P.finalComparisonImages;
  if(!comparison)return;
  stamp('AVANT / APRÈS',CX,145,a*eo(lt/0.4));
  var tf=fit(comparison.projectName,'bold #px '+SERIF,54,30,CR-CX,2);
  lines(tf,'bold #px '+SERIF,CX,245,1.1,INK,a*eo((lt-0.1)/0.45));
  var gap=20,cellW=(CR-CX-gap)/2,imageH=245,top=352,rowGap=105,beforeCount=comparison.before.length;
  ctx.globalAlpha=a*eo((lt-0.2)/0.4);ctx.fillStyle=INK2;ctx.font='bold 18px '+MONO;
  ctx.fillText('AVANT',CX,320);ctx.fillText('APRÈS',CX+cellW+gap,320);
  for(var i=0;i<seg.photoCount;i++){
    var isBefore=i<beforeCount,sideIndex=isBefore?i:i-beforeCount;
    var sideCount=isBefore?comparison.before.length:comparison.after.length;
    var x=CX+(isBefore?0:cellW+gap);
    var topY=sideCount===1?525:top+sideIndex*(imageH+rowGap);
    var gi=seg.photoStart+i,c=cache[gi],img=c&&c.st==='ok'?c.img:null,item=photos[gi];
    ctx.globalAlpha=a*eo((lt-0.25-i*0.12)/0.35);
    ctx.strokeStyle='rgba(30,42,71,0.35)';ctx.lineWidth=1.5;ctx.strokeRect(x+.5,topY+.5,cellW-1,imageH-1);
    if(img){
      var scale=Math.min((cellW-12)/img.naturalWidth,(imageH-12)/img.naturalHeight);
      var iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;
      ctx.drawImage(img,x+(cellW-iw)/2,topY+(imageH-ih)/2,iw,ih);
    }else{
      ctx.fillStyle=INK2;ctx.font='15px '+MONO;ctx.textAlign='center';
      ctx.fillText(c&&c.st==='error'?'Photo introuvable':'Chargement',x+cellW/2,topY+imageH/2);ctx.textAlign='left';
    }
    ctx.globalAlpha=a*eo((lt-0.3-i*0.12)/0.35);ctx.fillStyle=RED;ctx.font='bold 14px '+MONO;
    ctx.fillText(str(item.dateLabel),x,topY+imageH+25);
  }
  scribble(CX,1015,CR-CX,ease((lt-0.8)/0.7)*a,OCHRE,5);
  ctx.globalAlpha=a;ctx.fillStyle=INK2;ctx.font='italic 26px '+SERIF;
  ctx.fillText('Le chemin parcouru, en images.',CX,1074);ctx.globalAlpha=1;
}
function drawOutro(lt,a){
  var y=360;ctx.globalAlpha=a*eo(lt/0.6);ctx.fillStyle=RED;ctx.font='bold 20px '+MONO;ctx.fillText('DERNIÈRE PAGE',CX,y);
  ctx.globalAlpha=a*eo((lt-0.2)/0.7);ctx.fillStyle=INK;ctx.font='italic bold 80px '+SERIF;ctx.fillText('Fin du carnet.',CX,y+110);
  scribble(CX,y+140,330,ease((lt-0.6)/0.8)*a,OCHRE,9);
  var ec=P.entries.length,pc=photos.length,sum=ec+(ec>1?' travaux consignés, ':' travail consigné, ')+pc+(pc>1?' photos gardées.':' photo gardée.');
  var f=fit(sum,'italic #px '+SERIF,34,24,CR-CX,3);ctx.globalAlpha=1;var yy=lines(f,'italic #px '+SERIF,CX,y+220,1.3,INK2,a*eo((lt-0.9)/0.6));
  var pf=fit(P.periodLabel,'bold #px '+MONO,22,16,CR-CX,2);yy=lines(pf,'bold #px '+MONO,CX,yy+40,1.4,INK,a*eo((lt-1.2)/0.6));
  var sp=ease((lt-1.6)/1.2);if(sp>0){ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=INK;ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();
    var N=60,e2=Math.round(N*sp);for(var i=0;i<=e2;i++){var u=i/N,px=CR-300+u*260,py=yy+150+Math.sin(u*19)*18*(1-u*0.6)-u*20;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py)}
    ctx.stroke();ctx.restore()}
  ctx.globalAlpha=1;
}
function content(seg,lt,a){if(seg.k==='intro')drawIntro(lt,a);else if(seg.k==='title')drawTitle(seg,lt,a);else if(seg.k==='recap')drawRecap(seg,lt,a);else if(seg.k==='photos')drawPhotos(seg,lt,a);else if(seg.k==='comparison')drawComparison(seg,lt,a);else drawOutro(lt,a)}
function page(seg,lt,a){ctx.drawImage(paperC,0,0);content(seg,lt,a);folio(seg)}
var TURN=0.7;
function render(){
  if(!P||!paperC)return;var seg=segAt(t),lt=t-seg.s,prev=segs[seg.i-1];ensure(seg,lt);
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.textAlign='left';
  if(prev&&lt<TURN){
    page(seg,lt,1);var k=ease(lt/TURN);
    ctx.save();ctx.translate(0,-H*k);ctx.shadowColor='rgba(20,26,40,0.35)';ctx.shadowBlur=40;ctx.shadowOffsetY=20;ctx.fillStyle=PAPER;ctx.fillRect(0,0,W,H);
    ctx.shadowColor='transparent';ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();page(prev,prev.d-0.001,1);ctx.restore();
  }else page(seg,lt,1);
  if(seg.k==='outro'&&lt>seg.d-0.8){ctx.globalAlpha=ease((lt-(seg.d-0.8))/0.8)*0.85;ctx.fillStyle=PAPER;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1}
  dirty=false;
}

/* ---------- clock (shared by preview and export) ---------- */
function ui(){if(mode!=='preview')return;pp.innerHTML=playing?'II':'&#9654;';if(!seeking)sk.value=String(Math.round(dur?t/dur*1000:0));tm.textContent=fmt(t)+' / '+fmt(dur)}
function tick(){
  if(mode==='idle')return;var now=performance.now();if(now-lastFrame<31)return;lastFrame=now;
  var dt=lastTick?(now-lastTick)/1000:0;lastTick=now;var seg=segAt(t);
  if(playing){
    if(mode==='export')exportStep(seg,dt);
    else if(ready(seg,t-seg.s)){t=Math.min(dur,t+Math.min(dt,0.25));if(t>=dur){playing=false}}
    dirty=true;
  }
  if(dirty)render();ui();
}
function startLoop(){stopLoop();lastTick=0;var loop=function(){rafId=requestAnimationFrame(loop);tick()};rafId=requestAnimationFrame(loop);ivId=setInterval(tick,34)}
function stopLoop(){if(rafId)cancelAnimationFrame(rafId);if(ivId)clearInterval(ivId);rafId=ivId=0}

/* ---------- export ---------- */
function pickMime(){var c=['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  if(!window.MediaRecorder)return null;for(var i=0;i<c.length;i++){try{if(MediaRecorder.isTypeSupported(c[i]))return c[i]}catch(e){}}return null}
function onLoadError(msg){if(job&&!job.dead){fail(job,msg)}else if(mode==='preview'){post({type:'story_error',jobId:P&&P.jobId,message:msg})}}
function cleanup(j){
  if(j)j.dead=true;stopLoop();playing=false;mode='idle';
  if(j&&j.hb)clearInterval(j.hb);
  if(j&&j.rec){j.rec.ondataavailable=null;j.rec.onstop=null;try{if(j.rec.state!=='inactive')j.rec.stop()}catch(e){}}
  if(j&&j.stream)j.stream.getTracks().forEach(function(tr){try{tr.stop()}catch(e){}});
  if(j){j.parts=[];j.rec=j.stream=null}
  releaseAll();if(job===j)job=null;
}
function fail(j,msg){if(j.dead)return;var id=j.id;cleanup(j);cv.width=1;cv.height=1;post({type:'story_error',jobId:id,message:String(msg||'Erreur inconnue.')})}
function exportStep(seg,dt){
  var j=job;if(!j||j.dead)return;
  var nextT=Math.min(dur,t+dt),nextSeg=segAt(nextT);
  if(!ready(nextSeg,nextT-nextSeg.s)){ensure(nextSeg,nextT-nextSeg.s);
    if(j.rec.state==='recording'){try{j.rec.pause()}catch(e){}}
    if(!j.waitAt)j.waitAt=performance.now();return}
  if(!ready(seg,t-seg.s)){if(j.rec.state==='recording'){try{j.rec.pause()}catch(e){}}
    if(!j.waitAt)j.waitAt=performance.now();return}
  if(j.waitAt){j.waitAt=0;if(j.rec.state==='paused'){try{j.rec.resume()}catch(e){}}lastTick=performance.now();return}
  t=Math.min(dur,t+dt);
  var now=performance.now();if(now-j.lastP>500){j.lastP=now;post({type:'story_progress',jobId:j.id,p:Math.round(t/dur*100)})}
  if(t>=dur&&!j.ending){j.ending=true;render();setTimeout(function(){if(!j.dead&&j.rec)try{j.rec.stop()}catch(e){fail(j,e.message)}},250)}
}
function b64(u8){var s='';for(var i=0;i<u8.length;i+=0x8000)s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));return btoa(s)}
function sliceBuf(b){return b.arrayBuffer?b.arrayBuffer():new Response(b).arrayBuffer()}
async function sendChunks(j,blob,mime){
  var SZ=98304,total=Math.ceil(blob.size/SZ);post({type:'story_phase',jobId:j.id,phase:'export',completed:0,total:total});
  for(var i=0;i<total;i++){if(j.dead)return;var buf=await sliceBuf(blob.slice(i*SZ,Math.min(blob.size,(i+1)*SZ)));if(j.dead)return;
    post({type:'story_chunk',jobId:j.id,index:i,total:total,mime:mime,data:b64(new Uint8Array(buf))});
    await new Promise(function(r){setTimeout(r,0)})}
  if(j.dead)return;var id=j.id;cleanup(j);cv.width=1;cv.height=1;post({type:'story_done',jobId:id,mime:mime,total:total,bytes:blob.size});
}
function waitPhoto(j,gi){return new Promise(function(res,rej){if(gi>=photos.length)return res();load(gi);
  var iv=setInterval(function(){if(j.dead){clearInterval(iv);return rej(new Error('cancel'))}var c=cache[gi];
    if(c&&c.st==='ok'){clearInterval(iv);res()}else if(c&&c.st==='error'){clearInterval(iv);rej(new Error(c.msg))}},50)})}
async function runExport(j){
  var mimeFull=pickMime();if(!mimeFull||!cv.captureStream)throw new Error("L'enregistrement vidéo n'est pas disponible sur cet appareil.");
  var mime=mimeFull.indexOf('mp4')>=0?'video/mp4':'video/webm';
  post({type:'story_phase',jobId:j.id,phase:'prepare'});
  j.hb=setInterval(function(){if(!j.dead)post({type:'story_progress',jobId:j.id,p:0})},1000);
  t=0;ensure(segs[0],0);await waitPhoto(j,0);clearInterval(j.hb);j.hb=0;if(j.dead)return;
  render();j.stream=cv.captureStream(30);j.parts=[];j.size=0;
  /* Leave headroom under the 96 MB limit even for a long notebook. */
  var bitrate=Math.max(700000,Math.min(5000000,Math.floor(72*1024*1024*8/Math.max(1,dur))));
  j.rec=new MediaRecorder(j.stream,{mimeType:mimeFull,videoBitsPerSecond:bitrate});
  j.rec.ondataavailable=function(ev){if(j.dead||!ev.data||!ev.data.size)return;j.size+=ev.data.size;j.parts.push(ev.data);
    if(j.size>96*1024*1024)fail(j,'La vidéo dépasse 96 Mo. Réduisez le nombre de photos ou la durée.')};
  j.rec.onerror=function(ev){fail(j,'Enregistrement interrompu : '+((ev&&ev.error&&ev.error.message)||'erreur'))};
  j.rec.onstop=function(){if(j.dead)return;var parts=j.parts;j.parts=[];if(j.stream)j.stream.getTracks().forEach(function(tr){tr.stop()});
    stopLoop();playing=false;var blob=new Blob(parts,{type:mime});parts=null;
    if(!blob.size)return fail(j,'Aucune image vidéo enregistrée.');
    if(blob.size>96*1024*1024)return fail(j,'La vidéo dépasse 96 Mo.');
    sendChunks(j,blob,mime).catch(function(e){fail(j,e.message)})};
  post({type:'story_phase',jobId:j.id,phase:'recording'});
  j.lastP=0;mode='export';playing=true;j.rec.start(1000);startLoop();
}

/* ---------- public API ---------- */
window.generatePeriodStory=function(payload){
  if(job)cleanup(job);stopLoop();releaseAll();
  try{if(!payload||!Array.isArray(payload.entries))throw new Error('Données du carnet invalides.');
    P=payload;cv.width=W;cv.height=H;ctx=cv.getContext('2d');if(!paperC)paperC=buildPaper();build(P);t=0;
  }catch(e){post({type:'story_error',jobId:payload&&payload.jobId,message:e.message});return}
  if(P.preview){document.body.className='preview';mode='preview';playing=true;dirty=true;startLoop();return}
  document.body.className='export';var j={id:P.jobId,dead:false};job=j;
  runExport(j).catch(function(e){if(!j.dead&&e.message!=='cancel')fail(j,e.message)});
};
window.cancelPeriodStory=function(jobId){if(job&&(jobId==null||job.id===jobId)){cleanup(job);cv.width=1;cv.height=1;paperC=null}};
window.journalSeek=function(s){if(!P||mode==='export')return;t=clamp(Number(s)||0,0,dur);lastTick=0;dirty=true;render();ui()};
window.journalPlay=function(){if(!P||mode!=='preview')return;if(t>=dur)t=0;playing=true;lastTick=0;ui()};
window.journalPause=function(){if(mode!=='preview')return;playing=false;ui()};
window.journalDuration=0;
pp.onclick=function(){if(playing)window.journalPause();else window.journalPlay()};
sk.oninput=function(){seeking=true;window.journalSeek(Number(sk.value)/1000*dur)};
sk.onchange=function(){seeking=false;ui()};
window.addEventListener('pagehide',function(){if(job)cleanup(job);releaseAll();stopLoop()});
post({type:'story_ready'});
})();
</script></body></html>`;
}
