const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const storage = new Map();
let writeError = false;
const asyncStorage = {
  getItem: async key => storage.get(key) ?? null,
  setItem: async (key, value) => { if (writeError) throw new Error('disk full'); storage.set(key, value); },
  removeItem: async key => storage.delete(key),
};
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const mod = { exports: {} };
  cache.set(relative, mod.exports);
  const compiled = ts.transpileModule(fs.readFileSync(path.join(ROOT, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(`(function(module,exports,require){${compiled}\n})(mod,mod.exports,require);`, {
    mod, require: name => {
      if (name === '@react-native-async-storage/async-storage') return asyncStorage;
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  cache.set(relative, mod.exports);
  return mod.exports;
}
const { activityForTrip, activityInfo, filterActivities, activityMilestones } = load('utils/activities.ts');
const { activityReviewPatch } = load('utils/activityReview.ts');
const { activityMapHtml } = load('utils/activityMapHtml.ts');
const { parseExifDate, photoTakenAt, locatePhotoOnTrip } = load('utils/tripPhotoPlacement.ts');
const { remapTripMemories } = load('utils/tripMemoryRemapping.ts');
const { simplifyRoute } = load('utils/routeSimplification.ts');
const { updateTrip, getTrips } = load('utils/tripStorage.ts');
const { saveManualTripState, getManualTripState } = load('utils/manualTripStorage.ts');
const vehicles = [
  { id: 'activities', type: 'walk', walkParticipants: [{ id: 'a', name: 'A', type: 'human' }, { id: 'b', name: 'B', type: 'human' }, { id: 'dog', name: 'Dog', type: 'dog' }] },
  { id: 'car', type: 'car' },
];
const trip = (id, time, km, extra = {}) => ({
  id, startTime: time, endTime: time + 3600000, distanceKm: km, pointCount: 2, vehicle: 'activities',
  route: [{ lat: 45, lng: 1 }, { lat: 45.01, lng: 1.01 }], ...extra,
});
const june = new Date(2026, 5, 10).getTime();
const july = new Date(2026, 6, 10).getTime();

test('regenerated GPS remaps linked photos and moments together without changing content or clocks', () => {
  const takenAt = june + 1800000;
  const original = trip('regen', june, 5, {
    note: 'Trip note', walkParticipants: ['a', 'dog'],
    photos: [{ id: 'p', uri: 'content://original', takenAt, note: 'Photo note', routeIndex: 1 }],
    activityMoments: [{ id: 'm', photoId: 'p', note: 'Memory note', timestamp: takenAt,
      routeIndex: 1, lat: 45.01, lng: 1.01, placementMethod: 'time' }],
  });
  const before = JSON.stringify(original);
  const route = [
    { lat: 45, lng: 1, t: june }, { lat: 45.005, lng: 1.005, t: june + 600000 },
    { lat: 45.01, lng: 1.01, t: takenAt }, { lat: 45.02, lng: 1.02, t: original.endTime },
  ];
  const patch = remapTripMemories(original, route);
  for (const item of [patch.photos[0], patch.activityMoments[0]]) {
    assert.equal(item.routeIndex, 2);
    assert.equal(item.lat, route[2].lat);
    assert.equal(item.lng, route[2].lng);
    assert.equal(item.placementMethod, 'time');
  }
  assert.equal(patch.photos[0].takenAt, takenAt);
  assert.equal(patch.photos[0].uri, 'content://original');
  assert.equal(patch.photos[0].note, 'Photo note');
  assert.equal(patch.activityMoments[0].timestamp, takenAt);
  assert.equal(patch.activityMoments[0].note, 'Memory note');
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(Object.keys(patch).sort(), ['activityMoments', 'photos']);
  const html = activityMapHtml([{ ...original, ...patch, route }], vehicles, '#101010', true, patch.activityMoments[0]);
  const payload = JSON.parse(html.match(/var routes=(.*);var map=/)[1]);
  assert.equal(payload[0].moments[0].lat, patch.photos[0].lat);
  assert.ok(html.includes('var selectedPoint={"lat":45.01,"lng":1.01}'));
});

test('removed GPS points get valid replacement anchors and real clocks survive simplification', () => {
  const route = [
    { lat: 45, lng: 1, t: june }, { lat: 45.01, lng: 1.01, t: june + 1800000 },
    { lat: 45.02, lng: 1.02, t: june + 3600000 },
  ];
  const newRoute = simplifyRoute(route);
  assert.equal(newRoute.length, 2);
  assert.equal(newRoute[1].t, june + 3600000);
  const original = trip('removed', june, 5, { route,
    photos: [{ id: 'p', uri: 'gallery', takenAt: june + 2000000, routeIndex: 1,
      lat: 45.01, lng: 1.01, placementMethod: 'time' }],
    activityMoments: [{ id: 'note', note: 'Break', timestamp: june + 2000000, routeIndex: 1,
      lat: 45.01, lng: 1.01, placementMethod: 'time' }],
  });
  const patch = remapTripMemories(original, newRoute);
  for (const item of [patch.photos[0], patch.activityMoments[0]]) {
    assert.equal(item.routeIndex, 1);
    assert.equal(item.lat, route[1].lat);
    assert.equal(item.lng, route[1].lng);
  }
});

test('automatic remapping uses raw GPS on untimed regenerated routes, with explicit estimates otherwise', () => {
  const takenAt = june + 3000000;
  const original = trip('raw-remap', june, 5, {
    photos: [{ id: 'p', uri: 'gallery', takenAt, placementMethod: 'gps', routeIndex: 1 }],
  });
  const route = [{ lat: 45, lng: 1 }, { lat: 45.01, lng: 1 }, { lat: 45.02, lng: 1 }];
  const gps = [{ lat: 45.0101, lng: 1, timestamp: takenAt }];
  const actual = remapTripMemories(original, route, gps).photos[0];
  assert.equal(actual.routeIndex, 1);
  assert.equal(actual.placementMethod, 'gps');
  assert.equal(actual.lat, gps[0].lat);
  const estimate = remapTripMemories(original, route).photos[0];
  assert.equal(estimate.routeIndex, 2);
  assert.equal(estimate.placementMethod, 'estimated');
});

test('a midpoint memory on a long straight trace keeps its raw GPS coordinates after simplification', () => {
  const rawRoute = [
    { lat: 45, lng: 1, t: june }, { lat: 45.05, lng: 1.05, t: june + 1800000 },
    { lat: 45.10, lng: 1.10, t: june + 3600000 },
  ];
  const original = trip('straight-midpoint', june, 15, {
    route: rawRoute,
    photos: [{ id: 'p', uri: 'gallery', takenAt: june + 1800000, routeIndex: 1, placementMethod: 'time' }],
    activityMoments: [{ id: 'm', photoId: 'p', note: 'Middle', timestamp: june + 1800000,
      routeIndex: 1, lat: 45.05, lng: 1.05, placementMethod: 'time' }],
  });
  const route = simplifyRoute(rawRoute);
  assert.equal(route.length, 2);
  const gps = rawRoute.map(({ lat, lng, t }) => ({ lat, lng, timestamp: t }));
  const patch = remapTripMemories(original, route, gps);
  for (const item of [patch.photos[0], patch.activityMoments[0]]) {
    assert.ok(item.routeIndex >= 0 && item.routeIndex < route.length);
    assert.equal(item.lat, rawRoute[1].lat);
    assert.equal(item.lng, rawRoute[1].lng);
    assert.equal(item.placementMethod, 'time');
    assert.notEqual(item.lat, route[item.routeIndex].lat);
  }
  const html = activityMapHtml([{ ...original, route, ...patch }], vehicles, '#101010', true, patch.activityMoments[0]);
  assert.ok(html.includes('var selectedPoint={"lat":45.05,"lng":1.05}'));
  const afterGpsExpiry = remapTripMemories({ ...original, route, ...patch }, route);
  assert.equal(afterGpsExpiry.photos[0].lat, 45.05);
  assert.equal(afterGpsExpiry.activityMoments[0].lng, 1.05);
});

test('loop remapping keeps automatic capture time and manual old-anchor time distinct', () => {
  const crossing = { lat: 45, lng: 1 };
  const route = [
    { ...crossing, t: june }, { lat: 45.01, lng: 1.01, t: june + 600000 },
    { ...crossing, t: june + 1800000 }, { lat: 45.02, lng: 1.02, t: june + 2400000 },
    { ...crossing, t: june + 3600000 },
  ];
  const original = trip('loop', june, 5, { route,
    photos: [{ id: 'auto', uri: 'auto', takenAt: june + 3600000, routeIndex: 0, placementMethod: 'time' },
      { id: 'manual', uri: 'manual', takenAt: june, routeIndex: 4, ...crossing, placementMethod: 'manual' }],
    activityMoments: [{ id: 'm', note: 'Return', timestamp: june, photoId: 'manual',
      routeIndex: 4, ...crossing, placementMethod: 'manual' }],
  });
  const newRoute = [route[0], route[1], route[2], { lat: 45.015, lng: 1.015, t: june + 2100000 }, route[3], route[4]];
  const patch = remapTripMemories(original, newRoute);
  assert.equal(patch.photos[0].routeIndex, 5);
  assert.equal(patch.photos[1].routeIndex, 5);
  assert.equal(patch.photos[1].takenAt, june);
  assert.equal(patch.activityMoments[0].timestamp, june);
  assert.equal(patch.activityMoments[0].routeIndex, 5);
  // Without clocks, disambiguate repeated positions by old route progress.
  const untimed = remapTripMemories({ ...original, route: route.map(({ t, ...p }) => p) },
    newRoute.map(({ t, ...p }) => p));
  assert.equal(untimed.photos[1].routeIndex, 5);
});

test('manual and legacy positions remain geographic even when their point disappears', () => {
  const original = trip('manual', june, 5, {
    photos: [{ id: 'p', uri: 'original', takenAt: june, routeIndex: 1 }],
    activityMoments: [{ id: 'm', note: 'Correction', photoId: 'p', timestamp: june,
      lat: 45.0103, lng: 1.0103, routeIndex: 1, placementMethod: 'manual' }],
  });
  const route = [{ lat: 45, lng: 1, t: june }, { lat: 45.02, lng: 1.02, t: original.endTime }];
  const patch = remapTripMemories(original, route);
  for (const item of [patch.photos[0], patch.activityMoments[0]]) {
    assert.equal(item.lat, 45.0103);
    assert.equal(item.lng, 1.0103);
    assert.equal(item.routeIndex, 1);
    assert.equal(item.placementMethod, 'manual');
  }
  const legacy = remapTripMemories({ ...original, activityMoments: undefined }, route).photos[0];
  assert.equal(legacy.lat, original.route[1].lat);
  assert.equal(legacy.routeIndex, 1);
  assert.equal(legacy.placementMethod, 'manual');
  // A legacy photo correction made separately must not revert to its old moment.
  const corrected = remapTripMemories({ ...original, photos: [{ ...original.photos[0], routeIndex: 0 }],
    activityMoments: [{ ...original.activityMoments[0], placementMethod: 'time' }] }, route);
  assert.equal(corrected.photos[0].routeIndex, 0);
  assert.equal(corrected.activityMoments[0].lat, 45);
});

test('a legacy trip-map photo move wins over an earlier manual Activity Review position', () => {
  const original = trip('legacy-two-corrections', june, 5, {
    route: [
      { lat: 45, lng: 1, t: june }, { lat: 45.01, lng: 1.01, t: june + 1800000 },
      { lat: 45.02, lng: 1.02, t: june + 3600000 },
    ],
    // Old trip-map code moved only this index after the manual review placement.
    photos: [{ id: 'p', uri: 'content://original', takenAt: june + 1800000, note: 'Caption', routeIndex: 2 }],
    activityMoments: [{ id: 'm', photoId: 'p', note: 'Manual review note',
      timestamp: june + 1800000, routeIndex: 1, lat: 45.01, lng: 1.01, placementMethod: 'manual' }],
  });
  const newRoute = [
    original.route[0], { lat: 45.005, lng: 1.006, t: june + 600000 },
    original.route[1], { lat: 45.015, lng: 1.016, t: june + 2400000 }, original.route[2],
  ];
  const patch = remapTripMemories(original, newRoute);
  for (const item of [patch.photos[0], patch.activityMoments[0]]) {
    assert.equal(item.routeIndex, 4);
    assert.equal(item.lat, original.route[2].lat);
    assert.equal(item.lng, original.route[2].lng);
    assert.equal(item.placementMethod, 'manual');
  }
  assert.equal(patch.photos[0].takenAt, june + 1800000);
  assert.equal(patch.photos[0].note, 'Caption');
  assert.equal(patch.photos[0].uri, 'content://original');
  assert.equal(patch.activityMoments[0].timestamp, june + 1800000);
  assert.equal(patch.activityMoments[0].note, 'Manual review note');
  // Repeating regeneration must not restore the obsolete review placement.
  const repeated = remapTripMemories({ ...original, route: newRoute, ...patch }, original.route);
  assert.equal(repeated.photos[0].routeIndex, 2);
  assert.equal(repeated.activityMoments[0].routeIndex, 2);
});

test('unknown photo dates never position photos using takenAt or the linked default timestamp', () => {
  const original = trip('unknown', june, 5, {
    photos: [{ id: 'unknown', uri: 'gallery', takenAt: june + 3600000, takenAtEstimated: true }],
    activityMoments: [{ id: 'unknown-memory', note: 'Unknown', photoId: 'unknown', timestamp: june + 3600000 }],
  });
  const route = [{ lat: 45, lng: 1, t: june }, { lat: 45.01, lng: 1.01, t: original.endTime }];
  const patch = remapTripMemories(original, route);
  assert.equal(patch.photos[0].routeIndex, undefined);
  assert.equal(patch.activityMoments[0].routeIndex, undefined);
  assert.equal(patch.photos[0].takenAtEstimated, true);
  assert.equal(patch.photos[0].takenAt, original.endTime);
  assert.equal(patch.activityMoments[0].timestamp, original.endTime);
  const invalid = remapTripMemories({ ...original, photos: [
    { id: 'bad', uri: 'gallery', takenAt: NaN, routeIndex: 999 },
  ] }, route);
  assert.equal(invalid.photos[0].routeIndex, undefined);
});

test('GPS regeneration saves the remapped route and memories atomically and leaves UI intact on save failure', async () => {
  const original = trip('handler', june, 5, {
    photos: [{ id: 'p', uri: 'gallery', takenAt: june, placementMethod: 'time' }],
  });
  const source = ts.createSourceFile('trip-map.tsx', fs.readFileSync(path.join(ROOT, 'app/trip-map.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleRegenGpsRoute') declaration = node;
    ts.forEachChild(node, find);
  }
  find(source);
  assert.ok(declaration);
  const points = [
    { lat: 45, lng: 1, timestamp: june }, { lat: 45.01, lng: 1.015, timestamp: june + 1800000 },
    { lat: 45.02, lng: 1.02, timestamp: original.endTime },
  ];
  const context = {
    trip: original, regenGpsLoading: false, isWalkTrip: true, EPSILON_DEG_WALK: 0.000036,
    useCallback: fn => fn, loadMultiDayPoints: async () => points, filterGpsOutliers: p => p,
    simplifyRoute, remapTripMemories, computeRouteDistanceKm: () => 5,
    setRegenGpsLoading: value => { context.regenGpsLoading = value; },
    setTrip: update => { context.trip = update(context.trip); },
    updateTrip: async (id, patch) => { if (context.fail) throw new Error('disk full'); context.saved = patch; },
    tripEvents: { emitTripUpdated: () => {} }, Haptics: { notificationAsync: async () => {}, NotificationFeedbackType: { Success: 'success' } },
    Alert: { alert: () => {} }, fail: true,
  };
  vm.runInNewContext(ts.transpileModule(`var ${declaration.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  await context.handleRegenGpsRoute();
  assert.equal(context.trip, original);
  assert.equal(context.regenGpsLoading, false);
  context.fail = false;
  await context.handleRegenGpsRoute();
  assert.equal(context.saved.route[1].t, points[1].timestamp);
  assert.equal(context.saved.photos[0].routeIndex, 0);
  assert.equal(context.trip.photos[0].takenAt, june);
  assert.equal(context.trip.route, context.saved.route);
});

test('a trip-map manual photo correction updates its linked memory without changing content or timestamps', async () => {
  const original = trip('manual-handler', june, 5, {
    photos: [{ id: 'p', uri: 'gallery', takenAt: june, note: 'Photo caption', routeIndex: 0 }],
    activityMoments: [{ id: 'm', photoId: 'p', note: 'Moment caption', timestamp: june,
      routeIndex: 0, lat: 45, lng: 1, placementMethod: 'time' }],
  });
  const source = ts.createSourceFile('trip-map.tsx', fs.readFileSync(path.join(ROOT, 'app/trip-map.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleMapPointSelected') declaration = node;
    ts.forEachChild(node, find);
  }
  find(source);
  const context = {
    trip: original, repositioningPhotoId: 'p', useCallback: fn => fn,
    setPhotoSelectMode: () => {}, setRepositioningPhotoId: () => {},
    handleAddPhotos: () => { throw new Error('must reposition, not add'); },
    updateTrip: async (id, patch) => { context.saved = patch; },
    setTrip: next => { context.trip = next; },
  };
  vm.runInNewContext(ts.transpileModule(`var ${declaration.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  await context.handleMapPointSelected(1);
  for (const item of [context.saved.photos[0], context.saved.activityMoments[0]]) {
    assert.equal(item.routeIndex, 1);
    assert.equal(item.lat, original.route[1].lat);
    assert.equal(item.lng, original.route[1].lng);
    assert.equal(item.placementMethod, 'manual');
  }
  assert.equal(context.saved.photos[0].takenAt, june);
  assert.equal(context.saved.photos[0].note, 'Photo caption');
  assert.equal(context.saved.activityMoments[0].timestamp, june);
  assert.equal(context.saved.activityMoments[0].note, 'Moment caption');
});

test('photo times come from valid EXIF including timezone offsets, then gallery metadata', () => {
  assert.equal(parseExifDate('2026:10:14 09:48:00', '+02:00'), Date.parse('2026-10-14T07:48:00Z'));
  assert.equal(parseExifDate('2026-10-14T07:48:00Z'), Date.parse('2026-10-14T07:48:00Z'));
  assert.equal(photoTakenAt({ DateTimeOriginal: '2026:02:30 10:00:00' }, june), june);
  assert.equal(photoTakenAt({ DateTimeOriginal: '2026:10:14 09:48:00', OffsetTimeOriginal: '+02:00' }, june), Date.parse('2026-10-14T07:48:00Z'));
  assert.equal(photoTakenAt(null, june), june);
  assert.equal(photoTakenAt({ DateTimeOriginal: '2026:10:14 09:48:00' }, june), june);
  assert.equal(photoTakenAt(null, NaN), undefined);
  assert.equal(photoTakenAt(null, 0), undefined);
});
test('photo positions prefer real route clocks, retaining time through long stops and midnight', () => {
  const original = trip('timed', june, 5, { route: [
    { lat: 45, lng: 1, t: june },
    { lat: 45.01, lng: 1.01, t: june + 60000 },
    { lat: 45.02, lng: 1.02, t: june + 3600000 },
  ] });
  const before = JSON.stringify(original);
  const position = locatePhotoOnTrip(original, june + 2 * 60000);
  assert.equal(position.routeIndex, 1);
  assert.equal(position.method, 'time');
  assert.equal(position.timestamp, june + 2 * 60000);
  assert.equal(JSON.stringify(original), before);
  const start = Date.parse('2026-10-13T23:50:00Z'), end = Date.parse('2026-10-14T00:10:00Z');
  const overnight = { ...original, startTime: start, endTime: end, route: [
    { lat: 45, lng: 1, t: start }, { lat: 45.01, lng: 1, t: Date.parse('2026-10-14T00:00:00Z') }, { lat: 45.02, lng: 1, t: end },
  ] };
  assert.equal(locatePhotoOnTrip(overnight, Date.parse('2026-10-14T00:00:10Z')).routeIndex, 1);
});
test('untimed routes use the recorded GPS position before resorting to a marked estimate', () => {
  const original = trip('raw-gps', june, 5, { route: [
    { lat: 45, lng: 1 }, { lat: 45.01, lng: 1.01 }, { lat: 45.02, lng: 1.02 },
  ] });
  const time = june + 48 * 60000;
  const gps = [
    { lat: 45, lng: 1, timestamp: june },
    { lat: 45.0101, lng: 1.0101, timestamp: time },
    { lat: 45.02, lng: 1.02, timestamp: original.endTime },
  ];
  const position = locatePhotoOnTrip(original, time, gps);
  assert.equal(position.method, 'gps');
  assert.equal(position.routeIndex, 1);
  assert.equal(position.lat, 45.0101);
  assert.equal(locatePhotoOnTrip(original, time).method, 'estimated');
  assert.equal(locatePhotoOnTrip(original, time).routeIndex, 2);
  assert.equal(locatePhotoOnTrip(original, original.endTime + 6 * 60000, gps), undefined);
  assert.equal(locatePhotoOnTrip(original, NaN, gps), undefined);
  assert.equal(locatePhotoOnTrip({ ...original, route: [] }, time, gps), undefined);
});
test('automatic photo anchors survive saving; manual anchors can replace their location without changing photo time', () => {
  const original = trip('anchored', june, 5, { route: [
    { lat: 45, lng: 1, t: june }, { lat: 45.01, lng: 1.01, t: june + 60000 }, { lat: 45.02, lng: 1.02, t: june + 3600000 },
  ] });
  const takenAt = june + 2 * 60000;
  const placement = locatePhotoOnTrip(original, takenAt);
  const draft = {
    kind: 'bike', participants: ['a'], title: '', favorite: false, note: '', originalPhotoIds: [],
    moments: [{ id: 'auto', note: 'Break', ...placement, photo: { id: 'photo', uri: 'gallery', takenAt } }],
  };
  const patch = activityReviewPatch(original, draft);
  assert.equal(patch.photos[0].routeIndex, 1);
  assert.equal(patch.photos[0].takenAt, takenAt);
  assert.equal(patch.activityMoments[0].timestamp, takenAt);
  assert.equal(patch.activityMoments[0].lat, 45.01);
  const manual = activityReviewPatch(original, { ...draft, moments: [{ ...draft.moments[0], routeIndex: 2, lat: 45.02, lng: 1.02 }] });
  assert.equal(manual.photos[0].routeIndex, 2);
  assert.equal(manual.photos[0].takenAt, takenAt);
  const html = activityMapHtml([original], vehicles, '#101010', true, placement);
  assert.ok(html.includes('var selectedPoint={"lat":45.01,"lng":1.01}'));
  assert.doesNotThrow(() => new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]));
});
test('the review screen adds batches without duplicates, preserves unknown dates and supports manual photo correction', async () => {
  const current = trip('batch', june, 5, { route: [
    { lat: 45, lng: 1 }, { lat: 45.01, lng: 1.01 }, { lat: 45.02, lng: 1.02 },
  ] });
  const source = ts.createSourceFile('activity-review.tsx', fs.readFileSync(path.join(ROOT, 'app/activity-review.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ['preparePhoto', 'attachPhoto', 'addPhotoBatch', 'addMoment'];
  const declarations = new Map();
  function find(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(source))) declarations.set(node.name.getText(source), node.getText(source));
    ts.forEachChild(node, find);
  }
  find(source);
  assert.equal(declarations.size, names.length);
  let counter = 0;
  const context = {
    trip: current, moments: [], momentId: 'editable', momentNote: 'A caption', momentPhoto: undefined,
    pointIndex: undefined, photoPlacement: undefined, placementStatus: undefined,
    photoBusyRef: { current: false }, gpsPromise: { current: Promise.resolve([
      { lat: 45, lng: 1, timestamp: june }, { lat: 45.01, lng: 1.01, timestamp: june + 48 * 60000 },
      { lat: 45.02, lng: 1.02, timestamp: current.endTime },
    ]) },
    locatePhotoOnTrip, genId: () => `photo-draft-${++counter}`, Alert: { alert: () => {} },
    setMoments: update => { context.moments = update(context.moments); },
    setMomentPhoto: value => { context.momentPhoto = value; },
    setPointIndex: value => { context.pointIndex = value; },
    setPhotoPlacement: value => { context.photoPlacement = value; },
    setPlacementStatus: value => { context.placementStatus = value; },
    setPickingPoint: () => {}, setMomentEditing: () => {},
  };
  const code = ts.transpileModule(
    [...declarations.values()].map(declaration => `const ${declaration};`).join('\n') + `\nglobalThis.actions = {${names.join(',')}};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  vm.runInNewContext(code, context);
  const takenAt = june + 48 * 60000;
  await context.actions.addPhotoBatch([{ uri: 'one', takenAt }, { uri: 'one', takenAt }, { uri: 'two' }]);
  assert.equal(context.moments.length, 2);
  const automatic = context.moments.find(moment => moment.photo.uri === 'one');
  assert.equal(automatic.routeIndex, 1);
  assert.equal(automatic.timestamp, takenAt);
  assert.equal(automatic.placementMethod, 'gps');
  const unknown = context.moments.find(moment => moment.photo.uri === 'two');
  assert.equal(unknown.photo.takenAtEstimated, true);
  assert.equal(unknown.routeIndex, undefined);
  assert.equal(unknown.lat, undefined);
  await context.actions.addPhotoBatch([{ uri: 'one', takenAt }]);
  assert.equal(context.moments.length, 2);
  await context.actions.attachPhoto('editable-photo', takenAt);
  assert.equal(context.pointIndex, 1);
  context.pointIndex = 2;
  context.photoPlacement = { routeIndex: 2, lat: 45.02, lng: 1.02, timestamp: current.endTime, method: 'manual' };
  context.actions.addMoment();
  const manual = context.moments.find(moment => moment.id === 'editable');
  assert.equal(manual.routeIndex, 2);
  assert.equal(manual.timestamp, takenAt);
  assert.equal(manual.photo.takenAt, takenAt);
  assert.equal(manual.placementMethod, 'manual');
});

test('past activity badges follow each trip type and keep legacy walking badges', () => {
  const original = trip('editable', june, 5);
  for (const [kind, icon, color] of [
    ['walk', 'walk', '#4CAF50'],
    ['run', 'run', '#FF9800'],
    ['bike', 'bike', '#2196F3'],
    ['kayak', 'kayaking', '#009688'],
  ]) {
    const metadata = activityInfo(activityForTrip({ ...original, activityType: kind }, vehicles) ?? 'walk');
    assert.equal(metadata.icon, icon);
    assert.equal(metadata.color, color);
  }
  assert.equal(activityInfo(activityForTrip(original, vehicles)).icon, 'walk');
});

test('legacy walks are walking activities without changing their data', () => {
  const original = trip('legacy', june, 5);
  const before = JSON.stringify(original);
  assert.equal(activityForTrip(original, vehicles), 'walk');
  assert.equal(JSON.stringify(original), before);
  for (const kind of ['walk', 'run', 'bike', 'kayak']) {
    assert.equal(activityForTrip({ ...original, activityType: kind }, vehicles), kind);
  }
  assert.equal(activityForTrip({ ...original, vehicle: 'ignored', activityType: 'bike' }, vehicles), null);
  assert.equal(activityForTrip({ ...original, vehicle: 'car', activityType: 'bike' }, vehicles), null);
});
test('activity and participant filters compose, solo allows the recorder and a dog', () => {
  const fixtures = [
    trip('solo', june, 2, { activityType: 'bike', walkParticipants: ['a', 'dog'] }),
    trip('together', june, 3, { activityType: 'bike', walkParticipants: ['a', 'b'] }),
    trip('run', june, 4, { activityType: 'run', walkParticipants: ['a', 'b'] }),
  ];
  assert.deepEqual(Array.from(filterActivities(fixtures, vehicles, 'bike', 'solo'), t => t.id), ['solo']);
  assert.deepEqual(Array.from(filterActivities(fixtures, vehicles, 'bike', 'b'), t => t.id), ['together']);
  assert.equal(filterActivities(fixtures, vehicles, 'all', 'b').length, 2);
});
test('monthly milestones only announce first activities, records and thresholds reached in that month', () => {
  const fixtures = [
    trip('previous', june, 49, { activityType: 'bike', walkParticipants: ['b'] }),
    trip('current', july, 60, { activityType: 'bike', walkParticipants: ['b'] }),
    trip('first-kayak', july, 3, { activityType: 'kayak' }),
    trip('future', new Date(2026, 7, 1).getTime(), 500, { activityType: 'bike', walkParticipants: ['b'] }),
  ];
  const result = activityMilestones(fixtures, vehicles, 2026, 6);
  assert.ok(result.some(m => m.id === 'first-kayak'));
  assert.ok(!result.some(m => m.id === 'first-bike'));
  assert.ok(result.some(m => m.id === 'record-bike'));
  assert.ok(result.some(m => m.id === 'km-bike-b-50'));
  assert.ok(result.some(m => m.id === 'km-bike-b-100'));
  assert.ok(!result.some(m => m.id === 'km-bike-b-10' || m.id === 'km-bike-b-500'));
});
test('review editing preserves the GPS and unrelated photos, deleting a moment removes only its photo', () => {
  const current = trip('review', june, 12, { photos: [{ id: 'unrelated', uri: 'original' }, { id: 'owned', uri: 'moment' }] });
  const before = JSON.stringify(current);
  const patch = activityReviewPatch(current, {
    kind: 'bike', participants: ['a', 'b'], title: '  Family ride  ', feeling: 'relaxed', favorite: true,
    note: '  nice  ', moments: [{ id: 'new-moment', note: 'Break', routeIndex: 1, lat: 45.01, lng: 1.01,
      photo: { id: 'new-photo', uri: 'gallery', takenAt: june } }], originalPhotoIds: ['owned'],
  });
  assert.equal(patch.activityTitle, 'Family ride');
  assert.equal(patch.note, 'nice');
  assert.equal(patch.activityReview, 'completed');
  assert.deepEqual(Array.from(patch.photos, p => p.id), ['unrelated', 'new-photo']);
  assert.equal(patch.photos[1].routeIndex, 1);
  assert.equal(patch.activityMoments[0].photoId, 'new-photo');
  assert.equal(JSON.stringify(current), before);
  assert.ok(!('route' in patch) && !('distanceKm' in patch) && !('startTime' in patch));
});
test('skipping persists just the review status; strict writes expose missing trips and storage failures', async () => {
  const original = trip('skip', june, 8, { activityType: 'bike', activityReview: 'pending', walkParticipants: ['a', 'b'] });
  storage.set('@yoann2_trips', JSON.stringify([original]));
  await updateTrip('skip', { activityReview: 'skipped' }, true);
  const saved = (await getTrips())[0];
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), { ...original, activityReview: 'skipped' });
  await assert.rejects(updateTrip('missing', {}, true), /introuvable/);
  writeError = true;
  await assert.rejects(updateTrip('skip', { activityTitle: 'Lost' }, true), /disk full/);
  writeError = false;
  assert.equal((await getTrips())[0].activityTitle, undefined);
});
test('quick type selection persists only the type and keeps the picker open on write failure', async () => {
  const original = trip('quick-type', june, 8, {
    activityTitle: 'Family outing', note: 'A note', walkParticipants: ['a', 'b'],
    photos: [{ id: 'photo', uri: 'gallery', takenAt: june }],
    activityMoments: [{ id: 'moment', note: 'Break', photoId: 'photo', routeIndex: 1 }],
  });
  storage.set('@yoann2_trips', JSON.stringify([original]));
  // Exercise the screen's actual handler without mounting native map modules.
  const source = ts.createSourceFile('trip-map.tsx', fs.readFileSync(path.join(ROOT, 'app/trip-map.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function find(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'handlePickActivityType') handler = node;
    ts.forEachChild(node, find);
  }
  find(source);
  assert.ok(handler);
  const context = {
    trip: original, vehicles, isWalkTrip: true, activityTypeSavingRef: { current: false },
    open: true, busy: false, events: 0, alerts: [],
    activityForTrip, updateTrip,
    setTrip: updater => { context.trip = updater(context.trip); },
    setPickingActivity: value => { context.open = value; },
    setSavingActivityType: value => { context.busy = value; },
    tripEvents: { emitTripUpdated: () => { context.events++; } },
    Haptics: { selectionAsync: async () => {} },
    Alert: { alert: (...args) => { context.alerts.push(args); } },
  };
  const code = ts.transpileModule(handler.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, context);
  for (const kind of ['run', 'bike', 'kayak', 'walk']) {
    context.open = true;
    await context.handlePickActivityType(kind);
    assert.deepEqual(JSON.parse(JSON.stringify((await getTrips())[0])), { ...original, activityType: kind });
    assert.equal(context.trip.activityType, kind);
    assert.equal(context.open, false);
    assert.equal(context.busy, false);
  }
  assert.equal(context.events, 4);
  context.open = true;
  writeError = true;
  try { await context.handlePickActivityType('bike'); } finally { writeError = false; }
  assert.equal(context.open, true);
  assert.equal(context.trip.activityType, 'walk');
  assert.equal((await getTrips())[0].activityType, 'walk');
  assert.equal(context.alerts.length, 1);
  assert.equal(context.busy, false);
  assert.equal(context.activityTypeSavingRef.current, false);
  await context.handlePickActivityType('bike');
  assert.equal(context.trip.activityType, 'bike');
  assert.equal(context.open, false);
});
test('activity configuration survives manual-session reload', async () => {
  await saveManualTripState({
    active: true, paused: false, startTime: june, startLat: 45, startLon: 1,
    segments: [{ start: june }], tripMode: 'balade', activityType: 'kayak', walkParticipants: ['a', 'b'],
  });
  const state = await getManualTripState();
  assert.equal(state.activityType, 'kayak');
  assert.deepEqual(Array.from(state.walkParticipants), ['a', 'b']);
});
test('map payload is bounded, keeps real route indexes and escapes executable user content', () => {
  const route = Array.from({ length: 10000 }, (_, index) => ({ lat: 45 + index / 100000, lng: 1 }));
  const html = activityMapHtml([trip('map', june, 5, {
    route, activityMoments: [{ id: 'note', note: '</script><script>alert(1)</script>', lat: 45, lng: 1 }],
  })], vehicles, '#101010', true);
  const json = html.match(/var routes=(.*);var map=/)[1];
  assert.ok(!json.includes('</script>'));
  const routes = JSON.parse(json);
  assert.ok(routes[0].points.length <= 401);
  assert.equal(routes[0].points.at(-1).index, 9999);
  assert.equal(routes[0].moments[0].note, '</script><script>alert(1)</script>');
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(code));
});
