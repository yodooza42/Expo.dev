const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
function load(file, deps) {
  const exports = {};
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    require: name => {
      if (name in deps) return deps[name];
      throw new Error(`Unexpected ${name}`);
    },
    Date, Error, Math, Number, Promise, Set, Map,
  });
  return exports;
}

test('photo-date spread starts strictly after 24 hours and ignores missing dates', () => {
  const { hasSubtaskPhotoDateSpread, SUBTASK_PHOTO_GAP_MS } = load('utils/taskPhotoDates.ts', {
    'expo-media-library': {}, 'react-native': { Platform: { OS: 'android' } },
    '@/utils/photoReferences': { photoFilename: () => '' },
    '@/utils/tripPhotoPlacement': { photoTakenAt: () => undefined },
    '@/utils/photoProtection': { protectedPhotoSource: async uri => uri },
  });
  const t = 1_800_000_000_000;
  assert.equal(hasSubtaskPhotoDateSpread(['a', 'b'], { a: t, b: t + SUBTASK_PHOTO_GAP_MS }), false);
  assert.equal(hasSubtaskPhotoDateSpread(['a', 'b'], { a: t, b: t + SUBTASK_PHOTO_GAP_MS + 1 }), true);
  assert.equal(hasSubtaskPhotoDateSpread(['a', 'b', 'c'], { a: t, b: t + 10, c: NaN }), false);
  assert.equal(hasSubtaskPhotoDateSpread(['a'], { a: t }), false);
});

test('local gallery scan uses exact URI or a unique filename and leaves ambiguous matches unresolved', async () => {
  const originals = {
    exact: 'content://camera/exact.jpg',
    unique: 'file:///old-copy/unique.jpg',
    ambiguous: 'file:///old-copy/duplicate.jpg',
  };
  const assets = [
    { id: 'a1', uri: originals.exact, filename: 'exact.jpg', creationTime: 100 },
    { id: 'a2', uri: 'content://camera/unique.jpg', filename: 'unique.jpg', creationTime: 200 },
    { id: 'a3', uri: 'content://camera/duplicate-a.jpg', filename: 'duplicate.jpg', creationTime: 300 },
    { id: 'a4', uri: 'content://camera/duplicate-b.jpg', filename: 'duplicate.jpg', creationTime: 400 },
  ];
  const calls = [];
  const media = {
    SortBy: { creationTime: 'creationTime' },
    requestPermissionsAsync: async () => ({ granted: true }),
    getAssetsAsync: async options => {
      calls.push(['page', options]);
      return { assets, hasNextPage: false, endCursor: 'done' };
    },
    getAssetInfoAsync: async (id, options) => {
      calls.push(['info', id, options]);
      return { creationTime: assets.find(asset => asset.id === id).creationTime };
    },
  };
  const { scanTaskPhotoDates } = load('utils/taskPhotoDates.ts', {
    'expo-media-library': media,
    'react-native': { Platform: { OS: 'android' } },
    '@/utils/photoReferences': { photoFilename: uri => uri.split('/').pop() },
    '@/utils/tripPhotoPlacement': { photoTakenAt: (_exif, time) => time },
    '@/utils/photoProtection': { protectedPhotoSource: async uri => originals[uri] },
  });
  const result = await scanTaskPhotoDates(['exact', 'unique', 'ambiguous']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    dates: { exact: 100, unique: 200 }, unmatched: 1, scanned: 4, limited: false,
  });
  assert.ok(calls.filter(call => call[0] === 'info').every(call => call[2].shouldDownloadFromNetwork === false));
});

test('gallery scan requires an explicit local photo permission and never falls back to network', async () => {
  let permissionRequested = false;
  const media = {
    SortBy: { creationTime: 'creationTime' },
    requestPermissionsAsync: async () => { permissionRequested = true; return { granted: false }; },
    getAssetsAsync: async () => { throw new Error('must not scan without permission'); },
  };
  const { scanTaskPhotoDates } = load('utils/taskPhotoDates.ts', {
    'expo-media-library': media, 'react-native': { Platform: { OS: 'android' } },
    '@/utils/photoReferences': { photoFilename: () => 'x.jpg' },
    '@/utils/tripPhotoPlacement': { photoTakenAt: () => undefined },
    '@/utils/photoProtection': { protectedPhotoSource: async uri => uri },
  });
  await assert.rejects(scanTaskPhotoDates(['photo']), /Autorise l’accès aux photos/);
  assert.equal(permissionRequested, true);
});
