import AsyncStorage from '@react-native-async-storage/async-storage';

export const JOURNAL_RENDER_LOGS_KEY = '@yoann2_journal_render_logs_v1';
export const JOURNAL_RENDER_LOGS_LIMIT = 5;
export const JOURNAL_RENDER_LOG_EVENTS_LIMIT = 120;

export type JournalRenderStatus = 'running' | 'success' | 'error' | 'cancelled' | 'interrupted';
export type JournalRenderEngineState = {
  receivedAt: number;
  stage: string;
  storyTimeMs: number;
  storyDurationMs: number;
  segmentKind: string;
  segmentIndex: number;
  photoIndex: number;
  photoState: string;
  waitingPhotoIndex?: number;
  waitingPhotoState?: string;
  waitingSegmentKind?: string;
  waitingSegmentIndex?: number;
  recorderState: string;
  awaitingAck: boolean;
  blobRemainingBytes: number;
  pendingBlobs: number;
  chunkIndex: number;
  bytes: number;
  heartbeatAgeMs?: number;
};
export type JournalRenderEvent = {
  elapsedMs: number;
  kind: 'start' | 'phase' | 'progress' | 'photos' | 'video' | 'engine' | 'finish' | 'error' | 'cancel';
  phase: string;
  progress?: number;
  completed?: number;
  total?: number;
  bytes?: number;
  chunks?: number;
  idleMs?: number;
  engineStage?: string;
  storyTimeMs?: number;
  storyDurationMs?: number;
  segmentKind?: string;
  segmentIndex?: number;
  photoIndex?: number;
  photoState?: string;
  waitingPhotoIndex?: number;
  waitingPhotoState?: string;
  waitingSegmentKind?: string;
  waitingSegmentIndex?: number;
  recorderState?: string;
  awaitingAck?: boolean;
  blobRemainingBytes?: number;
  pendingBlobs?: number;
};
export type JournalRenderMetrics = {
  durationMs: number;
  recorderPauses: number;
  photoFailures: number;
};
export type JournalRenderLog = {
  id: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: JournalRenderStatus;
  entries: number;
  photos: number;
  phase: string;
  progress: number;
  writtenBytes: number;
  writtenChunks: number;
  idleMs?: number;
  errorCode?: string;
  metrics?: JournalRenderMetrics;
  engineState?: JournalRenderEngineState;
  events: JournalRenderEvent[];
};

export function failedJournalRenderLogs(logs: JournalRenderLog[]): JournalRenderLog[] {
  return logs.filter(log => log.status === 'error' || log.status === 'interrupted');
}

export function latestFailedJournalRenderLog(logs: JournalRenderLog[]): JournalRenderLog | undefined {
  return failedJournalRenderLogs(logs).reduce<JournalRenderLog | undefined>(
    (latest, log) => !latest || log.startedAt > latest.startedAt ? log : latest,
    undefined,
  );
}

let writes: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = writes.then(operation, operation);
  writes = next.then(() => undefined, () => undefined);
  return next;
}

async function readLogs(): Promise<JournalRenderLog[]> {
  try {
    const raw = await AsyncStorage.getItem(JOURNAL_RENDER_LOGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is JournalRenderLog =>
      !!item && typeof item === 'object' &&
      typeof item.id === 'string' &&
      typeof item.startedAt === 'number' &&
      ['running', 'success', 'error', 'cancelled', 'interrupted'].includes(item.status) &&
      Array.isArray(item.events));
  } catch {
    return [];
  }
}

async function writeLogs(logs: JournalRenderLog[]): Promise<void> {
  await AsyncStorage.setItem(
    JOURNAL_RENDER_LOGS_KEY,
    JSON.stringify(logs.slice(0, JOURNAL_RENDER_LOGS_LIMIT)),
  );
}

