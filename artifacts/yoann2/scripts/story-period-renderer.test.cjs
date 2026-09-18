/* Renderer-only contract tests.  They execute STORY_PERIOD_JS in a small DOM
   mock; this is intentionally not an Android/WebView integration test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(require.resolve('../utils/storyGeneratorPeriod.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(compiled, { exports: mod.exports, module: mod, require });
const renderer = mod.exports.STORY_PERIOD_JS;

function makeHarness(imageMode = 'ok', recorderSupported = true, exportBytes = 300003, deferredReader = false, mosaicTimeout = 7000) {
  const messages = [], timers = [], rafs = [], images = [], canvasText = [];
  const readerPending = [];
  let timerId = 0, clock = 0, activeTiles = 0, maxTiles = 0, recorderStarts = 0, imageLoads = 0;
  const ctx2d = new Proxy({ drawImage(image) { if (image?.invalid) throw new Error('empty image source'); }, fillText(value) { canvasText.push(String(value)); } }, { get: (target, key) => key in target ? target[key] : key === 'createRadialGradient'
    ? () => ({ addColorStop() {} }) : () => {} });
  class ImageMock {
    constructor() { this.onload = this.onerror = null; this.naturalWidth = 256; this.naturalHeight = 256; images.push(this); }
    set src(value) {
      this._src = value;
      if (!value) { this.invalid = true; return; }
      this.invalid = false; imageLoads++;
      activeTiles++; maxTiles = Math.max(maxTiles, activeTiles);
      if (imageMode === 'stall') return;
      queueMicrotask(() => {
        activeTiles--;
        if (this._src && (imageMode === 'fail' ? this.onerror : this.onload)) (imageMode === 'fail' ? this.onerror : this.onload)();
      });
    }
    get src() { return this._src; }
  }
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; }
    start() { this.state = 'recording'; recorderStarts++; }
    stop() {
      if (this.state !== 'recording') return;
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([Buffer.alloc(exportBytes, 7)]) });
      this.onstop?.();
    }
  }
  class Reader {
    readAsDataURL(blob) {
      const done = () => {
        this.result = `data:video/webm;base64,${Buffer.alloc(blob.size, 7).toString('base64')}`;
        this.onload?.();
      };
      if (deferredReader) readerPending.push(done); else done();
    }
  }
  const document = {
    body: { appendChild() {}, removeChild() {} },
    createElement(type) {
      if (type === 'canvas') return {
        width: 0, height: 0, style: {}, parentNode: document.body,
        getContext: () => ctx2d,
        captureStream: () => ({ getTracks: () => [{ stop() {} }] }),
        toDataURL: () => 'data:image/jpeg;base64,AA==',
      };
      return {};
    },
  };
  const window = {
    ReactNativeWebView: { postMessage: value => messages.push(JSON.parse(value)) },
    MediaRecorder: recorderSupported ? Recorder : undefined, Image: ImageMock, Path2D: class { moveTo() {} lineTo() {} },
  };
  const sandbox = {
    window, document, Image: ImageMock, MediaRecorder: recorderSupported ? Recorder : undefined, FileReader: Reader, Blob,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout(fn, delay) { const item = { id: ++timerId, fn, delay, due: clock + delay, live: true }; timers.push(item); return item.id; },
    clearTimeout(id) { const item = timers.find(t => t.id === id); if (item) item.live = false; },
    requestAnimationFrame(fn) { rafs.push(fn); return rafs.length; },
    cancelAnimationFrame() {}, Math, JSON, Promise, Date, console, queueMicrotask,
  };
  vm.runInNewContext(renderer.replace('var SAT_MOSAIC_TIMEOUT=7000;', `var SAT_MOSAIC_TIMEOUT=${mosaicTimeout};`), sandbox);
  return {
    messages, images, canvasText, get starts() { return recorderStarts; }, get maxTiles() { return maxTiles; }, get imageLoads() { return imageLoads; },
    runTimers(maxDelay) { for (const t of timers.filter(t => t.live && t.delay <= maxDelay)) { t.live = false; t.fn(); } },
    runFrame(ms) { clock = ms; const fn = rafs.shift(); if (fn) fn(ms); },
    advanceTo(ms) {
      while (true) {
        const next = timers.filter(t => t.live && t.due <= ms).sort((a, b) => a.due - b.due)[0];
        if (!next) break;
        clock = next.due; next.live = false; next.fn();
      }
      clock = ms;
    },
    flushReader() { readerPending.shift()?.(); },
    window,
  };
}

function trips(count) {
  return Array.from({ length: count }, (_, n) => ({
    route: [{ lat: 48.85 + n / 10000, lng: 2.35 }, { lat: 48.851 + n / 10000, lng: 2.351 }],
    distKm: 1, durationMs: 1000, vehicleType: n % 2 ? 'walk' : 'car', dateLabel: '1 jan.',
  }));
}
async function settle(rounds = 100) {
  for (let i = 0; i < rounds; i++) await new Promise(resolve => setImmediate(resolve));
}

test('56 satellite mosaics are sequential and tile fetches stay bounded', async () => {
  const h = makeHarness();
  h.window.generatePeriodStory({ jobId: 'sat-56', trips: trips(56), theme: 'satellite', videoDurationSec: 8 });
  await settle();
  assert.equal(h.starts, 1);
  assert.ok(h.maxTiles <= 4, `saw ${h.maxTiles} simultaneous tile loads`);
  const maps = h.messages.filter(m => m.type === 'story_phase' && m.phase === 'maps');
  assert.equal(maps.at(-1).completed, 57);
  assert.equal(maps.at(-1).total, 57);
  assert.match(renderer, /SAT_TOTAL_OUTPUT_PIXELS=5000000/);
  assert.match(renderer, /SAT_TILE_CONCURRENCY=4/);
});

test('successful cached tiles retain their source for overlapping mosaic reuse', async () => {
  const baseline = makeHarness();
  baseline.window.generatePeriodStory({ jobId: 'one-route', trips: trips(1), theme: 'satellite', videoDurationSec: 8 });
  await settle();
  const h = makeHarness();
  const sameRoute = trips(1)[0];
  h.window.generatePeriodStory({ jobId: 'reuse', trips: [sameRoute, { ...sameRoute }], theme: 'satellite', videoDurationSec: 8 });
  await settle();
  assert.equal(h.starts, 1);
  assert.equal(h.imageLoads, baseline.imageLoads, 'the shared tiles are fetched once, not blanked after mosaic completion');
  assert.equal(h.messages.some(m => m.type === 'story_theme_fallback'), false);
});

test('failed or stalled tiles fall back once and cancelled late loads do not start', async () => {
  const failed = makeHarness('fail');
  failed.window.generatePeriodStory({ jobId: 'failed', trips: trips(2), theme: 'satellite' });
  await settle();
  assert.equal(failed.messages.filter(m => m.type === 'story_theme_fallback').length, 1);
  assert.equal(failed.starts, 1);

  const timedOut = makeHarness('stall');
  timedOut.window.generatePeriodStory({ jobId: 'timed-out', trips: trips(2), theme: 'satellite' });
  timedOut.runTimers(10000);
  await settle();
  assert.equal(timedOut.messages.filter(m => m.type === 'story_theme_fallback').length, 1);

  const cancelled = makeHarness('stall');
  cancelled.window.generatePeriodStory({ jobId: 'cancelled', trips: trips(2), theme: 'satellite' });
  cancelled.window.cancelPeriodStory('cancelled');
  cancelled.runTimers(10000);
  await settle();
  assert.equal(cancelled.starts, 0);
  assert.equal(cancelled.messages.filter(m => m.type === 'story_error').length, 0);
});

test('overlapping map/preparation deadlines keep exactly one photo preload batch', async () => {
  const h = makeHarness('stall', true, 300003, false, 50000);
  const item = trips(1);
  item[0].photos = [{ img: 'data:image/jpeg;base64,AA==', frac: 0.5 }];
  h.window.generatePeriodStory({ jobId: 'deadline-overlap', trips: item, theme: 'satellite' });
  /* Exercise both guards while the stalled map completion is being abandoned;
     repeated calls must be absorbed by photoPreloading, then its own timeout
     is the only operation allowed to start recording. */
  h.advanceTo(40000);
  assert.equal(h.images.length, 5, 'four bounded tile decoders plus one photo batch');
  h.advanceTo(45000);
  assert.equal(h.images.length, 5, '45s preparation guard did not duplicate photos');
  h.advanceTo(46000);
  assert.equal(h.starts, 1);
});

