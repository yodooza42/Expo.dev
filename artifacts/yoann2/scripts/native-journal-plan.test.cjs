const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

function load(file, dependencies = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    require(name) {
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    Error, Map, Math, Number, Array,
  });
  return exports;
}

const timing = load('utils/journalPhotoTiming.ts');
const completionDate = load('utils/completionDate.ts');
const projectJournal = load('utils/projectJournal.ts', {
  '@/utils/completionDate': completionDate,
  '@/utils/journalPhotoTiming': timing,
  '@/utils/journalPhotoTimestamp': load('utils/journalPhotoTimestamp.ts'),
});
const planBuilder = load('utils/nativeJournalPlan.ts', {
  '@/utils/projectJournal': projectJournal,
  '@/utils/journalPhotoTiming': timing,
});

function makePayload() {
  return {
    journal: true,
    title: 'Travaux maison',
    periodLabel: '2025–2026',
    projectNames: ['Entrée', 'Garage'],
    entryCount: 2,
    photoCount: 4,
    secondsPerPhoto: 4.5,
    entries: [
      {
        id: 'task:a', sourceId: 'a', kind: 'task', title: 'Meuble', project: 'Entrée',
        projectId: 'entry', dateLabel: '1 mai 2026', dateKey: '2026-05-01', caption: 'Pose',
        photos: [
          {
            id: 'photo:1', img: '', assetKey: 'asset-1', caption: 'Avant',
            dateTimeLabel: '28 octobre 2026 - 20h54',
          },
          { id: 'photo:2', img: '', assetKey: 'asset-2', caption: 'Après' },
        ],
      },
      {
        id: 'project:garage', sourceId: 'garage', kind: 'project', title: 'Garage',
        project: 'Garage', projectId: 'garage', dateLabel: '2 mai 2026', dateKey: '2026-05-02',
        caption: 'Terminé', photos: [],
      },
    ],
    finalComparisonImages: {
      projectName: 'Entrée',
      before: [{ id: 'before', img: '', assetKey: 'asset-3', dateLabel: '1 janvier 2025' }],
      after: [{ id: 'after', img: '', assetKey: 'asset-4', dateLabel: '1 mai 2026' }],
    },
  };
}

const assets = [
  { key: 'asset-1', uri: 'file://before.jpg', title: 'Meuble', index: 0 },
  { key: 'asset-2', uri: 'content://after.jpg', title: 'Meuble', index: 1 },
  { key: 'asset-3', uri: 'file://compare-before.jpg', title: 'Entrée · Avant', index: 2 },
  { key: 'asset-4', uri: 'file://compare-after.jpg', title: 'Entrée · Après', index: 3 },
];

test('native render plan keeps every timeline photo and resolves local URIs', () => {
  const plan = planBuilder.buildNativeJournalPlan(makePayload(), assets);
  const photoScenes = plan.scenes.filter(scene => scene.photoUri);

  assert.equal(plan.width, 720);
  assert.equal(plan.height, 1280);
  assert.equal(plan.fps, 15);
  assert.equal(photoScenes.length, 4);
  assert.deepEqual(Array.from(photoScenes, scene => scene.photoUri), [
    'file://before.jpg', 'content://after.jpg',
    'file://compare-before.jpg', 'file://compare-after.jpg',
  ]);
  assert.ok(plan.scenes.some(scene => scene.kind === 'intro'));
  assert.ok(plan.scenes.some(scene => scene.kind === 'entry'));
  assert.ok(plan.scenes.some(scene => scene.kind === 'comparison'));
  assert.ok(plan.scenes.some(scene => scene.kind === 'outro'));
  assert.ok(plan.scenes.every(scene => scene.durationSec > 0));
  assert.equal(
    plan.scenes.find(scene => scene.photoUri === 'file://before.jpg').dateLabel,
    '28 octobre 2026 - 20h54',
  );
  assert.equal(
    plan.scenes.find(scene => scene.photoUri === 'content://after.jpg').dateLabel,
    '1 mai 2026',
    'photos without capture metadata keep the existing entry date',
  );
  assert.equal(
    plan.scenes.reduce((duration, scene) => duration + scene.durationSec, 0),
    projectJournal.journalDuration(makePayload().entries, makePayload().secondsPerPhoto, true, {
      title: makePayload().title,
      periodLabel: makePayload().periodLabel,
      projectNames: makePayload().projectNames,
      entryCount: makePayload().entryCount,
      photoCount: makePayload().photoCount,
      finalComparison: {
        projectName: makePayload().finalComparisonImages.projectName,
        before: makePayload().finalComparisonImages.before,
        after: makePayload().finalComparisonImages.after,
      },
    }),
  );
});

