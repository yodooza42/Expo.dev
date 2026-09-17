/* Pure domain/storage contract tests.  The TypeScript modules are transpiled
   in a VM so these tests do not require React Native or a renderer. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');

function loadTypeScript(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})(require,module,exports);`, {
    module,
    exports: module.exports,
    require(name) {
      if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    Date,
    Math,
    JSON,
  });
  return module.exports;
}

const draft = loadTypeScript('utils/periodStoryDraft.ts');

function localDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function route(start, end, withTimes = true) {
  const points = [
    { lat: 48.85, lng: 2.35 },
    { lat: 48.86, lng: 2.36 },
    { lat: 48.87, lng: 2.37 },
  ];
  if (withTimes) {
    points[0].t = start;
    points[1].t = (start + end) / 2;
    points[2].t = end;
  }
  return points;
}

function trip(id, date, options = {}) {
  const startTime = localDate(date).getTime() + 10 * 60 * 60 * 1000;
  return {
    id,
    startTime,
    endTime: startTime + 60 * 60 * 1000,
    distanceKm: options.distanceKm ?? 5,
    vehicle: 'car',
    pointCount: 3,
    route: options.route === undefined ? route(startTime, startTime + 60 * 60 * 1000) : options.route,
    photos: options.photos ?? [],
  };
}

test('local dates are strict, local, inclusive and leap-year safe', () => {
  assert.equal(draft.parseLocalDate('2024-02-29').getDate(), 29);
  assert.equal(draft.parseLocalDate('2023-02-29'), null);
  assert.equal(draft.parseLocalDate('2024-2-09'), null);
  assert.equal(draft.parseLocalDate('2024-02-29T00:00:00'), null);
  assert.equal(draft.localDateKey(new Date(2024, 1, 29, 23, 59)), '2024-02-29');

  const previous = draft.lastCompletedMonth(new Date(2024, 0, 15, 12));
  assert.equal(draft.localDateKey(previous.from), '2023-12-01');
  assert.equal(draft.localDateKey(previous.to), '2023-12-31');
  const leap = draft.monthRange(new Date(2024, 1, 15));
  assert.equal(draft.localDateKey(leap.from), '2024-02-01');
  assert.equal(draft.localDateKey(leap.to), '2024-02-29');
  assert.equal(draft.monthStoryTitle(leap.from, leap.to), 'Notre mois de février');
  assert.equal(draft.monthStoryTitle(new Date(2024, 7, 1), new Date(2024, 7, 3)), 'Nos souvenirs');
});

test('event membership uses the local start day and explicit corrections', () => {
  const event = {
    id: 'holiday',
    title: 'Vacances',
    startDate: '2024-08-10',
    endDate: '2024-08-12',
    includedTripIds: ['outside'],
    excludedTripIds: ['nope'],
  };
  assert.equal(draft.eventMatchesTrip(event, trip('inside', '2024-08-12')), true);
  assert.equal(draft.eventMatchesTrip({ ...event, title: '' }, trip('inside', '2024-08-12')), true,
    'automatic selection is visible before the user types the event title');
  assert.equal(draft.eventMatchesTrip(event, trip('before', '2024-08-09')), false);
  assert.equal(draft.eventMatchesTrip(event, trip('outside', '2024-08-01')), true);
  assert.equal(draft.eventMatchesTrip(event, trip('nope', '2024-08-11')), false);
});

test('draft groups, resolves overrides/conflicts, deduplicates photos and does not mutate trips', () => {
  const first = trip('a', '2024-08-10', {
    photos: [
      { id: 'p1', uri: 'content://one', takenAt: localDate('2024-08-10').getTime() + 10 * 60 * 60 * 1000 + 30 * 60 * 1000 },
      { id: 'same-id', uri: 'content://two', takenAt: 1 },
      { id: 'missing', uri: '', takenAt: 1 },
    ],
  });
  const second = trip('b', '2024-08-11', {
    photos: [{ id: 'same-id', uri: 'content://different', takenAt: 1 }],
  });
  const invalid = trip('unavailable', '2024-08-12', { route: null });
  const events = [
    { id: 'e1', title: 'Mer', startDate: '2024-08-10', endDate: '2024-08-11', includedTripIds: [], excludedTripIds: [] },
    { id: 'e2', title: 'Famille', startDate: '2024-08-11', endDate: '2024-08-12', includedTripIds: [], excludedTripIds: [] },
  ];
  const before = JSON.parse(JSON.stringify([first, second, invalid]));
  const result = draft.buildPeriodStoryDraft({
    trips: [first, second, invalid],
    events,
    choices: {
      excludedTripIds: [],
      excludedPhotoKeys: [],
      photoCaptions: { '["a","p1"]': 'Notre sortie à la mer' },
      tripChapterOverrides: { b: 'day' },
    },
    from: new Date(2024, 7, 1),
    to: new Date(2024, 7, 31),
  });

  assert.equal(result.trips.length, 2);
  assert.equal(result.unavailableTrips.length, 1);
  assert.equal(result.conflicts.length, 0, 'the day override resolves the overlap');
  assert.equal(result.trips[0].photos[0].routeIndex, 1);
  assert.equal(result.trips[0].photos[0].note, 'Notre sortie à la mer',
    'the story-only caption is copied onto the exported photo');
  assert.equal(result.photoCount, 2);
  assert.equal(result.omittedPhotoCount, 2, 'missing and globally duplicate photos are counted');
  assert.equal(result.chapters.some(chapter => chapter.title === 'Journée du 11 août'), true);
  assert.deepEqual(JSON.parse(JSON.stringify([first, second, invalid])), before);

  const conflict = draft.buildPeriodStoryDraft({
    trips: [second],
    events,
    choices: { excludedTripIds: [], excludedPhotoKeys: [], tripChapterOverrides: {} },
    from: new Date(2024, 7, 1),
    to: new Date(2024, 7, 31),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(conflict.conflicts)), [{ tripId: 'b', eventIds: ['e1', 'e2'] }]);
  assert.equal(conflict.chapters[0].eventId, 'e1', 'unresolved conflicts are provisional');
});

test('auto keeps the full story while a requested duration targets the complete video', () => {
  const built = draft.buildPeriodStoryDraft({
    trips: [trip('a', '2024-08-10', {
      distanceKm: 1,
      photos: [{ id: 'p', uri: 'content://p', takenAt: 1 }],
    })],
    events: [],
    from: new Date(2024, 7, 1),
    to: new Date(2024, 7, 31),
  });
  const automatic = draft.getStoryTiming(built.chapters);
  assert.equal(automatic.baseDurationSec, 9);
  assert.equal(automatic.totalDurationSec, 11);

  const timing = draft.getStoryTiming(built.chapters, 60);
  assert.equal(timing.openingSec, 3);
  assert.equal(timing.recapSec, 3);
  assert.equal(timing.photoPauseSec, 2);
  assert.equal(timing.photoPausePerPhotoSec, 2);
  assert.equal(timing.baseDurationSec, 58);
  assert.equal(timing.totalDurationSec, 60);
  assert.equal(timing.chapters.reduce((sum, chapter) => sum + chapter.durationSec, 0), timing.baseDurationSec - 6);
  assert.equal(timing.chapters[0].durationSec, 52);
});

test('story timing follows elapsed trip time rather than distance', () => {
  const car = trip('one-hour-car', '2024-08-10', { distanceKm: 50 });
  const walk = trip('one-hour-walk', '2024-08-11', { distanceKm: 5 });
  walk.vehicle = 'walk';
  const built = draft.buildPeriodStoryDraft({
    trips: [car, walk],
    events: [],
    from: new Date(2024, 7, 1),
    to: new Date(2024, 7, 31),
  });
  const timing = draft.getStoryTiming(built.chapters);

  assert.equal(timing.chapters.length, 2);
  assert.equal(timing.chapters[0].durationSec, 3);
  assert.equal(timing.chapters[1].durationSec, 3);
});

test('ignored trips and broken route/photo metadata never enter export', () => {
  const ignored = trip('ignored', '2024-08-10', { route: route(1, 2) });
  ignored.vehicle = 'ignored';
  const invalidRoute = trip('bad-route', '2024-08-11', {
    route: [{ lat: 90, lng: 0 }, { lat: 0, lng: 0 }],
    photos: [{ id: 'bad', uri: 'content://bad', takenAt: Number.NaN, routeIndex: -4 }],
  });
  const excludedInvalid = trip('excluded-bad', '2024-08-12', {
    route: null,
    photos: [{ id: 'excluded', uri: 'content://excluded', takenAt: 1 }],
  });
  const valid = trip('valid', '2024-08-13', {
    photos: [
      { id: 'final', uri: 'content://final', takenAt: Number.NaN, routeIndex: Number.NaN },
      { id: 'safe', uri: 'content://safe', takenAt: 1, routeIndex: 99 },
    ],
  });
  const result = draft.buildPeriodStoryDraft({
    trips: [ignored, invalidRoute, excludedInvalid, valid],
    events: [],
    choices: {
      excludedTripIds: ['excluded-bad'],
      excludedPhotoKeys: [],
      tripChapterOverrides: {},
    },
    from: new Date(2024, 7, 1),
    to: new Date(2024, 7, 31),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.trips.map(item => item.id))), ['valid']);
  assert.equal(result.unavailableTrips.length, 2);
  assert.equal(result.omittedPhotoCount, 2, 'invalid + excluded is counted once per source photo');
  assert.deepEqual(JSON.parse(JSON.stringify(result.trips[0].photos.map(photo => photo.routeIndex))), [2, 0]);
  assert.match(draft.photoKey('a:b', { id: 'c:d', uri: '', takenAt: 0 }), /^\["a:b","c:d"\]$/);
});

test('flattened trips follow chapter order rather than global timestamp order', () => {
  const early = trip('early', '2024-08-01');
  const middle = trip('middle', '2024-08-02');
  const late = trip('late', '2024-08-03');
  const result = draft.buildPeriodStoryDraft({
    trips: [early, middle, late],
    events: [{
      id: 'event',
      title: 'Souvenir',
      startDate: '2024-08-01',
      endDate: '2024-08-03',
      includedTripIds: ['early', 'late'],
      excludedTripIds: [],
    }],
    choices: { excludedTripIds: [], excludedPhotoKeys: [], tripChapterOverrides: { middle: 'day' } },
    from: new Date(2024, 7, 1),
    to: new Date(2024, 7, 31),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.trips.map(item => item.id))), ['early', 'late', 'middle']);
});

function makeStorage() {
  const values = new Map();
  let failWrites = false;
  return {
    values,
    setFailWrites(value) { failWrites = value; },
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) {
      if (failWrites) throw new Error('write failed');
      values.set(key, value);
    },
  };
}

test('storage CRUD survives reload, serialises writes, validates metadata and exposes write failures', async () => {
  const storage = makeStorage();
  const mod = loadTypeScript('utils/periodStoryStorage.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
  });
  const event = {
    id: 'e',
    title: 'Août',
    startDate: '2024-08-01',
    endDate: '2024-08-31',
    includedTripIds: ['t'],
    excludedTripIds: [],
  };
  await mod.saveFamilyEvent(event);
  event.title = 'mutated caller';
  assert.equal((await mod.loadFamilyEvents())[0].title, 'Août');
  await mod.saveFamilyEvent({ ...event, title: 'updated' });
  assert.equal((await mod.loadFamilyEvents())[0].title, 'updated');
  await mod.savePeriodChoices('delete-reload', {
    excludedTripIds: ['kept-exclusion'],
    excludedPhotoKeys: ['kept-photo'],
    photoCaptions: { 'trip:photo': 'Souvenir en famille' },
    tripChapterOverrides: { assigned: 'e', neutral: 'day' },
  });
  await mod.deleteFamilyEvent('e');
  assert.deepEqual(await mod.loadFamilyEvents(), []);
  const cleaned = await mod.loadPeriodChoices('delete-reload');
  assert.deepEqual(JSON.parse(JSON.stringify(cleaned)), {
    excludedTripIds: ['kept-exclusion'],
    excludedPhotoKeys: ['kept-photo'],
    photoCaptions: { 'trip:photo': 'Souvenir en famille' },
    tripChapterOverrides: { neutral: 'day' },
  });
  const reloaded = loadTypeScript('utils/periodStoryStorage.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await reloaded.loadPeriodChoices('delete-reload'))),
    JSON.parse(JSON.stringify(cleaned)), 'removed event assignments stay removed across reload');

  const choices = {
    excludedTripIds: ['t'],
    excludedPhotoKeys: ['t:p'],
    photoCaptions: { 't:p': 'Chez Mamie' },
    tripChapterOverrides: { t: 'day' },
  };
  await mod.savePeriodChoices('2024-08-01_2024-08-31', choices);
  choices.excludedTripIds.push('caller-mutation');
  assert.deepEqual(JSON.parse(JSON.stringify(await mod.loadPeriodChoices('2024-08-01_2024-08-31'))), {
    excludedTripIds: ['t'],
    excludedPhotoKeys: ['t:p'],
    photoCaptions: { 't:p': 'Chez Mamie' },
    tripChapterOverrides: { t: 'day' },
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(await mod.loadPeriodChoices('other'))),
    { excludedTripIds: [], excludedPhotoKeys: [], photoCaptions: {}, tripChapterOverrides: {} },
  );

  storage.setFailWrites(true);
  await assert.rejects(
    mod.savePeriodChoices('failed', { ...mod.EMPTY_STORY_CHOICES }),
    /write failed/,
  );
  storage.setFailWrites(false);
  assert.deepEqual(
    JSON.parse(JSON.stringify(await mod.loadPeriodChoices('failed'))),
    { excludedTripIds: [], excludedPhotoKeys: [], photoCaptions: {}, tripChapterOverrides: {} },
  );
});
