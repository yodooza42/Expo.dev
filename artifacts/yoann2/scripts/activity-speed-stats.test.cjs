const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');

function loader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const mod = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(`(function(module,exports,require){${code}\n})(mod,mod.exports,require)`, {
      mod, require: name => {
        if (name in overrides) return overrides[name];
        if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
        throw new Error(`Unexpected dependency: ${name}`);
      },
    });
    cache.set(file, mod.exports);
    return mod.exports;
  }
  return load;
}
const statsModule = loader()('utils/activitySpeedStats.ts');
const { activitySpeedLimit, filterActivitySpeedPoints, activitySpeedStats } = statsModule;
const point = (time, metres, speedKmh = 0) => ({
  lat: 0, lng: metres / 111194.92664455874, timestamp: time, speedKmh,
});
function approx(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.001, `${actual} ~= ${expected}`);
}

test('the four user limits are exact, with a safe pre-selection limit', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(statsModule.ACTIVITY_MAX_SPEED_KMH)), {
    walk: 21, run: 40, bike: 75, kayak: 15,
  });
  assert.equal(activitySpeedLimit(), 75);
  assert.equal(activitySpeedLimit('unexpected'), 75);
  assert.equal(activitySpeedLimit('toString'), 75);
});

for (const [kind, limit] of Object.entries(statsModule.ACTIVITY_MAX_SPEED_KMH)) {
  test(`${kind}: retains speed at the limit and rejects excess speeds and coordinate jumps`, () => {
    const samples = [point(0, 0, 0), point(10_000, 1, limit), point(20_000, 2, limit + 1),
      point(30_000, 10000, 0), point(40_000, 3, 0), point(40_000, 3, 0)];
    const original = JSON.stringify(samples);
    const result = filterActivitySpeedPoints(samples, kind);
    assert.deepEqual(Array.from(result, p => p.timestamp), [0, 10000, 40000]);
    assert.equal(JSON.stringify(samples), original);
  });
}

test('movement average is distance/time, independent of irregular sample density', () => {
  // 10 s at 10 km/h, followed by 30 s at 20 km/h: 17.5 km/h,
  // not the arithmetic mean of three speed samples.
  const samples = [point(0, 0, 10), point(10_000, 100 / 3.6, 10),
    point(40_000, 700 / 3.6, 20)];
  const result = activitySpeedStats(samples, 'bike', 0, 40_000);
  approx(result.averageMovingKmh, 17.5);
  assert.equal(result.movingMs, 40_000);
  assert.equal(result.totalMs, 40_000);
  assert.equal(result.pauseMs, 0);
  assert.equal(result.unknownMs, 0);
  assert.equal(result.maxSpeed, 20);
});

test('separates movement, stationary time, and uncovered GPS duration', () => {
  const samples = [point(5000, 0, 0), point(20_000, 0, 0),
    point(35_000, 0, 0), point(50_000, 75, 18), point(65_000, 150, 18)];
  const result = activitySpeedStats(samples, 'bike', 0, 70_000);
  assert.equal(result.pauseMs, 30_000);
  assert.equal(result.movingMs, 30_000);
  assert.equal(result.unknownMs, 10_000);
  approx(result.averageMovingKmh, 18);
  assert.equal(result.totalMs, result.pauseMs + result.movingMs + result.unknownMs);
});

test('long GPS outages are not mistaken for pauses or movement', () => {
  const result = activitySpeedStats([point(0, 0, 10), point(600_000, 1000, 10)], 'bike', 0, 600_000);
  assert.equal(result.movingMs, 0);
  assert.equal(result.pauseMs, 0);
  assert.equal(result.unknownMs, 600_000);
  assert.equal(result.averageMovingKmh, 0);
});

