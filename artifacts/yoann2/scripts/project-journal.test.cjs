const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
function load(file, deps = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(js, { exports, require: name => {
    if (name in deps) return deps[name];
    throw new Error(`Unexpected ${name}`);
  }, Date, Error, setTimeout, clearTimeout });
  return exports;
}
const dates = load('utils/completionDate.ts');
const journal = load('utils/projectJournal.ts', { '@/utils/completionDate': dates });
const renderer = load('utils/projectJournalRenderer.ts');
const clone = value => JSON.parse(JSON.stringify(value));
const projects = [
  { id: 'p1', name: 'Garage', status: 'done', completedAt: '06/04/2026', photos: ['file://p'], description: 'Projet achevé' },
  { id: 'p2', name: 'Maison', status: 'inprogress', photos: ['file://uncompleted-project'], description: '' },
];
const tasks = [
  { id: 'later', projectId: 'p1', title: 'Finition', status: 'done', completedAt: '05/04/2026', dueDate: '2026-08-01', notes: 'Note originale', photos: ['file://a', 'file://b'] },
  { id: 'earlier', projectId: 'p2', title: 'Préparer', status: 'done', completedAt: '02/04/2026', dueDate: '2026-09-01', notes: '', photos: [] },
  { id: 'unknown', projectId: 'p2', title: 'Date inconnue', status: 'done', photos: ['file://unknown'] },
  { id: 'todo', projectId: 'p2', title: 'À venir', status: 'todo', completedAt: '01/04/2026', photos: [] },
];
const choices = () => ({ ...journal.initialJournalChoices(projects), from: '2026-04-01', to: '2026-04-30', projectIds: ['p1', 'p2'] });

