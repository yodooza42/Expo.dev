import React from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';

interface Props { onDone: () => void; }

// ─── Full HTML/Canvas animation ───────────────────────────────────────────────
// No images used. Everything is drawn procedurally:
//   • Doom-fire algorithm  → pixel-level fire simulation
//   • Bezier paths         → phoenix body, wings, tail, head, crown
//   • Wing flap            → sin-wave animation on bezier control points
//   • Sparks               → physics particles with gravity
//   • Text                 → letter-by-letter golden reveal with glow
const HTML = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#000;touch-action:none}
#c{position:fixed;top:0;left:0;width:100%;height:100%}
</style></head><body>
<canvas id="c"></canvas>
<script>
var cv=document.getElementById('c');
var W=cv.width=window.innerWidth;
var H=cv.height=window.innerHeight;
var g=cv.getContext('2d');
var CX=W/2;

// ── Doom fire ────────────────────────────────────────────────────────────────
var FW=120,FH=180;
var fbuf=new Uint8Array(FW*FH);
var fCv=document.createElement('canvas');
fCv.width=FW; fCv.height=FH;
var fG=fCv.getContext('2d');
var fId=fG.createImageData(FW,FH);
var fD=fId.data;

// Palette: black → dark red → red → orange → yellow → white
var PAL=[];
for(var i=0;i<256;i++){
  var r=0,gr=0,b=0;
  if(i<85){r=Math.round(i*3);}
  else if(i<170){r=255;gr=Math.round((i-85)*3);}
  else{r=255;gr=255;b=Math.round((i-170)*3);}
  PAL.push([r,gr,b]);
}

function seed(y,heat){for(var x=0;x<FW;x++)fbuf[y*FW+x]=heat;}

function stepFire(){
  for(var y=0;y<FH-1;y++){
    for(var x=0;x<FW;x++){
      var below=fbuf[(y+1)*FW+x];
      var d=(Math.random()*3)|0;
      var nx=(x-d+1+FW)%FW;
      fbuf[y*FW+nx]=Math.max(0,below-(d>0?1:0));
    }
  }
}

function renderFire(alpha){
  for(var i=0;i<FW*FH;i++){
    var v=fbuf[i];var c=PAL[v];
    var p=i<<2;
    fD[p]=c[0];fD[p+1]=c[1];fD[p+2]=c[2];
    fD[p+3]=v>0?Math.round(alpha*255):0;
  }
  fG.putImageData(fId,0,0);
  g.save();
  g.imageSmoothingEnabled=true;
  var fH2=H*0.82,fY=H-fH2;
  g.drawImage(fCv,0,fY,W,fH2);
  g.restore();
}

