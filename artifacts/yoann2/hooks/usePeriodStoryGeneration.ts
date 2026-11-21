import { File, Paths, type FileHandle } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Alert, AppState, Platform } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type WebView from 'react-native-webview';

import type { Trip } from '@/types/trips';
import { buildStoryPeriodHtml } from '@/utils/storyGeneratorPeriod';
import { PeriodStoryTransfer, type StoryVideoChunk } from '@/utils/periodStoryTransfer';
import { buildProjectJournalHtml } from '@/utils/projectJournalRenderer';
import { prepareJournal, type JournalPhotoAsset } from '@/utils/prepareJournal';
import { JOURNAL_LIMITS, journalDuration } from '@/utils/projectJournal';
import type { JournalGenerationRequest } from '@/types/projectJournal';
import { resolvePhotoRef } from '@/utils/library/catalogue';
import { photoCandidates } from '@/utils/photoReferences';
import { prepareStoryPhoto } from '@/utils/storyPhoto';
import {
  addNativeJournalProgressListener,
  cancelNativeJournal,
  generateNativeJournal,
  isNativeJournalEncoderAvailable,
} from '@/modules/yoann-journal-native/src';
import { buildNativeJournalPlan } from '@/utils/nativeJournalPlan';
import {
  appendJournalRenderLogEvent,
  beginJournalRenderLog,
  finishJournalRenderLog,
  type JournalRenderEngineState,
  type JournalRenderMetrics,
} from '@/utils/journalRenderLogs';

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
type CachedPeriodStoryResult = PeriodStoryResult & { file?: File; webUrl?: boolean };
type Run = {
  id: string;
  startedAt: number;
  ready: boolean;
  injected: boolean;
  script?: string;
  lastActivity: number;
  deadline: number;
  signal: string;
  file?: File;
  handle?: FileHandle;
  transfer?: PeriodStoryTransfer;
  webChunks?: Uint8Array[];
  journalAssets?: Map<string, JournalPhotoAsset>;
  requestedJournalAssets?: Set<string>;
  journalAssetQueue?: string[];
  currentJournalAssetKey?: string;
  journalAssetTotal?: number;
  journalAssetIndex?: number;
  journalAssetChunkIndex?: number;
  awaitingJournalAssetAck?: boolean;
  preparingJournalAsset?: boolean;
  preparedJournalAssets?: Map<string, string>;
  preparingJournalAssetKeys?: Set<string>;
  exportStarted?: boolean;
  currentJournalAssetData?: string;
  currentPhase?: Phase;
  currentProgress?: number;
  journalLastLoggedProgress?: number;
  journalLastLoggedPhotos?: number;
  journalLastLoggedMegabytes?: number;
  journalLastLoggedEngineAt?: number;
  debugMetrics?: JournalRenderMetrics;
  engineState?: JournalRenderEngineState;
  nativeEngine?: boolean;
  nativeWrittenBytes?: number;
  nativeFrames?: number;
  nativeLastLoggedProgress?: number;
};
const JOURNAL_INACTIVITY_TIMEOUT_MS = 60_000;
const JOURNAL_ASSET_CHUNK_CHARS = 96 * 1024;
function parseDebugMetrics(value: unknown): JournalRenderMetrics | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const metrics = value as Record<string, unknown>;
  if (typeof metrics.durationMs !== 'number' || !Number.isFinite(metrics.durationMs) ||
      typeof metrics.recorderPauses !== 'number' || !Number.isFinite(metrics.recorderPauses) ||
      typeof metrics.photoFailures !== 'number' || !Number.isFinite(metrics.photoFailures)) return undefined;
  return {
    durationMs: metrics.durationMs,
    recorderPauses: metrics.recorderPauses,
    photoFailures: metrics.photoFailures,
  };
}
function formatDebugMetrics(value: unknown): string {
  const metrics = parseDebugMetrics(value);
  if (!metrics) return '';
  return `Export : ${Math.round(metrics.durationMs / 1000)} s · pauses : ${metrics.recorderPauses} · photos en échec : ${metrics.photoFailures}`;
}
function journalErrorCode(message: string): string {
  if (/ne répond plus/i.test(message)) return 'watchdog_60s';
  if (/arrière-plan/i.test(message)) return 'background';
  if (/mediarecorder/i.test(message)) return 'media_recorder';
  if (/photo|image/i.test(message)) return 'photo';
  if (/fragment|transfert|fichier vidéo|96 mo/i.test(message)) return 'video_transfer';
  if (/moteur/i.test(message)) return 'webview';
  return 'generation_error';
}
const TITLES: Record<Phase, string> = {
  prepare: 'Préparation des trajets…',
  maps: 'Préparation des cartes…',
  photos: 'Préparation des photos…',
  recording: 'Création de la vidéo…',
  export: 'Enregistrement de la vidéo…',
};

