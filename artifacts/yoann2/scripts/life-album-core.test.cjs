const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../utils/lifeAlbumCore.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports, Date, Math });

const {
  albumAgeAt,
  albumDay,
  buildAlbumTimeline,
  chronologicalMemories,
  emptyLifeAlbum,
  isAlbumDate,
  isLifeAlbum,
  suggestedAlbumDate,
  unassignedAlbumPhotos,
} = moduleExports;

test('validates calendar dates instead of accepting impossible days', () => {
  assert.equal(isAlbumDate('2024-02-29'), true);
  assert.equal(isAlbumDate('2023-02-29'), false);
  assert.equal(isAlbumDate('2024-13-01'), false);
  assert.equal(isAlbumDate('2024-2-01'), false);
});

test('formats a timestamp as its local calendar day', () => {
  const timestamp = new Date(2025, 2, 9, 23, 30).getTime();
  assert.equal(albumDay(timestamp), '2025-03-09');
});

test('suggests the earliest known selected photo date and ignores undated photos', () => {
  const photos = [
    { id: 'later', takenAt: new Date(2025, 10, 20, 18).getTime() },
    { id: 'same-day', takenAt: new Date(2025, 10, 20, 9).getTime() },
    { id: 'older', takenAt: new Date(2025, 10, 19, 14).getTime() },
    { id: 'undated' },
  ];
  assert.equal(suggestedAlbumDate(['later', 'same-day'], photos), '2025-11-20');
  assert.equal(suggestedAlbumDate(['later', 'same-day', 'older', 'undated'], photos), '2025-11-19');
  assert.equal(suggestedAlbumDate(['undated'], photos), null);
});

test('calculates age by anniversary and handles events before birth', () => {
  assert.equal(albumAgeAt('2020-08-14', '2025-08-13'), '4 ans');
  assert.equal(albumAgeAt('2020-08-14', '2025-08-14'), '5 ans');
  assert.equal(albumAgeAt('2020-08-14', '2020-08-20'), '6 jours');
  assert.equal(albumAgeAt('2020-08-14', '2021-01-14'), '5 mois');
  assert.equal(albumAgeAt('2020-08-14', '2019-01-01'), null);
  assert.equal(albumAgeAt(null, '2025-01-01'), null);
});

test('orders memories by their event date without mutating the source list', () => {
  const newer = { id: 'later', date: '2024-07-12', createdAt: 1 };
  const older = { id: 'earlier', date: '2021-02-01', createdAt: 2 };
  const album = { memories: [newer, older] };
  assert.deepEqual(Array.from(chronologicalMemories(album), item => item.id), ['earlier', 'later']);
  assert.deepEqual(Array.from(album.memories, item => item.id), ['later', 'earlier']);
});

test('allows and places memories before birth ahead of the birth marker', () => {
  const prenatal = { id: 'echo', date: '2025-09-25', createdAt: 1 };
  const afterBirth = { id: 'first-steps', date: '2026-04-03', createdAt: 2 };
  const rows = buildAlbumTimeline([afterBirth, prenatal], '2026-01-14', '2026-11-19');
  assert.deepEqual(
    Array.from(rows, row => row.kind === 'memory' ? row.memory.id : row.kind),
    ['year', 'beforeBirth', 'echo', 'year', 'birth', 'first-steps', 'today'],
  );
});

test('returns photos not assigned to any memory to the sorting inbox', () => {
  const album = {
    photos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    memories: [{ photoIds: ['b', 'c'] }, { photoIds: ['c'] }],
  };
  assert.deepEqual(Array.from(unassignedAlbumPhotos(album), item => item.id), ['a']);
});

test('starts with an empty, valid album and rejects corrupted structures', () => {
  const album = emptyLifeAlbum();
  assert.equal(isLifeAlbum(album), true);
  assert.equal(isLifeAlbum({ ...album, profile: { ...album.profile, birthDate: '2023-02-29' } }), false);
  assert.equal(isLifeAlbum({ ...album, memories: [{ id: 'x', date: 'not-a-date' }] }), false);
});