// ── Phoenix (pure bezier drawing) ─────────────────────────────────────────────
function drawPhoenix(t,opacity,showGlow){
  if(opacity<=0)return;
  g.save();
  g.globalAlpha=Math.min(1,opacity);

  var px=CX, py=H*0.55;
  g.translate(px,py);

  var SPAN=W*0.44;           // half wingspan
  var BH=H*0.20;             // half body height
  var flapA=Math.sin(t*4.2)*0.38;   // wing flap (radians)
  var flapY=flapA*SPAN*0.55; // tip vertical displacement

  // Tail feathers
  for(var ti=-3;ti<=3;ti++){
    var ta=ti*0.22;
    var tx2=Math.sin(ta)*55,ty2=BH*0.35+90+Math.abs(ti)*5;
    g.beginPath();
    g.moveTo(Math.sin(ta)*18,BH*0.25);
    g.quadraticCurveTo(Math.sin(ta)*38,BH*0.4+30,tx2,ty2);
    var tg2=g.createLinearGradient(0,BH*0.25,tx2,ty2);
    tg2.addColorStop(0,'rgba(255,100,0,0.9)');
    tg2.addColorStop(0.6,'rgba(255,60,0,0.5)');
    tg2.addColorStop(1,'rgba(255,40,0,0)');
    g.strokeStyle=tg2;
    g.lineWidth=3-Math.abs(ti)*0.3;
    g.stroke();
  }

  // Wings — drawn mirrored
  for(var side=-1;side<=1;side+=2){
    g.save();
    g.scale(side,1);

    // Control points (Y moves with flap)
    var wp1x=SPAN*0.28,wp1y=-25+flapY*0.25;
    var wp2x=SPAN*0.60,wp2y=-45+flapY*0.60;
    var wp3x=SPAN*0.90,wp3y=-18+flapY;
    var wbx=SPAN*0.55, wby=wp2y+55;

    // Main wing surface
    g.beginPath();
    g.moveTo(0,5);
    g.bezierCurveTo(wp1x,wp1y,wp2x,wp2y,wp3x,wp3y);
    g.bezierCurveTo(wp3x+8,wp3y+28,wbx,wby,0,BH*0.15);
    g.closePath();
    var wg=g.createLinearGradient(0,wp3y,wp3x,wp3y);
    wg.addColorStop(0,'rgba(150,20,0,0.95)');
    wg.addColorStop(0.4,'rgba(220,60,0,0.95)');
    wg.addColorStop(0.75,'rgba(255,120,0,0.95)');
    wg.addColorStop(1,'rgba(255,200,50,0.95)');
    g.fillStyle=wg;
    g.fill();

    // Feather lines on wing
    for(var fi=0;fi<6;fi++){
      var ft=fi/5;
      var fsx=wp1x+(wp3x-wp1x)*ft;
      var fsy=wp1y+(wp3y-wp1y)*ft;
      var fex=fsx+15*(1-ft*0.5);
      var fey=fsy+40*(1-ft*0.3);
      g.beginPath();
      g.moveTo(fsx,fsy);
      g.lineTo(fex,fey);
      g.strokeStyle='rgba(255,180,50,0.35)';
      g.lineWidth=1.5;
      g.stroke();
    }

    // Wing tip glow (fire)
    if(showGlow){
      var glx=wp3x,gly=wp3y;
      var tipG=g.createRadialGradient(glx,gly,0,glx,gly,38);
      tipG.addColorStop(0,'rgba(255,230,120,0.9)');
      tipG.addColorStop(0.5,'rgba(255,100,0,0.5)');
      tipG.addColorStop(1,'rgba(255,50,0,0)');
      g.beginPath();
      g.arc(glx,gly,38,0,Math.PI*2);
      g.fillStyle=tipG;
      g.fill();
    }

    g.restore();
  }

  // Body — dark ellipse with ember glow center
  g.beginPath();
  g.ellipse(0,0,W*0.055,BH*0.48,0,0,Math.PI*2);
  var bg2=g.createLinearGradient(0,-BH*0.48,0,BH*0.48);
  bg2.addColorStop(0,'#1a0400');
  bg2.addColorStop(0.45,'#2e0700');
  bg2.addColorStop(1,'#1a0400');
  g.fillStyle=bg2;
  g.fill();

  // Body inner glow
  var bodyGlow=g.createRadialGradient(0,-5,0,0,0,W*0.07);
  bodyGlow.addColorStop(0,'rgba(255,100,10,0.4)');
  bodyGlow.addColorStop(1,'rgba(255,50,0,0)');
  g.beginPath();
  g.ellipse(0,0,W*0.055,BH*0.48,0,0,Math.PI*2);
  g.fillStyle=bodyGlow;
  g.fill();

  // Head
  var headY=-BH*0.48-W*0.04;
  var headR=W*0.042;
  g.beginPath();
  g.arc(0,headY,headR,0,Math.PI*2);
  g.fillStyle='#1e0500';
  g.fill();

  // Eyes glow
  var eyeOff=headR*0.38;
  for(var ei=-1;ei<=1;ei+=2){
    var eyeG=g.createRadialGradient(ei*eyeOff,headY-2,0,ei*eyeOff,headY-2,5);
    eyeG.addColorStop(0,'rgba(255,220,80,1)');
    eyeG.addColorStop(1,'rgba(255,120,0,0)');
    g.beginPath();
    g.arc(ei*eyeOff,headY-2,5,0,Math.PI*2);
    g.fillStyle=eyeG;
    g.fill();
  }

  // Beak
  g.beginPath();
  g.moveTo(0,headY+headR*0.3);
  g.lineTo(headR*0.7,headY+headR*0.65);
  g.lineTo(0,headY+headR*0.9);
  g.fillStyle='#ff7700';
  g.fill();

  // Crown feathers
  for(var ci=-2;ci<=2;ci++){
    var ca=-Math.PI/2+ci*0.22;
    var clen=headR*0.9+(2-Math.abs(ci))*headR*0.4;
    var csx=Math.cos(ca)*headR,csy=headY+Math.sin(ca)*headR;
    var cex=Math.cos(ca)*(headR+clen),cey=headY+Math.sin(ca)*(headR+clen);
    g.beginPath();
    g.moveTo(csx,csy);
    g.lineTo(cex,cey);
    var cg3=g.createLinearGradient(csx,csy,cex,cey);
    cg3.addColorStop(0,'rgba(255,120,0,0.9)');
    cg3.addColorStop(1,'rgba(255,220,50,0)');
    g.strokeStyle=cg3;
    g.lineWidth=2.5-Math.abs(ci)*0.4;
    g.stroke();
  }

  // Ambient glow around whole phoenix
  if(showGlow){
    var haloG=g.createRadialGradient(0,0,20,0,0,SPAN*0.9);
    haloG.addColorStop(0,'rgba(255,80,0,0.12)');
    haloG.addColorStop(1,'rgba(255,40,0,0)');
    g.beginPath();
    g.arc(0,0,SPAN*0.9,0,Math.PI*2);
    g.fillStyle=haloG;
    g.fill();
  }

  g.restore();
}

