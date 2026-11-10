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
    'expo-file-system/legacy': { EncodingType: { Base64: 'base64' }, readAsStringAsync: async () => '' },
    '@/utils/photoReferences': { photoCandidates: async uri => [uri] },
    '@/utils/tripPhotoPlacement': { photoTakenAt: () => undefined },
    '@/utils/photoProtection': { protectedPhotoSource: async uri => uri },
  });
  const t = 1_800_000_000_000;
  assert.equal(hasSubtaskPhotoDateSpread(['a', 'b'], { a: t, b: t + SUBTASK_PHOTO_GAP_MS }), false);
  assert.equal(hasSubtaskPhotoDateSpread(['a', 'b'], { a: t, b: t + SUBTASK_PHOTO_GAP_MS + 1 }), true);
  assert.equal(hasSubtaskPhotoDateSpread(['a', 'b', 'c'], { a: t, b: t + 10, c: NaN }), false);
  assert.equal(hasSubtaskPhotoDateSpread(['a'], { a: t }), false);
});

test('reads EXIF only from photos attached to the task, without querying the gallery', async () => {
  const fileReads = [];
  const exifInputs = [];
  const metadata = {
    'photo-one-bytes': { timestamp: 100 },
    'photo-two-bytes': { timestamp: 100 + 3 * 24 * 60 * 60 * 1000 },
  };
  const files = {
    EncodingType: { Base64: 'base64' },
    readAsStringAsync: async (uri, options) => {
      fileReads.push([uri, options]);
      return uri.endsWith('one.jpg') ? 'photo-one-bytes' : 'photo-two-bytes';
    },
  };
  const exifr = { parse: async (dataUri, options) => {
    exifInputs.push([dataUri, options]);
    const bytes = dataUri.split(',')[1];
    return metadata[bytes];
  } };
  const { scanTaskPhotoDates } = load('utils/taskPhotoDates.ts', {
    'exifr/dist/lite.esm.mjs': exifr,
    'expo-file-system/legacy': files,
    '@/utils/photoReferences': { photoCandidates: async uri => [uri] },
    '@/utils/tripPhotoPlacement': { photoTakenAt: exif => exif?.timestamp },
    '@/utils/photoProtection': { protectedPhotoSource: async uri => uri },
  });
  const progress = [];
  const result = await scanTaskPhotoDates(['file:///vault/one.jpg', 'file:///vault/two.jpg'], message => progress.push(message));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    dates: { 'file:///vault/one.jpg': 100, 'file:///vault/two.jpg': 100 + 3 * 24 * 60 * 60 * 1000 },
    unmatched: 0, scanned: 2,
  });
  assert.deepEqual(fileReads.map(([uri]) => uri), ['file:///vault/one.jpg', 'file:///vault/two.jpg']);
  assert.ok(fileReads.every(([, options]) => options.encoding === 'base64'));
  assert.ok(exifInputs.every(([dataUri]) => dataUri.startsWith('data:image/jpeg;base64,')));
  assert.deepEqual(progress, ['Lecture des métadonnées des photos 1/2…', 'Lecture des métadonnées des photos 2/2…']);
});

test('falls back to another protected copy if a task photo URI cannot be read', async () => {
  const reads = [];
  const { scanTaskPhotoDates } = load('utils/taskPhotoDates.ts', {
    'exifr/dist/lite.esm.mjs': { parse: async () => ({ timestamp: 1234 }) },
    'expo-file-system/legacy': {
      EncodingType: { Base64: 'base64' },
      readAsStringAsync: async uri => {
        reads.push(uri);
        if (uri === 'file:///vault/photo.jpg') throw new Error('unavailable');
        return 'protected-photo-bytes';
      },
    },
    '@/utils/photoReferences': { photoCandidates: async uri => [uri, 'file:///backup/photo.jpg'] },
    '@/utils/tripPhotoPlacement': { photoTakenAt: exif => exif?.timestamp },
    '@/utils/photoProtection': { protectedPhotoSource: async uri => uri },
  });
  const result = await scanTaskPhotoDates(['file:///vault/photo.jpg']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    dates: { 'file:///vault/photo.jpg': 1234 }, unmatched: 0, scanned: 1,
  });
  assert.deepEqual(reads, ['file:///vault/photo.jpg', 'file:///backup/photo.jpg']);
});
