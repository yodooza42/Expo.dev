const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'utils/journalRenderLogs.ts'),
  'utf8',
);

function loadStore() {
  const values = new Map();
  const storage = {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
  const module = { exports: {} };
  const compiled = ts.transpileModule(SOURCE, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(
    `(function(require, module, exports) {\n${compiled}\n})(require, module, exports);`,
    {
      module,
      exports: module.exports,
      require(name) {
        if (name === '@react-native-async-storage/async-storage') {
          return { __esModule: true, default: storage };
        }
        throw new Error(`Unexpected dependency: ${name}`);
      },
      Date,
    },
  );
  return { store: module.exports, values };
}

test('journal render logs retain only the five newest runs', async () => {
  const { store, values } = loadStore();
  for (let index = 0; index < 6; index++) {
    await store.beginJournalRenderLog({
      id: `run-${index}`,
      startedAt: 1000 + index,
      entries: 12,
      photos: 51,
    });
  }
  const logs = await store.loadJournalRenderLogs();
  assert.equal(logs.length, 5);
  assert.equal(JSON.stringify(logs.map(log => log.id)), JSON.stringify(['run-5', 'run-4', 'run-3', 'run-2', 'run-1']));
  assert.equal(JSON.parse(values.get(store.JOURNAL_RENDER_LOGS_KEY)).length, 5);
});

test('copyable carnet logs include only failures and interrupted renders', async () => {
  const { store } = loadStore();
  const logs = [
    { id: 'success-newer', status: 'success', startedAt: 4000 },
    { id: 'error-older', status: 'error', startedAt: 2000 },
    { id: 'cancelled', status: 'cancelled', startedAt: 5000 },
    { id: 'interrupted-newer', status: 'interrupted', startedAt: 3000 },
  ];
  assert.deepEqual(
    Array.from(store.failedJournalRenderLogs(logs), log => log.status),
    ['error', 'interrupted'],
  );
  assert.equal(store.latestFailedJournalRenderLog(logs).id, 'interrupted-newer');
});

test('journal render logs keep bounded progress and final diagnostics', async () => {
  const { store } = loadStore();
  await store.beginJournalRenderLog({ id: 'run', startedAt: 1000, entries: 12, photos: 51 });
  await store.appendJournalRenderLogEvent('run', {
    elapsedMs: 10_000,
    kind: 'video',
    phase: 'export',
    progress: 70,
    bytes: 7_000_000,
    chunks: 100,
  }, { phase: 'export', progress: 70, writtenBytes: 7_000_000, writtenChunks: 100 });
  await store.finishJournalRenderLog('run', {
    endedAt: 46_000,
    durationMs: 45_000,
    status: 'error',
    phase: 'export',
    progress: 70,
    writtenBytes: 7_000_000,
    writtenChunks: 100,
    idleMs: 60_000,
    errorCode: 'watchdog_60s',
    engineState: {
      receivedAt: 1_000,
      heartbeatAgeMs: 60_000,
      stage: 'waiting_native_ack',
      storyTimeMs: 18_000,
      storyDurationMs: 20_000,
      segmentKind: 'title',
      segmentIndex: 3,
      photoIndex: 7,
      photoState: 'ok',
      waitingPhotoIndex: 8,
      waitingPhotoState: 'loading',
      waitingSegmentKind: 'title',
      waitingSegmentIndex: 4,
      recorderState: 'paused',
      awaitingAck: true,
      blobRemainingBytes: 24_576,
      pendingBlobs: 1,
      chunkIndex: 42,
      bytes: 2_900_000,
    },
  });
  const [log] = await store.loadJournalRenderLogs();
  assert.equal(log.status, 'error');
  assert.equal(log.phase, 'export');
  assert.equal(log.progress, 70);
  assert.equal(log.writtenBytes, 7_000_000);
  assert.equal(log.idleMs, 60_000);
  assert.equal(log.engineState.stage, 'waiting_native_ack');
  assert.equal(log.engineState.waitingPhotoIndex, 8);
  assert.equal(log.events.at(-1).engineStage, 'waiting_native_ack');
  assert.equal(log.events.at(-1).waitingPhotoIndex, 8);
  assert.equal(log.events.at(-1).kind, 'error');
});

test('a running log left by an app crash is marked interrupted', async () => {
  const { store } = loadStore();
  await store.beginJournalRenderLog({ id: 'crashed-run', startedAt: 1000, entries: 2, photos: 5 });
  const [log] = await store.loadJournalRenderLogs();
  assert.equal(log.status, 'interrupted');
  assert.equal(log.errorCode, 'app_closed');
  assert.ok(log.endedAt >= log.startedAt);
});

test('journal logs can be cleared independently of other app storage', async () => {
  const { store, values } = loadStore();
  await store.beginJournalRenderLog({ id: 'run', startedAt: 1000, entries: 1, photos: 1 });
  await store.clearJournalRenderLogs();
  assert.equal((await store.loadJournalRenderLogs()).length, 0);
  assert.equal(values.has(store.JOURNAL_RENDER_LOGS_KEY), false);
});
