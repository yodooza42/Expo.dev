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
  { id: 'unknown', projectId: 'p1', title: 'Date inconnue', status: 'done', photos: ['file://unknown'] },
  { id: 'todo', projectId: 'p1', title: 'À venir', status: 'todo', completedAt: '01/04/2026', photos: [] },
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
  assert.deepEqual(clone(oneDay.entries.map(e => e.id)), ['task:later']);
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
    ...tasks[2], dueDate: '06/04/2026', photos: ['file://still-here'],
  };
  const output = journal.buildProjectJournal(projects, [onlyUndated], choices());
  assert.equal(output.photoCount, 1, 'the separately completed project album is still available');
  assert.equal(output.undatedPhotos, 1);
  assert.equal(output.undated[0].photoCount, 1);
  assert.ok(!output.entries.some(entry => entry.id === 'task:unknown'));
});
test('empty/invalid ranges, malformed drafts and oversized selections fail explicitly without truncation', () => {
  assert.ok(journal.buildProjectJournal(projects, tasks, { ...choices(), from: '2026-05-01', to: '2026-04-01' }).error);
  assert.ok(journal.buildProjectJournal(projects, tasks, { ...choices(), projectIds: [] }).error);
  assert.ok(journal.buildProjectJournal(projects, tasks, { ...choices(), title: '' }).error);
  assert.ok(journal.buildProjectJournal(projects, tasks, { ...choices(), excludedEntryIds: ['task:later', 'task:earlier', 'project:p1'] }).error);
  assert.equal(journal.validateJournalChoices(choices()), true);
  assert.equal(journal.validateJournalChoices({ ...choices(), from: '2026-02-31' }), false);
  assert.equal(journal.validateJournalChoices({ ...choices(), captions: { task: false } }), false);
  const huge = { ...tasks[0], photos: Array.from({ length: 61 }, (_, i) => `file://${i}`) };
  const output = journal.buildProjectJournal(projects, [huge], choices());
  assert.ok(output.error.includes('60 photos'));
  assert.equal(output.photoCount, 62, 'limits never silently drop photos');
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
  const timers = new Map(), messages = [], draws = [];
  const set = (fn, delay, interval = false) => {
    const id = next++; timers.set(id, { fn, due: now + delay, delay, interval }); return id;
  };
  const clear = id => timers.delete(id);
  const ctx = new Proxy({
    measureText: text => ({ width: String(text).length * 17 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
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
  return { win, messages, draws, elements, advance, get maxImages() { return maxImages; }, get activeImages() { return activeImages; },
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
test('preview and exporter use exactly the calculated duration, expose controls and load bounded photos', async () => {
  const e = engine(), data = payload({ count: 30 });
  e.win.generatePeriodStory(data);
  assert.equal(e.win.journalDuration, journal.journalDuration(data.entries, 3));
  await e.advance(300);
  e.win.journalPause(); e.win.journalSeek(10);
  await e.advance(200);
  assert.ok(e.draws.some(draw => draw.text === 'Détail 0'));
  e.win.journalSeek(e.win.journalDuration - 3); await e.advance(200);
  assert.ok(e.draws.some(draw => draw.text === 'Fin du carnet.'));
  assert.ok(e.maxImages <= 3, `current+next+transition, not ${e.maxImages} decoded photos`);
  assert.equal(e.messages.some(m => m.type === 'story_chunk'), false);
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
