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
const { activityForTrip, filterActivities, activityMilestones } = load('utils/activities.ts');
const { activityReviewPatch } = load('utils/activityReview.ts');
const { activityMapHtml } = load('utils/activityMapHtml.ts');
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
