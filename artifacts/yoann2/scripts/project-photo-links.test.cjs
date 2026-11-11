const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../utils/projectPhotoLinks.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports });
const { attachProjectPhotoReferences, getUnlinkedProjectPhotos, isSharedProjectPhoto } = moduleExports;

test('shows only project photos not already linked to the task', () => {
  assert.deepEqual(
    Array.from(getUnlinkedProjectPhotos(['file://one', 'file://two', 'file://one'], ['file://two'])),
    ['file://one'],
  );
});

test('associates existing project photo URIs without copying or duplicating them', () => {
  const result = attachProjectPhotoReferences(
    ['file://task-photo'],
    ['file://old-project-photo'],
    ['file://project-photo', 'file://project-photo'],
  );
  assert.deepEqual(Array.from(result.photos), ['file://task-photo', 'file://project-photo']);
  assert.deepEqual(Array.from(result.projectPhotoUris), ['file://old-project-photo', 'file://project-photo']);
});

test('removing a task association never deletes a photo still owned by its project', () => {
  assert.equal(isSharedProjectPhoto('file://shared', ['file://shared'], []), true);
  assert.equal(isSharedProjectPhoto('file://shared', [], ['file://shared']), true);
  assert.equal(isSharedProjectPhoto('file://task-only', [], ['file://shared']), false);
});
