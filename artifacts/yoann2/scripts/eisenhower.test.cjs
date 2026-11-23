const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../utils/eisenhower.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports });

const {
  eisenhowerFromLevels,
  eisenhowerFromScores,
  eisenhowerScoreFromLevel,
  normalizeTaskEisenhower,
} = moduleExports;

test('classifies every Eisenhower quadrant consistently on the three-level form scale', () => {
  assert.equal(eisenhowerFromLevels(3, 3), 'do_now');
  assert.equal(eisenhowerFromLevels(1, 3), 'schedule');
  assert.equal(eisenhowerFromLevels(3, 1), 'delegate');
  assert.equal(eisenhowerFromLevels(1, 1), 'eliminate');
});

test('saved low importance and medium urgency remain delegate, not do now', () => {
  assert.equal(eisenhowerScoreFromLevel(1), 2);
  assert.equal(eisenhowerScoreFromLevel(2), 3);
  assert.equal(eisenhowerScoreFromLevel(3), 5);
  assert.equal(eisenhowerFromScores(3, 2), 'delegate');
  assert.equal(eisenhowerFromScores(3, 3), 'do_now');
  assert.equal(eisenhowerFromScores(2, 3), 'schedule');
  assert.equal(eisenhowerFromScores(2, 2), 'eliminate');
});

test('normalizes stale stored quadrants without changing the task ratings', () => {
  const task = { id: 'curtains', urgency: 3, importance: 2, eisenhower: 'do_now' };
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalizeTaskEisenhower(task))),
    { ...task, eisenhower: 'delegate' },
  );
  assert.equal(task.eisenhower, 'do_now');
});
