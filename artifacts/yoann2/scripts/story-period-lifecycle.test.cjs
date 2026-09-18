/* Lifecycle and transfer-contract tests for the native Story Période bridge.
   These tests use the real TypeScript sources in a small CommonJS/VM harness;
   no React Native runtime is required. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const TRANSFER_SOURCE = fs.readFileSync(path.join(ROOT, 'utils/periodStoryTransfer.ts'), 'utf8');
const HOOK_SOURCE = fs.readFileSync(path.join(ROOT, 'hooks/usePeriodStoryGeneration.ts'), 'utf8');

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
}

function loadCommonJs(source, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const sandbox = {
    ...globals,
    module,
    exports: module.exports,
    require(name) {
      if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(
    `(function(require, module, exports) {\n${transpile(source)}\n})(require, module, exports);`,
    sandbox,
  );
  return module.exports;
}

const transfer = loadCommonJs(TRANSFER_SOURCE);

function bytes(length, seed = 0) {
  return Buffer.from(Array.from({ length }, (_, index) => (seed + index * 37) & 255));
}

function chunkData(length, seed = 0) {
  return bytes(length, seed).toString('base64');
}

function message(payload) {
  return { nativeEvent: { data: JSON.stringify(payload) } };
}

async function settle(rounds = 12) {
  for (let index = 0; index < rounds; index++) {
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
  }
}

function makeClock() {
  let nextTimerId = 1;
  const timers = [];
  const clock = {
    now: 1_000,
    timers,
    setTimeout(fn, delay) {
      const timer = {
        id: nextTimerId++,
        fn,
        delay,
        due: clock.now + Math.max(0, Number(delay) || 0),
        interval: false,
        active: true,
      };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout(id) {
      const timer = timers.find(item => item.id === id);
      if (timer) timer.active = false;
    },
    setInterval(fn, delay) {
      const timer = {
        id: nextTimerId++,
        fn,
        delay,
        due: clock.now + Math.max(1, Number(delay) || 1),
        interval: true,
        active: true,
      };
      timers.push(timer);
      return timer.id;
    },
    clearInterval(id) {
      const timer = timers.find(item => item.id === id);
      if (timer) timer.active = false;
    },
    fireTimeout(delay) {
      const candidates = timers.filter(item => item.active && !item.interval && item.delay === delay);
      for (const timer of candidates) {
        if (!timer.active) continue;
        timer.active = false;
        timer.fn();
      }
    },
    tick(milliseconds) {
      clock.now += milliseconds;
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const timer of [...timers]) {
          if (!timer.active || timer.due > clock.now) continue;
          progressed = true;
          if (!timer.interval) timer.active = false;
          else timer.due = clock.now + Math.max(1, Number(timer.delay) || 1);
          timer.fn();
        }
      }
    },
    activeCount() {
      return timers.filter(item => item.active).length;
    },
  };
  return clock;
}

class HookRunner {
  constructor(hook) {
    this.hook = hook;
    this.slots = [];
    this.cursor = 0;
    this.pendingEffects = [];
    this.mounted = true;
    this.output = null;
  }

  sameDeps(previous, next) {
    if (!previous || !next || previous.length !== next.length) return false;
    return previous.every((value, index) => Object.is(value, next[index]));
  }

  useRef(initialValue) {
    const index = this.cursor++;
    if (!this.slots[index]) this.slots[index] = { kind: 'ref', current: initialValue };
    return this.slots[index];
  }

  useState(initialValue) {
    const index = this.cursor++;
    if (!this.slots[index]) {
      const slot = {
        kind: 'state',
        value: typeof initialValue === 'function' ? initialValue() : initialValue,
        set: value => {
          slot.value = typeof value === 'function' ? value(slot.value) : value;
          if (this.mounted) this.render();
        },
      };
      this.slots[index] = slot;
    }
    const slot = this.slots[index];
    return [slot.value, slot.set];
  }

  useMemo(factory, deps) {
    const index = this.cursor++;
    const previous = this.slots[index];
    if (!previous || !this.sameDeps(previous.deps, deps)) {
      this.slots[index] = { kind: 'memo', value: factory(), deps };
    }
    return this.slots[index].value;
  }

  useEffect(effect, deps) {
    const index = this.cursor++;
    const previous = this.slots[index];
    if (!previous || !this.sameDeps(previous.deps, deps)) {
      if (previous?.cleanup) previous.cleanup();
      this.slots[index] = { kind: 'effect', deps, cleanup: undefined };
      this.pendingEffects.push({ index, effect });
    }
  }

  render() {
    this.cursor = 0;
    this.pendingEffects = [];
    this.output = this.hook();
    for (const pending of this.pendingEffects) {
      if (!this.mounted) continue;
      this.slots[pending.index].cleanup = pending.effect() || undefined;
    }
    return this.output;
  }

  unmount() {
    if (!this.mounted) return;
    this.mounted = false;
    for (const slot of this.slots) {
      if (slot?.kind === 'effect' && slot.cleanup) slot.cleanup();
    }
  }
}

function makeNativeMocks(clock, options = {}) {
  const native = {
    alerts: [],
    injections: [],
    shares: [],
    files: [],
    getSizeCalls: 0,
    resolvePhoto: null,
  };

  class MockHandle {
    constructor(file) {
      this.file = file;
      this.writes = [];
      this.closed = false;
    }

    writeBytes(value) {
      if (this.closed) throw new Error('handle closed');
      this.writes.push(Array.from(value));
    }

    close() {
      this.closed = true;
    }
  }

  class MockFile {
    constructor(directory, name) {
      this.directory = directory;
      this.name = name;
      this.uri = `${directory}://${name}`;
      this.created = false;
      this.deleted = false;
      this.handle = null;
      native.files.push(this);
    }

    create() {
      if (this.created) throw new Error('file already exists');
      this.created = true;
    }

    open() {
      if (!this.created) throw new Error('file not created');
      this.handle = new MockHandle(this);
      return this.handle;
    }

    delete() {
      this.deleted = true;
    }
  }

  const Image = {
    getSize(uri, success, failure) {
      native.getSizeCalls++;
      if (options.photoMode === 'blocked') {
        native.resolvePhoto = () => success(2000, 1000);
        return;
      }
      if (options.photoMode === 'error') {
        failure(new Error('synthetic photo failure'));
        return;
      }
      success(2000, 1000);
    },
  };

  const manipulateAsync = async (uri, actions, config) => ({
    uri: `${uri}-temporary`,
    base64: chunkData(4, 21),
    actions,
    config,
  });

  const webView = {
    injectJavaScript(script) {
      native.injections.push(script);
    },
  };

  const dependencies = {
    'expo-file-system': {
      File: MockFile,
      Paths: { cache: 'cache' },
    },
    'expo-file-system/legacy': {
      deleteAsync: async () => {},
    },
    'expo-image-manipulator': {
      manipulateAsync,
      SaveFormat: { JPEG: 'jpeg' },
    },
    'expo-sharing': {
      shareAsync: async (uri, config) => {
        if (options.shareMode === 'error') throw new Error('synthetic share failure');
        native.shares.push({ uri, config });
      },
    },
    react: null,
    'react-native': {
      Image,
      Alert: {
        alert(title, messageText) {
          native.alerts.push({ title, message: messageText });
        },
      },
      Platform: { OS: 'android' },
    },
    '@/utils/storyGeneratorPeriod': {
      buildStoryPeriodHtml: () => '<html data-synthetic-story />',
    },
    '@/utils/periodStoryTransfer': transfer,
  };

  return { native, dependencies, webView };
}

function makeHarness(options = {}) {
  const clock = makeClock();
  const { native, dependencies, webView } = makeNativeMocks(clock, options);
  const runner = new HookRunner(null);
  const react = {
    useRef: value => runner.useRef(value),
    useState: value => runner.useState(value),
    useMemo: (factory, deps) => runner.useMemo(factory, deps),
    useEffect: (effect, deps) => runner.useEffect(effect, deps),
    useCallback: (callback, deps) => runner.useMemo(() => callback, deps),
  };
  dependencies.react = react;

  const hookModule = loadCommonJs(HOOK_SOURCE, dependencies, {
    Date: { now: () => clock.now },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
  });
  runner.hook = hookModule.usePeriodStoryGeneration;
  runner.render();
  runner.output.webViewRef.current = webView;
  return {
    clock,
    native,
    runner,
    get api() {
      return runner.output;
    },
    webView,
  };
}

function requestWithTrips(overrides = {}) {
  return {
    trips: [{
      id: 'trip-1',
      route: [{ lat: 1, lng: 2, t: 1750000000000 }, { lat: 1.001, lng: 2.002, t: 1750000030000 }],
      distanceKm: 1.25,
      startTime: 1_000,
      endTime: 2_000,
      photos: [],
      note: 'synthetic note',
    }],
    vehicleType: () => 'car',
    dateLabel: () => 'synthetic date',
    periodLabel: 'synthetic period',
    tripCountLabel: '1 trajet',
    driveDurLabel: '1 min',
    walkDurLabel: '0 min',
    videoDurationSec: 2,
    theme: 'dark',
    ...overrides,
  };
}

async function prepareStart(harness, request = requestWithTrips()) {
  const started = harness.api.start(request);
  const id = harness.api.jobId;
  harness.clock.fireTimeout(0);
  await settle();
  await started;
  return id;
}

function ready(harness, id) {
  harness.api.onMessage(id, message({ type: 'story_ready' }));
}

function send(harness, id, payload) {
  harness.api.onMessage(id, message(payload));
}

test('decodeStoryChunk handles byte lengths 1, 2, 3 and the 150000-byte boundary without Buffer APIs', () => {
  for (const length of [1, 2, 3, 150_000]) {
    const source = bytes(length, length);
    const decoded = transfer.decodeStoryChunk(source.toString('base64'));
    assert.equal(decoded.constructor.name, 'Uint8Array');
    assert.deepEqual(Array.from(decoded), Array.from(source));
  }

  const overLimit = bytes(150_001).toString('base64');
  assert.throws(() => transfer.decodeStoryChunk(overLimit), /Fragment vidéo invalide/);
});

test('decodeStoryChunk rejects empty, malformed, misaligned and oversized fragments', () => {
  const invalid = [
    '',
    'A',
    'abc!',
    'AA=A',
    'A===',
    'AAAA====',
    'AAAA\n',
    'A'.repeat(200_004),
  ];
  for (const value of invalid) {
    assert.throws(() => transfer.decodeStoryChunk(value), /Fragment vidéo invalide/);
  }
});

test('PeriodStoryTransfer buffers out-of-order chunks and writes every fragment once', () => {
  const writes = [];
  const transferBuffer = new transfer.PeriodStoryTransfer({
    index: 2,
    total: 4,
    mime: 'video/mp4',
    data: chunkData(3, 30),
  }, value => writes.push(Array.from(value)));

  assert.equal(transferBuffer.accept({
    index: 2, total: 4, mime: 'video/mp4', data: chunkData(3, 30),
  }), true);
  assert.equal(transferBuffer.written, 0);
  assert.equal(transferBuffer.accept({
    index: 1, total: 4, mime: 'video/mp4', data: chunkData(2, 20),
  }), true);
  assert.equal(transferBuffer.accept({
    index: 1, total: 4, mime: 'video/mp4', data: chunkData(2, 20),
  }), false);
  assert.equal(writes.length, 0);

  assert.equal(transferBuffer.accept({
    index: 0, total: 4, mime: 'video/mp4', data: chunkData(1, 10),
  }), true);
  assert.equal(writes.length, 3);
  assert.deepEqual(writes.flat(), [
    ...Array.from(bytes(1, 10)),
    ...Array.from(bytes(2, 20)),
    ...Array.from(bytes(3, 30)),
  ]);
  assert.equal(transferBuffer.accept({
    index: 0, total: 4, mime: 'video/mp4', data: chunkData(1, 10),
  }), false);
  assert.equal(transferBuffer.accept({
    index: 3, total: 4, mime: 'video/mp4', data: chunkData(2, 40),
  }), true);
  assert.equal(transferBuffer.complete, true);
  assert.deepEqual(writes.at(-1), Array.from(bytes(2, 40)));
  assert.equal(writes.length, 4);
});

test('PeriodStoryTransfer rejects inconsistent metadata, indexes and chunk data', () => {
  const first = { index: 0, total: 2, mime: 'video/webm', data: chunkData(1) };
  assert.throws(() => new transfer.PeriodStoryTransfer(
    { ...first, total: 0 }, () => {},
  ), /Format vidéo invalide/);
  assert.throws(() => new transfer.PeriodStoryTransfer(
    { ...first, mime: 'video/avi' }, () => {},
  ), /Format vidéo invalide/);

  const transferBuffer = new transfer.PeriodStoryTransfer(first, () => {});
  for (const chunk of [
    { ...first, total: 3 },
    { ...first, mime: 'video/mp4' },
    { ...first, index: -1 },
    { ...first, index: 2 },
    { ...first, index: 0, data: 42 },
  ]) {
    assert.throws(() => transferBuffer.accept(chunk), /Transfert vidéo incohérent/);
  }
});

test('hook starts only one job for an immediate double tap and waits for ready before injecting options', async () => {
  const harness = makeHarness();
  const request = requestWithTrips();
  const first = harness.api.start(request);
  const firstId = harness.api.jobId;
  const second = harness.api.start(request);
  assert.ok(firstId);
  assert.equal(harness.api.jobId, firstId);

  harness.clock.fireTimeout(0);
  await settle();
  await Promise.all([first, second]);
  assert.equal(harness.native.injections.length, 0);

  ready(harness, firstId);
  assert.equal(harness.native.injections.length, 1);
  assert.match(harness.native.injections[0], /generatePeriodStory/);
  assert.match(harness.native.injections[0], new RegExp(`"jobId":"${firstId}"`));
  assert.match(harness.native.injections[0], /"theme":"dark"/);
  assert.match(harness.native.injections[0], /synthetic period/);
  let preparedOptions;
  vm.runInNewContext(harness.native.injections[0], {
    window: { generatePeriodStory: opts => { preparedOptions = opts; } },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(preparedOptions.trips[0].route)), request.trips[0].route,
    'coordinates and exact GPS times must survive native preparation');
});

test('hook preserves family chapter ids and attaches the matching identity to each prepared trip', async () => {
  const harness = makeHarness();
  const request = requestWithTrips({
    familyStory: true,
    customName: 'Mars · Anniversaire',
    dateRangeLabel: 'du 1 au 31 mars 2026',
    chapters: [{
      id: 'chapter-a',
      title: 'Maison',
      tripIds: ['trip-1'],
      durationSec: 4,
    }],
  });
  const id = await prepareStart(harness, request);
  ready(harness, id);
  let preparedOptions;
  vm.runInNewContext(harness.native.injections[0], {
    window: { generatePeriodStory: options => { preparedOptions = options; } },
  });
  assert.equal(preparedOptions.familyStory, true);
  assert.equal(JSON.stringify(preparedOptions.chapters), JSON.stringify(request.chapters));
  assert.equal(preparedOptions.trips[0].id, 'trip-1');
  assert.equal(preparedOptions.trips[0].chapterId, 'chapter-a');
  assert.equal(preparedOptions.trips[0].chapterTitle, 'Maison');
});

test('hook assigns a new job id after cancel and ignores stale chunks from the previous job', async () => {
  const harness = makeHarness();
  const oldId = harness.api.start(requestWithTrips()) && harness.api.jobId;
  assert.ok(oldId);
  harness.api.cancel();
  const newStart = harness.api.start(requestWithTrips());
  const newId = harness.api.jobId;
  assert.notEqual(newId, oldId);
  harness.clock.fireTimeout(0);
  await settle();
  await newStart;

  send(harness, oldId, {
    type: 'story_chunk', jobId: oldId, index: 0, total: 1,
    mime: 'video/mp4', data: chunkData(2, 9),
  });
  assert.equal(harness.native.files.length, 0);
  assert.equal(harness.api.jobId, newId);
});

test('hook writes incremental chunks in order, retains the result, and manually shares once per gesture', async () => {
  const harness = makeHarness();
  const id = await prepareStart(harness);
  ready(harness, id);

  const makeChunk = (index, length, seed) => ({
    type: 'story_chunk', jobId: id, index, total: 3, mime: 'video/mp4',
    data: chunkData(length, seed),
  });
  send(harness, id, makeChunk(1, 2, 20));
  assert.equal(harness.native.files.length, 1);
  assert.deepEqual(harness.native.files[0].handle.writes, []);
  send(harness, id, makeChunk(1, 2, 20));
  assert.deepEqual(harness.native.files[0].handle.writes, []);

  send(harness, id, makeChunk(0, 1, 10));
  send(harness, id, makeChunk(2, 3, 30));
  await settle();
  const file = harness.native.files[0];
  assert.deepEqual(file.handle.writes.flat(), [
    ...Array.from(bytes(1, 10)),
    ...Array.from(bytes(2, 20)),
    ...Array.from(bytes(3, 30)),
  ]);
  assert.equal(file.handle.closed, true);
  assert.equal(file.deleted, false);
  assert.equal(harness.native.shares.length, 0, 'completion must not open the share sheet');
  assert.equal(JSON.stringify(harness.api.result), JSON.stringify({ uri: file.uri, mimeType: 'video/mp4' }));
  assert.equal(harness.api.jobId, null);

  send(harness, id, makeChunk(2, 3, 30));
  await settle(2);
  assert.equal(harness.native.shares.length, 0);
  const firstShare = harness.api.shareResult();
  const duplicateShare = harness.api.shareResult();
  assert.equal(await duplicateShare, false, 'a double tap must not open two sheets');
  assert.equal(await firstShare, true);
  assert.equal(harness.native.shares.length, 1);
  assert.equal(harness.native.shares[0].uri, file.uri);
  assert.equal(harness.api.isSharing, false);
});

test('failed sharing retains the generated video and discardResult removes it explicitly', async () => {
  const harness = makeHarness({ shareMode: 'error' });
  const id = await prepareStart(harness);
  ready(harness, id);
  send(harness, id, {
    type: 'story_chunk', jobId: id, index: 0, total: 1,
    mime: 'video/webm', data: chunkData(2, 44),
  });
  const file = harness.native.files[0];
  assert.equal((await harness.api.shareResult()), false);
  assert.equal(file.deleted, false);
  assert.equal(JSON.stringify(harness.api.result), JSON.stringify({ uri: file.uri, mimeType: 'video/webm' }));
  harness.api.discardResult();
  assert.equal(file.deleted, true);
  assert.equal(harness.api.result, null);
});

test('starting a new generation clears an old cached result and unmount clears a completed result', async () => {
  const harness = makeHarness();
  let id = await prepareStart(harness);
  ready(harness, id);
  send(harness, id, {
    type: 'story_chunk', jobId: id, index: 0, total: 1,
    mime: 'video/mp4', data: chunkData(2, 45),
  });
  const oldFile = harness.native.files[0];
  const nextStart = harness.api.start(requestWithTrips());
  assert.equal(oldFile.deleted, true);
  assert.ok(harness.api.jobId);
  harness.api.cancel();
  harness.clock.fireTimeout(0);
  await nextStart;

  const completed = makeHarness();
  id = await prepareStart(completed);
  ready(completed, id);
  send(completed, id, {
    type: 'story_chunk', jobId: id, index: 0, total: 1,
    mime: 'video/mp4', data: chunkData(2, 46),
  });
  const completedFile = completed.native.files[0];
  completed.runner.unmount();
  assert.equal(completedFile.deleted, true);
});

test('renderer error and native renderer crash leave no partial file and show a terminal alert', async () => {
  const errored = makeHarness();
  const errorId = await prepareStart(errored);
  ready(errored, errorId);
  send(errored, errorId, {
    type: 'story_chunk', jobId: errorId, index: 0, total: 2,
    mime: 'video/webm', data: chunkData(2, 50),
  });
  assert.equal(errored.native.files.length, 1);
  send(errored, errorId, {
    type: 'story_error', jobId: errorId, message: 'synthetic renderer error',
  });
  assert.equal(errored.native.files[0].deleted, true);
  assert.equal(errored.api.jobId, null);
  assert.match(errored.native.alerts.at(-1).message, /synthetic renderer error/);

  const crashed = makeHarness();
  const crashId = await prepareStart(crashed);
  ready(crashed, crashId);
  send(crashed, crashId, {
    type: 'story_chunk', jobId: crashId, index: 0, total: 2,
    mime: 'video/mp4', data: chunkData(2, 51),
  });
  crashed.api.onEngineError(crashId);
  assert.equal(crashed.api.jobId, null);
  assert.equal(crashed.native.files[0].deleted, true);
  assert.match(crashed.native.alerts.at(-1).message, /interrompu/);
});

test('unavailable recorder event exits the current job with its explicit error', async () => {
  const harness = makeHarness();
  const id = await prepareStart(harness);
  send(harness, id, {
    type: 'story_error',
    jobId: id,
    message: 'MediaRecorder indisponible.',
  });
  assert.equal(harness.api.jobId, null);
  assert.equal(harness.native.alerts.length, 1);
  assert.equal(harness.native.alerts[0].message, 'MediaRecorder indisponible.');
});

test('inactivity watchdog stops a stalled job and alerts the user', async () => {
  const harness = makeHarness();
  harness.api.start(requestWithTrips());
  assert.ok(harness.api.jobId);
  harness.clock.tick(45_001);
  await settle(2);
  assert.equal(harness.api.jobId, null);
  assert.match(harness.native.alerts.at(-1).message, /ne répond plus/);
});

test('blocked photo preparation times out with a useful error', async () => {
  const harness = makeHarness({ photoMode: 'blocked' });
  const request = requestWithTrips({
    trips: [{
      ...requestWithTrips().trips[0],
      photos: [{ uri: 'synthetic://photo', routeIndex: 1, note: 'synthetic' }],
    }],
  });
  const started = harness.api.start(request);
  harness.clock.fireTimeout(0);
  await settle();
  assert.equal(harness.native.getSizeCalls, 1);
  harness.clock.fireTimeout(20_000);
  await settle();
  await started;
  assert.equal(harness.api.jobId, null);
  assert.match(harness.native.alerts.at(-1).message, /photo ne répond pas/);
  assert.match(harness.native.alerts.at(-1).message, /trajet 1/);
  assert.match(harness.native.alerts.at(-1).message, /synthetic/);
});

test('cancelling blocked photo preparation prevents its late continuation', async () => {
  const harness = makeHarness({ photoMode: 'blocked' });
  const request = requestWithTrips({
    trips: [{
      ...requestWithTrips().trips[0],
      photos: [{ uri: 'synthetic://photo', routeIndex: 1 }],
    }],
  });
  const started = harness.api.start(request);
  harness.clock.fireTimeout(0);
  await settle();
  assert.equal(harness.native.getSizeCalls, 1);
  harness.api.cancel();
  assert.equal(harness.api.jobId, null);
  harness.native.resolvePhoto();
  await settle();
  await started;
  assert.equal(harness.native.alerts.length, 0);
  assert.equal(harness.native.files.length, 0);
  assert.equal(harness.native.injections.some(script => script.includes('generatePeriodStory')), false);
});

test('unmount cleanup cancels the renderer, closes and removes a partial file', async () => {
  const harness = makeHarness();
  const id = await prepareStart(harness);
  ready(harness, id);
  send(harness, id, {
    type: 'story_chunk', jobId: id, index: 0, total: 2,
    mime: 'video/mp4', data: chunkData(2, 60),
  });
  assert.equal(harness.native.files[0].deleted, false);
  harness.runner.unmount();
  assert.equal(harness.native.files[0].deleted, true);
  assert.equal(harness.native.files[0].handle.closed, true);
  assert.ok(harness.native.injections.some(script => script.includes('cancelPeriodStory')));
  assert.equal(harness.clock.activeCount(), 0);
});