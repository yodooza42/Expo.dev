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
const {
  attachProjectPhotoReferences,
  buildProjectPhotoAssignmentUpdates,
  collectProjectPhotoUris,
  getUnlinkedProjectPhotos,
  isSharedProjectPhoto,
  subTaskPhotoAssignmentKey,
} = moduleExports;

test('collects album photos and photos attached to other tasks in the same project', () => {
  assert.deepEqual(
    Array.from(collectProjectPhotoUris(['file://album'], ['file://task', 'file://album'])),
    ['file://album', 'file://task'],
  );
});

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

test('distributes project photos across subtasks and adds shared references to each parent task', () => {
  const tasks = [
    {
      id: 'task-1', photos: ['file://owned'], projectPhotoUris: [], subTaskPhotosReviewed: false,
      subTasks: [
        { id: 'sub-a', title: 'Chaussures', done: false, photoUris: ['file://owned'] },
        { id: 'sub-b', title: 'Aquarium', done: false, photoUris: [] },
      ],
    },
    {
      id: 'task-2', photos: [], subTasks: [
        { id: 'sub-c', title: 'Banquette', done: false, photoUris: [] },
      ],
    },
  ];
  const assignments = {
    'file://project-a': subTaskPhotoAssignmentKey('task-1', 'sub-a'),
    'file://project-b': subTaskPhotoAssignmentKey('task-1', 'sub-b'),
    'file://project-c': subTaskPhotoAssignmentKey('task-2', 'sub-c'),
  };

  const updates = buildProjectPhotoAssignmentUpdates(tasks, Object.keys(assignments), assignments);
  assert.equal(updates.length, 2);
  const first = updates.find(item => item.id === 'task-1').updates;
  assert.deepEqual(Array.from(first.photos), ['file://owned', 'file://project-a', 'file://project-b']);
  assert.deepEqual(Array.from(first.projectPhotoUris), ['file://project-a', 'file://project-b']);
  assert.deepEqual(Array.from(first.subTasks[0].photoUris), ['file://owned', 'file://project-a']);
  assert.deepEqual(Array.from(first.subTasks[1].photoUris), ['file://project-b']);
  assert.equal(first.subTaskPhotosReviewed, undefined);

  const second = updates.find(item => item.id === 'task-2').updates;
  assert.deepEqual(Array.from(second.photos), ['file://project-c']);
  assert.deepEqual(Array.from(second.projectPhotoUris), ['file://project-c']);
  assert.deepEqual(Array.from(second.subTasks[0].photoUris), ['file://project-c']);
});

test('clearing a project photo assignment preserves task-owned photos and other references', () => {
  const tasks = [{
    id: 'task-1',
    photos: ['file://owned', 'file://project'],
    projectPhotoUris: ['file://project', 'file://other-project'],
    subTaskPhotosReviewed: true,
    subTasks: [
      { id: 'sub-a', title: 'A', done: false, photoUris: ['file://owned', 'file://project'] },
      { id: 'sub-b', title: 'B', done: false, photoUris: [] },
    ],
  }];

  const updates = buildProjectPhotoAssignmentUpdates(tasks, ['file://project'], {});
  assert.equal(updates.length, 1);
  const result = updates[0].updates;
  assert.deepEqual(Array.from(result.photos), ['file://owned', 'file://project']);
  assert.deepEqual(Array.from(result.projectPhotoUris), ['file://project', 'file://other-project']);
  assert.deepEqual(Array.from(result.subTasks[0].photoUris), ['file://owned']);
});

test('does not change tasks without subtasks or photos assigned to unknown subtasks', () => {
  const tasks = [
    { id: 'task-1', photos: [], subTasks: undefined },
    { id: 'task-2', photos: [], subTasks: [{ id: 'sub-a', title: 'A', done: false, photoUris: [] }], subTaskPhotosReviewed: true },
  ];
  assert.equal(
    buildProjectPhotoAssignmentUpdates(tasks, ['file://project'], { 'file://project': 'missing:subtask' }).length,
    0,
  );
});
