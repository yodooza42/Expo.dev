import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import WebView from 'react-native-webview';
import type { JournalVideoPayload } from '@/types/projectJournal';
import { buildProjectJournalHtml } from '@/utils/projectJournalRenderer';
import type { JournalPhotoAsset } from '@/utils/prepareJournal';
import { JOURNAL_LIMITS } from '@/utils/projectJournal';
import { prepareStoryPhoto } from '@/utils/storyPhoto';

const CHUNK_CHARS = 96 * 1024;

type PendingTransfer = {
  dataUri: string;
  total: number;
  nextIndex: number;
};

export function JournalPreview({
  payload,
  assets,
  onProgress,
  onError,
}: {
  payload: JournalVideoPayload;
  assets: JournalPhotoAsset[];
  onProgress: (detail: string) => void;
  onError: (message: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const webView = useRef<WebView | null>(null);
  const alive = useRef(true);
  const onErrorRef = useRef(onError);
  const onProgressRef = useRef(onProgress);
  onErrorRef.current = onError;
  onProgressRef.current = onProgress;
  const assetByKey = useRef(new Map(assets.map(asset => [asset.key, asset])));
  assetByKey.current = new Map(assets.map(asset => [asset.key, asset]));
  const preparing = useRef(new Set<string>());
  const queue = useRef<string[]>([]);
  const pending = useRef(new Map<string, PendingTransfer>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const sendNextChunk = useCallback((key: string) => {
    const transfer = pending.current.get(key);
    if (!transfer || !alive.current) return;
    const index = transfer.nextIndex;
    const start = index * CHUNK_CHARS;
    const chunk = transfer.dataUri.slice(start, start + CHUNK_CHARS);
    const message = {
      type: 'journal_preview_asset_chunk',
      key,
      index,
      total: transfer.total,
      chunk,
    };
    try {
      if (Platform.OS === 'web') {
        frame.current?.contentWindow?.postMessage(message, '*');
      } else {
        webView.current?.injectJavaScript(`window.postMessage(${JSON.stringify(message)},'*');true;`);
      }
    } catch {
      onErrorRef.current('Le transfert d’une photo vers l’aperçu a échoué. Réessaie.');
      return;
    }
    const oldTimer = timers.current.get(key);
    if (oldTimer) clearTimeout(oldTimer);
    timers.current.set(key, setTimeout(() => {
      if (!alive.current || !pending.current.has(key)) return;
      pending.current.delete(key);
      preparing.current.delete(key);
      timers.current.delete(key);
      onErrorRef.current('Le transfert d’une photo vers l’aperçu a dépassé le délai prévu. Réessaie.');
    }, 20_000));
  }, []);

  const requestAsset = useCallback(async (key: string) => {
    if (preparing.current.has(key) || pending.current.has(key) || queue.current.includes(key)) return;
    if (preparing.current.size || pending.current.size) {
      queue.current.push(key);
      return;
    }
    const asset = assetByKey.current.get(key);
    if (!asset) {
      onErrorRef.current('Une photo du carnet est introuvable. Ferme puis rouvre l’aperçu.');
      return;
    }
    preparing.current.add(key);
    onProgressRef.current(`Préparation de la photo ${asset.index + 1} / ${assets.length}`);
    try {
      const dataUri = await prepareStoryPhoto(asset.uri, () => alive.current);
      if (!alive.current) return;
      const bytes = Math.ceil(dataUri.slice(dataUri.indexOf(',') + 1).length * 3 / 4);
      if (bytes > JOURNAL_LIMITS.photoBytes) {
        throw new Error('Cette photo dépasse la taille autorisée après préparation. Retire-la du carnet.');
      }
      pending.current.set(key, {
        dataUri,
        total: Math.ceil(dataUri.length / CHUNK_CHARS),
        nextIndex: 0,
      });
      onProgressRef.current(`Chargement de la photo ${asset.index + 1} / ${assets.length}`);
      sendNextChunk(key);
    } catch (error) {
      preparing.current.delete(key);
      if (alive.current) {
        onErrorRef.current(`${asset.title} · photo ${asset.index + 1} : ${error instanceof Error ? error.message : 'Photo illisible.'}`);
      }
    }
  }, [assets.length, sendNextChunk]);

  const handleMessage = useCallback((message: any) => {
    if (message?.type === 'story_error') {
      onErrorRef.current(message.message || 'L’aperçu a rencontré une erreur.');
      return;
    }
    if (message?.type === 'story_asset_needed' && typeof message.key === 'string') {
      void requestAsset(message.key);
      return;
    }
    if (message?.type !== 'story_asset_chunk_received' || message.preview !== true
      || typeof message.key !== 'string' || !Number.isInteger(message.index)) return;
    const transfer = pending.current.get(message.key);
    if (!transfer || message.index !== transfer.nextIndex) return;
    const timer = timers.current.get(message.key);
    if (timer) clearTimeout(timer);
    timers.current.delete(message.key);
    if (message.complete === true) {
      pending.current.delete(message.key);
      preparing.current.delete(message.key);
      onProgressRef.current('Les photos se chargent au fil de la lecture.');
      const next = queue.current.shift();
      if (next) void requestAsset(next);
      return;
    }
    transfer.nextIndex++;
    sendNextChunk(message.key);
  }, [requestAsset, sendNextChunk]);

  useEffect(() => {
    alive.current = true;
    if (Platform.OS !== 'web') {
      return () => {
        alive.current = false;
        timers.current.forEach(clearTimeout);
        timers.current.clear();
        queue.current = [];
      };
    }
    const receive = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow) handleMessage(event.data);
    };
    window.addEventListener('message', receive);
    return () => {
      alive.current = false;
      window.removeEventListener('message', receive);
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      queue.current = [];
    };
  }, [handleMessage]);
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
      ref={webView}
      onError={() => onError('Impossible d’ouvrir l’aperçu. Réessaie.')}
      onRenderProcessGone={() => onError('L’aperçu a été interrompu. Tu peux créer la vidéo directement.')}
      onMessage={event => {
        try {
          handleMessage(JSON.parse(event.nativeEvent.data));
        } catch {}
      }} style={s.native} containerStyle={s.native} />}
  </View>;
}
const s = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 720 / 1430, borderRadius: 14, overflow: 'hidden' },
  native: { flex: 1 },
});