test('unsupported recorder reports a safe terminal error', () => {
  const unsupported = makeHarness('ok', false);
  unsupported.window.generatePeriodStory({ jobId: 'no-rec', trips: trips(1), theme: 'dark' });
  assert.equal(unsupported.messages.find(m => m.type === 'story_error')?.jobId, 'no-rec');
});

test('dark/light start normally and byte-aligned exports concatenate exactly', async () => {
  for (const theme of ['dark', 'light']) {
    const h = makeHarness();
    h.window.generatePeriodStory({ jobId: theme, trips: trips(1), theme, videoDurationSec: 0.001 });
    h.runFrame(1); h.runFrame(1000); h.runTimers(300);
    await settle(5); h.runTimers(0); h.runTimers(0); h.runTimers(0); h.runTimers(0);
    assert.equal(h.messages.some(m => m.type === 'story_theme_fallback'), false);
    const chunks = h.messages.filter(m => m.type === 'story_chunk');
    assert.equal(chunks.length, 3);
    assert.deepEqual(chunks.map(c => c.index), [0, 1, 2]);
    assert.ok(chunks.every(c => c.jobId === theme && c.data.length % 4 === 0));
    assert.equal(Buffer.from(chunks.map(c => c.data).join(''), 'base64').length, 300003);
  }
});

