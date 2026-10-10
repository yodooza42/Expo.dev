const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'utils/storyPlaybackTimeline.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const testModule = { exports: {} };
vm.runInNewContext(`(function(module,exports){${compiled}\n})(testModule,testModule.exports);`, {
  testModule,
  exports: testModule.exports,
});
const { buildStoryPlaybackTimeline, compressStoryStationaryTime } = testModule.exports;
const storySource = fs.readFileSync(path.join(ROOT, 'utils/storyGenerator.ts'), 'utf8');
const storyCompiled = ts.transpileModule(storySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const storyModule = { exports: {} };
vm.runInNewContext(`(function(module,exports){${storyCompiled}\n})(storyModule,storyModule.exports);`, {
  storyModule,
  exports: storyModule.exports,
});

test('compresses a long stationary interval only on the story timeline', () => {
  const points = [
    { ms: 0, km: 0, spd: 8 },
    { ms: 60_000, km: 0.2, spd: 8 },
    { ms: 7 * 60_000, km: 0.2, spd: 0 },
    { ms: 27 * 60_000, km: 0.2, spd: 0 },
    { ms: 28 * 60_000, km: 0.4, spd: 8 },
  ];

  const result = compressStoryStationaryTime(points);

  assert.equal(result[2].ms, points[2].ms);
  assert.equal(result[2].km, points[2].km);
  assert.ok(Math.abs(result[2].storyMs - (60_000 + 2_200 * 6 / 26)) < 1);
  assert.equal(result[3].storyMs, 62_200);
  assert.equal(result[4].storyMs, 122_200);
  assert.equal(points[3].ms, 27 * 60_000, 'the source trip data is not mutated');

  const timeline = buildStoryPlaybackTimeline(points);
  assert.equal(timeline.pauses.length, 1);
  assert.equal(timeline.pauses[0].durationMs, 26 * 60_000);
  assert.equal(timeline.pauses[0].storyStartMs, 60_000);
  assert.equal(timeline.pauses[0].storyEndMs, 62_200);
});

test('leaves short stops and moving intervals at their real pace', () => {
  const shortStop = [
    { ms: 0, km: 0 },
    { ms: 60_000, km: 0.1 },
    { ms: 3 * 60_000, km: 0.1 },
    { ms: 4 * 60_000, km: 0.2 },
  ];
  const slowMovement = [
    { ms: 0, km: 0 },
    { ms: 10 * 60_000, km: 0.5 },
    { ms: 20 * 60_000, km: 1 },
  ];

  assert.deepEqual(
    compressStoryStationaryTime(shortStop).map(point => point.storyMs),
    shortStop.map(point => point.ms),
  );
  assert.deepEqual(
    compressStoryStationaryTime(slowMovement).map(point => point.storyMs),
    slowMovement.map(point => point.ms),
  );
});

test('story renderer script remains valid JavaScript for the WebView', () => {
  assert.doesNotThrow(() => new Function(storyModule.exports.STORY_GENERATE_JS));
});
