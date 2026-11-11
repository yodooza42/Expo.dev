const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../utils/annaStorage.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const values = new Map();
const storage = {
  async getItem(key) { return values.get(key) ?? null; },
  async setItem(key, value) { values.set(key, value); },
};
const moduleExports = {};
const plain = value => JSON.parse(JSON.stringify(value));
vm.runInNewContext(js, {
  exports: moduleExports,
  require: name => {
    if (name === '@react-native-async-storage/async-storage') return { default: storage, ...storage };
    throw new Error(`Unexpected module: ${name}`);
  },
  Date, Error, Object, JSON, RegExp,
});

test('Anna nanny days are saved, toggled off and kept independent by date', async () => {
  values.clear();
  assert.deepEqual(plain(await moduleExports.loadAnnaPlanning()), {});
  assert.deepEqual(plain(await moduleExports.toggleAnnaDay('2026-11-06', true)), { '2026-11-06': true });
  assert.deepEqual(plain(await moduleExports.toggleAnnaDay('2026-11-08', true)), {
    '2026-11-06': true, '2026-11-08': true,
  });
  assert.deepEqual(plain(await moduleExports.toggleAnnaDay('2026-11-06', false)), { '2026-11-08': true });
  assert.deepEqual(plain(await moduleExports.loadAnnaPlanning()), { '2026-11-08': true });
});

test('Anna nanny day loading ignores malformed and impossible calendar dates', async () => {
  values.clear();
  values.set('@anna_nanny_days_v1', JSON.stringify({
    '2026-02-28': true,
    '2026-02-30': true,
    '2026-11-11': false,
    nope: true,
  }));
  assert.deepEqual(plain(await moduleExports.loadAnnaPlanning()), { '2026-02-28': true });
  await assert.rejects(moduleExports.toggleAnnaDay('2026-02-30', true), /Date de planning invalide/);
});