test('multiple projects and inclusive local completion dates produce chronological tasks and project milestones', () => {
  const before = JSON.stringify({ projects, tasks });
  const output = journal.buildProjectJournal(projects, tasks, choices());
  assert.deepEqual(clone(output.entries.map(e => e.id)), ['task:earlier', 'task:later', 'project:p1']);
  assert.equal(output.photoCount, 3);
  assert.equal(output.undated.length, 1);
  assert.equal(output.undated[0].id, 'unknown');
  assert.equal(output.undated[0].photoCount, 1);
  assert.equal(output.undatedPhotos, 1);
  assert.equal(output.availablePhotos, 3);
  assert.equal(output.excludedPhotos, 0);
  assert.equal(output.error, '');
  assert.equal(JSON.stringify({ projects, tasks }), before);
  const oneDay = journal.buildProjectJournal(projects, tasks, { ...choices(), from: '2026-04-05', to: '2026-04-05' });
  assert.deepEqual(clone(oneDay.entries.map(e => e.id)), ['task:later', 'project:p1']);
});
test('project selection, excluded entries/photos and independent captions never alter originals', () => {
  const base = choices(), photoId = journal.journalPhotoId('task:later', 'file://b');
  const chosen = { ...base, projectIds: ['p1'], excludedEntryIds: ['project:p1'], excludedPhotoIds: [photoId],
    captions: { 'task:later': 'Nouvelle légende' }, photoCaptions: { [journal.journalPhotoId('task:later', 'file://a')]: 'Détail photo' } };
  const output = journal.buildProjectJournal(projects, tasks, chosen);
  assert.equal(output.entries.length, 1);
  assert.equal(output.entries[0].caption, 'Nouvelle légende');
  assert.equal(output.entries[0].photos.length, 1);
  assert.equal(output.entries[0].photos[0].caption, 'Détail photo');
  assert.equal(output.availablePhotos, 3);
  assert.equal(output.excludedPhotos, 2, 'counts both a hidden photo and the album of a hidden step');
  assert.equal(tasks[0].notes, 'Note originale');
  assert.equal(tasks[0].photos.length, 2);
  assert.equal(journal.buildProjectJournal(projects, tasks, { ...chosen, excludedPhotoIds: [] }).photoCount, 2);
});
test('missing completion date never substitutes the due date even when the task has photos', () => {
  const onlyUndated = {
    ...tasks[2], projectId: 'p2', dueDate: '06/04/2026', photos: ['file://still-here'],
  };
  const output = journal.buildProjectJournal(projects, [onlyUndated], choices());
  assert.equal(output.photoCount, 1, 'the separately completed project album is still available');
  assert.equal(output.undatedPhotos, 1);
  assert.equal(output.undated[0].photoCount, 1);
  assert.ok(!output.entries.some(entry => entry.id === 'task:unknown'));
});
test('parallel projects stay interleaved and each recap immediately follows its closing task', () => {
  const ps = ['p1', 'p2', 'p3'].map(id => ({ id, name: id, status: 'inprogress', photos: [] }));
  const order = ['p2', 'p3', 'p2', 'p1', 'p1', 'p3', 'p2', 'p1', 'p3'];
  const counts = {};
  const ts = order.map((projectId, i) => ({
    id: `${projectId}-t${counts[projectId] = (counts[projectId] ?? 0) + 1}`,
    projectId, title: `${projectId} tâche ${counts[projectId]}`, status: 'done',
    completedAt: `${String(i + 1).padStart(2, '0')}/04/2026`, photos: [`file://${i}`],
  }));
  const before = JSON.stringify({ ps, ts });
  const opts = { ...choices(), projectIds: ps.map(p => p.id) };
  const output = journal.buildProjectJournal(ps, ts, opts);
  assert.deepEqual(clone(output.entries.map(e => e.id)), [
    'task:p2-t1', 'task:p3-t1', 'task:p2-t2', 'task:p1-t1', 'task:p1-t2', 'task:p3-t2',
    'task:p2-t3', 'project:p2', 'task:p1-t3', 'project:p1', 'task:p3-t3', 'project:p3',
  ]);
  for (const recap of output.entries.filter(e => e.recapTasks)) {
    assert.equal(recap.recapTasks.length, 3);
    assert.equal(output.entries[output.entries.indexOf(recap) - 1].id, recap.afterTaskId);
  }
  const limited = journal.buildProjectJournal(ps, ts, { ...opts, from: '2026-04-07', to: '2026-04-07' });
  assert.equal(limited.entries[1].recapTasks.length, 3, 'recap includes earlier tasks without adding their media again');
  assert.equal(limited.photoCount, 1);
  const excluded = journal.buildProjectJournal(ps, ts, { ...opts, excludedEntryIds: ['task:p2-t3'] });
  assert.equal(excluded.entries[excluded.entries.findIndex(e => e.id === 'project:p2') - 1].id,
    'task:p2-t2', 'recap follows the last task actually retained in the montage');
  const reopened = journal.buildProjectJournal(ps, ts.map(t => t.id === 'p2-t2' ? { ...t, status: 'inprogress' } : t), opts);
  assert.ok(!reopened.entries.some(e => e.id === 'project:p2'));
  const unknown = journal.buildProjectJournal(ps, ts.map(t => t.id === 'p2-t1' ? { ...t, completedAt: undefined } : t), opts);
  assert.ok(!unknown.entries.some(e => e.id === 'project:p2'));
  const tied = journal.buildProjectJournal(ps, ts.map(t => ({ ...t, completedAt: '01/04/2026' })), opts);
  for (const recap of tied.entries.filter(e => e.recapTasks))
    assert.equal(tied.entries[tied.entries.indexOf(recap) - 1].id, recap.afterTaskId);
  assert.equal(JSON.stringify({ ps, ts }), before);
});
test('manual same-day montage interleaves projects and reanchors each recap after its actual last task', () => {
  const ps = projects.map(p => ({ ...p, status: 'inprogress', photos: [] }));
  const ts = [
    ['a', 'p1', '05'], ['b', 'p1', '05'], ['c', 'p2', '05'], ['d', 'p2', '05'],
    ['before', 'p1', '04'], ['after', 'p2', '06'],
  ].map(([id, projectId, day]) => ({ id, projectId, title: id, status: 'done', completedAt: `${day}/04/2026`, photos: [] }));
  const opts = { ...choices(), taskOrderByDate: { '2026-04-05': ['task:b', 'task:c', 'task:a', 'task:d', 'task:deleted', 'task:after'] } };
  const before = JSON.stringify({ ps, ts, opts });
  const built = journal.buildProjectJournal(ps, ts, opts);
  assert.deepEqual(clone(built.entries.map(e => e.id)), [
    'task:before', 'task:b', 'task:c', 'task:a', 'project:p1', 'task:d', 'task:after', 'project:p2',
  ]);
  assert.deepEqual(clone(built.request.entries), clone(built.entries));
  const hidden = journal.buildProjectJournal(ps, ts, { ...opts, excludedEntryIds: ['task:a'] });
  assert.equal(hidden.entries[hidden.entries.findIndex(e => e.id === 'project:p1') - 1].id, 'task:b');
  assert.equal(hidden.entries.find(e => e.id === 'project:p1').afterTaskId, 'task:b');
  const none = journal.buildProjectJournal(ps, ts, { ...opts, excludedEntryIds: ['task:a', 'task:b', 'task:before'] });
  assert.ok(!none.entries.some(e => e.id === 'project:p1'));
  const hiddenRecap = journal.buildProjectJournal(ps, ts, { ...opts, excludedEntryIds: ['project:p1'] });
  assert.ok(!hiddenRecap.entries.some(e => e.id === 'project:p1'));
  const reversedSource = journal.buildProjectJournal([...ps].reverse(), [...ts].reverse(), opts);
  assert.deepEqual(clone(reversedSource.entries), clone(built.entries));
  assert.equal(JSON.stringify({ ps, ts, opts }), before);
});
test('move controls stay within a day, retain absent choices and survive JSON roundtrips', () => {
  const ts = ['a', 'b', 'c'].map((id, index) => ({
    id, projectId: index === 1 ? 'p2' : 'p1', title: id, status: 'done', completedAt: '05/04/2026', photos: [],
  }));
  let opts = { ...choices(), taskOrderByDate: { '2026-04-05': ['task:absent', 'task:a', 'task:b', 'task:c'], '2026-04-01': ['task:other'] } };
  const before = clone(opts);
  let built = journal.buildProjectJournal(projects, ts, opts);
  opts = journal.moveJournalTask(opts, built.candidates, 'task:c', -1);
  assert.deepEqual(clone(opts.taskOrderByDate['2026-04-05']), ['task:absent', 'task:a', 'task:c', 'task:b']);
  assert.deepEqual(clone(before.taskOrderByDate['2026-04-05']), ['task:absent', 'task:a', 'task:b', 'task:c']);
  assert.equal(journal.validateJournalChoices(clone(opts)), true);
  built = journal.buildProjectJournal(projects, ts, clone(opts));
  assert.deepEqual(clone(built.entries.filter(e => e.kind === 'task').map(e => e.id)), ['task:a', 'task:c', 'task:b']);
  assert.equal(journal.moveJournalTask(opts, built.candidates, 'task:a', -1), opts);
  assert.equal(journal.moveJournalTask(opts, built.candidates, 'task:b', 1), opts);
  assert.equal(journal.moveJournalTask(opts, built.candidates, 'project:p1', -1), opts);
  const selected = journal.buildProjectJournal(projects, ts, { ...opts, projectIds: ['p1'] });
  const moved = journal.moveJournalTask(opts, selected.candidates, 'task:c', -1);
  assert.deepEqual(clone(moved.taskOrderByDate['2026-04-05']), ['task:absent', 'task:c', 'task:a', 'task:b']);
  assert.deepEqual(clone(moved.taskOrderByDate['2026-04-01']), ['task:other']);
  assert.equal(journal.buildProjectJournal(projects, ts, { ...opts, from: '2026-04-06' }).entries.length, 0);
  assert.deepEqual(clone(journal.buildProjectJournal(projects, ts, opts).entries), clone(built.entries));
});
test('draft hook reopens after pending writes, migrates old choices, and keeps manual order per journal', async () => {
  const store = new Map();
  let current, release;
  const pause = new Promise(resolve => { release = resolve; });
  const hook = load('hooks/useJournalDraft.ts', {
    react: {
      useState(initial) {
        const instance = current, index = instance.index++;
        if (!(index in instance.state)) instance.state[index] = initial;
        return [instance.state[index], next => { instance.state[index] = typeof next === 'function' ? next(instance.state[index]) : next; }];
      },
      useRef(value) {
        const instance = current, index = instance.index++;
        return instance.state[index] ?? (instance.state[index] = { current: value });
      },
      useEffect(fn) { if (current.mount) current.effects.push(fn); },
      useCallback: fn => fn,
    },
    '@react-native-async-storage/async-storage': { default: {
      getItem: async key => store.get(key) ?? null,
      setItem: async (key, value) => { await pause; store.set(key, value); },
    } },
    '@/utils/projectJournal': journal,
  });
  function mount(projectId) {
    const instance = { state: [], index: 0, effects: [], mount: true };
    instance.render = () => { current = instance; instance.index = 0; return hook.useJournalDraft(projects, false, projectId); };
    instance.render();
    instance.cleanup = instance.effects.map(fn => fn());
    instance.mount = false;
    return instance;
  }
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const legacy = choices(); delete legacy.taskOrderByDate;
  store.set('@yoann2_project_journal_v1:all', JSON.stringify(legacy));
  const first = mount(); await flush();
  assert.deepEqual(clone(first.render().choices.taskOrderByDate), {});
  const next = { ...first.render().choices, taskOrderByDate: { '2026-04-05': ['task:b', 'task:a'] } };
  first.render().save({ ...next, title: 'Premier' });
  first.render().save({ ...next, title: 'Dernier' });
  first.cleanup.forEach(fn => fn?.());
  const reopened = mount();
  await flush();
  assert.equal(reopened.render().choices, null, 'waits until pending writes finish');
  release(); await flush(); await flush();
  assert.equal(reopened.render().choices.title, 'Dernier');
  assert.deepEqual(clone(reopened.render().choices.taskOrderByDate), clone(next.taskOrderByDate));
  const scoped = mount('p1'); await flush();
  assert.deepEqual(clone(scoped.render().choices.taskOrderByDate), {});
  assert.deepEqual(clone(scoped.render().choices.projectIds), ['p1']);
});
test('empty/invalid ranges, malformed drafts and oversized selections fail explicitly without truncation', () => {
  assert.ok(journal.buildProjectJournal(projects, tasks, { ...choices(), from: '2026-05-01', to: '2026-04-01' }).error);
  assert.ok(journal.buildProjectJournal(projects, tasks, { ...choices(), projectIds: [] }).error);
  assert.ok(journal.buildProjectJournal(projects, tasks, { ...choices(), title: '' }).error);
  assert.ok(journal.buildProjectJournal(projects, tasks, { ...choices(), excludedEntryIds: ['task:later', 'task:earlier', 'project:p1'] }).error);
  assert.equal(journal.validateJournalChoices(choices()), true);
  assert.equal(journal.validateJournalChoices({ ...choices(), from: '2026-02-31' }), false);
  assert.equal(journal.validateJournalChoices({ ...choices(), captions: { task: false } }), false);
  for (const taskOrderByDate of [null, [], { bad: [] }, { '2026-04-05': 'task:a' },
    { '2026-04-05': [2] }, { '2026-04-05': ['project:p1'] }, { '2026-04-05': ['task:a', 'task:a'] }])
    assert.equal(journal.validateJournalChoices({ ...choices(), taskOrderByDate }), false);
  const huge = { ...tasks[0], photos: Array.from({ length: 121 }, (_, i) => `file://${i}`) };
  const output = journal.buildProjectJournal(projects, [huge], choices());
  assert.ok(output.error.includes('120 photos'));
  assert.equal(output.photoCount, 122, 'limits never silently drop photos');
});
test('photo preparation is sequential, preserves captions and reports a precise inaccessible photo', async () => {
  const calls = [];
  const prepare = load('utils/prepareJournal.ts', {
    '@/utils/projectJournal': journal,
    '@/utils/storyPhoto': { prepareStoryPhoto: async uri => { calls.push(uri); if (uri === 'file://b') throw new Error('Accès refusé'); return 'data:image/jpeg;base64,YWJj'; } },
  });
  const request = journal.buildProjectJournal(projects, tasks, choices()).request;
  await assert.rejects(prepare.prepareJournal(request, 'job', () => true, () => {}), /Finition · photo 2 : Accès refusé/);
  assert.deepEqual(calls, ['file://a', 'file://b']);
  await assert.rejects(prepare.prepareJournal(request, 'job', () => false, () => {}), /annulée/);
});

