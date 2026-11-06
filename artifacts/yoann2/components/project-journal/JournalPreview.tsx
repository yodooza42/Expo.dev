import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import WebView from 'react-native-webview';
import type { JournalVideoPayload } from '@/types/projectJournal';
import { buildProjectJournalHtml } from '@/utils/projectJournalRenderer';

export function JournalPreview({ payload, onError }: { payload: JournalVideoPayload; onError: (message: string) => void }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const receive = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.type === 'story_error')
        onError(event.data.message || 'L’aperçu a rencontré une erreur.');
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onError]);
  const source = useMemo(() => {
    const json = JSON.stringify({ ...payload, preview: true }).replace(/</g, '\\u003c');
    return { html: buildProjectJournalHtml().replace('</body>',
      `<script>window.generatePeriodStory(${json});</script></body>`) };
  }, [payload]);
  return <View style={s.frame}>
    {Platform.OS === 'web' ? React.createElement('iframe', {
      title: 'Aperçu animé du carnet', srcDoc: source.html, sandbox: 'allow-scripts',
      ref: frame,
      style: { width: '100%', height: '100%', border: 0, display: 'block' },
    }) : <WebView source={source} javaScriptEnabled mediaPlaybackRequiresUserAction={false}
      onError={() => onError('Impossible d’ouvrir l’aperçu. Réessaie.')}
      onRenderProcessGone={() => onError('L’aperçu a été interrompu. Réduis le nombre de photos.')}
      onMessage={event => {
        try {
          const message = JSON.parse(event.nativeEvent.data);
          if (message.type === 'story_error') onError(message.message || 'L’aperçu a rencontré une erreur.');
        } catch {}
      }} style={s.native} containerStyle={s.native} />}
  </View>;
}
const s = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 720 / 1430, borderRadius: 14, overflow: 'hidden' },
  native: { flex: 1 },
});
