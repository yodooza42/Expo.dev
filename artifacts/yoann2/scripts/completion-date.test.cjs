const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const dateExports = {};
vm.runInNewContext(compile(read('utils/completionDate.ts')), { exports: dateExports, Date });
const { formatCompletionDate, parseCompletionDate, completionDateError, resolveCompletionDate } = dateExports;
const now = new Date(2026, 10, 6, 23, 30);
const copy = value => JSON.parse(JSON.stringify(value));

test('completion is a strict local day; invalid and future dates are rejected', () => {
  assert.equal(formatCompletionDate(now), '06/11/2026');
  assert.equal(parseCompletionDate('31/02/2026'), null);
  assert.equal(parseCompletionDate('29/02/2025'), null);
  assert.ok(parseCompletionDate('29/02/2024'));
  assert.equal(completionDateError('06/11/2026', now), undefined);
  assert.ok(completionDateError('07/11/2026', now));
  assert.ok(completionDateError('2026-11-05', now));
  assert.equal(completionDateError('', now), undefined);
});

test('automatic completion, backdating, ordinary edits and reopening are distinct', () => {
  assert.equal(resolveCompletionDate({ status: 'todo' }, { status: 'done' }, now), '06/11/2026');
  assert.equal(resolveCompletionDate(undefined, { status: 'done' }, now), '06/11/2026');
  assert.equal(resolveCompletionDate({ status: 'todo' }, { status: 'done', completedAt: '15/10/2026' }, now), '15/10/2026');
  const done = { status: 'done', completedAt: '15/10/2026' };
  assert.equal(resolveCompletionDate(done, { status: 'done' }, now), done.completedAt);
  assert.equal(resolveCompletionDate(done, { completedAt: '10/10/2026' }, now), '10/10/2026');
  assert.equal(resolveCompletionDate(done, {}, now), done.completedAt);
  assert.equal(resolveCompletionDate(done, { status: 'todo' }, now), undefined);
  assert.equal(resolveCompletionDate({ status: 'done' }, {}, now), undefined, 'do not invent legacy completion dates');
  assert.equal(resolveCompletionDate(done, { completedAt: '31/02/2026' }, now), done.completedAt);
});

function contextHarness() {
  const source = read('contexts/AppContext.tsx');
  const ast = ts.createSourceFile('AppContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes = [];
  (function visit(node) { nodes.push(node); ts.forEachChild(node, visit); })(ast);
  const state = { projects: [], tasks: [], writes: new Map() };
  const sandbox = {
    resolveCompletionDate, Date,
    useCallback: fn => fn, genId: () => `id-${Math.random()}`,
    computeEisenhower: () => 'schedule', markDirty() {},
    STORAGE_KEYS: { PROJECTS: 'projects', TASKS: 'tasks' },
    AsyncStorage: { setItem: (key, value) => { state.writes.set(key, JSON.parse(value)); } },
    ensureTaskFolder: async () => {},
    projects: [],
    setProjects: fn => { state.projects = fn(state.projects); },
    setTasks: fn => { state.tasks = fn(state.tasks); },
  };
  const functions = {};
  for (const name of ['addProject', 'updateProject', 'addTask', 'updateTask']) {
    const declaration = nodes.find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === name);
    functions[name] = vm.runInNewContext(compile(`(() => { const fn = ${declaration.initializer.getText(ast)}; return fn; })();`), sandbox);
  }
  return { state, ...functions };
}

test('actual context writes preserve corrected project/task dates and recurrence creates only once', () => {
  const app = contextHarness();
  app.addProject({ name: 'Test', status: 'done', dueDate: '2026-07-01' });
  const id = app.state.projects[0].id;
  assert.equal(app.state.projects[0].completedAt, formatCompletionDate());
  app.updateProject(id, { completedAt: '05/04/2026' });
  app.updateProject(id, { name: 'Renamed', status: 'done' });
  assert.equal(app.state.writes.get('projects')[0].completedAt, '05/04/2026');
  assert.equal(app.state.projects[0].dueDate, '2026-07-01');
  app.updateProject(id, { status: 'inprogress' });
  assert.equal(app.state.projects[0].completedAt, undefined);
  app.updateProject(id, { status: 'done' });
  assert.equal(app.state.projects[0].completedAt, formatCompletionDate());

  app.addTask({ title: 'Recurring', status: 'todo', dueDate: '2026-07-01T00:00:00.000Z', recurrence: 'weekly' });
  const taskId = app.state.tasks[0].id;
  app.updateTask(taskId, { status: 'done' });
  assert.equal(app.state.tasks.length, 2);
  assert.equal(app.state.tasks[1].status, 'todo');
  assert.equal(app.state.tasks[1].completedAt, undefined);
  const nextDeadline = app.state.tasks[1].dueDate;
  app.updateTask(taskId, { status: 'done', completedAt: '05/04/2026' });
  app.updateTask(taskId, { notes: 'Corrected later' });
  assert.equal(app.state.tasks.length, 2);
  assert.equal(app.state.tasks[1].dueDate, nextDeadline);
  assert.equal(app.state.writes.get('tasks')[0].completedAt, '05/04/2026');
  assert.equal(app.state.tasks[0].dueDate, '2026-07-01T00:00:00.000Z');
  app.addTask({ title: 'Already done', status: 'done', dueDate: '2026-07-01' });
  assert.equal(app.state.tasks[2].completedAt, formatCompletionDate());
});