test('explicit manual pauses are counted even without GPS, including overlapping active segments', () => {
  const result = activitySpeedStats([point(0, 0), point(15_000, 0),
    point(300_000, 0), point(315_000, 0)], 'walk', 0, 315_000, [
    { start: 0, end: 15_000 }, { start: 0, end: 10_000 }, { start: 300_000, end: 315_000 },
  ]);
  assert.equal(result.pauseMs, 315_000);
  assert.equal(result.unknownMs, 0);
  assert.equal(result.movingMs, 0);
});

test('GPS-only speed fallback, empty trips and duplicate timestamps stay finite', () => {
  const result = activitySpeedStats([point(0, 0, undefined), point(10_000, 50, undefined)]
    .map(({ speedKmh, ...p }) => p), 'bike', 0, 10_000);
  approx(result.maxSpeed, 18);
  approx(result.averageMovingKmh, 18);
  const empty = activitySpeedStats([], 'walk', 0, 0);
  assert.ok(Object.values(empty).every(Number.isFinite));
  assert.equal(activitySpeedStats([point(0, 0), point(0, 1)], 'walk', 0, 1000).unknownMs, 1000);
});

test('cycling peak is computed from full samples, not the drawing subset', () => {
  const samples = Array.from({ length: 1001 }, (_, i) => point(i * 1000, i * 5, i === 501 ? 38.1 : 18));
  assert.equal(activitySpeedStats(samples, 'bike', 0, 1_000_000).maxSpeed, 38.1);
  const source = fs.readFileSync(path.join(ROOT, 'app/trip-map.tsx'), 'utf8');
  assert.match(source, /setTripStatsPoints\(tripPoints\)/);
  assert.match(source, /activitySpeedStats\(statsPoints, activityKind/);
  assert.match(source, /activitySpeedStats\(tripStatsPoints, storyActivity/);
  for (const label of ['MOY · MOUVEMENT', 'En mouvement :', 'Pauses :', 'GPS incomplet']) assert.ok(source.includes(label));
});

test('native background task reads the activity on every batch, survives resume and leaves cars unchanged', async () => {
  const storage = new Map();
  let callback;
  const tracking = loader({
    '@react-native-async-storage/async-storage': {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => storage.set(key, value),
      getAllKeys: async () => [...storage.keys()],
      multiRemove: async keys => keys.forEach(key => storage.delete(key)),
    },
    'expo-location': {},
    'expo-task-manager': { defineTask: (_, fn) => { callback = fn; } },
    '@/utils/locationBackup': { autoBackup: async () => {} },
    '@/widgets/updateWidget': { updateTodoWidget: async () => {} },
  })('utils/locationTracking.ts');
  const now = Date.now();
  const run = async (kind, mode, speed, distance) => {
    storage.clear();
    storage.set(tracking.TRIP_MODE_KEY, mode);
    storage.set('@yoann2_manual_trip', JSON.stringify({
      active: true, paused: false, activityType: kind, startTime: now, segments: [{ start: now }],
    }));
    storage.set('@yoann2_last_valid_point', JSON.stringify(point(now, 0, 0)));
    await callback({ data: { locations: [{
      coords: { latitude: 0, longitude: distance / 111194.92664455874, speed: speed / 3.6, accuracy: 5 },
      timestamp: now + 10_000,
    }] } });
    return (await tracking.loadDayPoints(tracking.dateKey(new Date(now)))).length;
  };
  for (const [kind, limit] of Object.entries(statsModule.ACTIVITY_MAX_SPEED_KMH)) {
    assert.equal(await run(kind, 'balade', limit, 2), 1, kind);
    assert.equal(await run(kind, 'balade', limit + 0.01, 2), 0, kind);
    assert.equal(await run(kind, 'balade', 0, (limit + 1) / 3.6 * 10), 0, `${kind} coordinate jump`);
  }
  assert.equal(await run(undefined, 'balade', 38.1, 100), 1, 'before picker confirmation');
  assert.equal(await run('walk', 'voiture', 100, 250), 1);
  assert.equal(await run('walk', 'moto', 100, 250), 1);
});

test('stationary heartbeat stores pause samples without adding fictitious distance', async () => {
  const storage = new Map();
  let callback;
  const tracking = loader({
    '@react-native-async-storage/async-storage': {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => storage.set(key, value),
      getAllKeys: async () => [...storage.keys()],
      multiRemove: async () => {},
    },
    'expo-location': {},
    'expo-task-manager': { defineTask: (_, fn) => { callback = fn; } },
    '@/utils/locationBackup': { autoBackup: async () => {} },
    '@/widgets/updateWidget': { updateTodoWidget: async () => {} },
  })('utils/locationTracking.ts');
  const now = Date.now();
  storage.set(tracking.TRIP_MODE_KEY, 'balade');
  storage.set('@yoann2_manual_trip', JSON.stringify({
    active: true, paused: false, activityType: 'bike', startTime: now, segments: [{ start: now }],
  }));
  storage.set('@yoann2_last_valid_point', JSON.stringify(point(now, 0)));
  await callback({ data: { locations: [5, 15, 20, 30].map(seconds => ({
    coords: { latitude: 0, longitude: 0, speed: 0, accuracy: 5 },
    timestamp: now + seconds * 1000,
  })) } });
  assert.equal((await tracking.loadDayPoints(tracking.dateKey(new Date(now)))).length, 2);
  assert.equal(tracking.getTripDistKm(), 0);
});

for (const file of ['app/trip-map.tsx', 'app/(tabs)/map.native.tsx']) {
  test(`${file}: actual chart renders movement, pauses, max and total with and without a speed sensor`, () => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const names = ['TripSpeedChart', 'fmtChartDur', 'fmtAxisTime', 'formatPace', 'filterGpsOutliers'];
    const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
    assert.ok(functions.some(node => node.name.text === 'TripSpeedChart'));
    const compiled = ts.transpileModule(functions.map(node => node.getText(ast)).join('\n'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
    }).outputText;
    const render = (samples, activityKind = 'bike') => {
      const props = {
        points: samples, statsPoints: samples, color: '#2196F3',
        onScrub: () => {}, activityKind, startTime: 0, endTime: 60_000, isWalk: !!activityKind,
        activityTrip: { startTime: 0, endTime: 60_000 },
      };
      return vm.runInNewContext(`${compiled}; TripSpeedChart(props)`, {
        props, ...statsModule,
        haversineKm: loader()('utils/haversine.ts').haversineKm,
        React: { createElement: (type, attrs, ...children) => ({ type, attrs, children }) },
        useState: value => [value, () => {}], useMemo: fn => fn(), useCallback: fn => fn,
        useColors: () => ({ foreground: '#fff', mutedForeground: '#888', border: '#333' }),
        StyleSheet: { hairlineWidth: 1 },
        Dimensions: { get: () => ({ width: 402 }) },
        View: 'View', Text: 'Text', Pressable: 'Pressable',
        Svg: 'Svg', Defs: 'Defs', LinearGradient: 'LinearGradient', Stop: 'Stop', Path: 'Path',
        SvgLine: 'Line', Circle: 'Circle', SvgText: 'SvgText',
      });
    };
    const samples = [point(0, 0, 18), point(15_000, 75, 18),
      point(30_000, 150, 18), point(45_000, 150, 0), point(60_000, 150, 0)];
    const screen = render(samples);
    assert.ok(screen);
    const content = JSON.stringify(screen);
    assert.ok(content.includes('MOY · MOUVEMENT'));
    assert.ok(content.includes('En mouvement :'));
    assert.ok(content.includes('Pauses :'));
    assert.ok(content.includes('TOTAL'));
    assert.ok(content.includes('18.0'));
    assert.ok(!content.includes('NaN'));
    const withoutSensor = JSON.stringify(render(samples.map(({ speedKmh, ...p }) => p)));
    assert.ok(withoutSensor.includes('En mouvement :'));
    assert.ok(!withoutSensor.includes('NaN'));
    const car = JSON.stringify(render(samples, null));
    assert.ok(!car.includes('En mouvement :'), 'vehicle statistics keep their existing presentation');
  });
}