/** A single shared clock drives rAF, all timers and recorder callbacks. */
function engine({ badPhoto = false, loadDelay = 25 } = {}) {
  let now = 1000, next = 1, activeImages = 0, maxImages = 0, recorder;
  const timers = new Map(), messages = [], draws = [], imageDraws = [];
  const set = (fn, delay, interval = false) => {
    const id = next++; timers.set(id, { fn, due: now + delay, delay, interval }); return id;
  };
  const clear = id => timers.delete(id);
  const ctx = new Proxy({
    measureText: text => ({ width: String(text).length * 17 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    drawImage(source) { if (source?.value) imageDraws.push({ src: source.value, at: now }); },
    fillText(text, x, y) { if (text) draws.push({ text, x, y, at: now }); },
  }, { get: (o, k) => k in o ? o[k] : () => {}, set: (o, k, v) => { o[k] = v; return true; } });
  const canvas = () => ({ width: 720, height: 1280, getContext: () => ctx,
    captureStream: () => ({ getTracks: () => [{ stop() {} }] }) });
  const elements = { cv: canvas(), pp: {}, sk: { value: '0' }, tm: {} };
  class Photo {
    naturalWidth = 800; naturalHeight = 600;
    decode() { return Promise.resolve(); }
    set src(value) {
      if (value && !this.value) { activeImages++; maxImages = Math.max(maxImages, activeImages); }
      if (!value && this.value) activeImages--;
      this.value = value;
      if (value) set(() => {
        if (!this.value) return;
        if (badPhoto) this.onerror?.(); else this.onload?.();
      }, loadDelay);
    }
  }
  class Recorder {
    static isTypeSupported = mime => mime === 'video/webm;codecs=vp8';
    state = 'inactive';
    constructor() { recorder = this; }
    start() { this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([new Uint8Array(140_000)]) });
      this.onstop?.();
    }
  }
  const win = {
    ReactNativeWebView: { postMessage: data => messages.push(JSON.parse(data)) },
    MediaRecorder: Recorder, addEventListener() {},
  };
  const html = renderer.buildProjectJournalHtml();
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  vm.runInNewContext(script, {
    window: win, document: { getElementById: id => elements[id], createElement: canvas, body: {} },
    Image: Photo, MediaRecorder: Recorder, Blob, Response, Uint8Array, Math, performance: { now: () => now },
    setTimeout: (fn, ms) => set(fn, ms), clearTimeout: clear,
    setInterval: (fn, ms) => set(fn, ms, true), clearInterval: clear,
    requestAnimationFrame: fn => set(fn, 16), cancelAnimationFrame: clear,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
  });
  async function advance(ms) {
    const until = now + ms;
    while (true) {
      let found;
      for (const [id, timer] of timers) if (timer.due <= until && (!found || timer.due < found[1].due)) found = [id, timer];
      if (!found) break;
      const [id, timer] = found; now = timer.due;
      if (timer.interval) timer.due += timer.delay; else timers.delete(id);
      timer.fn();
      for (let i = 0; i < 4; i++) await Promise.resolve();
    }
    now = until;
    await new Promise(resolve => setImmediate(resolve));
  }
  return { win, messages, draws, imageDraws, elements, advance, get maxImages() { return maxImages; }, get activeImages() { return activeImages; },
    get recorder() { return recorder; }, get timerCount() { return timers.size; } };
}
function payload({ count = 3, preview = true } = {}) {
  const entries = Array.from({ length: count }, (_, i) => ({
    id: `e${i}`, title: `Étape ${i}`, caption: 'Une réalisation à garder.', dateLabel: '5 avril 2026', project: 'Garage', kind: 'task',
    photos: [{ id: `photo${i}`, caption: `Détail ${i}`, img: `data:image/jpeg;base64,YWJj${i}` }],
  }));
  return { jobId: 'job', journal: true, preview, title: 'Mon carnet', periodLabel: 'Avril 2026', projectNames: ['Garage'],
    entryCount: count, photoCount: count, secondsPerPhoto: 3, entries };
}
test('recap renderer includes every task across readable pages with matching preview/export duration', async () => {
  const e = engine(), data = payload({ count: 0 });
  const recap = {
    id: 'project:one', kind: 'project', title: 'Un projet mené à bien', project: 'Garage',
    caption: 'Une étape après l’autre !', photos: [],
    recapTasks: Array.from({ length: 13 }, (_, i) => ({ id: `t${i}`, title: `Réalisation ${i}`, dateLabel: '5 avril 2026' })),
  };
  data.entries = [recap]; data.entryCount = 1; data.photoCount = 0;
  e.win.generatePeriodStory(data);
  assert.equal(e.win.journalDuration, journal.journalDuration([recap], 3));
  await e.advance(200);
  e.win.journalPause();
  for (let page = 0; page < 3; page++) {
    e.win.journalSeek(6 + page * journal.journalRecapDuration(recap));
    await e.advance(200);
  }
  for (let i = 0; i < 13; i++)
    assert.ok(e.draws.some(draw => draw.text === `Réalisation ${i}`), `missing recap task ${i}`);
  assert.ok(e.draws.some(draw => draw.text === 'PROJET TERMINÉ'));
  assert.equal(e.activeImages, 0, 'summary does not decode all original task photos again');
});
test('preview and exporter use exactly the calculated duration, expose controls and load bounded photos', async () => {
  const e = engine(), data = payload({ count: 30 });
  e.win.generatePeriodStory(data);
  assert.equal(e.win.journalDuration, journal.journalDuration(data.entries, 3));
  await e.advance(300);
  e.win.journalPause(); e.win.journalSeek(5.2);
  await e.advance(200);
  assert.ok(e.draws.some(draw => draw.text === 'Détail 0'));
  e.win.journalSeek(e.win.journalDuration - 3); await e.advance(200);
  assert.ok(e.draws.some(draw => draw.text === 'Fin du carnet.'));
  assert.ok(e.maxImages <= 8, `at most the current and turning pages, not ${e.maxImages} decoded photos`);
  assert.equal(e.messages.some(m => m.type === 'story_chunk'), false);
});
test('task page reveals four photos in half-second steps and continues the remaining photos on the next page', async () => {
  const e = engine(), data = payload({ count: 1 });
  data.entries[0].photos = Array.from({ length: 6 }, (_, i) => ({
    id: `photo-${i + 1}`, caption: `Photo ${i + 1}`, img: `data:image/jpeg;base64,cGhvdG8${i}`,
  }));
  data.photoCount = 6;
  e.win.generatePeriodStory(data);
  await e.advance(300);
  e.win.journalPause();
  const hasDrawn = id => e.imageDraws.some(draw => draw.src.endsWith(`cGhvdG8${id - 1}`));
  e.win.journalSeek(5.2); assert.equal(hasDrawn(1), true); assert.equal(hasDrawn(2), false);
  await e.advance(500);
  e.win.journalSeek(5.7); assert.equal(hasDrawn(2), true); assert.equal(hasDrawn(3), false);
  await e.advance(500);
  e.win.journalSeek(6.2); assert.equal(hasDrawn(3), true); assert.equal(hasDrawn(4), false);
  await e.advance(500);
  e.win.journalSeek(6.7); assert.equal(hasDrawn(4), true); assert.equal(hasDrawn(5), false);
  await e.advance(500);
  e.win.journalSeek(9.7);
  await e.advance(100);
  assert.equal(hasDrawn(5), true, 'photo five starts the continuation page');
  assert.equal(hasDrawn(6), false, 'photo six still waits for its half-second reveal');
  await e.advance(500);
  e.win.journalSeek(10.2);
  assert.equal(hasDrawn(6), true);
  assert.equal(e.win.journalDuration, journal.journalDuration(data.entries, 3));
});
test('real renderer protocol advances past 45 seconds, streams honest ordered chunks and releases resources', async () => {
  const e = engine();
  e.win.generatePeriodStory(payload({ count: 8, preview: false }));
  await e.advance(70_000); await e.advance(500);
  const progress = e.messages.filter(m => m.type === 'story_progress').map(m => m.p);
  assert.ok(progress.some(p => p > 50 && p <= 100));
  const chunks = e.messages.filter(m => m.type === 'story_chunk');
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.map(m => m.index), [0, 1]);
  assert.ok(chunks.every(m => m.mime === 'video/webm' && m.data.length <= 200_000));
  assert.equal(Buffer.concat(chunks.map(m => Buffer.from(m.data, 'base64'))).length, 140_000);
  assert.equal(e.activeImages, 0);
  assert.equal(e.timerCount, 0);
  assert.equal(e.messages.some(m => m.type === 'story_error'), false);
});
test('cancelling recording releases resources and prevents a late video', async () => {
  const e = engine();
  e.win.generatePeriodStory(payload({ preview: false }));
  await e.advance(1000);
  e.win.cancelPeriodStory('job');
  await e.advance(60_000);
  assert.equal(e.activeImages, 0);
  assert.equal(e.timerCount, 0);
  assert.equal(e.messages.some(m => m.type === 'story_chunk'), false);
});
test('an inaccessible renderer image fails with an exact locator, not an empty successful video', async () => {
  const e = engine({ badPhoto: true });
  e.win.generatePeriodStory(payload({ preview: false }));
  await e.advance(1000);
  assert.ok(e.messages.some(m => m.type === 'story_error' && m.message.includes('Étape 0') && m.message.includes('photo0')));
  assert.equal(e.messages.some(m => m.type === 'story_chunk'), false);
  assert.equal(e.activeImages, 0);
});
test('dated subtasks become separate chronological story entries with their own assigned photos', () => {
  const project = { id: 'split', name: 'Chambre', status: 'inprogress', photos: [] };
  const task = {
    id: 'paint', projectId: 'split', title: 'Peinture chambre', status: 'done',
    completedAt: '30/04/2026', dueDate: '2026-05-01', notes: '', photos: ['p1', 'p2', 'p3'],
    subTasks: [
      { id: 'paper', title: 'Enlever la tapisserie', done: true, completedAt: '01/01/2026', photoUris: ['p1'] },
      { id: 'sand', title: 'Poncer et sous-couche', done: true, completedAt: '20/02/2026', photoUris: ['p2', 'p3'] },
      { id: 'paint', title: 'Peinture couleur', done: true, photoUris: [] },
    ],
  };
  const output = journal.buildProjectJournal([project], [task], {
    ...choices(), projectIds: ['split'], from: '2026-01-01', to: '2026-04-30',
  });
  const steps = output.entries.filter(entry => entry.kind === 'task');
  assert.deepEqual(clone(steps.map(entry => [entry.title, entry.dateKey, entry.photos.map(photo => photo.uri)])), [
    ['Enlever la tapisserie', '2026-01-01', ['p1']],
    ['Poncer et sous-couche', '2026-02-20', ['p2', 'p3']],
  ]);
  assert.ok(steps.every(entry => entry.parentTaskTitle === 'Peinture chambre' && entry.sourceId === 'paint'));
  assert.equal(output.undated.length, 1);
  assert.equal(output.undated[0].title, 'Peinture chambre · Peinture couleur');
  assert.equal(output.undated[0].action, 'subtask-date');
  assert.equal(output.undatedPhotos, 0);
  assert.equal(output.entries[output.entries.indexOf(output.entries.find(entry => entry.recapTasks)) - 1].id, 'task:paint:subtask:sand');
});
test('subtask photos without a dated assignment are visible as an actionable item, not lost', () => {
  const project = { id: 'split', name: 'Chambre', status: 'inprogress', photos: [] };
  const task = {
    id: 'paint', projectId: 'split', title: 'Peinture chambre', status: 'done',
    completedAt: '30/04/2026', photos: ['p1', 'p2'],
    subTasks: [{ id: 'paper', title: 'Tapisserie', done: true, completedAt: '01/01/2026', photoUris: ['p1'] }],
  };
  const output = journal.buildProjectJournal([project], [task], {
    ...choices(), projectIds: ['split'], from: '2026-01-01', to: '2026-04-30',
  });
  assert.equal(output.photoCount, 1);
  assert.equal(output.undatedPhotos, 1);
  assert.equal(output.undated[0].action, 'photos');
  assert.equal(output.undated[0].photoCount, 1);
});
test('legacy tasks with no dated subtasks keep their original entry and all photos', () => {
  const task = {
    ...tasks[0], subTasks: [
      { id: 'one', title: 'A', done: true },
      { id: 'two', title: 'B', done: false },
    ],
  };
  const output = journal.buildProjectJournal(projects, [task], choices());
  assert.deepEqual(clone(output.entries.filter(entry => entry.kind === 'task').map(entry => [entry.id, entry.title, entry.photos.length])),
    [['task:later', 'Finition', 2]]);
});
