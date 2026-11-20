const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../utils/storyPhoto.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

function loadStoryPhoto({ dimensions, deleted = [] }) {
  const exports = {};
  const calls = [];
  const mocks = {
    'expo-file-system/legacy': { deleteAsync: async uri => deleted.push(uri) },
    'expo-image-manipulator': {
      SaveFormat: { JPEG: 'jpeg' },
      manipulateAsync: async (...args) => {
        calls.push(args);
        return { uri: `${args[0]}?resized`, base64: 'aW1hZ2U=' };
      },
    },
    'react-native': {
      Image: { getSize: (_uri, onSuccess) => onSuccess(dimensions.width, dimensions.height) },
    },
    '@/utils/photoReferences': { photoCandidates: async uri => [uri] },
  };
  vm.runInNewContext(compiled, {
    exports, require: name => mocks[name], Date, Math, Number, Promise, setTimeout, clearTimeout,
  });
  return { ...exports, calls, deleted };
}

test('resizes 50MP photos to a 960px long edge while preserving aspect ratio', async () => {
  const module = loadStoryPhoto({ dimensions: { width: 8000, height: 6000 } });
  const image = await module.prepareStoryPhoto('file://original.jpg', () => true);
  assert.equal(image, 'data:image/jpeg;base64,aW1hZ2U=');
  assert.equal(module.calls[0][1].length, 1);
  assert.equal(module.calls[0][1][0].resize.width, 960);
  assert.equal(module.calls[0][1][0].resize.height, 720);
  assert.equal(module.calls[0][2].compress, 0.82);
  assert.deepEqual(module.deleted, ['file://original.jpg?resized']);
  assert.equal(module.getStoryPhotoDimensions(900, 600), null);
});