async function preparePhoto(reference: string, isCurrent: () => boolean): Promise<string> {
  const uri = resolvePhotoRef(reference);
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

export function usePeriodStoryGeneration(mode: 'period' | 'journal' = 'period') {
  const webViewRef = useRef<WebView>(null);
  const runRef = useRef<Run | null>(null);
  const mounted = useRef(true);
  const sequence = useRef(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [usesNativeEngine, setUsesNativeEngine] = useState(false);
  const [phase, setPhase] = useState<Phase>('prepare');
  const [progress, setProgress] = useState(0);
  const [detail, setDetail] = useState('');
  const [fallbackNote, setFallbackNote] = useState('');
  const [result, setResult] = useState<PeriodStoryResult | null>(null);
  const [debugMetrics, setDebugMetrics] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState('');
  const resultRef = useRef<CachedPeriodStoryResult | null>(null);
  const sharingRef = useRef(false);
  const discardAfterShareRef = useRef(false);
  const source = useMemo(() => ({ html: mode === 'journal' ? buildProjectJournalHtml() : buildStoryPeriodHtml() }), [mode]);

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
      try { cached.file?.delete(); } catch {}
      if (cached.webUrl) URL.revokeObjectURL(cached.uri);
    }
    if (mounted.current) setResult(null);
  }, []);

  const stop = useCallback((keepFile = false) => {
    const run = runRef.current;
    if (!run) return;
    runRef.current = null; // Invalidate before any late native/WebView callback.
    if (run.nativeEngine) cancelNativeJournal(run.id);
    else {
      try { webViewRef.current?.injectJavaScript(`window.cancelPeriodStory&&window.cancelPeriodStory(${JSON.stringify(run.id)});true;`); } catch {}
    }
    run.script = undefined;
    run.transfer?.clear();
    run.webChunks = undefined;
    run.journalAssets = undefined;
    run.preparedJournalAssets?.clear();
    run.preparingJournalAssetKeys?.clear();
    run.currentJournalAssetData = undefined;
    try { run.handle?.close(); } catch {}
    if (!keepFile) { try { run.file?.delete(); } catch {} }
    if (mounted.current) {
      setJobId(null); // Unmount the renderer, releasing native memory too.
      setUsesNativeEngine(false);
    }
  }, []);

  const fail = useCallback((message: string) => {
    const run = runRef.current;
    if (!run) return;
    if (mode === 'journal') {
      const endedAt = Date.now();
      void finishJournalRenderLog(run.id, {
        endedAt,
        durationMs: Math.max(0, endedAt - run.startedAt),
        status: 'error',
        phase: run.currentPhase ?? 'prepare',
        progress: run.currentProgress ?? 0,
        writtenBytes: run.transfer?.writtenBytes ?? run.nativeWrittenBytes ?? 0,
        writtenChunks: run.transfer?.written ?? 0,
        idleMs: Math.max(0, endedAt - run.lastActivity),
        errorCode: journalErrorCode(message),
        metrics: run.debugMetrics,
        engineState: run.engineState ? {
          ...run.engineState,
          heartbeatAgeMs: Math.max(0, endedAt - run.engineState.receivedAt),
        } : undefined,
      }).catch(() => {});
    }
    stop();
    if (mounted.current) setError(message);
    if (mounted.current) Alert.alert('Story interrompue', message);
  }, [stop, mode]);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => {
      const run = runRef.current;
      const inactivityLimit = mode === 'journal' ? JOURNAL_INACTIVITY_TIMEOUT_MS : 45_000;
      if (run && (Date.now() > run.deadline
        || (!run.preparingJournalAsset && !run.preparingJournalAssetKeys?.size &&
          Date.now() - run.lastActivity > inactivityLimit))) {
        fail(mode === 'journal'
          ? 'Le moteur du carnet ne répond plus. Le brouillon est conservé ; tu peux réessayer.'
          : 'La génération ne répond plus. Tu peux réessayer avec le thème Sombre ou une période plus courte. Tes trajets sont conservés.');
      }
    }, 1000);
    const appState = AppState.addEventListener('change', nextState => {
      const run = runRef.current;
      if (nextState === 'background' && mode === 'journal' && run?.exportStarted) {
        fail('L’application est passée en arrière-plan pendant la création. Le carnet a été annulé pour éviter une vidéo corrompue ; garde l’application ouverte pendant l’export.');
      }
    });
    return () => {
      mounted.current = false;
      clearInterval(timer);
      appState.remove();
      const run = runRef.current;
      if (mode === 'journal' && run) {
        const endedAt = Date.now();
        void finishJournalRenderLog(run.id, {
          endedAt,
          durationMs: Math.max(0, endedAt - run.startedAt),
          status: 'interrupted',
          phase: run.currentPhase ?? 'prepare',
          progress: run.currentProgress ?? 0,
          writtenBytes: run.transfer?.writtenBytes ?? 0,
          writtenChunks: run.transfer?.written ?? 0,
          errorCode: 'screen_closed',
        }).catch(() => {});
      }
      stop();
      clearCachedResult();
    };
  }, [clearCachedResult, fail, stop, mode]);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const tag = `story-generation-${jobId}`;
    void activateKeepAwakeAsync(tag).then(() => {
      if (!active) void deactivateKeepAwake(tag);
    }).catch(() => {});
    return () => {
      active = false;
      void deactivateKeepAwake(tag).catch(() => {});
    };
  }, [jobId]);

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

  const prepareNextJournalAssets = useCallback(async (id: string) => {
    let run = runRef.current;
    if (!run || run.id !== id) return;
    const prepared = run.preparedJournalAssets ??= new Map<string, string>();
    const preparing = run.preparingJournalAssetKeys ??= new Set<string>();
    while (prepared.size + preparing.size < 2) {
      if (!run || run.id !== id) return;
      const currentKey = run.currentJournalAssetKey;
      const nextKey = run.journalAssetQueue?.find(key =>
        key !== currentKey && !prepared.has(key) && !preparing.has(key));
      if (!nextKey) return;
      const asset = run.journalAssets?.get(nextKey);
      if (!asset) return;
      preparing.add(nextKey);
      run.lastActivity = Date.now();
      try {
        const dataUri = await prepareStoryPhoto(asset.uri, () => runRef.current?.id === id);
        run = runRef.current;
        if (!run || run.id !== id) return;
        const encodedBytes = Math.ceil(dataUri.slice(dataUri.indexOf(',') + 1).length * 3 / 4);
        if (encodedBytes > JOURNAL_LIMITS.photoBytes) {
          throw new Error('Cette photo préparée dépasse la taille autorisée. Retire-la du carnet.');
        }
        run.preparedJournalAssets?.set(nextKey, dataUri);
        run.lastActivity = Date.now();
      } catch (error) {
        if (runRef.current?.id === id) {
          fail(`${asset.title} · photo ${asset.index + 1} : ${error instanceof Error ? error.message : 'Photo illisible.'}`);
        }
        return;
      } finally {
        const active = runRef.current;
        active?.preparingJournalAssetKeys?.delete(nextKey);
      }
    }
  }, [fail]);

  const sendNextJournalAssetChunk = useCallback(async (id: string) => {
    let run = runRef.current;
    if (!run || run.id !== id || run.awaitingJournalAssetAck || run.preparingJournalAsset) return;
    if (!run.currentJournalAssetKey) run.currentJournalAssetKey = run.journalAssetQueue?.shift();
    let key = run.currentJournalAssetKey;
    let asset = key ? run.journalAssets?.get(key) : undefined;
    if (!key || !asset) return;

    if (!run.currentJournalAssetData) {
      const warmed = run.preparedJournalAssets?.get(key);
      if (warmed) {
        run.currentJournalAssetData = warmed;
        run.preparedJournalAssets?.delete(key);
      } else {
        run.preparingJournalAsset = true;
        run.lastActivity = Date.now();
        setPhase('photos');
        setDetail(`Préparation de la photo ${(run.journalAssetIndex ?? 0) + 1} / ${run.journalAssetTotal ?? 0}`);
        try {
          const dataUri = await prepareStoryPhoto(asset.uri, () => runRef.current?.id === id);
          run = runRef.current;
          if (!run || run.id !== id) return;
          const encodedBytes = Math.ceil(dataUri.slice(dataUri.indexOf(',') + 1).length * 3 / 4);
          if (encodedBytes > JOURNAL_LIMITS.photoBytes) {
            throw new Error('Cette photo préparée dépasse la taille autorisée. Retire-la du carnet.');
          }
          run.currentJournalAssetData = dataUri;
          run.lastActivity = Date.now();
        } catch (error) {
          if (runRef.current?.id === id) {
            fail(`${asset.title} · photo ${asset.index + 1} : ${error instanceof Error ? error.message : 'Photo illisible.'}`);
          }
          return;
        } finally {
          const active = runRef.current;
          if (active?.id === id) {
            active.preparingJournalAsset = false;
            active.lastActivity = Date.now();
          }
        }
      }
    }
    void prepareNextJournalAssets(id);

    run = runRef.current;
    if (!run || run.id !== id || !run.currentJournalAssetData) return;
    key = run.currentJournalAssetKey;
    asset = key ? run.journalAssets?.get(key) : undefined;
    if (!key || !asset) return;
    const dataUri = run.currentJournalAssetData;
    const chunkIndex = run.journalAssetChunkIndex ?? 0;
    const chunkCount = Math.ceil(dataUri.length / JOURNAL_ASSET_CHUNK_CHARS);
    const chunk = dataUri.slice(chunkIndex * JOURNAL_ASSET_CHUNK_CHARS, (chunkIndex + 1) * JOURNAL_ASSET_CHUNK_CHARS);
    run.awaitingJournalAssetAck = true;
    run.lastActivity = Date.now();
    run.currentPhase = 'photos';
    run.currentProgress = run.journalAssetTotal
      ? Math.round(((run.journalAssetIndex ?? 0) / run.journalAssetTotal) * 100)
      : 0;
    setPhase('photos');
    setProgress(run.currentProgress);
    setDetail(`Transfert des photos ${(run.journalAssetIndex ?? 0) + 1} / ${run.journalAssetTotal ?? 0}`);
    const webView = webViewRef.current;
    if (!webView) {
      run.awaitingJournalAssetAck = false;
      fail('Le moteur vidéo n’est plus disponible pour recevoir les photos. Réessaie le carnet.');
      return;
    }
    try {
      webView.injectJavaScript(
        `window.receivePeriodStoryAssetChunk&&window.receivePeriodStoryAssetChunk(${JSON.stringify(id)},${JSON.stringify(asset.key)},${chunkIndex},${chunkCount},${JSON.stringify(chunk)});true;`,
      );
    } catch { fail('Le transfert d’une photo vers le moteur vidéo a échoué. Réessaie le carnet.'); }
  }, [fail, prepareNextJournalAssets]);

  const completeVideoTransfer = useCallback((run: Run, id: string) => {
    if (!run.transfer?.complete) {
      fail('Transfert vidéo incomplet.');
      return;
    }
    run.handle?.close();
    run.handle = undefined;
    const mimeType = run.transfer.mime;
    const uri = Platform.OS === 'web'
      ? URL.createObjectURL(new Blob(run.webChunks!.map(bytes => bytes.slice().buffer as ArrayBuffer), { type: mimeType }))
      : run.file!.uri;
    if (mode === 'journal') {
      const endedAt = Date.now();
      void finishJournalRenderLog(id, {
        endedAt,
        durationMs: Math.max(0, endedAt - run.startedAt),
        status: 'success',
        phase: 'export',
        progress: 100,
        writtenBytes: run.transfer.writtenBytes,
        writtenChunks: run.transfer.written,
        metrics: run.debugMetrics,
        engineState: run.engineState,
      }).catch(() => {});
    }
    stop(true);
    const cached: CachedPeriodStoryResult = { uri, mimeType, file: run.file, webUrl: Platform.OS === 'web' };
    resultRef.current = cached;
    if (mounted.current) setResult({ uri, mimeType });
  }, [fail, mode, stop]);

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
      const metrics = formatDebugMetrics(msg.metrics);
      if (metrics) setDebugMetrics(metrics);
      run.debugMetrics = parseDebugMetrics(msg.metrics) ?? run.debugMetrics;
      fail(typeof msg.message === 'string' ? msg.message : 'Le moteur vidéo a rencontré une erreur. Réessaie en thème Sombre.');
      return;
    }
    if (msg.type === 'story_heartbeat') {
      const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
      const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 32) : 'unknown';
      const state: JournalRenderEngineState = {
        receivedAt: Date.now(),
        stage: text(msg.stage),
        storyTimeMs: number(msg.storyTimeMs),
        storyDurationMs: number(msg.storyDurationMs),
        segmentKind: text(msg.segmentKind),
        segmentIndex: number(msg.segmentIndex),
        photoIndex: number(msg.photoIndex),
        photoState: text(msg.photoState),
        waitingPhotoIndex: number(msg.waitingPhotoIndex),
        waitingPhotoState: text(msg.waitingPhotoState),
        waitingSegmentKind: text(msg.waitingSegmentKind),
        waitingSegmentIndex: number(msg.waitingSegmentIndex),
        recorderState: text(msg.recorderState),
        awaitingAck: msg.awaitingAck === true,
        blobRemainingBytes: number(msg.blobRemainingBytes),
        pendingBlobs: number(msg.pendingBlobs),
        chunkIndex: number(msg.chunkIndex),
        bytes: number(msg.bytes),
      };
      run.engineState = state;
      if (mode === 'journal' && Date.now() - (run.journalLastLoggedEngineAt ?? 0) >= 10_000) {
        run.journalLastLoggedEngineAt = Date.now();
        void appendJournalRenderLogEvent(id, {
          elapsedMs: Date.now() - run.startedAt,
          kind: 'engine',
          phase: run.currentPhase ?? 'recording',
          progress: run.currentProgress,
          engineStage: state.stage,
          storyTimeMs: state.storyTimeMs,
          storyDurationMs: state.storyDurationMs,
          segmentKind: state.segmentKind,
          segmentIndex: state.segmentIndex,
          photoIndex: state.photoIndex,
          photoState: state.photoState,
          waitingPhotoIndex: state.waitingPhotoIndex,
          waitingPhotoState: state.waitingPhotoState,
          waitingSegmentKind: state.waitingSegmentKind,
          waitingSegmentIndex: state.waitingSegmentIndex,
          recorderState: state.recorderState,
          awaitingAck: state.awaitingAck,
          blobRemainingBytes: state.blobRemainingBytes,
          pendingBlobs: state.pendingBlobs,
          bytes: state.bytes,
          chunks: state.chunkIndex,
        }).catch(() => {});
      }
      return;
    }
    if (msg.type === 'story_done') {
      try {
        if (mode !== 'journal' || !run.transfer ||
            typeof msg.total !== 'number' || typeof msg.bytes !== 'number' ||
            msg.mime !== run.transfer.mime) {
          throw new Error('Transfert vidéo incomplet.');
        }
        run.transfer.finish(msg.total, msg.bytes);
        run.lastActivity = Date.now();
        const metrics = formatDebugMetrics(msg.metrics);
        if (metrics) setDebugMetrics(metrics);
        run.debugMetrics = parseDebugMetrics(msg.metrics) ?? run.debugMetrics;
        setProgress(100);
        setDetail(`${run.transfer.writtenBytes} octets enregistrés`);
        completeVideoTransfer(run, id);
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Transfert vidéo incomplet.');
      }
      return;
    }
    if (msg.type === 'story_theme_fallback') {
      setFallbackNote('Satellite indisponible ou trop lourd : cette vidéo utilise le fond Sombre.');
      return;
    }
    if (msg.type === 'story_asset_needed') {
      const key = typeof msg.key === 'string' ? msg.key : '';
      const assets = run.journalAssets;
      if (!key || !assets?.has(key)) {
        if (run.requestedJournalAssets?.has(key)) return;
        fail('Le moteur vidéo a demandé une photo indisponible. Réessaie le carnet.');
        return;
      }
      run.lastActivity = Date.now();
      const requested = run.requestedJournalAssets ?? new Set<string>();
      run.requestedJournalAssets = requested;
      if (!requested.has(key)) {
        requested.add(key);
        (run.journalAssetQueue ??= []).push(key);
      }
      void sendNextJournalAssetChunk(id);
      void prepareNextJournalAssets(id);
      return;
    }
    if (msg.type === 'story_asset_chunk_received') {
      const key = run.currentJournalAssetKey;
      const asset = key ? run.journalAssets?.get(key) : undefined;
      if (!asset || msg.key !== asset.key || msg.index !== run.journalAssetChunkIndex) {
        fail('Le transfert des photos a perdu sa synchronisation. Réessaie le carnet.');
        return;
      }
      run.awaitingJournalAssetAck = false;
      run.lastActivity = Date.now();
      if (msg.complete === true) {
        run.currentJournalAssetData = undefined;
        run.currentJournalAssetKey = undefined;
        run.journalAssetIndex = (run.journalAssetIndex ?? 0) + 1;
        run.journalAssetChunkIndex = 0;
        const total = run.journalAssetTotal ?? 0;
        const progress = total ? Math.round((run.journalAssetIndex / total) * 100) : 100;
        run.currentPhase = 'photos';
        run.currentProgress = progress;
        setProgress(progress);
        setDetail(`${run.journalAssetIndex} / ${total} photos transférées`);
        if (mode === 'journal' && (run.journalAssetIndex % 10 === 0 || run.journalAssetIndex === total)) {
          run.journalLastLoggedPhotos = run.journalAssetIndex;
          void appendJournalRenderLogEvent(id, {
            elapsedMs: Date.now() - run.startedAt,
            kind: 'photos',
            phase: 'photos',
            progress,
            completed: run.journalAssetIndex,
            total,
          }, { phase: 'photos', progress }).catch(() => {});
        }
      } else {
        run.journalAssetChunkIndex = (run.journalAssetChunkIndex ?? 0) + 1;
      }
      void sendNextJournalAssetChunk(id);
      return;
    }
    if (msg.type === 'story_phase' && ['maps', 'photos', 'recording', 'export'].includes(String(msg.phase))) {
      const nextPhase = msg.phase as Phase;
      if (mode === 'journal' && (nextPhase === 'recording' || nextPhase === 'export')) run.exportStarted = true;
      const completed = typeof msg.completed === 'number' && Number.isFinite(msg.completed) ? msg.completed : 0;
      const total = typeof msg.total === 'number' && Number.isFinite(msg.total) ? msg.total : 0;
      const signal = `${nextPhase}:${completed}/${total}`;
      const progress = total > 0 ? Math.min(100, Math.max(0, Math.round(completed / total * 100))) : 0;
      if (signal !== run.signal) {
        run.signal = signal;
        run.lastActivity = Date.now();
        run.currentPhase = nextPhase;
        run.currentProgress = progress;
        if (mode === 'journal') {
          void appendJournalRenderLogEvent(id, {
            elapsedMs: Date.now() - run.startedAt,
            kind: 'phase',
            phase: nextPhase,
            progress,
            completed,
            total,
          }, { phase: nextPhase, progress }).catch(() => {});
        }
      }
      setPhase(nextPhase);
      setProgress(progress);
      const unit = nextPhase === 'maps' ? 'cartes' : nextPhase === 'export' ? 'fragments' : 'photos';
      setDetail(total > 0 ? `${completed} / ${total} ${unit}` : '');
      return;
    }
    if (msg.type === 'story_progress' && typeof msg.p === 'number' && Number.isFinite(msg.p)) {
      const metrics = formatDebugMetrics(msg.metrics);
      if (metrics) setDebugMetrics(metrics);
      const p = Math.min(100, Math.max(0, Math.round(msg.p)));
      const signal = `recording:${p}`;
      if (signal !== run.signal) {
        run.signal = signal;
        run.lastActivity = Date.now();
        run.currentPhase = 'recording';
        run.currentProgress = p;
      }
      run.debugMetrics = parseDebugMetrics(msg.metrics) ?? run.debugMetrics;
      if (mode === 'journal' && (p === 100 || p >= (run.journalLastLoggedProgress ?? -5) + 5)) {
        run.journalLastLoggedProgress = p;
        void appendJournalRenderLogEvent(id, {
          elapsedMs: Date.now() - run.startedAt,
          kind: 'progress',
          phase: 'recording',
          progress: p,
        }, { phase: 'recording', progress: p }).catch(() => {});
      }
      setPhase('recording');
      setProgress(p);
      setDetail(`${p} %`);
      return;
    }
    if (msg.type !== 'story_chunk') return;
    try {
      const chunk = msg as unknown as StoryVideoChunk;
      if (mode === 'journal' && (typeof chunk.data !== 'string' || chunk.data.length > 96 * 1024)) {
        throw new Error('Un fragment vidéo dépasse 96 Ko. Réessaie la création.');
      }
      if (!run.transfer) {
        run.transfer = new PeriodStoryTransfer(chunk, bytes => {
          if (Platform.OS === 'web') { run.webChunks!.push(bytes); return; }
          if (!run.handle) throw new Error('Fichier vidéo fermé.');
          run.handle.writeBytes(bytes);
        }, mode === 'journal' ? 96 * 1024 * 1024 : undefined);
        if (Platform.OS === 'web') run.webChunks = [];
        else {
          const ext = run.transfer.mime === 'video/mp4' ? 'mp4' : 'webm';
          run.file = new File(Paths.cache, `story_${mode}_${run.id}.${ext}`);
          run.file.create();
          run.handle = run.file.open();
        }
      }
      if (mode === 'journal' && chunk.index !== run.transfer.written) {
        throw new Error('Des fragments de la vidéo sont manquants.');
      }
      const accepted = run.transfer.accept(chunk);
      run.lastActivity = Date.now();
      run.currentPhase = 'export';
      run.currentProgress = 0;
      setPhase('export');
      if (mode === 'journal') {
        const progress = Math.min(99, Math.round(run.transfer.writtenBytes / (96 * 1024 * 1024) * 100));
        run.currentProgress = progress;
        setProgress(progress);
        setDetail(`${(run.transfer.writtenBytes / (1024 * 1024)).toFixed(1)} Mo écrits`);
        const megabytes = Math.floor(run.transfer.writtenBytes / (5 * 1024 * 1024));
        if (megabytes > (run.journalLastLoggedMegabytes ?? 0)) {
          run.journalLastLoggedMegabytes = megabytes;
          void appendJournalRenderLogEvent(id, {
            elapsedMs: Date.now() - run.startedAt,
            kind: 'video',
            phase: 'export',
            progress,
            bytes: run.transfer.writtenBytes,
            chunks: run.transfer.written,
          }, {
            phase: 'export',
            progress,
            writtenBytes: run.transfer.writtenBytes,
            writtenChunks: run.transfer.written,
          }).catch(() => {});
        }
        webViewRef.current?.injectJavaScript(
          `window.ackPeriodStoryChunk&&window.ackPeriodStoryChunk(${JSON.stringify(id)},${chunk.index});true;`,
        );
        return;
      }
      if (!accepted) return;
      const total = run.transfer.total ?? 0;
      setProgress(total ? Math.round(run.transfer.written / total * 100) : 0);
      setDetail(`${run.transfer.written} / ${total} fragments`);
      if (!run.transfer.complete) return;
      completeVideoTransfer(run, id);
    } catch (error) {
      fail(error instanceof Error ? error.message
        : 'Impossible d’enregistrer la vidéo. Vérifie l’espace libre du téléphone puis réessaie.');
    }
  }, [completeVideoTransfer, fail, injectIfReady, prepareNextJournalAssets, sendNextJournalAssetChunk, mode]);

  const onLoadEnd = useCallback((id: string) => {
    if (runRef.current?.id !== id) return;
    // Retry the ready handshake if the initial bridge message arrived too early.
    try {
      webViewRef.current?.injectJavaScript(`window.ReactNativeWebView.postMessage(JSON.stringify(typeof window.generatePeriodStory==='function'?{type:'story_ready'}:{type:'story_error',jobId:${JSON.stringify(id)},message:'Le moteur vidéo n’a pas pu se charger.'}));true;`);
    } catch { fail('Le moteur vidéo n’a pas pu se charger.'); }
  }, [fail]);

  const onEngineError = useCallback((id: string) => {
    if (runRef.current?.id === id) {
      fail(mode === 'journal' ? 'Le moteur vidéo a été interrompu. Réessaie avec moins de photos. Les originaux sont conservés.'
        : 'Le moteur vidéo a été interrompu. Réessaie en thème Sombre ou avec une période plus courte. Tes trajets sont conservés.');
    }
  }, [fail, mode]);

  const start = useCallback(async (request: GenerationRequest | JournalGenerationRequest) => {
    const journal = 'journal' in request;
    const count = journal ? request.entries.length : request.trips.length;
    if (runRef.current || sharingRef.current || count === 0) return;
    if (Platform.OS === 'web' && !journal) {
      Alert.alert('Story', 'La création vidéo est disponible dans l’application mobile.');
      return;
    }
    clearCachedResult();
    const id = `${Date.now()}-${++sequence.current}`;
    const photoCount = journal ? request.photoCount : request.trips.reduce((n, t) => n + (t.photos?.filter(p => p.routeIndex != null).length ?? 0), 0);
    const duration = journal ? journalDuration(request.entries, request.secondsPerPhoto, !!request.finalComparison)
      : request.videoDurationSec + photoCount * (request.photoPauseSecPerPhoto ?? 2);
    runRef.current = {
      id, startedAt: Date.now(), ready: false, injected: false, lastActivity: Date.now(), signal: '',
      currentPhase: 'prepare', currentProgress: 0,
      deadline: Date.now() + 90_000 +
        duration * 3000 +
        photoCount * 100_000,
    };
    if (journal) {
      void beginJournalRenderLog({
        id,
        startedAt: runRef.current.startedAt,
        entries: request.entries.length,
        photos: request.photoCount,
      }).catch(() => {});
    }
    setJobId(id);
    setUsesNativeEngine(false);
    setPhase('prepare');
    setProgress(0);
    setDetail(`0 / ${count} ${journal ? 'étapes' : 'trajets'}`);
    setFallbackNote('');
    setDebugMetrics('');
    setError('');
    try {
      if ('journal' in request) {
        const prepared = prepareJournal(request, id, () => runRef.current?.id === id);
        if (runRef.current?.id !== id) return;
        const { payload, assets } = prepared;
        runRef.current.journalAssets = new Map(assets.map(asset => [asset.key, asset]));
        runRef.current.requestedJournalAssets = new Set();
        runRef.current.journalAssetQueue = [];
        runRef.current.preparedJournalAssets = new Map();
        runRef.current.preparingJournalAssetKeys = new Set();
        runRef.current.journalAssetTotal = assets.length;
        runRef.current.journalAssetIndex = 0;
        runRef.current.journalAssetChunkIndex = 0;
        if (Platform.OS === 'android') {
          if (isNativeJournalEncoderAvailable()) {
            const nativeAssets: JournalPhotoAsset[] = [];
            for (let index = 0; index < assets.length; index++) {
              const asset = assets[index]!;
              const candidates = await photoCandidates(asset.uri);
              if (runRef.current?.id !== id) return;
              if (!candidates.length) {
                throw new Error(`${asset.title} · photo ${asset.index + 1} : photo introuvable dans le catalogue.`);
              }
              nativeAssets.push({ ...asset, nativeCandidates: candidates });
              runRef.current.lastActivity = Date.now();
              if (index === 0 || (index + 1) % 5 === 0 || index === assets.length - 1) {
                setDetail(`Vérification des photos ${index + 1} / ${assets.length}`);
              }
            }
            const plan = buildNativeJournalPlan(payload, nativeAssets);
            runRef.current.nativeEngine = true;
            runRef.current.exportStarted = true;
            runRef.current.currentPhase = 'recording';
            setUsesNativeEngine(true);
            setPhase('recording');
            setProgress(0);
            setDetail('Préparation du moteur vidéo Android…');
            const subscription = addNativeJournalProgressListener(event => {
              const run = runRef.current;
              if (!run || run.id !== id || event.jobId !== id) return;
              run.lastActivity = Date.now();
              run.nativeWrittenBytes = event.bytes;
              run.nativeFrames = event.frames;
              run.currentPhase = event.stage === 'finalizing' ? 'export' : 'recording';
              run.currentProgress = event.progress;
              run.engineState = {
                receivedAt: Date.now(),
                stage: `native_${event.stage}`,
                storyTimeMs: Math.round(event.frames / plan.fps * 1000),
                storyDurationMs: Math.round(event.totalFrames / plan.fps * 1000),
                segmentKind: 'native',
                segmentIndex: event.scene,
                photoIndex: 0,
                photoState: 'none',
                recorderState: 'native',
                awaitingAck: false,
                blobRemainingBytes: 0,
                pendingBlobs: 0,
                chunkIndex: event.frames,
                bytes: event.bytes,
              };
              setPhase(run.currentPhase);
              setProgress(event.progress);
              setDetail(event.stage === 'preparing'
                ? `Préparation · étape ${event.scene} / ${event.scenes}`
                : `${event.progress} % · ${(event.bytes / (1024 * 1024)).toFixed(1)} Mo écrits`);
              if (event.progress >= (run.nativeLastLoggedProgress ?? -5) + 5) {
                run.nativeLastLoggedProgress = event.progress;
                void appendJournalRenderLogEvent(id, {
                  elapsedMs: Date.now() - run.startedAt,
                  kind: 'engine',
                  phase: run.currentPhase,
                  progress: event.progress,
                  completed: event.frames,
                  total: event.totalFrames,
                  engineStage: `native_${event.stage}`,
                  segmentKind: 'native',
                  segmentIndex: event.scene,
                  storyTimeMs: run.engineState.storyTimeMs,
                  storyDurationMs: run.engineState.storyDurationMs,
                  bytes: event.bytes,
                }, {
                  phase: run.currentPhase,
                  progress: event.progress,
                  writtenBytes: event.bytes,
                  writtenChunks: 0,
                }).catch(() => {});
              }
            });
            try {
              const nativeResult = await generateNativeJournal(id, plan);
              if (runRef.current?.id !== id) return;
              const endedAt = Date.now();
              const nativeFile = new File(nativeResult.uri);
              runRef.current.file = nativeFile;
              runRef.current.nativeWrittenBytes = nativeResult.bytes;
              runRef.current.nativeFrames = nativeResult.frames;
              runRef.current.debugMetrics = {
                durationMs: endedAt - runRef.current.startedAt,
                recorderPauses: 0,
                photoFailures: 0,
              };
              setDebugMetrics(formatDebugMetrics(runRef.current.debugMetrics));
              setProgress(100);
              setPhase('export');
              setDetail(`${(nativeResult.bytes / (1024 * 1024)).toFixed(1)} Mo · vidéo prête`);
              void finishJournalRenderLog(id, {
                endedAt,
                durationMs: Math.max(0, endedAt - runRef.current.startedAt),
                status: 'success',
                phase: 'export',
                progress: 100,
                writtenBytes: nativeResult.bytes,
                writtenChunks: 0,
                metrics: runRef.current.debugMetrics,
                engineState: runRef.current.engineState,
              }).catch(() => {});
              stop(true);
              const cached: CachedPeriodStoryResult = {
                uri: nativeFile.uri,
                mimeType: 'video/mp4',
                file: nativeFile,
              };
              resultRef.current = cached;
              if (mounted.current) setResult({ uri: nativeFile.uri, mimeType: 'video/mp4' });
            } finally {
              subscription?.remove();
            }
            return;
          }
          if (photoCount > 15) {
            throw new Error('Ce carnet nécessite le nouveau moteur vidéo Android. Mets à jour l’application avant de créer plus de 15 photos.');
          }
        }
        const payloadWithStart = { ...payload, startedAtMs: runRef.current.startedAt };
        runRef.current.script = `(function(){try{window.generatePeriodStory(${JSON.stringify(payloadWithStart)});}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'story_error',jobId:${JSON.stringify(id)},message:'Impossible de démarrer le carnet vidéo.'}));}})();true;`;
        setDetail(assets.length ? `${assets.length} photos à préparer au fil de la vidéo` : 'Ouverture du carnet…');
        injectIfReady();
        return;
      }
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
          photos.push({ img, note: photo.note, lat: photo.lat, lng: photo.lng,
            frac: Math.max(0, Math.min(1, photo.routeIndex / (route.length - 1))) });
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
      if (runRef.current?.id === id) fail(error instanceof Error ? error.message
        : journal ? 'Impossible de préparer le carnet.' : 'Impossible de préparer les trajets.');
    }
  }, [clearCachedResult, fail, injectIfReady]);

  const shareResult = useCallback(async (): Promise<boolean> => {
    const cached = resultRef.current;
    if (!cached || sharingRef.current) return false;
    sharingRef.current = true;
    if (mounted.current) setIsSharing(true);
    try {
      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = cached.uri;
        link.download = `carnet-de-bord.${cached.mimeType === 'video/mp4' ? 'mp4' : 'webm'}`;
        document.body.appendChild(link); link.click(); link.remove();
        return true;
      }
      if (Sharing.isAvailableAsync && !(await Sharing.isAvailableAsync())) {
        throw new Error('Partage indisponible sur cet appareil.');
      }
      await Sharing.shareAsync(cached.uri, {
        mimeType: cached.mimeType,
        dialogTitle: mode === 'journal' ? 'Partager le carnet de bord' : 'Partager la story période',
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
          try { pending.file?.delete(); } catch {}
          if (pending.webUrl) URL.revokeObjectURL(pending.uri);
        }
        if (mounted.current) setResult(null);
      }
    }
  }, [mode]);

  const discardResult = useCallback(() => {
    clearCachedResult();
  }, [clearCachedResult]);

  return {
    jobId, isGenerating: jobId !== null, progress, detail, usesNativeEngine,
    title: mode === 'journal' && phase === 'prepare' ? 'Préparation du carnet…' : TITLES[phase], fallbackNote, error,
    webViewRef, source, start, cancel: () => {
      const run = runRef.current;
      if (mode === 'journal' && run) {
        const endedAt = Date.now();
        void finishJournalRenderLog(run.id, {
          endedAt,
          durationMs: Math.max(0, endedAt - run.startedAt),
          status: 'cancelled',
          phase: run.currentPhase ?? 'prepare',
          progress: run.currentProgress ?? 0,
          writtenBytes: run.transfer?.writtenBytes ?? 0,
          writtenChunks: run.transfer?.written ?? 0,
          errorCode: 'user_cancelled',
        }).catch(() => {});
      }
      stop();
    }, onMessage, onLoadEnd, onEngineError,
    result, shareResult, discardResult, isSharing, debugMetrics,
  };
}