export function beginJournalRenderLog(input: {
  id: string;
  startedAt: number;
  entries: number;
  photos: number;
}): Promise<void> {
  return serialize(async () => {
    const logs = await readLogs();
    const next: JournalRenderLog = {
      ...input,
      status: 'running',
      phase: 'prepare',
      progress: 0,
      writtenBytes: 0,
      writtenChunks: 0,
      events: [{ elapsedMs: 0, kind: 'start', phase: 'prepare' }],
    };
    await writeLogs([next, ...logs.filter(log => log.id !== input.id)]);
  });
}

export function appendJournalRenderLogEvent(
  id: string,
  event: JournalRenderEvent,
  snapshot?: Partial<Pick<JournalRenderLog,
    'phase' | 'progress' | 'writtenBytes' | 'writtenChunks'>>,
): Promise<void> {
  return serialize(async () => {
    const logs = await readLogs();
    const index = logs.findIndex(log => log.id === id);
    if (index < 0) return;
    const current = logs[index]!;
    logs[index] = {
      ...current,
      ...snapshot,
      events: [...current.events, event].slice(-JOURNAL_RENDER_LOG_EVENTS_LIMIT),
    };
    await writeLogs(logs);
  });
}

export function finishJournalRenderLog(
  id: string,
  input: {
    endedAt: number;
    durationMs: number;
    status: Exclude<JournalRenderStatus, 'running'>;
    phase: string;
    progress: number;
    writtenBytes: number;
    writtenChunks: number;
    idleMs?: number;
    errorCode?: string;
    metrics?: JournalRenderMetrics;
    engineState?: JournalRenderEngineState;
  },
): Promise<void> {
  return serialize(async () => {
    const logs = await readLogs();
    const index = logs.findIndex(log => log.id === id);
    if (index < 0) return;
    const current = logs[index]!;
    const finishEvent: JournalRenderEvent = {
      elapsedMs: input.durationMs,
      kind: input.status === 'success' ? 'finish' : input.status === 'cancelled' ? 'cancel' : 'error',
      phase: input.phase,
      progress: input.progress,
      bytes: input.writtenBytes,
      chunks: input.writtenChunks,
      ...(input.idleMs !== undefined ? { idleMs: input.idleMs } : {}),
      ...(input.engineState ? {
        engineStage: input.engineState.stage,
        storyTimeMs: input.engineState.storyTimeMs,
        storyDurationMs: input.engineState.storyDurationMs,
        segmentKind: input.engineState.segmentKind,
        segmentIndex: input.engineState.segmentIndex,
        photoIndex: input.engineState.photoIndex,
        photoState: input.engineState.photoState,
        waitingPhotoIndex: input.engineState.waitingPhotoIndex,
        waitingPhotoState: input.engineState.waitingPhotoState,
        waitingSegmentKind: input.engineState.waitingSegmentKind,
        waitingSegmentIndex: input.engineState.waitingSegmentIndex,
        recorderState: input.engineState.recorderState,
        awaitingAck: input.engineState.awaitingAck,
        blobRemainingBytes: input.engineState.blobRemainingBytes,
        pendingBlobs: input.engineState.pendingBlobs,
      } : {}),
    };
    logs[index] = {
      ...current,
      ...input,
      events: [...current.events, finishEvent].slice(-JOURNAL_RENDER_LOG_EVENTS_LIMIT),
    };
    await writeLogs(logs);
  });
}

export function loadJournalRenderLogs(): Promise<JournalRenderLog[]> {
  return serialize(async () => {
    const logs = await readLogs();
    let changed = false;
    const recovered = logs.map(log => {
      if (log.status !== 'running') return log;
      changed = true;
      return {
        ...log,
        status: 'interrupted' as const,
        endedAt: Date.now(),
        durationMs: Math.max(0, Date.now() - log.startedAt),
        errorCode: 'app_closed',
      };
    });
    if (changed) await writeLogs(recovered);
    return recovered.slice(0, JOURNAL_RENDER_LOGS_LIMIT);
  });
}

export function clearJournalRenderLogs(): Promise<void> {
  return serialize(async () => {
    await AsyncStorage.removeItem(JOURNAL_RENDER_LOGS_KEY);
  });
}
