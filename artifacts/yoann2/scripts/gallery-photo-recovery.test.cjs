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
    trips: () => trips,
    replace: next => { trips = next; },
    run: () => load('utils/galleryPhotoRecovery.ts').searchGalleryTripPhotos({
      isCurrent: () => !options.cancelled, progress: () => {},
    }),
  };
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