test('60s and 120s recordings, including photo pause, outlive preparation timeout', async () => {
  for (const seconds of [60, 120]) {
    const h = makeHarness();
    const withPhoto = trips(1);
    withPhoto[0].photos = [{ img: 'data:image/jpeg;base64,AA==', frac: 0.5, note: 'pause' }];
    h.window.generatePeriodStory({ jobId: `long-${seconds}`, trips: withPhoto, theme: 'dark', videoDurationSec: seconds });
    await settle(2); // photo preload shares the harness microtask clock
    h.runFrame(1);
    for (let ms = 1000; ms <= seconds * 1000 + 3500; ms += 1000) {
      h.advanceTo(ms);
      h.runFrame(ms);
    }
    h.advanceTo(seconds * 1000 + 4000); // scheduled recorder stop and zero-delay export work
    h.advanceTo(seconds * 1000 + 4010);
    assert.equal(h.messages.filter(m => m.type === 'story_error').length, 0, `${seconds}s must not hit preparation deadline`);
    assert.ok(h.messages.some(m => m.type === 'story_chunk'), `${seconds}s must finalize after its photo pause`);
  }
});

test('family stories render the exact title, selected chapter identities, and pause-excluded timing', async () => {
  const h = makeHarness();
  const familyTrips = trips(3).map((trip, index) => ({
    ...trip,
    id: `selected-${index}`,
    distKm: index + 1,
    photos: index === 1 ? [{ img: 'data:image/jpeg;base64,AA==', frac: 0.5, note: 'family photo' }] : [],
  }));
  h.window.generatePeriodStory({
    jobId: 'family',
    trips: familyTrips,
    familyStory: true,
    customName: 'Mars · Souvenirs',
    dateRangeLabel: 'du 1 au 31 mars 2026',
    periodLabel: 'mars 2026',
    tripCountLabel: '3 trajets',
    driveDurLabel: '🚗 1h',
    walkDurLabel: '',
    videoDurationSec: 12,
    theme: 'dark',
    chapters: [
      { id: 'chapter-a', title: 'Maison', tripIds: ['selected-0', 'selected-1'], durationSec: 1 },
      { id: 'chapter-b', title: 'Anniversaire', tripIds: ['selected-2'], durationSec: 2 },
    ],
  });
  await settle();
  const timing = h.messages.find(message => message.type === 'story_timing');
  assert.deepEqual(timing.chapters.map(chapter => chapter.tripIds), [
    ['selected-0', 'selected-1'],
    ['selected-2'],
  ]);
  assert.equal(timing.baseDurationSec, 12);
  assert.equal(timing.openingSec, 3);
  assert.equal(timing.recapSec, 3);
  assert.equal(timing.chapterAnimationSec, 6);
  assert.equal(timing.photoPauseSec, 2);
  assert.equal(timing.totalDurationSec, 14);
  assert.equal(timing.photos[0].tripId, 'selected-1');
  const firstChapterDuration = 2;
  const expectedPhotoSec = 3 +
    firstChapterDuration / 2 +
    firstChapterDuration / 2 / 2;
  assert.ok(Math.abs(timing.photos[0].atSec - expectedPhotoSec) < 1e-9,
    'photo anchor is measured on the virtual timeline');

  h.runFrame(1);       // starts the shared animation clock
  h.runFrame(2000);    // opening card
  assert.ok(h.canvasText.includes('Mars · Souvenirs'));
  assert.ok(h.canvasText.includes('du 1 au 31 mars 2026'));
  h.runFrame(3001);    // first chapter
  assert.ok(h.canvasText.includes('Maison'));
  h.runFrame(5001);    // reaches the photo anchor and starts its pause
  assert.ok(h.canvasText.includes('family photo'),
    'the selected photo caption is rendered below the photo');
  h.runFrame(7001);    // second chapter boundary, after the 2s photo pause
  assert.ok(h.canvasText.includes('Anniversaire'));
});

