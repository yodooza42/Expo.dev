import { File, Paths, type FileHandle } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Alert, Platform } from 'react-native';
import type WebView from 'react-native-webview';

import type { Trip } from '@/types/trips';
import { buildStoryPeriodHtml } from '@/utils/storyGeneratorPeriod';
import { PeriodStoryTransfer, type StoryVideoChunk } from '@/utils/periodStoryTransfer';

type Phase = 'prepare' | 'maps' | 'photos' | 'recording' | 'export';
export type PeriodStoryChapter = {
  id: string;
  title: string;
  tripIds: string[];
  durationSec: number;
};
export type GenerationRequest = {
  trips: Trip[];
  vehicleType: (trip: Trip) => 'car' | 'moto' | 'walk';
  vehicleLabel?: (trip: Trip) => string;
  dateLabel: (trip: Trip) => string;
  periodLabel: string;
  tripCountLabel: string;
  driveDurLabel: string;
  walkDurLabel: string;
  videoDurationSec: number;
  photoPauseSecPerPhoto?: number;
  customName?: string;
  dateRangeLabel?: string;
  theme: 'dark' | 'light' | 'satellite';
  familyStory?: boolean;
  chapters?: PeriodStoryChapter[];
};
export type PeriodStoryResult = { uri: string; mimeType: 'video/mp4' | 'video/webm' };
type CachedPeriodStoryResult = PeriodStoryResult & { file: File };
type Run = {
  id: string;
  ready: boolean;
  injected: boolean;
  script?: string;
  lastActivity: number;
  deadline: number;
  signal: string;
  file?: File;
  handle?: FileHandle;
  transfer?: PeriodStoryTransfer;
};
const TITLES: Record<Phase, string> = {
  prepare: 'Préparation des trajets…',
  maps: 'Préparation des cartes…',
  photos: 'Préparation des photos…',
  recording: 'Création de la vidéo…',
  export: 'Enregistrement de la vidéo…',
};