function formHarness(kind, existing) {
  const states = [];
  let cursor = 0;
  const saved = [];
  const elements = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
    },
    useMemo: fn => fn(),
  };
  const app = {
    projects: kind === 'project' && existing ? [existing] : [{ id: 'project', name: 'Project' }],
    tasks: kind === 'task' && existing ? [existing] : [],
    categories: [{ id: 'category', name: 'Maison' }],
    updateTask: (...args) => saved.push(args), updateProject: (...args) => saved.push(args),
    addTask: data => saved.push(['new', data]), addProject: data => saved.push(['new', data]),
  };
  const modules = {
    react,
    'react-native': {
      StyleSheet: { create: value => value }, Dimensions: { get: () => ({ width: 402 }) },
      Platform: { OS: 'web' }, View: 'View', Text: 'Text', TextInput: 'TextInput',
      Pressable: 'Pressable', ScrollView: 'ScrollView',
    },
    'expo-router': { useLocalSearchParams: () => existing ? { id: existing.id } : {}, useRouter: () => ({ back() {} }) },
    'expo-haptics': { notificationAsync() {}, NotificationFeedbackType: { Success: 'success' } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@expo/vector-icons': { MaterialCommunityIcons: 'Icon' },
    '@/contexts/AppContext': { useApp: () => app },
    '@/hooks/useColors': { useColors: () => ({}) },
    '@/components/SubPageHeader': { SubPageHeader: 'Header' },
    '@/components/CompletionDateField': { CompletionDateField: 'CompletionDateField' },
    '@/components/KeyboardAwareScrollViewCompat': { KeyboardAwareScrollViewCompat: 'KeyboardScroll' },
    '@/utils/completionDate': dateExports,
  };
  const exports = {};
  vm.runInNewContext(compile(read(`app/${kind}/new.tsx`)), {
    exports, require: name => modules[name] ?? {}, Date, console,
  });
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.type) elements.push(node);
    walk(node.props?.children); walk(node.props?.right);
  };
  const render = () => { cursor = 0; elements.length = 0; walk(exports.default()); };
  render();
  return {
    saved, render,
    field: () => elements.find(e => e.type === 'CompletionDateField'),
    save: () => elements.find(e => e.type === 'Header').props.right.props.onPress(),
    chooseDone: () => elements.find(e => e.type === 'Pressable'
      && e.props.children.some(c => c?.type === 'Text' && c.props.children.includes('Terminé'))).props.onPress(),
  };
}

for (const kind of ['project', 'task']) {
  const existing = {
    id: 'existing', name: 'Project', title: 'Task', status: 'done', completedAt: '15/10/2026',
    startDate: '2026-01-01T12:00:00.000Z', dueDate: '2026-07-01T12:00:00.000Z',
    photos: ['file://photo'], priority: 'medium', importance: 3, urgency: 3,
  };
  test(`${kind} editor submits the corrected date, retains deadline/photos and blocks invalid dates`, () => {
    const form = formHarness(kind, existing);
    assert.equal(form.field().props.value, '15/10/2026');
    form.field().props.onChange('31/02/2026'); form.render(); form.save(); form.render();
    assert.equal(form.saved.length, 0);
    assert.ok(form.field().props.error);
    form.field().props.onChange('05/04/2026'); form.render(); form.save();
    const data = copy(form.saved[0][1]);
    assert.equal(data.completedAt, '05/04/2026');
    assert.equal(data.dueDate.slice(0, 10), '2026-07-01');
    assert.deepEqual(data.photos, existing.photos);
  });
  test(`${kind} editor offers today only on a new completion`, () => {
    const form = formHarness(kind, { ...existing, status: 'todo', completedAt: undefined });
    assert.equal(form.field(), undefined);
    form.chooseDone(); form.render();
    assert.equal(form.field().props.value, formatCompletionDate());
  });
}

test('actual history grouping repositions projects and tasks by corrected date, not deadline or last edit', () => {
  const source = read('app/(tabs)/bureau.tsx');
  const ast = ts.createSourceFile('bureau.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes = [];
  (function visit(n) { nodes.push(n); ts.forEachChild(n, visit); })(ast);
  const group = nodes.find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'pastWeekGroups');
  const helpers = ast.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text !== 'DashboardScreen').map(n => n.getText(ast)).join('\n');
  const sandbox = {
    Date, parseCompletionDate, useMemo: fn => fn(), todayStart: new Date(2026, 10, 6),
    tasks: [{ id: 't', status: 'done', completedAt: '05/04/2026', dueDate: '2026-07-01' }],
    projects: [{ id: 'p', status: 'done', completedAt: '05/04/2026', updatedAt: '2026-11-06', dueDate: '2026-07-01' },
      { id: 'legacy', status: 'done', updatedAt: '2026-11-06', dueDate: '2026-07-01' }],
  };
  const run = () => copy(vm.runInNewContext(compile(`(() => { ${helpers}\nconst groups = ${group.initializer.getText(ast)}; return groups; })();`), sandbox));
  let groups = run();
  assert.equal(groups[0].days[0].dateKey, '2026-04-05');
  assert.equal(groups[0].days[0].tasks[0].id, 't');
  assert.equal(groups[0].days[0].projects[0].id, 'p');
  assert.equal(groups.at(-1).weekKey, 'no-date');
  assert.equal(groups.at(-1).days[0].projects[0].id, 'legacy');
  sandbox.projects[0].completedAt = '01/03/2026';
  groups = run();
  assert.equal(groups[0].days[0].dateKey, '2026-03-01');
  assert.equal(groups[1].days[0].dateKey, '2026-04-05');
});
