const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(file, dependencies = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(js, { exports, require: name => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}

const { buildBureauHistoryRows } = load('utils/bureauHistoryRows.ts');
const copy = value => JSON.parse(JSON.stringify(value));
const task = { id: 't1', photos: ['original-1', 'original-2'], title: 'Travaux' };
const subTask = { id: 's1', title: 'Préparation', done: true };
const project = { id: 'p1', name: 'Projet' };
const appointment = { id: 'a1', title: 'Rendez-vous' };
const day = { dateKey: '2026-11-01', label: 'Dimanche', date: new Date(2026, 10, 1),
  tasks: [task], subTasks: [{ task, subTask }], projects: [project] };
const weeks = [{ weekKey: '2026-10-26', label: 'Semaine 44', days: [day] }];
const appointments = new Map([[day.dateKey, [appointment]]]);

test('history preserves week/day labels, card order and original data references', () => {
  const before = JSON.stringify(weeks);
  const rows = buildBureauHistoryRows(weeks, true, appointments);
  assert.deepEqual(copy(rows.map(row => row.kind)), ['week', 'day', 'task', 'subtask', 'project', 'appointment']);
  assert.equal(rows[0].label, weeks[0].label);
  assert.equal(rows[1].label, day.label);
  assert.equal(rows[2].task, task);
  assert.equal(rows[3].subTask, subTask);
  assert.equal(rows[4].project, project);
  assert.equal(rows[5].appointment, appointment);
  assert.equal(JSON.stringify(weeks), before);
});

test('appointments remain optional, undated history remains accessible and keys are stable', () => {
  const noDate = { weekKey: 'no-date', label: 'Sans date', days: [
    { ...day, dateKey: 'no-date', label: 'Terminés sans date connue', subTasks: [] },
  ] };
  const rows = buildBureauHistoryRows([...weeks, noDate], false, appointments);
  assert.equal(rows.some(row => row.kind === 'appointment'), false);
  assert.ok(rows.some(row => row.label === 'Terminés sans date connue'));
  assert.equal(new Set(rows.map(row => row.key)).size, rows.length);
  assert.deepEqual(copy(rows.map(row => row.key)),
    copy(buildBureauHistoryRows([...weeks, noDate], false, appointments).map(row => row.key)));
  assert.equal(buildBureauHistoryRows([], false, appointments).length, 0);
});

test('a large single-day history is split into individual virtualizable cards, not one huge image row', () => {
  const tasks = Array.from({ length: 500 }, (_, i) => ({ ...task, id: `t${i}`, photos: Array(100).fill(`photo-${i}`) }));
  const rows = buildBureauHistoryRows([{ ...weeks[0], days: [{ ...day, tasks, subTasks: [], projects: [] }] }], false, appointments);
  assert.equal(rows.length, 502);
  assert.equal(rows.filter(row => row.kind === 'task').length, 500);
  assert.equal(rows[2].task.photos, tasks[0].photos, 'do not read, transform or copy photo files to build the timeline');
});

const jsx = (type, props) => ({ type, props });
const { TaskPhotoStrip } = load('components/TaskPhotoStrip.tsx', {
  react: { memo: component => component },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { FlatList: 'FlatList', Pressable: 'Pressable', StyleSheet: { create: value => value } },
  'expo-image': { Image: 'Image' },
});

test('photo strips bound mounted thumbnails and open the untouched original album at the selected index', () => {
  const uris = Array.from({ length: 100 }, (_, i) => `file://original-${i}.jpg`);
  let opened, stopped = false;
  const list = TaskPhotoStrip({ uris, size: 110, onOpen: (photos, index) => { opened = { photos, index }; } });
  assert.equal(list.type, 'FlatList');
  assert.equal(list.props.data, uris);
  assert.equal(list.props.horizontal, true);
  assert.equal(list.props.initialNumToRender, 3);
  assert.equal(list.props.maxToRenderPerBatch, 3);
  assert.equal(list.props.windowSize, 3);
  assert.equal(list.props.getItemLayout(null, 25).offset, 25 * 116);
  const pressable = list.props.renderItem({ item: uris[25], index: 25 });
  const image = pressable.props.children;
  assert.equal(image.props.source.uri, uris[25]);
  assert.equal(image.props.recyclingKey, uris[25]);
  assert.equal(image.props.allowDownscaling, true);
  assert.equal(image.props.transition, 0);
  pressable.props.onPress({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true, 'opening a photo must not also open the underlying task');
  assert.equal(opened.photos, uris);
  assert.equal(opened.index, 25);
  assert.equal(TaskPhotoStrip({ uris: [], size: 110, onOpen() {} }).props.scrollEnabled, false);
});
