import './_group.css';

import { DEMO_OPTIONS } from './_data';
import { STORY_GENERATE_JS } from './_originalGenerator';

const storyOptions = JSON.stringify(DEMO_OPTIONS).replace(/</g, '\\u003c');

const srcDoc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=360,initial-scale=1,maximum-scale=1,user-scalable=no">
  <style>
    html,body{width:360px;height:640px;margin:0;overflow:hidden;background:#0A0B0E}
    canvas{display:block!important;position:fixed!important;inset:0!important;width:360px!important;height:640px!important}
  </style>
</head>
<body>
<script>
  (function(){
    HTMLCanvasElement.prototype.captureStream=function(){
      return {getTracks:function(){return[]}};
    };
    function PreviewMediaRecorder(){
      this.state='inactive';
      this.ondataavailable=null;
      this.onstop=null;
    }
    PreviewMediaRecorder.isTypeSupported=function(){return true};
    PreviewMediaRecorder.prototype.start=function(){this.state='recording'};
    PreviewMediaRecorder.prototype.stop=function(){this.state='inactive'};
    window.MediaRecorder=PreviewMediaRecorder;
    window.ReactNativeWebView={postMessage:function(){}};
    // Advance only the isolated preview to the final frame for comparison.
    var pendingFrames=[],previewTime=1000;
    window.requestAnimationFrame=function(callback){pendingFrames.push(callback);return pendingFrames.length};
    window.renderPreviewEnd=function(){
      for(var step=0;pendingFrames.length&&step<70;step++){
        pendingFrames.shift()(previewTime);
        previewTime=6400+(step+1)*10;
      }
    };
  })();
${STORY_GENERATE_JS}
  window.generateStory(${storyOptions});
  window.renderPreviewEnd();
  (function revealCanvas(){
    var canvas=document.querySelector('canvas');
    if(!canvas){requestAnimationFrame(revealCanvas);return}
    canvas.style.position='fixed';
    canvas.style.top='0';
    canvas.style.left='0';
    canvas.style.width='360px';
    canvas.style.height='640px';
  })();
</script>
</body>
</html>`;

export function Current() {
  return (
    <div className="story-directions-reference">
      <iframe
        className="story-directions-reference__frame"
        srcDoc={srcDoc}
        title="Story actuelle — Les bords de Dronne"
        sandbox="allow-scripts"
      />
    </div>
  );
}