test('native photo scenes keep recovery URI candidates for library references', () => {
  const preparedAssets = [
    { ...assets[0], nativeCandidates: ['content://resolved/photo.jpg', 'file:///backup/photo.jpg'] },
    ...assets.slice(1),
  ];
  const plan = planBuilder.buildNativeJournalPlan(makePayload(), preparedAssets);
  const firstPhoto = plan.scenes.find(scene => scene.kind === 'photo');

  assert.equal(firstPhoto.photoUri, 'content://resolved/photo.jpg');
  assert.deepEqual(Array.from(firstPhoto.photoFallbackUris), ['file:///backup/photo.jpg']);
});

test('comparison photos already shown in the timeline do not inflate the selected count', () => {
  const payload = makePayload();
  payload.photoCount = 2;
  payload.finalComparisonImages.before = [
    { id: 'before', img: '', assetKey: 'asset-1', dateLabel: '1 janvier 2025' },
  ];
  payload.finalComparisonImages.after = [
    { id: 'after', img: '', assetKey: 'asset-2', dateLabel: '1 mai 2026' },
  ];
  const plan = planBuilder.buildNativeJournalPlan(payload, assets);

  assert.equal(plan.scenes.filter(scene => scene.kind === 'photo').length, 2);
  assert.equal(plan.scenes.filter(scene => scene.kind === 'comparison').length, 2);
});

test('native photo scenes keep recovery URI candidates for library references', () => {
  const preparedAssets = [
    { ...assets[0], nativeCandidates: ['content://resolved/photo.jpg', 'file:///backup/photo.jpg'] },
    ...assets.slice(1),
  ];
  const plan = planBuilder.buildNativeJournalPlan(makePayload(), preparedAssets);
  const firstPhoto = plan.scenes.find(scene => scene.kind === 'photo');

  assert.equal(firstPhoto.photoUri, 'content://resolved/photo.jpg');
  assert.deepEqual(Array.from(firstPhoto.photoFallbackUris), ['file:///backup/photo.jpg']);
});

test('comparison photos already shown in the timeline do not inflate the selected count', () => {
  const payload = makePayload();
  payload.photoCount = 2;
  payload.finalComparisonImages.before = [
    { id: 'before', img: '', assetKey: 'asset-1', dateLabel: '1 janvier 2025' },
  ];
  payload.finalComparisonImages.after = [
    { id: 'after', img: '', assetKey: 'asset-2', dateLabel: '1 mai 2026' },
  ];
  const plan = planBuilder.buildNativeJournalPlan(payload, assets);

  assert.equal(plan.scenes.filter(scene => scene.kind === 'photo').length, 2);
  assert.equal(plan.scenes.filter(scene => scene.kind === 'comparison').length, 2);
});

test('native plan fails rather than silently dropping a missing photo', () => {
  assert.throws(
    () => planBuilder.buildNativeJournalPlan(makePayload(), assets.slice(0, 3)),
    /introuvable/,
  );
});

test('native plan rejects a montage exceeding the fifteen-minute limit', () => {
  const payload = makePayload();
  payload.secondsPerPhoto = 2_000;
  assert.throws(
    () => planBuilder.buildNativeJournalPlan(payload, assets),
    /15 minutes/,
  );
});