// ── Sparks ────────────────────────────────────────────────────────────────────
var sparks=[];
function addSpark(n){
  for(var i=0;i<(n||1);i++){
    sparks.push({
      x:CX+(Math.random()-0.5)*W*0.7,
      y:H*0.65+Math.random()*H*0.25,
      vx:(Math.random()-0.5)*4,
      vy:-(2+Math.random()*5),
      life:1,
      size:1.5+Math.random()*3.5,
      warm:Math.random()>0.4
    });
  }
}
function tickSparks(){
  for(var i=sparks.length-1;i>=0;i--){
    var s=sparks[i];
    s.x+=s.vx; s.y+=s.vy;
    s.vy+=0.08;
    s.vx*=0.99;
    s.life-=0.018+(Math.random()*0.01);
    if(s.life<=0||s.y<0)sparks.splice(i,1);
  }
}
function drawSparks(){
  for(var i=0;i<sparks.length;i++){
    var s=sparks[i];
    g.save();
    g.globalAlpha=s.life*0.9;
    g.beginPath();
    g.arc(s.x,s.y,s.size*s.life,0,Math.PI*2);
    g.fillStyle=s.warm?'#ffcc44':'#ff6622';
    g.fill();
    g.restore();
  }
}

// ── Text ──────────────────────────────────────────────────────────────────────
var FS=Math.round(W*0.155);
var TY=H*0.20;
var letterReveal=0;
var show20=false;
var dateStr='';

function drawText(a){
  if(letterReveal<=0||a<=0)return;
  g.save();
  g.globalAlpha=a;
  g.font='900 '+FS+'px "Arial Black",Arial,sans-serif';
  g.textAlign='center';
  g.textBaseline='middle';

  var txt='YOANN'.slice(0,Math.min(5,Math.ceil(letterReveal)));
  if(show20)txt+=' 2.0';

  // Outer glow
  g.shadowColor='#ff6600';
  g.shadowBlur=40;
  g.fillStyle='#FFC107';
  g.fillText(txt,CX,TY);
  g.shadowBlur=15;
  g.fillStyle='#FFE082';
  g.fillText(txt,CX,TY);
  g.shadowBlur=0;

  if(dateStr){
    var dFS=Math.round(W*0.038);
    g.font='300 '+dFS+'px Arial,sans-serif';
    g.fillStyle='rgba(255,193,7,0.78)';
    g.fillText(dateStr,CX,TY+FS*0.78);
  }
  g.restore();
}

// ── Explosion burst ───────────────────────────────────────────────────────────
var exploded=false;
function explode(){
  if(exploded)return;
  exploded=true;
  // Seed fire from center outward
  var ex=Math.floor(FW/2),ey=Math.floor(FH*0.45);
  for(var dy=-8;dy<=2;dy++)
    for(var dx=-8;dx<=8;dx++){
      var nx=(ex+dx+FW)%FW;
      var ny=Math.max(0,Math.min(FH-1,ey+dy));
      fbuf[ny*FW+nx]=255;
    }
  seed(FH-1,255);seed(FH-2,255);
  for(var k=0;k<60;k++)addSpark(1);
}

// ── Main loop ─────────────────────────────────────────────────────────────────
var startTs=null,done=false,skipped=false;

function finish(){
  if(done)return;
  done=true;
  explode();
  var alpha=0;
  var iv=setInterval(function(){
    alpha+=0.06;
    g.fillStyle='rgba(0,0,0,'+Math.min(1,alpha)+')';
    g.fillRect(0,0,W,H);
    if(alpha>=1.2){
      clearInterval(iv);
      try{window.ReactNativeWebView.postMessage('done');}catch(e){}
    }
  },16);
}

cv.addEventListener('touchstart',function(){
  if(!done){
    skipped=true;
    letterReveal=5;show20=true;
    seed(FH-1,255);seed(FH-2,240);
    for(var sk=0;sk<8;sk++)stepFire();
    setTimeout(finish,700);
  }
},{passive:true});