async function preparePhoto(uri: string, isCurrent: () => boolean): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = (async () => {
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) =>
      Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
    if (!isCurrent()) throw new Error('Génération annulée.');
    if (!(size.width > 0 && size.height > 0)) throw new Error('Photo illisible.');
    const scale = Math.min(1, 1280 / size.width, 1280 / size.height);
    // Only the temporary story copy is resized, with its aspect ratio preserved.
    const image = await manipulateAsync(uri, scale < 1 ? [{ resize: {
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
    } }] : [], { format: SaveFormat.JPEG, compress: 0.82, base64: true });
    try {
      if (!image.base64) throw new Error('Photo illisible.');
      return `data:image/jpeg;base64,${image.base64}`;
    } finally {
      if (image.uri !== uri) void FileSystem.deleteAsync(image.uri, { idempotent: true }).catch(() => {});
    }
  })();
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Une photo ne répond pas. Vérifie son accès dans la galerie.')), 20_000);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function usePeriodStoryGeneration() {
  const webViewRef = useRef<WebView>(null);
  const runRef = useRef<Run | null>(null);
  const mounted = useRef(true);
  const sequence = useRef(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('prepare');
  const [progress, setProgress] = useState(0);
  const [detail, setDetail] = useState('');
  const [fallbackNote, setFallbackNote] = useState('');
  const [result, setResult] = useState<PeriodStoryResult | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const resultRef = useRef<CachedPeriodStoryResult | null>(null);
  const sharingRef = useRef(false);
  const discardAfterShareRef = useRef(false);
  const source = useMemo(() => ({ html: buildStoryPeriodHtml() }), []);

  const clearCachedResult = useCallback(() => {
    /*
     * A share sheet owns the URI while it is open.  Deleting the cache file
     * underneath it makes Android's document provider report a missing video,
     * so defer cleanup until shareResult() has settled.
     */
    if (sharingRef.current) {
      discardAfterShareRef.current = true;
      return;
    }
    const cached = resultRef.current;
    resultRef.current = null;
    if (cached) {
      try { cached.file.delete(); } catch {}
    }
    if (mounted.current) setResult(null);
  }, []);

  const stop = useCallback((keepFile = false) => {
    const run = runRef.current;
    if (!run) return;
    runRef.current = null; // Invalidate before any late native/WebView callback.
    try { webViewRef.current?.injectJavaScript(`window.cancelPeriodStory&&window.cancelPeriodStory(${JSON.stringify(run.id)});true;`); } catch {}
    run.script = undefined;
    run.transfer?.clear();
    try { run.handle?.close(); } catch {}
    if (!keepFile) { try { run.file?.delete(); } catch {} }
    if (mounted.current) setJobId(null); // Unmount the renderer, releasing native memory too.
  }, []);

  const fail = useCallback((message: string) => {
    if (!runRef.current) return;
    stop();
    if (mounted.current) Alert.alert('Story interrompue', message);
  }, [stop]);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => {
      const run = runRef.current;
      if (run && (Date.now() - run.lastActivity > 45_000 || Date.now() > run.deadline)) {
        fail('La génération ne répond plus. Tu peux réessayer avec le thème Sombre ou une période plus courte. Tes trajets sont conservés.');
      }
    }, 1000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      stop();
      clearCachedResult();
    };
  }, [clearCachedResult, fail, stop]);

  const injectIfReady = useCallback(() => {
    const run = runRef.current;
    if (!run?.ready || !run.script || run.injected) return;
    if (!webViewRef.current) return;
    run.injected = true;
    run.lastActivity = Date.now();
    const script = run.script;
    run.script = undefined;
    try { webViewRef.current.injectJavaScript(script); }
    catch { fail('Impossible de démarrer le moteur vidéo. Réessaie la génération.'); }
  }, [fail]);

  const onMessage = useCallback((id: string, event: { nativeEvent: { data: string } }) => {
    const run = runRef.current;
    if (!run || run.id !== id) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.nativeEvent.data);
      if (!msg || typeof msg !== 'object') return;
    } catch { return; }
    if (msg.type === 'story_ready') {
      if (!run.ready) { run.ready = true; run.lastActivity = Date.now(); }
      injectIfReady();
      return;
    }
    if (msg.jobId !== id) return;
    if (msg.type === 'story_error') {
      fail(typeof msg.message === 'string' ? msg.message : 'Le moteur vidéo a rencontré une erreur. Réessaie en thème Sombre.');
      return;
    }
    if (msg.type === 'story_theme_fallback') {
      setFallbackNote('Satellite indisponible ou trop lourd : cette vidéo utilise le fond Sombre.');
      return;
    }
    if (msg.type === 'story_phase' && ['maps', 'photos', 'recording', 'export'].includes(String(msg.phase))) {
      const nextPhase = msg.phase as Phase;
      const completed = typeof msg.completed === 'number' && Number.isFinite(msg.completed) ? msg.completed : 0;
      const total = typeof msg.total === 'number' && Number.isFinite(msg.total) ? msg.total : 0;
      const signal = `${nextPhase}:${completed}/${total}`;
      if (signal !== run.signal) { run.signal = signal; run.lastActivity = Date.now(); }
      setPhase(nextPhase);
      setProgress(total > 0 ? Math.min(100, Math.max(0, Math.round(completed / total * 100))) : 0);
      const unit = nextPhase === 'maps' ? 'cartes' : nextPhase === 'export' ? 'fragments' : 'photos';
      setDetail(total > 0 ? `${completed} / ${total} ${unit}` : '');
      return;
    }
    if (msg.type === 'story_progress' && typeof msg.p === 'number' && Number.isFinite(msg.p)) {
      const p = Math.min(100, Math.max(0, Math.round(msg.p)));
      const signal = `recording:${p}`;
      if (signal !== run.signal) { run.signal = signal; run.lastActivity = Date.now(); }
      setPhase('recording');
      setProgress(p);
      setDetail(`${p} %`);
      return;
    }
    if (msg.type !== 'story_chunk') return;
    try {
      const chunk = msg as unknown as StoryVideoChunk;
      if (!run.transfer) {
        run.transfer = new PeriodStoryTransfer(chunk, bytes => {
          if (!run.handle) throw new Error('Fichier vidéo fermé.');
          run.handle.writeBytes(bytes);
        });
        const ext = run.transfer.mime === 'video/mp4' ? 'mp4' : 'webm';
        run.file = new File(Paths.cache, `story_period_${run.id}.${ext}`);
        run.file.create();
        run.handle = run.file.open();
      }
      if (!run.transfer.accept(chunk)) return;
      run.lastActivity = Date.now();
      setPhase('export');
      setProgress(Math.round(run.transfer.written / run.transfer.total * 100));
      setDetail(`${run.transfer.written} / ${run.transfer.total} fragments`);
      if (!run.transfer.complete) return;
      run.handle?.close();
      run.handle = undefined;
      const uri = run.file!.uri;
      const mimeType = run.transfer.mime;
      stop(true);
       const cached: CachedPeriodStoryResult = { uri, mimeType, file: run.file! };
       resultRef.current = cached;
       if (mounted.current) setResult({ uri, mimeType });
    } catch {
      fail('Impossible d’enregistrer la vidéo. Vérifie l’espace libre du téléphone puis réessaie.');
    }
  }, [fail, injectIfReady, stop]);

  const onLoadEnd = useCallback((id: string) => {
    if (runRef.current?.id !== id) return;
    // Retry the ready handshake if the initial bridge message arrived too early.
    try {
      webViewRef.current?.injectJavaScript(`window.ReactNativeWebView.postMessage(JSON.stringify(typeof window.generatePeriodStory==='function'?{type:'story_ready'}:{type:'story_error',jobId:${JSON.stringify(id)},message:'Le moteur vidéo n’a pas pu se charger.'}));true;`);
    } catch { fail('Le moteur vidéo n’a pas pu se charger.'); }
  }, [fail]);

  const onEngineError = useCallback((id: string) => {
    if (runRef.current?.id === id) {
      fail('Le moteur vidéo a été interrompu. Réessaie en thème Sombre ou avec une période plus courte. Tes trajets sont conservés.');
    }
  }, [fail]);

  const start = useCallback(async (request: GenerationRequest) => {
    if (runRef.current || sharingRef.current || request.trips.length === 0) return;
    if (Platform.OS === 'web') {
      Alert.alert('Story', 'La création vidéo est disponible dans l’application mobile.');
      return;
    }
    clearCachedResult();
    const id = `${Date.now()}-${++sequence.current}`;
    const photoCount = request.trips.reduce((n, t) => n + (t.photos?.filter(p => p.routeIndex != null).length ?? 0), 0);
    runRef.current = {
      id, ready: false, injected: false, lastActivity: Date.now(), signal: '',
      deadline: Date.now() + 90_000 +
        (request.videoDurationSec + photoCount * (request.photoPauseSecPerPhoto ?? 2)) * 3000 +
        photoCount * 20_000,
    };
    setJobId(id);
    setPhase('prepare');
    setProgress(0);
    setDetail(`0 / ${request.trips.length} trajets`);
    setFallbackNote('');
    try {
      const trips = [];
      for (let i = 0; i < request.trips.length; i++) {
        // Let the progress/cancel UI render even when there are no photographs.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (runRef.current?.id !== id) return;
        const trip = request.trips[i];
        const route = trip.route!;
        if (route.length < 2 || route.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) ||
            Math.abs(p.lat) >= 85 || Math.abs(p.lng) > 180)) {
          throw new Error('Un trajet contient des coordonnées GPS invalides. Retire-le de la sélection puis réessaie.');
        }
        const photos = [];
        const sourcePhotos = trip.photos ?? [];
        for (let photoIndex = 0; photoIndex < sourcePhotos.length; photoIndex++) {
          const photo = sourcePhotos[photoIndex];
          if (photo.routeIndex == null) continue;
          setDetail(`Trajet ${i + 1} / ${request.trips.length} · préparation d’une photo`);
          let img: string;
          try {
            img = await preparePhoto(photo.uri, () => runRef.current?.id === id);
          } catch (error) {
            /*
             * A referenced photo is never silently dropped.  Include a
             * stable trip/photo locator so a family-story draft can remove
             * the unreadable asset and retry without guessing which gallery
             * item failed.
             */
            const photoLabel = photo.note?.trim()
              ? `«${photo.note.trim()}»`
              : `n°${photoIndex + 1}`;
            const reason = error instanceof Error ? error.message : 'photo illisible';
            throw new Error(`Photo ${photoLabel} du trajet ${i + 1}${trip.id ? ` (${trip.id})` : ''} : ${reason}`);
          }
          if (runRef.current?.id !== id) return;
          runRef.current.lastActivity = Date.now();
          photos.push({ img, note: photo.note, frac: Math.max(0, Math.min(1, photo.routeIndex / (route.length - 1))) });
        }
        const tripId = trip.id;
        const chapterIndex = request.chapters?.findIndex(chapter => chapter.tripIds.includes(tripId)) ?? -1;
        const chapter = chapterIndex >= 0 ? request.chapters?.[chapterIndex] : undefined;
        trips.push({
          id: tripId,
          chapterId: chapter?.id,
          chapterTitle: chapter?.title,
          chapterIndex: chapterIndex >= 0 ? chapterIndex : undefined,
          route: route.map(p => ({ lat: p.lat, lng: p.lng, t: p.t })),
          distKm: trip.distanceKm, durationMs: trip.endTime - trip.startTime,
          startTimeMs: trip.startTime, vehicleType: request.vehicleType(trip),
           vehicleLabel: request.vehicleLabel?.(trip),
           dateLabel: request.dateLabel(trip), note: trip.note, photos,
        });
        runRef.current.lastActivity = Date.now();
        setProgress(Math.round((i + 1) / request.trips.length * 100));
        setDetail(`${i + 1} / ${request.trips.length} trajets`);
      }
      if (runRef.current?.id !== id) return;
      const { vehicleType: _vehicleType, vehicleLabel: _vehicleLabel, dateLabel: _dateLabel, ...options } = request;
      const opts = { ...options, trips, jobId: id };
      runRef.current.script = `(function(){try{window.generatePeriodStory(${JSON.stringify(opts)});}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_error',jobId:${JSON.stringify(id)},message:'Impossible de préparer la vidéo. Réessaie en thème Sombre.'}));}})();true;`;
      setDetail('Démarrage du moteur vidéo…');
      injectIfReady();
    } catch (error) {
      if (runRef.current?.id === id) fail(error instanceof Error ? error.message : 'Impossible de préparer les trajets.');
    }
  }, [clearCachedResult, fail, injectIfReady]);

  const shareResult = useCallback(async (): Promise<boolean> => {
    const cached = resultRef.current;
    if (!cached || sharingRef.current) return false;
    sharingRef.current = true;
    if (mounted.current) setIsSharing(true);
    try {
      if (Sharing.isAvailableAsync && !(await Sharing.isAvailableAsync())) {
        throw new Error('Partage indisponible sur cet appareil.');
      }
      await Sharing.shareAsync(cached.uri, {
        mimeType: cached.mimeType,
        dialogTitle: 'Partager la story période',
      });
      return true;
    } catch {
      /*
       * Keep the file after a failed share.  The user can retry without
       * paying for another rendering pass.
       */
      if (mounted.current) {
        Alert.alert('Partage indisponible', 'La vidéo a été créée, mais le partage a échoué. Tu peux réessayer.');
      }
      return false;
    } finally {
      sharingRef.current = false;
      if (mounted.current) setIsSharing(false);
      if (discardAfterShareRef.current) {
        discardAfterShareRef.current = false;
        const pending = resultRef.current;
        resultRef.current = null;
        if (pending) {
          try { pending.file.delete(); } catch {}
        }
        if (mounted.current) setResult(null);
      }
    }
  }, []);

  const discardResult = useCallback(() => {
    clearCachedResult();
  }, [clearCachedResult]);

  return {
    jobId, isGenerating: jobId !== null, progress, detail, title: TITLES[phase], fallbackNote,
    webViewRef, source, start, cancel: () => stop(), onMessage, onLoadEnd, onEngineError,
    result, shareResult, discardResult, isSharing,
  };
}