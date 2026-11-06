import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import type { usePeriodStoryGeneration } from '@/hooks/usePeriodStoryGeneration';

type Generation = ReturnType<typeof usePeriodStoryGeneration>;
/** Browser transport for the exact same isolated canvas engine as Android. */
export function browserJournalHtml(html: string) {
  const bridge = `<script>
window.ReactNativeWebView={postMessage:function(data){parent.postMessage({journalBridge:true,data:data},'*');}};
window.addEventListener('message',function(event){
 if(event.source!==parent||!event.data||event.data.type!=='journal_inject')return;
 try{(new Function(event.data.script))();}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_error',message:String(e)}));}
});
</script>`;
  return html.replace('<head>', `<head>${bridge}`);
}

export function JournalEngine({ generation }: { generation: Generation }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const jobId = generation.jobId;
  const html = useMemo(() => browserJournalHtml(generation.source.html), [generation.source.html]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !jobId) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || !event.data?.journalBridge) return;
      generation.onMessage(jobId, { nativeEvent: { data: event.data.data } });
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [jobId, generation.onMessage]);
  if (!jobId) return null;
  return <View pointerEvents="none" collapsable={false} accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={s.host}>
    {Platform.OS === 'web' ? React.createElement('iframe', {
      key: jobId, title: 'Moteur vidéo du carnet', srcDoc: html, sandbox: 'allow-scripts',
      ref: (element: HTMLIFrameElement | null) => {
        iframeRef.current = element;
        generation.webViewRef.current = element ? {
          injectJavaScript: (script: string) => element.contentWindow?.postMessage({ type: 'journal_inject', script }, '*'),
        } as WebView : null;
      },
      onLoad: () => generation.onLoadEnd(jobId),
      style: { width: 1, height: 1, border: 0 },
    }) : <WebView key={jobId} ref={generation.webViewRef} source={generation.source}
      onMessage={event => generation.onMessage(jobId, event)} onLoadEnd={() => generation.onLoadEnd(jobId)}
      onError={() => generation.onEngineError(jobId)} onRenderProcessGone={() => generation.onEngineError(jobId)}
      onContentProcessDidTerminate={() => generation.onEngineError(jobId)}
      javaScriptEnabled mediaPlaybackRequiresUserAction={false}
      style={s.webview} containerStyle={s.webview} />}
  </View>;
}
const s = StyleSheet.create({
  host: { position: 'absolute', top: -4, left: -4, width: 1, height: 1, opacity: 0.01, overflow: 'hidden' },
  webview: { width: 1, height: 1, flex: 0 },
});