function loop(ts){
  if(done){requestAnimationFrame(loop);return;}
  if(!startTs)startTs=ts;
  var t=(ts-startTs)/1000;

  g.fillStyle='#000';
  g.fillRect(0,0,W,H);

  // ── 0-2s  : YOANN letter by letter ─────────────────────────────────────────
  if(t<2){
    letterReveal=Math.min(5,t*3.2);
    drawText(Math.min(1,t));
    requestAnimationFrame(loop);return;
  }

  // ── 2-5s  : fire starts ─────────────────────────────────────────────────────
  if(t<5){
    var heat=Math.round(Math.min(255,(t-2)/3*255));
    seed(FH-1,heat);if(heat>100)seed(FH-2,heat-30);
    stepFire();
    renderFire(1);
    if(Math.random()<0.25)addSpark();
    tickSparks();drawSparks();
    drawText(1);
    requestAnimationFrame(loop);return;
  }

  // ── 5-8s  : fire full + phoenix emerges ────────────────────────────────────
  if(t<8){
    seed(FH-1,255);seed(FH-2,220);
    stepFire();
    renderFire(1);
    if(Math.random()<0.45)addSpark();
    tickSparks();drawSparks();
    var pOp=Math.min(1,(t-5)/3);
    drawPhoenix(t,pOp,pOp>0.3);
    drawText(1);
    requestAnimationFrame(loop);return;
  }

  // ── 8-14s : phoenix fully visible, wings flap intensely ────────────────────
  if(t<14){
    seed(FH-1,255);seed(FH-2,200);
    stepFire();
    renderFire(1);
    if(Math.random()<0.55)addSpark();
    tickSparks();drawSparks();
    drawPhoenix(t,1,true);
    drawText(1);
    requestAnimationFrame(loop);return;
  }

  // ── 14-17s: date appears above + wings slow ────────────────────────────────
  if(t<17){
    if(!dateStr){
      var d=new Date();
      var days=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
      var months=['janvier','f\u00e9vrier','mars','avril','mai','juin','juillet','ao\u00fbt','septembre','octobre','novembre','d\u00e9cembre'];
      dateStr=days[d.getDay()]+' '+d.getDate()+' '+months[d.getMonth()]+'  \u00b7  '+(d.getHours()<10?'0':'')+d.getHours()+':'+(d.getMinutes()<10?'0':'')+d.getMinutes();
    }
    seed(FH-1,255);seed(FH-2,180);
    stepFire();
    renderFire(1);
    if(Math.random()<0.4)addSpark();
    tickSparks();drawSparks();
    drawPhoenix(t*0.6,1,true); // slow wing flap
    drawText(1);
    requestAnimationFrame(loop);return;
  }

  // ── 17-19s: "2.0" appears, fire cools ────────────────────────────────────
  if(t<19){
    show20=true;
    var fAlpha=Math.max(0,1-(t-17)/2);
    seed(FH-1,Math.round(fAlpha*200));
    if(fAlpha>0.3)seed(FH-2,Math.round(fAlpha*160));
    stepFire();
    renderFire(fAlpha);
    if(Math.random()<0.2)addSpark();
    tickSparks();drawSparks();
    drawPhoenix(t*0.4,1,fAlpha>0.2);
    drawText(1);
    requestAnimationFrame(loop);return;
  }

  // ── 19-21s: logo hold (static) ─────────────────────────────────────────────
  if(t<21){
    tickSparks();drawSparks();
    drawPhoenix(t*0.4,1,false);
    drawText(1);
    requestAnimationFrame(loop);return;
  }

  // ── 21-22s: explosion ──────────────────────────────────────────────────────
  if(t<22){
    explode();
    seed(FH-1,255);
    stepFire();stepFire();
    renderFire(1);
    addSpark(3);
    tickSparks();drawSparks();
    drawPhoenix(t*0.4,1,true);
    drawText(1);
    var flashA=Math.min(0.5,(t-21)*0.6);
    g.fillStyle='rgba(255,160,40,'+flashA+')';
    g.fillRect(0,0,W,H);
    requestAnimationFrame(loop);return;
  }

  finish();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
</script></body></html>`;

export function PhoenixWebSplash({ onDone }: Props) {
  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <WebView
        source={{ html: HTML }}
        style={styles.webview}
        onMessage={({ nativeEvent }) => {
          if (nativeEvent.data === 'done') onDone();
        }}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        originWhitelist={['*']}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
});
