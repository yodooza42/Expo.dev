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

function box(type, data) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + data.length, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, data]);
}

function tiffWithDate(date = '2026:11:10 12:34:56') {
  const tiff = Buffer.alloc(46);
  tiff.write('II', 0, 2, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x0132, 10);
  tiff.writeUInt16LE(2, 12);
  tiff.writeUInt32LE(date.length + 1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt32LE(0, 22);
  tiff.write(date, 26, 'ascii');
  tiff[26 + date.length] = 0;
  return tiff;
}

function jpegWithExif(tiff) {
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const app1 = Buffer.alloc(4);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1.writeUInt16BE(exif.length + 2, 2);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x01, 0x02]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, exif, Buffer.from([0xff, 0xda]), Buffer.alloc(8192, 7)]);
}

function heifWithExif(tiff) {
  const ftypData = Buffer.concat([Buffer.from('heic'), Buffer.alloc(4), Buffer.from('mif1')]);
  const ftyp = box('ftyp', ftypData);
  const infePayload = Buffer.concat([
    Buffer.from([2, 0, 0, 0]), // infe version 2
    Buffer.from([0, 1, 0, 0]), // item ID 1, no protection
    Buffer.from('Exif', 'ascii'),
    Buffer.from('date\0', 'ascii'),
  ]);
  const infe = box('infe', infePayload);
  const iinf = box('iinf', Buffer.concat([Buffer.alloc(4), Buffer.from([0, 1]), infe]));
  const exifItem = Buffer.concat([Buffer.from([0, 0, 0, 6]), Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const imagePayload = Buffer.alloc(200 * 1024, 0x5a);
  const metaPayloadLength = 4 + iinf.length + (8 + 22);
  const mdatStart = ftyp.length + 8 + metaPayloadLength;
  const itemStart = mdatStart + 8 + imagePayload.length;
  const ilocPayload = Buffer.alloc(22);
  ilocPayload[0] = 0; // iloc version 0
  ilocPayload[4] = 0x44; // 4-byte extent offset and length
  ilocPayload[5] = 0; // no base offset
  ilocPayload.writeUInt16BE(1, 6); // one item
  ilocPayload.writeUInt16BE(1, 8); // item ID
  ilocPayload.writeUInt16BE(0, 10); // data reference
  ilocPayload.writeUInt16BE(1, 12); // one extent
  ilocPayload.writeUInt32BE(itemStart, 14);
  ilocPayload.writeUInt32BE(exifItem.length, 18);
  const iloc = box('iloc', ilocPayload);
  const meta = box('meta', Buffer.concat([Buffer.alloc(4), iinf, iloc]));
  const mdat = box('mdat', Buffer.concat([imagePayload, exifItem]));
  return { bytes: Buffer.concat([ftyp, meta, mdat]), imageStart: mdatStart + 8, imageEnd: itemStart };
}

function fileSystemFor(uri, bytes, ranges = []) {
  return {
    EncodingType: { Base64: 'base64' },
    getInfoAsync: async () => ({ exists: true, size: bytes.length }),
    readAsStringAsync: async (readUri, options) => {
      assert.equal(readUri, uri);
      ranges.push({ start: options.position, end: options.position + options.length });
      return bytes.subarray(options.position, options.position + options.length).toString('base64');
    },
  };
}

test('photo-date spread starts strictly after 24 hours and ignores missing dates', () => {
  const { hasSubtaskPhotoDateSpread, SUBTASK_PHOTO_GAP_MS } = load('utils/taskPhotoDates.ts', {
    '@/utils/photoReferences': { photoCandidates: async uri => [uri] },
    '@/utils/tripPhotoPlacement': { photoTakenAt: () => undefined },
    '@/utils/photoProtection': { protectedPhotoSource: async uri => uri },
    '@/utils/imageExifDate': { readImageExifDateFields: async () => undefined },
  });
  const t = 1_800_000_000_000;
  assert.equal(hasSubtaskPhotoDateSpread(['a', 'b'], { a: t, b: t + SUBTASK_PHOTO_GAP_MS }), false);
  assert.equal(hasSubtaskPhotoDateSpread(['a', 'b'], { a: t, b: t + SUBTASK_PHOTO_GAP_MS + 1 }), true);
  assert.equal(hasSubtaskPhotoDateSpread(['a', 'b', 'c'], { a: t, b: t + 10, c: NaN }), false);
  assert.equal(hasSubtaskPhotoDateSpread(['a'], { a: t }), false);
});

test('task photos sort by capture date and time, keeping unknown dates stable at the end', () => {
  const { sortTaskPhotosChronologically } = load('utils/taskPhotoDates.ts', {
    '@/utils/photoReferences': { photoCandidates: async uri => [uri] },
    '@/utils/tripPhotoPlacement': { photoTakenAt: () => undefined },
    '@/utils/photoProtection': { protectedPhotoSource: async uri => uri },
    '@/utils/imageExifDate': { readImageExifDateFields: async () => undefined },
  });
  assert.deepEqual(
    sortTaskPhotosChronologically(
      ['late', 'unknown-a', 'early', 'unknown-b', 'same-time'],
      { late: 1_800_000_000_200, early: 1_800_000_000_100, 'same-time': 1_800_000_000_100 },
    ),
    ['early', 'same-time', 'late', 'unknown-a', 'unknown-b'],
  );
});

test('reads only metadata ranges from JPEG and extracts its capture date', async () => {
  const uri = 'file:///vault/photo.jpg';
  const bytes = jpegWithExif(tiffWithDate());
  const ranges = [];
  const fs = fileSystemFor(uri, bytes, ranges);
  const { readImageExifDateFields } = load('utils/imageExifDate.ts', {
    'expo-file-system/legacy': fs,
  });
  const fields = await readImageExifDateFields(uri);
  assert.equal(fields.DateTime, '2026:11:10 12:34:56');
  assert.ok(ranges.every(range => range.end <= bytes.length - 8192), 'must stop before compressed image data');
  assert.ok(ranges.reduce((sum, range) => sum + range.end - range.start, 0) < 1024);
});

test('reads the HEIF Exif item by offset without reading image data', async () => {
  const uri = 'file:///vault/photo.heic';
  const { bytes, imageStart, imageEnd } = heifWithExif(tiffWithDate('2025:03:04 05:06:07'));
  const ranges = [];
  const fs = fileSystemFor(uri, bytes, ranges);
  const { readImageExifDateFields } = load('utils/imageExifDate.ts', {
    'expo-file-system/legacy': fs,
  });
  const fields = await readImageExifDateFields(uri);
  assert.equal(fields.DateTime, '2025:03:04 05:06:07');
  assert.ok(ranges.every(range => range.end <= imageStart || range.start >= imageEnd),
    'must skip unrelated media bytes and read only the Exif item');
  assert.ok(ranges.reduce((sum, range) => sum + range.end - range.start, 0) < 2048);
});

test('scans only the supplied task photos, reports missing dates, and keeps progress', async () => {
  const metadata = {
    'file:///vault/one.jpg': { DateTime: 'one' },
    'file:///vault/two.jpg': { DateTime: 'two' },
  };
  const { scanTaskPhotoDates } = load('utils/taskPhotoDates.ts', {
    '@/utils/photoReferences': { photoCandidates: async uri => [uri] },
    '@/utils/tripPhotoPlacement': { photoTakenAt: exif => exif?.DateTime === 'one' ? 100 : exif?.DateTime === 'two' ? 100 + 3 * 24 * 60 * 60 * 1000 : undefined },
    '@/utils/photoProtection': { protectedPhotoSource: async uri => uri },
    '@/utils/imageExifDate': { readImageExifDateFields: async uri => metadata[uri] },
  });
  const progress = [];
  const result = await scanTaskPhotoDates(['file:///vault/one.jpg', 'file:///vault/two.jpg'], message => progress.push(message));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    dates: { 'file:///vault/one.jpg': 100, 'file:///vault/two.jpg': 100 + 3 * 24 * 60 * 60 * 1000 },
    unmatched: 0, scanned: 2,
  });
  assert.deepEqual(progress, ['Lecture des métadonnées des photos 1/2…', 'Lecture des métadonnées des photos 2/2…']);
});

