const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../utils/completionPrompts.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports });
const { getCompletionPrompts, getUndismissedCompletionPrompts } = moduleExports;

const project = { id: 'p1', name: 'Cuisine', status: 'todo' };
const makeTask = (overrides = {}) => ({
  id: 't1', projectId: 'p1', title: 'Peinture', status: 'todo',
  subTasks: [
    { id: 's1', title: 'Préparer', done: true, completedAt: '01/01/2026' },
    { id: 's2', title: 'Peindre', done: true, completedAt: '20/02/2026' },
  ],
  ...overrides,
});

test('offers task completion only when every non-empty subtask is done', () => {
  const prompts = getCompletionPrompts([project], [makeTask()]);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].kind, 'task');
  assert.equal(prompts[0].title, 'Peinture');
  assert.equal(prompts[0].childCount, 2);
  assert.equal(getCompletionPrompts([project], [makeTask({ subTasks: [] })]).length, 0);
  assert.equal(getCompletionPrompts([project], [makeTask({ subTasks: [{ id: 's1', done: false }] })]).length, 0);
  assert.equal(getCompletionPrompts([project], [makeTask({ status: 'done' })]).some(prompt => prompt.kind === 'task'), false);
  assert.equal(getCompletionPrompts([{ ...project, archived: true }], [makeTask()]).length, 0);
});

test('offers project completion only when its non-empty task list is fully done', () => {
  const first = makeTask({ status: 'done', completedAt: '20/02/2026' });
  const second = { id: 't2', projectId: 'p1', title: 'Plomberie', status: 'done', completedAt: '21/02/2026' };
  const prompts = getCompletionPrompts([project], [first, second]);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].kind, 'project');
  assert.equal(prompts[0].childCount, 2);
  assert.equal(getCompletionPrompts([project], [first, { ...second, status: 'todo' }]).length, 0);
  assert.equal(getCompletionPrompts([project], []).length, 0);
  assert.equal(getCompletionPrompts([{ ...project, archived: true }], [first, second]).length, 0);
});

test('a dismissal is retained for the same child state and returns after a meaningful change', () => {
  const original = getCompletionPrompts([project], [makeTask()])[0];
  assert.equal(getUndismissedCompletionPrompts([original], { [original.id]: original.signature }).length, 0);
  const changed = getCompletionPrompts([project], [makeTask({
    subTasks: [
      { id: 's1', title: 'Préparer', done: true, completedAt: '02/01/2026' },
      { id: 's2', title: 'Peindre', done: true, completedAt: '20/02/2026' },
    ],
  })])[0];
  assert.notEqual(changed.signature, original.signature);
  assert.equal(getUndismissedCompletionPrompts([changed], { [changed.id]: original.signature }).length, 1);
});
