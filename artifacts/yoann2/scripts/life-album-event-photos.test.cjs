const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScript(relativePath, mockedModules = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const moduleExports = {};
  vm.runInNewContext(compiled, {
    exports: moduleExports,
    require: name => {
      if (Object.hasOwn(mockedModules, name)) return mockedModules[name];
      throw new Error(`Unexpected dependency in album event photo test: ${name}`);
    },
  });
  return moduleExports;
}

test('imports selected gallery assets into the album folder with capture dates and unique photo references', async () => {
  const calls = [];
  const ref = id => `y2p:${id}`;
  const { importAlbumPhotoItems } = loadTypeScript('utils/lifeAlbum.ts', {
    '@react-native-async-storage/async-storage': { default: {} },
    'expo-image-picker': {},
    '@/utils/library/importPhoto': {
      importPhotos: async (items, folder) => {
        calls.push({ items, folder });
        return {
          imported: [
            { ref: ref('same'), takenAt: 1799010000000 },
            { ref: ref('same'), takenAt: 1799010000000 },
            { ref: ref('second'), takenAt: 1799013600000 },
          ],
          failed: ['One photo could not be read'],
        };
      },
    },
    '@/utils/library/paths': {
      isLibraryRef: value => value.startsWith('y2p:'),
      refId: value => value.slice(4),
    },
    '@/utils/lifeAlbumCore': {
      isLifeAlbum: () => true,
      emptyLifeAlbum: () => ({}),
    },
  });

  const inputs = [
    { uri: 'content://gallery/one', takenAt: 1799010000000, originalName: 'one.jpg' },
    { uri: 'content://gallery/two', takenAt: 1799013600000, originalName: 'two.jpg' },
  ];
  const result = await importAlbumPhotoItems(inputs);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].folder, 'Photos/Album de vie');
  assert.deepEqual(calls[0].items, inputs);
  assert.deepEqual(result.failed, ['One photo could not be read']);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.photos.map(photo => ({ id: photo.id, uri: photo.uri, takenAt: photo.takenAt })))),
    [
      { id: 'same', uri: 'y2p:same', takenAt: 1799010000000 },
      { id: 'second', uri: 'y2p:second', takenAt: 1799013600000 },
    ],
  );
});

test('the event editor filters the native gallery by its date and attaches chosen photos to that event', () => {
  const screen = fs.readFileSync(path.join(__dirname, '..', 'app/life-album.tsx'), 'utf8');
  assert.match(screen, /referenceDate=\{memoryGalleryDate\}/);
  assert.match(screen, /onAddAssets=\{addGalleryPhotosToMemory\}/);
  assert.match(screen, /takenAt: asset\.creationTime/);
  assert.match(screen, /photoIds: chronologicalAlbumPhotoIds/);
  assert.match(screen, /photoCaptions,/);
  assert.match(screen, /life-memory-photo-caption-/);
});
