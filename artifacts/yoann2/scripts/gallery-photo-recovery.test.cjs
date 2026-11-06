const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const T = Date.parse('2026-10-15T15:00:00Z');

function caseOf(id = 'p', extra = {}) {
  const original = { id, uri: `file:///gone/${id}.jpeg`, takenAt: T + 600000, takenAtEstimated: false, note: 'Pause plage', routeIndex: 4, lat: 45, lng: 1, ...extra };
  return {
    key: JSON.stringify(['trip', id]), tripId: 'trip', photoId: id,
    tripStartTime: T, tripEndTime: T + 7200000, note: original.note,
    expectedAt: original.takenAt, timeEstimated: original.takenAtEstimated !== false,
    original, status: 'pending', candidates: [],
  };
}
function asset(id = 'a', extra = {}) {
  return { assetId: id, id, uri: `file:///gallery/${id}.jpeg`, filename: `IMG_${id}.jpeg`, takenAt: T + 600000, creationTime: T + 600000, width: 2000, height: 3000, ...extra };
}
function setup(photos = [caseOf().original], suppliedAssets = [asset()]) {
  const files = new Set(suppliedAssets.map(item => item.uri));
  let trips = [{ id: 'trip', startTime: T, endTime: T + 7200000, photos, activityMoments: [{ photoId: photos[0]?.id, note: 'moment' }] }];
  const writes = [], copies = [], pages = [];
  const options = { permission: { granted: true, accessPrivileges: 'all' }, cancelled: false, failInfo: false };
  const cache = new Map();
  const overrides = {
    '@react-native-async-storage/async-storage': {
      getItem: async key => key === '@yoann2_trips' ? JSON.stringify(trips) : null,
      setItem: async (key, value) => {
        assert.equal(key, '@yoann2_trips');
        if (options.failWrite) throw new Error('disk full');
        if (options.beforeWrite) await options.beforeWrite();
        trips = JSON.parse(value);
        writes.push(trips);
      },
    },
    'react-native': { Platform: { OS: 'android' } },
    '@/utils/photoReferences': {
      photoFilename: uri => decodeURIComponent(uri).split('/').pop(),
      photoCandidates: async uri => [uri],
      photoExists: async uri => files.has(uri),
    },
    '@/utils/tripStorage': {
      getTrips: async () => trips,
      updateTrip: async (id, patch, strict) => {
        assert.equal(strict, true);
        const current = trips.find(trip => trip.id === id);
        if (typeof patch === 'function') patch = patch(current);
        writes.push(patch);
        trips = trips.map(trip => trip.id === id ? { ...trip, ...patch } : trip);
      },
    },
    '@/utils/tripEvents': { tripEvents: { emitTripUpdated: () => {} } },
    '@/utils/photoProtection': {
      protectPhoto: async (source, owner) => {
        if (!files.has(source)) throw new Error('source inaccessible');
        copies.push({ source, owner });
        options.onCopy?.();
        return `file:///permanent/${source.split('/').pop()}`;
      },
    },
    'expo-media-library': {
      SortBy: { creationTime: 'creationTime' },
      requestPermissionsAsync: async () => options.permission,
      getAssetsAsync: async query => {
        pages.push(query);
        const filtered = suppliedAssets.filter(item => item.creationTime >= query.createdAfter && item.creationTime <= query.createdBefore);
        const start = Number(query.after ?? 0);
        const result = filtered.slice(start, start + query.first);
        return { assets: result, hasNextPage: start + result.length < filtered.length, endCursor: String(start + result.length) };
      },
      getAssetInfoAsync: async id => {
        if (options.failInfo) throw new Error('permission or cloud');
        const item = suppliedAssets.find(item => item.id === id);
        if (!item) throw new Error('missing asset');
        return { ...item, localUri: item.uri };
      },
    },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const mod = { exports: {} };
    cache.set(file, mod.exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(`(function(module,exports,require){${code}\n})(mod,mod.exports,require)`, {
      mod, Error, console, require: name => {
        if (name in overrides) return overrides[name];
        if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
        throw new Error('Unexpected import ' + name);
      },
    });
    return mod.exports;
  }
  return { load, files, writes, copies, pages, options, overrides,
    realStorage: () => { delete overrides['@/utils/tripStorage']; },
    trips: () => trips,
    replace: next => { trips = next; },
    run: () => load('utils/galleryPhotoRecovery.ts').searchGalleryTripPhotos({
      isCurrent: () => !options.cancelled, progress: () => {},
    }),
  };
}

// Exercise the hook's actual actions without a native gallery or a browser.
function renderRecoveryHook(env) {
  const slots = [];
  let cursor = 0;
  env.overrides.react = {
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback: callback => callback,
    useEffect: () => {},
  };
  const { useGalleryPhotoRecovery } = env.load('hooks/useGalleryPhotoRecovery.ts');
  const render = () => { cursor = 0; return useGalleryPhotoRecovery('trip'); };
  render.remount = () => { slots.length = 0; };
  return render;
}

test('unique verified capture time is automatic, retaining captions, anchors, dates and moment references', async () => {
  const env = setup();
  const before = env.trips()[0];
  const report = await env.run();
  assert.equal(report.automaticallyRepaired, 1);
  assert.equal(env.writes.length, 1);
  assert.equal(env.copies[0].owner.project, 'Trajets');
  const photo = env.trips()[0].photos[0];
  assert.equal(photo.id, 'p');
  assert.equal(photo.note, before.photos[0].note);
  assert.equal(photo.routeIndex, 4);
  assert.equal(photo.lat, 45);
  assert.equal(photo.lng, 1);
  assert.equal(photo.takenAt, before.photos[0].takenAt);
  assert.equal(photo.galleryMetadata.filename, 'IMG_a.jpeg');
  assert.equal(photo.galleryMetadata.takenAt, T + 600000);
  assert.equal(env.trips()[0].activityMoments[0].photoId, 'p');
  assert.equal(env.files.has('file:///gallery/a.jpeg'), true);
});

test('burst photos, competing souvenirs and uncertain legacy times are never auto-picked', async () => {
  const burst = setup(undefined, [asset('a'), asset('b', { creationTime: T + 600500, takenAt: T + 600500 })]);
  const burstReport = await burst.run();
  assert.equal(burstReport.automaticallyRepaired, 0);
  assert.equal(burstReport.cases[0].candidates.length, 2);
  assert.equal(burst.writes.length, 0);
  const competing = setup([caseOf('p').original, caseOf('q').original]);
  assert.equal((await competing.run()).automaticallyRepaired, 0);
  const legacy = setup([caseOf('p', { takenAtEstimated: undefined }).original]);
  const legacyReport = await legacy.run();
  assert.equal(legacyReport.automaticallyRepaired, 0);
  assert.equal(legacyReport.cases[0].timeEstimated, true);
  const estimated = setup([caseOf('p', { takenAtEstimated: true }).original]);
  assert.equal((await estimated.run()).automaticallyRepaired, 0);
});

test('legacy exact filename plus timestamp can corroborate a unique original but names alone cannot', async () => {
  const env = setup();
  const matching = env.load('utils/galleryPhotoMatching.ts');
  const item = caseOf('p', { takenAtEstimated: undefined });
  item.candidates = matching.rankGalleryCandidates(item, [asset('a', { filename: 'p.jpeg' })]);
  assert.equal(matching.automaticGalleryMatches([item], true).size, 1);
  item.candidates = matching.rankGalleryCandidates(item, [asset('a', { filename: 'p.jpeg', takenAt: T + 660000 })]);
  assert.equal(matching.automaticGalleryMatches([item], true).size, 0);
  assert.equal(matching.automaticGalleryMatches([item], false).size, 0);
});

test('manual confirmation chooses the actual candidate and preserves more recent edits', async () => {
  const env = setup([caseOf('p', { takenAtEstimated: undefined }).original], [asset('a'), asset('b')]);
  const report = await env.run();
  assert.equal(report.automaticallyRepaired, 0);
  const originalUri = env.trips()[0].photos[0].uri;
  env.options.onCopy = () => env.replace(env.trips().map(trip => ({
    ...trip, photos: trip.photos.map(photo => ({ ...photo, note: 'new note while copying' })),
  })));
  await env.load('utils/galleryPhotoRecovery.ts').applyGalleryCandidate(
    report.cases[0], report.cases[0].candidates.find(item => item.assetId === 'b'), () => true,
  );
  assert.equal(env.trips()[0].photos.length, 1);
  assert.equal(env.trips()[0].photos[0].note, 'new note while copying');
  assert.equal(env.trips()[0].photos[0].galleryMetadata.assetId, 'b');
  assert.notEqual(env.trips()[0].photos[0].uri, originalUri);
});

test('limited permission and incomplete metadata keep choices but disable automatic repairs', async () => {
  const limited = setup();
  limited.options.permission.accessPrivileges = 'limited';
  const report = await limited.run();
  assert.equal(report.limitedAccess, true);
  assert.equal(report.automaticallyRepaired, 0);
  assert.equal(report.cases[0].candidates.length, 1);
  const failedInfo = setup();
  failedInfo.options.failInfo = true;
  const failed = await failedInfo.run();
  assert.equal(failed.automaticallyRepaired, 0);
  assert.equal(failed.issues.length, 1);
  assert.equal(failedInfo.writes.length, 0);
  const denied = setup();
  denied.options.permission.granted = false;
  await assert.rejects(denied.run(), /refusé/);
  assert.equal(denied.writes.length, 0);
});

test('pagination searches beyond the first page and deduplicates assets across overlapping windows', async () => {
  const assets = Array.from({ length: 240 }, (_, index) => asset('a' + index, {
    creationTime: T + index * 10000, takenAt: T + index * 10000,
  }));
  const photo = caseOf('p', { takenAt: T + 2390000 }).original;
  const env = setup([photo], assets);
  const report = await env.run();
  assert.equal(report.scannedAssets, 240);
  assert.equal(env.pages.length, 3);
  assert.equal(report.automaticallyRepaired, 0); // Another image ten seconds away warrants confirmation.
  assert.equal(report.cases[0].candidates[0].assetId, 'a239');
});

test('a complete empty gallery reports missing instead of claiming repaired or deleting links', async () => {
  const env = setup(undefined, []);
  const report = await env.run();
  assert.equal(report.cases[0].status, 'missing');
  assert.equal(report.automaticallyRepaired, 0);
  assert.equal(env.writes.length, 0);
  assert.equal(env.trips()[0].photos[0].uri, 'file:///gone/p.jpeg');
});

test('existing readable photos are not replaced or even used to request gallery permission', async () => {
  const env = setup();
  env.files.add('file:///gone/p.jpeg');
  env.options.permission.granted = false;
  const report = await env.run();
  assert.equal(report.cases.length, 0);
  assert.equal(env.pages.length, 0);
  assert.equal(env.writes.length, 0);
});

test('cancel during protection prevents the later URI update and keeps the source photo', async () => {
  const env = setup();
  env.options.onCopy = () => { env.options.cancelled = true; };
  await assert.rejects(env.run(), /annul/);
  assert.equal(env.writes.length, 0);
  assert.equal(env.trips()[0].photos[0].uri, 'file:///gone/p.jpeg');
  assert.equal(env.files.has('file:///gallery/a.jpeg'), true);
});

test('stale search results cannot overwrite a souvenir already repaired elsewhere', async () => {
  const env = setup([caseOf('p', { takenAtEstimated: undefined }).original]);
  const report = await env.run();
  env.replace(env.trips().map(trip => ({ ...trip, photos: [{ ...trip.photos[0], uri: 'file:///newer.jpeg' }] })));
  await assert.rejects(env.load('utils/galleryPhotoRecovery.ts').applyGalleryCandidate(
    report.cases[0], report.cases[0].candidates[0], () => true,
  ), /changé/);
  assert.equal(env.writes.length, 0);
  assert.equal(env.trips()[0].photos[0].uri, 'file:///newer.jpeg');
});

test('GPS evidence compares camera metadata, never a manually adjusted route position', async () => {
  const env = setup();
  const matching = env.load('utils/galleryPhotoMatching.ts');
  const item = caseOf();
  const atAnchor = asset('a', { lat: 45, lng: 1 });
  let ranked = matching.rankGalleryCandidates(item, [atAnchor]);
  assert.equal(ranked[0].reasons.some(reason => reason.includes('GPS')), false);
  item.original.galleryMetadata = { lat: 45, lng: 1 };
  ranked = matching.rankGalleryCandidates(item, [atAnchor]);
  assert.equal(ranked[0].reasons.some(reason => reason.includes('GPS')), true);
});

test('a truncated large scan remains explicit and never treats a partial unique match as certain', async () => {
  const assets = Array.from({ length: 5010 }, (_, index) => asset('a' + index, {
    creationTime: T + index * 1000, takenAt: T + index * 1000,
  }));
  const env = setup(undefined, assets);
  const report = await env.run();
  assert.equal(report.scannedAssets, 5000);
  assert.equal(report.automaticallyRepaired, 0);
  assert.ok(report.issues.some(issue => issue.includes('limitée')));
  assert.equal(env.writes.length, 0);
});

test('GPS anchors and legacy notes do not make a nearest-in-time guess automatic', async () => {
  const env = setup([caseOf('p', {
    takenAt: T + 600000, takenAtEstimated: undefined, note: 'a precise place', lat: 45, lng: 1,
  }).original], [asset('a', { location: { latitude: 45, longitude: 1 } })]);
  const result = await env.run();
  assert.equal(result.automaticallyRepaired, 0);
  assert.equal(result.cases[0].candidates.length, 1);
  assert.equal(env.writes.length, 0);
});

test('repair and persisted undo restore exact old source metadata without changing souvenir or deleting any bytes', async () => {
  const original = caseOf('p', { galleryMetadata: { assetId: 'old', filename: 'old.jpeg', takenAt: T + 600000, lat: 44 } }).original;
  const env = setup([original]);
  env.realStorage();
  const before = JSON.stringify(env.trips()[0].activityMoments);
  await env.run();
  const repaired = env.trips()[0];
  const entry = repaired.photoRecoveryHistory[0];
  assert.equal(entry.before.uri, original.uri);
  assert.deepEqual(entry.before.galleryMetadata, original.galleryMetadata);
  assert.equal(entry.after.galleryMetadata.assetId, 'a');
  assert.equal(entry.context.automatic, true);
  assert.equal(entry.context.source, 'file:///gallery/a.jpeg');
  assert.equal(entry.context.tripStartTime, T);
  // Simulate independently edited captions/placements and a new read from disk.
  const store = env.load('utils/tripStorage.ts');
  await store.updateTrip('trip', current => ({
    photos: current.photos.map(photo => ({ ...photo, note: 'latest caption', lat: 48, lng: 2, routeIndex: 99, placementMethod: 'manual' })),
  }), true);
  const recovery = env.load('utils/tripPhotoRecovery.ts');
  const restored = await recovery.undoTripPhotoRecovery('trip', entry.id);
  assert.equal(restored.id, original.id);
  assert.equal(restored.uri, original.uri);
  assert.equal(restored.note, 'latest caption');
  assert.equal(restored.takenAt, original.takenAt);
  assert.equal(restored.takenAtEstimated, original.takenAtEstimated);
  assert.equal(restored.lat, 48);
  assert.equal(restored.lng, 2);
  assert.equal(restored.routeIndex, 99);
  assert.equal(restored.placementMethod, 'manual');
  assert.deepEqual(JSON.parse(JSON.stringify(restored.galleryMetadata)), original.galleryMetadata);
  assert.equal(JSON.stringify(env.trips()[0].activityMoments), before);
  assert.ok(env.trips()[0].photoRecoveryHistory[0].undoneAt);
  assert.equal(env.files.has('file:///gallery/a.jpeg'), true);
  assert.equal(env.copies.length, 1); // Undo does not invoke protection, copy or deletion.
  assert.equal(await recovery.tripPhotoSourceReadable(restored.uri), false);
  const next = await env.run();
  assert.equal(next.automaticallyRepaired, 0); // A later session never re-applies the rejected match.
  assert.equal(next.cases[0].status, 'pending');
  await env.load('utils/galleryPhotoRecovery.ts').applyGalleryCandidate(next.cases[0], next.cases[0].candidates[0], () => true);
  assert.equal(env.trips()[0].photoRecoveryHistory.length, 2);
  assert.equal(env.trips()[0].photoRecoveryHistory[1].context.automatic, false);
});

test('undo removes newly introduced metadata, keeps a readable original, and is single-use', async () => {
  const env = setup();
  env.realStorage();
  await env.run();
  const recovery = env.load('utils/tripPhotoRecovery.ts');
  const entry = env.trips()[0].photoRecoveryHistory[0];
  env.files.add(entry.before.uri);
  await recovery.undoTripPhotoRecovery('trip', entry.id);
  assert.equal('galleryMetadata' in env.trips()[0].photos[0], false);
  assert.equal(await recovery.tripPhotoSourceReadable(entry.before.uri), true);
  const writes = env.writes.length;
  await assert.rejects(recovery.undoTripPhotoRecovery('trip', entry.id), /Annulation impossible/);
  assert.equal(env.writes.length, writes);
});

test('undo refuses a newer URI, metadata-only change, removed photo, removed trip or unknown entry', async () => {
  for (const modification of [
    trip => ({ ...trip, photos: [{ ...trip.photos[0], uri: 'file:///newer.jpeg' }] }),
    trip => ({ ...trip, photos: [{ ...trip.photos[0], galleryMetadata: { ...trip.photos[0].galleryMetadata, assetId: 'newer' } }] }),
    trip => ({ ...trip, photos: [] }),
  ]) {
    const env = setup();
    env.realStorage();
    await env.run();
    const entry = env.trips()[0].photoRecoveryHistory[0];
    env.replace(env.trips().map(modification));
    const snapshot = JSON.stringify(env.trips());
    await assert.rejects(env.load('utils/tripPhotoRecovery.ts').undoTripPhotoRecovery('trip', entry.id), /Annulation impossible/);
    assert.equal(JSON.stringify(env.trips()), snapshot);
  }
  const env = setup();
  env.realStorage();
  await assert.rejects(env.load('utils/tripPhotoRecovery.ts').undoTripPhotoRecovery('trip', 'unknown'), /introuvable/);
  env.replace([]);
  await assert.rejects(env.load('utils/tripPhotoRecovery.ts').undoTripPhotoRecovery('trip', 'unknown'), /introuvable/);
});

test('multiple relinks and undo do not resurrect an older undo even if its exact source returns (ABA)', async () => {
  const env = setup(undefined, [asset('a'), asset('b')]);
  env.realStorage();
  const recovery = env.load('utils/tripPhotoRecovery.ts');
  await recovery.relinkTripPhoto('trip', 'p', asset('a').uri);
  const first = env.trips()[0].photoRecoveryHistory[0];
  await recovery.relinkTripPhoto('trip', 'p', asset('b').uri);
  const second = env.trips()[0].photoRecoveryHistory[1];
  await assert.rejects(recovery.undoTripPhotoRecovery('trip', first.id), /Annulation impossible/);
  await recovery.undoTripPhotoRecovery('trip', second.id);
  assert.equal(env.trips()[0].photos[0].uri, first.after.uri);
  await assert.rejects(recovery.undoTripPhotoRecovery('trip', first.id), /Annulation impossible/);
});

test('competing repairs use the committed source revision; only one stale candidate can win', async () => {
  const env = setup(undefined, [asset('a'), asset('b')]);
  env.realStorage();
  const original = env.trips()[0].photos[0];
  const recovery = env.load('utils/tripPhotoRecovery.ts');
  const results = await Promise.allSettled([
    recovery.relinkTripPhoto('trip', 'p', asset('a').uri, { expectedPhoto: original }),
    recovery.relinkTripPhoto('trip', 'p', asset('b').uri, { expectedPhoto: original }),
  ]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter(item => item.status === 'rejected').length, 1);
  assert.equal(env.trips()[0].photoRecoveryHistory.length, 1);
});

test('queued caption edits and undo preserve both changes, including edits while the write is pending', async () => {
  const env = setup();
  env.realStorage();
  await env.run();
  const entry = env.trips()[0].photoRecoveryHistory[0];
  const recovery = env.load('utils/tripPhotoRecovery.ts');
  const store = env.load('utils/tripStorage.ts');
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const writing = new Promise(resolve => { entered = resolve; });
  env.options.beforeWrite = async () => { entered(); await gate; };
  const caption = store.updateTrip('trip', current => ({
    photos: current.photos.map(photo => ({ ...photo, note: 'concurrent caption', routeIndex: 8 })),
  }), true);
  await writing;
  const undo = recovery.undoTripPhotoRecovery('trip', entry.id);
  env.options.beforeWrite = null;
  release();
  await Promise.all([caption, undo]);
  assert.equal(env.trips()[0].photos[0].uri, entry.before.uri);
  assert.equal(env.trips()[0].photos[0].note, 'concurrent caption');
  assert.equal(env.trips()[0].photos[0].routeIndex, 8);
});

test('queued source change wins before undo, which rechecks at commit instead of overwriting it', async () => {
  const env = setup();
  env.realStorage();
  await env.run();
  const entry = env.trips()[0].photoRecoveryHistory[0];
  const store = env.load('utils/tripStorage.ts');
  const change = store.updateTrip('trip', current => ({
    photos: current.photos.map(photo => ({ ...photo, uri: 'file:///concurrent.jpeg' })),
  }), true);
  const undo = env.load('utils/tripPhotoRecovery.ts').undoTripPhotoRecovery('trip', entry.id);
  await change;
  await assert.rejects(undo, /Annulation impossible/);
  assert.equal(env.trips()[0].photos[0].uri, 'file:///concurrent.jpeg');
  assert.equal(env.trips()[0].photoRecoveryHistory[0].undoneAt, undefined);
});

test('failed repair or undo writes do not leave a partial history; queue recovers after failure', async () => {
  const env = setup();
  env.realStorage();
  env.options.failWrite = true;
  const recovery = env.load('utils/tripPhotoRecovery.ts');
  await assert.rejects(recovery.relinkTripPhoto('trip', 'p', asset().uri), /disk full/);
  assert.equal(env.trips()[0].photoRecoveryHistory, undefined);
  assert.equal(env.trips()[0].photos[0].uri, caseOf().original.uri);
  env.options.failWrite = false;
  await recovery.relinkTripPhoto('trip', 'p', asset().uri);
  const snapshot = JSON.stringify(env.trips());
  const entry = env.trips()[0].photoRecoveryHistory[0];
  env.options.failWrite = true;
  await assert.rejects(recovery.undoTripPhotoRecovery('trip', entry.id), /disk full/);
  assert.equal(JSON.stringify(env.trips()), snapshot);
  env.options.failWrite = false;
  await recovery.undoTripPhotoRecovery('trip', entry.id);
  assert.ok(env.trips()[0].photoRecoveryHistory[0].undoneAt);
});

test('hook exposes automatic/manual history, undoes, offers another choice, and reloads history on reopening', async () => {
  const env = setup();
  env.realStorage();
  const render = renderRecoveryHook(env);
  await render().start();
  let state = render();
  assert.equal(state.phase, 'done');
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].canUndo, true);
  await state.undo(state.history[0]);
  state = render();
  assert.equal(state.phase, 'ready');
  assert.equal(state.undoNotice.missing, true);
  assert.equal(state.history[0].canUndo, false);
  assert.equal(state.history[0].needsSelection, true);
  assert.equal(state.report.automaticallyRepaired, 0);
  assert.equal(state.report.cases[0].status, 'pending');
  assert.equal(state.report.cases[0].original.uri, caseOf().original.uri);
  // Reopening the sheet/hook still finds the persisted undo and reselect action.
  render.remount();
  const reopened = render;
  await reopened().loadHistory();
  assert.equal(reopened().history[0].needsSelection, true);
  await reopened().start({ tripId: 'trip', manualOnly: true });
  state = reopened();
  assert.equal(state.report.automaticallyRepaired, 0);
  await state.choose(state.report.cases[0].key, state.report.cases[0].candidates[0].assetId);
  state = reopened();
  assert.equal(state.report.manuallyRepaired, 1);
  assert.equal(state.history.length, 2);
  assert.equal(state.history.filter(item => item.canUndo).length, 1);
  assert.equal(state.history.some(item => item.needsSelection), false);
});

test('hook refreshes stale undo availability after a conflict without changing the later source', async () => {
  const env = setup();
  env.realStorage();
  const render = renderRecoveryHook(env);
  await render().start();
  const stale = render().history[0];
  await env.load('utils/tripStorage.ts').updateTrip('trip', current => ({
    photos: current.photos.map(photo => ({ ...photo, uri: 'file:///newer.jpeg' })),
  }), true);
  await render().undo(stale);
  assert.match(render().error, /Annulation impossible/);
  assert.equal(render().history[0].canUndo, false);
  assert.equal(render().undoNotice, null);
  assert.equal(env.trips()[0].photos[0].uri, 'file:///newer.jpeg');
});
