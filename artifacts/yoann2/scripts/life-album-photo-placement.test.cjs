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
      throw new Error(`Unexpected dependency in pure module test: ${name}`);
    },
  });
  return moduleExports;
}

const paths = loadTypeScript('utils/library/paths.ts');
const { collectReferences, expectedFolders } = loadTypeScript('utils/library/placement.ts', {
  '@/utils/library/paths': paths,
});

test('keeps album photos in the library inventory and in their album folder', () => {
  const album = {
    version: 1,
    profile: { name: '', birthDate: null, coverPhotoId: null },
    photos: [{ id: 'album-photo', uri: 'y2p:album-photo', addedAt: 1 }],
    memories: [{ id: 'memory', title: '', date: '2025-04-12', note: '', photoIds: ['album-photo'], createdAt: 1, updatedAt: 1 }],
  };
  const data = { projects: [], tasks: [], trips: [], album };
  const references = collectReferences(data);
  const folders = expectedFolders(data);

  assert.equal(references.ids.has('album-photo'), true);
  assert.equal(references.legacy.size, 0);
  assert.equal(folders.get('album-photo'), 'Photos/Album de vie');
});