test('family trips use elapsed-time weights inside one mixed-distance chapter', async () => {
  const h = makeHarness();
  const mixedTrips = trips(2).map((trip, index) => ({
    ...trip,
    id: index === 0 ? 'long-trip' : 'short-trip',
    distKm: index === 0 ? 100 : 1,
    photos: index === 1 ? [{ img: 'data:image/jpeg;base64,AA==', frac: 0.5, note: 'short route' }] : [],
  }));
  h.window.generatePeriodStory({
    jobId: 'family-mixed-distance',
    trips: mixedTrips,
    familyStory: true,
    customName: 'Mixed distances',
    dateRangeLabel: '1–2 mars 2026',
    periodLabel: 'mars 2026',
    tripCountLabel: '2 trajets',
    driveDurLabel: '',
    walkDurLabel: '',
    videoDurationSec: 18,
    theme: 'dark',
    chapters: [{ id: 'same-chapter', title: 'Même chapitre', tripIds: ['long-trip', 'short-trip'], durationSec: 12 }],
  });
  await settle();
  const timing = h.messages.find(message => message.type === 'story_timing');
  const shortTrip = timing.trips.find(trip => trip.id === 'short-trip');
  assert.ok(shortTrip.durationSec >= 3, `short route received ${shortTrip.durationSec}s`);
  assert.equal(shortTrip.durationSec, 6);
  assert.equal(timing.photos[0].tripId, 'short-trip');
  assert.equal(timing.photos[0].atSec, 12, 'photo stays anchored after the equal-duration segment');
});

test('large exports refresh an idle deadline after every actual chunk', async () => {
  const h = makeHarness('ok', true, 750003, true);
  h.window.generatePeriodStory({ jobId: 'large-export', trips: trips(1), theme: 'dark', videoDurationSec: 0.001 });
  h.runFrame(1); h.runFrame(1000); h.runTimers(300);
  for (let clock = 20000; clock <= 120000; clock += 20000) {
    h.advanceTo(clock); // crosses the previous 30s window only after a prior chunk refreshed it
    h.flushReader();
    h.advanceTo(clock); // runs the zero-delay next-slice task
  }
  assert.equal(h.messages.filter(m => m.type === 'story_error').length, 0);
  assert.equal(h.messages.filter(m => m.type === 'story_chunk').length, 6);
});