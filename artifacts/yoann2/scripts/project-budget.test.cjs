const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../utils/money.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports, Intl, Math });
const { fmtEuro, sumEuroAmounts } = moduleExports;

test('formats money with two French decimal places, including floating-point artifacts', () => {
  assert.equal(fmtEuro(383.98), '383,98\u00a0€');
  assert.equal(fmtEuro(116.01999999999998), '116,02\u00a0€');
  assert.equal(fmtEuro(1234.5), '1\u00a0234,50\u00a0€');
  assert.equal(fmtEuro(0), '0,00\u00a0€');
});

test('adds monetary amounts in cents instead of accumulating binary fractions', () => {
  assert.equal(sumEuroAmounts([{ amount: 0.1 }, { amount: 0.2 }]), 0.3);
});