test('falls back to another protected copy if a task photo URI cannot be read', async () => {
  const reads = [];
  const { scanTaskPhotoDates } = load('utils/taskPhotoDates.ts', {
    '@/utils/photoReferences': { photoCandidates: async uri => [uri, 'file:///backup/photo.jpg'] },
    '@/utils/tripPhotoPlacement': { photoTakenAt: exif => exif?.DateTime === 'found' ? 1234 : undefined },
    '@/utils/photoProtection': { protectedPhotoSource: async uri => uri },
    '@/utils/imageExifDate': { readImageExifDateFields: async uri => {
      reads.push(uri);
      if (uri === 'file:///vault/photo.jpg') throw new Error('unavailable');
      return { DateTime: 'found' };
    } },
  });
  const result = await scanTaskPhotoDates(['file:///vault/photo.jpg']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    dates: { 'file:///vault/photo.jpg': 1234 }, unmatched: 0, scanned: 1,
  });
  assert.deepEqual(reads, ['file:///vault/photo.jpg', 'file:///backup/photo.jpg']);
});

test('returns unmatched when the supported image has no EXIF capture date', async () => {
  const { scanTaskPhotoDates } = load('utils/taskPhotoDates.ts', {
    '@/utils/photoReferences': { photoCandidates: async uri => [uri] },
    '@/utils/tripPhotoPlacement': { photoTakenAt: () => undefined },
    '@/utils/photoProtection': { protectedPhotoSource: async uri => uri },
    '@/utils/imageExifDate': { readImageExifDateFields: async () => undefined },
  });
  const result = await scanTaskPhotoDates(['file:///vault/large.jpg']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    dates: {}, unmatched: 1, scanned: 1,
  });
});
