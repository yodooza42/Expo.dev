const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const tree = 'content://com.android.externalstorage.documents/tree/primary%3AYoann2.0';
const doc = name => `${tree}/document/${encodeURIComponent('primary:Yoann2.0/' + name)}`;

function environment() {
  const storage = new Map([['@yoann2_saf_photos_uri', doc('Photos')], ['@yoann2_saf_root_uri', tree]]);
  const files = new Map();
  const folders = new Map([[doc('Photos'), []]]);
  const operations = [];
  let denied = false;
  let corrupt = false;
  let failWrite = false;
  const saf = {
    readDirectoryAsync: async uri => {
      operations.push(['readDir', uri]);
      if (denied || !folders.has(uri)) throw new Error('permission denied');
      return folders.get(uri);
    },
    makeDirectoryAsync: async (parent, name) => {
      operations.push(['safMkdir', name]);
      const uri = doc(decodeURIComponent(parent.split('/document/')[1] ?? 'primary:Yoann2.0').split(':')[1] + '/' + name);
      folders.set(uri, []);
      folders.get(parent)?.push(uri);
      return uri;
    },
    createFileAsync: async (parent, name) => {
      operations.push(['create', name]);
      const parentId = decodeURIComponent(parent.split('/document/')[1]);
      const uri = `${tree}/document/${encodeURIComponent(parentId + '/' + name)}`;
      folders.get(parent)?.push(uri);
      return uri;
    },
    writeAsStringAsync: async (uri, bytes) => {
      if (denied) throw new Error('permission denied');
      files.set(uri, corrupt && uri.includes('.jpeg') ? bytes + 'corrupt' : bytes);
    },
    readAsStringAsync: async uri => {
      if (denied || !files.has(uri)) throw new Error('missing external file');
      return files.get(uri);
    },
    requestDirectoryPermissionsAsync: async () => {
      operations.push(['permission']);
      return { granted: true, directoryUri: tree };
    },
  };
  const filesystem = {
    documentDirectory: 'file:///app/files/',
    cacheDirectory: 'file:///app/cache/',
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    StorageAccessFramework: saf,
    getInfoAsync: async uri => ({ exists: files.has(uri) || folders.has(uri), size: files.get(uri)?.length ?? 0 }),
    makeDirectoryAsync: async uri => { operations.push(['localMkdir', uri]); },
    copyAsync: async ({ from, to }) => {
      if (!files.has(from)) throw new Error('source missing');
      files.set(to, files.get(from));
    },
    writeAsStringAsync: async (uri, bytes) => { files.set(uri, bytes); },
    readAsStringAsync: async uri => {
      if (!files.has(uri)) throw new Error('missing local file');
      return files.get(uri);
    },
  };
  const asyncStorage = {
    getItem: async key => storage.get(key) ?? null,
    setItem: async (key, value) => {
      if (failWrite) throw new Error('disk full');
      storage.set(key, value);
    },
    getAllKeys: async () => [...storage.keys()],
    multiGet: async keys => keys.map(key => [key, storage.get(key) ?? null]),
    multiRemove: async keys => keys.forEach(key => storage.delete(key)),
    removeItem: async key => storage.delete(key),
  };
  const cache = new Map();
  const overrides = {};
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const mod = { exports: {} };
    const compiled = ts.transpileModule(fs.readFileSync(path.join(ROOT, relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.React },
    }).outputText;
    vm.runInNewContext(`(function(module,exports,require){${compiled}\n})(mod,mod.exports,require)`, {
      mod, console, setTimeout: () => 1, clearTimeout: () => {},
      require: name => {
        if (name in overrides) return overrides[name];
        if (name === '@react-native-async-storage/async-storage') return asyncStorage;
        if (name === 'expo-file-system/legacy') return filesystem;
        if (name === 'react-native') return { Platform: { OS: 'android' }, Alert: { alert: () => {} } };
        if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
        throw new Error(`Unexpected import ${name}`);
      },
    });
    cache.set(relative, mod.exports);
    return mod.exports;
  }
  return {
    storage, files, folders, operations, load, overrides,
    deny: () => { denied = true; }, corrupt: () => { corrupt = true; },
    failWrite: value => { failWrite = value; },
  };
}

test('a gallery/cache source becomes a permanent byte-identical copy and a verified hidden external backup', async () => {
  const env = environment();
  const source = 'file:///app/cache/ImagePicker/photo.jpeg';
  const bytes = 'JPEG+EXIF:date=2026:original_bytes';
  env.files.set(source, bytes);
  const protection = env.load('utils/photoProtection.ts');
  const local = await protection.protectPhoto(source, { project: 'House', folder: 'Task_tache_ab12' });
  assert.ok(local.startsWith('file:///app/files/photo_vault/'));
  assert.equal(env.files.get(local), bytes);
  assert.equal(env.files.get(source), bytes, 'original dates and bytes never change');
  const records = JSON.parse(env.storage.get('@yoann2_photo_protection_v1'));
  assert.equal(env.files.get(records[0].external), bytes);
  const created = env.operations.filter(([kind]) => kind === 'create').map(([, name]) => name);
  assert.equal(created[0], '.nomedia');
  assert.ok(created[1].endsWith('.jpeg'));
  assert.ok(!env.operations.some(([kind]) => kind === 'permission'), 'no unsolicited permission dialog in background');
  env.files.delete(source);
  assert.equal(await protection.protectPhoto(source, { project: 'House', folder: 'Task_tache_ab12' }), local);
  assert.equal((await protection.photoProtectionStatus()).backedUp, 1);
});

test('a deleted private copy can be rebuilt from its verified external copy after restoring metadata', async () => {
  const env = environment();
  const source = 'file:///storage/emulated/0/DCIM/image.jpeg';
  env.files.set(source, 'bytes');
  const protection = env.load('utils/photoProtection.ts');
  const first = await protection.protectPhoto(source, { project: 'House' });
  env.files.delete(source);
  env.files.delete(first);
  const rebuilt = await protection.protectPhoto(first, { project: 'House' });
  assert.equal(env.files.get(rebuilt), 'bytes');
  const candidates = await env.load('utils/photoReferences.ts').photoCandidates(source);
  assert.ok(candidates.includes(rebuilt), 'legacy references can still resolve via the durable registry');
});

test('a failed external copy is explicitly pending, with the local copy retained', async () => {
  const env = environment();
  env.files.set('file:///app/cache/photo.jpeg', 'bytes');
  env.deny();
  const protection = env.load('utils/photoProtection.ts');
  const local = await protection.protectPhoto('file:///app/cache/photo.jpeg', { project: 'House' });
  assert.equal(env.files.get(local), 'bytes');
  const status = await protection.photoProtectionStatus();
  assert.equal(status.pending, 1);
  assert.equal(status.backedUp, 0);
  assert.ok(JSON.parse(env.storage.get('@yoann2_photo_protection_v1'))[0].error);
});

test('verification rejects external byte corruption instead of declaring a successful backup', async () => {
  const env = environment();
  env.files.set('file:///app/cache/photo.jpeg', 'original');
  env.corrupt();
  const protection = env.load('utils/photoProtection.ts');
  await protection.protectPhoto('file:///app/cache/photo.jpeg', { project: 'House' });
  assert.equal((await protection.photoProtectionStatus()).backedUp, 0);
  assert.equal((await protection.photoProtectionStatus()).pending, 1);
});

test('a missing photo is not replaced with a different file or recorded as protected', async () => {
  const env = environment();
  const protection = env.load('utils/photoProtection.ts');
  await assert.rejects(protection.protectPhoto('file:///old/files/task_photos/missing.jpeg', { project: 'House' }),
    /source inaccessible/);
  assert.equal((await protection.photoProtectionStatus()).local, 0);
});

test('concurrent imports preserve every registry entry and errors do not poison the queue', async () => {
  const env = environment();
  env.storage.delete('@yoann2_saf_photos_uri');
  const protection = env.load('utils/photoProtection.ts');
  const uris = Array.from({ length: 8 }, (_, i) => `file:///app/cache/${i}.jpeg`);
  uris.forEach((uri, i) => env.files.set(uri, `bytes${i}`));
  await Promise.all(uris.map(uri => protection.protectPhoto(uri, { project: 'House' })));
  assert.equal((await protection.photoProtectionStatus()).local, 8);
  env.failWrite(true);
  env.files.set('file:///app/cache/extra.jpeg', 'extra');
  await assert.rejects(protection.protectPhoto('file:///app/cache/extra.jpeg', { project: 'House' }), /disk full/);
  env.failWrite(false);
  await protection.protectPhoto('file:///app/cache/extra.jpeg', { project: 'House' });
  assert.equal((await protection.photoProtectionStatus()).local, 9);
});

test('repair replaces dead same-name links, retains readable originals and never deletes references', async () => {
  const env = environment();
  const merge = env.load('utils/photoReferences.ts').mergeRecoveredPhotoUris;
  const old = 'file:///old/task_photos/same.jpeg';
  const repaired = 'file:///app/files/project_photos/recovered/same.jpeg';
  const good = 'file:///app/files/keep.jpeg';
  env.files.set(repaired, 'restored');
  env.files.set(good, 'original');
  env.files.set('file:///new/keep.jpeg', 'other');
  const input = [old, good, 'file:///missing/unknown.jpeg'];
  const result = await merge(input, [repaired, 'file:///new/keep.jpeg']);
  assert.deepEqual(Array.from(result.uris), [repaired, good, input[2]]);
  assert.equal(result.repaired, 1);
  assert.equal(input[0], old);
});

test('shared-storage paths resolve only within granted trees; old private paths rebase exactly', async () => {
  const env = environment();
  const refs = env.load('utils/photoReferences.ts');
  assert.equal(refs.grantedPhotoUri('file:///storage/emulated/0/Yoann2.0/Photos/House/a.jpeg', tree), doc('Photos/House/a.jpeg'));
  assert.equal(refs.grantedPhotoUri('file:///storage/emulated/0/DCIM/a.jpeg', tree), null);
  assert.equal(refs.grantedPhotoUri('file:///storage/emulated/0/Yoann2.0/../DCIM/a.jpeg', tree), null);
  env.files.set('file:///app/files/task_photos/a.jpeg', 'valid');
  assert.ok((await refs.photoCandidates('file:///old/files/task_photos/a.jpeg')).includes('file:///app/files/task_photos/a.jpeg'));
});

test('recovery traverses nested albums, keeps task IDs and namespaces same-name files without creating source folders', async () => {
  const env = environment();
  const project = doc('Photos/House');
  const task = doc('Photos/House/Repair_tache_ab12');
  const album = doc('Photos/House/Repair_tache_ab12/Album (2)');
  const another = doc('Photos/House/Other_tache_cd34');
  env.folders.set(doc('Photos'), [project]);
  env.folders.set(project, [task, another]);
  env.folders.set(task, [album]);
  env.folders.set(album, [doc('Photos/House/Repair_tache_ab12/Album (2)/same.jpeg')]);
  env.folders.set(another, [doc('Photos/House/Other_tache_cd34/same.jpeg')]);
  env.files.set(env.folders.get(album)[0], 'task one');
  env.files.set(env.folders.get(another)[0], 'task two');
  const report = await env.load('utils/photoStorage.ts').recoverAllPhotosFromExternal(['House']);
  assert.equal(report.scannedImages, 2);
  assert.equal(report.errors.length, 0);
  const taskFolders = report.projects[0].taskFolders;
  assert.equal(taskFolders[0].taskId, 'ab12');
  assert.equal(taskFolders[1].taskId, 'cd34');
  assert.notEqual(taskFolders[0].uris[0], taskFolders[1].uris[0]);
  assert.equal(env.files.get(taskFolders[0].uris[0]), 'task one');
  assert.equal(env.files.get(taskFolders[1].uris[0]), 'task two');
  assert.ok(!env.operations.some(([kind]) => kind === 'safMkdir'));
});

test('recovery distinguishes access denial and partial failures from an empty readable folder', async () => {
  const empty = environment();
  assert.equal((await empty.load('utils/photoStorage.ts').recoverAllPhotosFromExternal(['House'])).scannedImages, 0);
  const denied = environment();
  denied.deny();
  await assert.rejects(denied.load('utils/photoStorage.ts').recoverAllPhotosFromExternal(['House']), /inaccessible/);
  const partial = environment();
  partial.folders.set(doc('Photos'), [doc('Photos/House')]);
  partial.folders.set(doc('Photos/House'), [doc('Photos/House/broken.jpeg'), doc('Photos/House/ok.jpeg')]);
  partial.files.set(doc('Photos/House/ok.jpeg'), 'ok');
  const result = await partial.load('utils/photoStorage.ts').recoverAllPhotosFromExternal(['House']);
  assert.equal(result.errors.length, 1);
  assert.equal(result.projects[0].projectUris.length, 1);
});

test('automatic protection covers projects, tasks and trip photos without changing trip anchors/captions', async () => {
  const env = environment();
  const effects = [];
  env.overrides.react = { useEffect: fn => effects.push(fn), useRef: current => ({ current }) };
  const trip = { id: 'trip', photos: [{ id: 'photo', uri: 'file:///gallery/trip.jpeg', routeIndex: 7, takenAt: 42, note: 'memory' }] };
  let tripPatch;
  env.overrides['@/utils/tripStorage'] = { getTrips: async () => [trip], updateTrip: async (id, patch) => { tripPatch = patch; } };
  env.overrides['@/utils/tripEvents'] = { tripEvents: { onTripUpdated: () => () => {}, emitTripUpdated: () => {} } };
  const project = { id: 'project', name: 'House', photos: ['file:///gallery/project.jpeg'] };
  const task = { id: 'task', title: 'Repair', projectId: 'project', photos: ['file:///gallery/task.jpeg'] };
  [project.photos[0], task.photos[0], trip.photos[0].uri].forEach(uri => env.files.set(uri, uri));
  let taskChanges, projectChanges;
  env.load('hooks/usePhotoProtection.ts').usePhotoProtection({
    projects: [project], tasks: [task], loading: false,
    replaceProject: (id, changes) => { projectChanges = changes; },
    replaceTask: (id, changes) => { taskChanges = changes; },
  });
  const cleanup = effects[0]();
  await env.load('utils/photoProtection.ts').photoProtectionEvents.retry();
  assert.ok(projectChanges.has(project.photos[0]));
  assert.ok(taskChanges.has(task.photos[0]));
  assert.equal(tripPatch.photos[0].id, 'photo');
  assert.equal(tripPatch.photos[0].routeIndex, 7);
  assert.equal(tripPatch.photos[0].takenAt, 42);
  assert.equal(tripPatch.photos[0].note, 'memory');
  assert.notEqual(tripPatch.photos[0].uri, trip.photos[0].uri);
  cleanup();
});

test('reinstall recovery scans trip folders and repairs exact links, preserving all photo metadata', async () => {
  const env = environment();
  const root = doc('Photos/Trajets');
  const folder = doc('Photos/Trajets/manual_123');
  const image = doc('Photos/Trajets/manual_123/saved.jpeg');
  env.folders.set(doc('Photos'), [root]);
  env.folders.set(root, [folder]);
  env.folders.set(folder, [image]);
  env.files.set(image, 'original-photo-bytes');
  const original = {
    id: 'p1', uri: 'file:///old-install/photo_vault/saved.jpeg',
    takenAt: 123456, routeIndex: 7, lat: 45, lng: 1, note: 'Pause plage', placementMethod: 'manual',
  };
  let trip = { id: 'manual_123', photos: [original] };
  let emissions = 0;
  env.overrides['@/utils/tripStorage'] = {
    getTrips: async () => [trip],
    updateTrip: async (id, patch, strict) => {
      assert.equal(strict, true);
      if (typeof patch === 'function') patch = patch(trip);
      trip = { ...trip, ...patch };
    },
  };
  env.overrides['@/utils/tripEvents'] = {
    tripEvents: { emitTripUpdated: () => { emissions++; } },
  };
  const scan = await env.load('utils/photoStorage.ts').recoverAllPhotosFromExternal(['Trajets']);
  assert.equal(scan.scannedImages, 1);
  const recovery = env.load('utils/tripPhotoRecovery.ts');
  const result = await recovery.recoverTripPhotos(scan.projects);
  assert.equal(result.repaired, 1);
  assert.equal(result.missing, 0);
  assert.equal(emissions, 1);
  assert.equal(env.files.get(trip.photos[0].uri), 'original-photo-bytes');
  assert.equal(JSON.stringify({ ...trip.photos[0], uri: original.uri }), JSON.stringify(original));
  assert.equal((await recovery.recoverTripPhotos(scan.projects)).repaired, 0);
});

test('trip recovery never guesses another trip, duplicates, or a photo without its bytes', async () => {
  const env = environment();
  const photo = { id: 'p', uri: 'file:///deleted/a.jpeg', takenAt: 1, note: 'kept' };
  const one = 'file:///recovered/one/a.jpeg';
  const two = 'file:///recovered/two/a.jpeg';
  env.files.set(one, 'one');
  env.files.set(two, 'different');
  let writes = 0;
  env.overrides['@/utils/tripStorage'] = {
    getTrips: async () => [{ id: 'mine', photos: [photo] }],
    updateTrip: async () => { writes++; },
  };
  env.overrides['@/utils/tripEvents'] = { tripEvents: { emitTripUpdated: () => {} } };
  const recovery = env.load('utils/tripPhotoRecovery.ts');
  const ambiguous = await recovery.repairTripPhotos([photo], [one, two, 'file:///missing/a.jpeg']);
  assert.equal(ambiguous.replacements.size, 0);
  assert.equal(ambiguous.missing, 1);
  const wrongTrip = await recovery.recoverTripPhotos([{
    projectName: 'Trajets', projectUris: [], taskFolders: [
      { folderName: 'someone_else', taskId: null, uris: [one] },
    ],
  }]);
  assert.equal(wrongTrip.repaired, 0);
  assert.equal(wrongTrip.missing, 1);
  assert.equal(writes, 0);
});

test('explicit gallery relink protects bytes and retains latest caption, position and souvenir identity', async () => {
  const env = environment();
  const original = { id: 'p', uri: 'file:///gone.jpeg', takenAt: 42, routeIndex: 7, lat: 45, lng: 1, note: 'before', placementMethod: 'manual' };
  let trip = { id: 'trip', photos: [original], moments: [{ photoId: 'p', caption: 'linked' }] };
  let writes = 0, emissions = 0;
  env.overrides['@/utils/tripStorage'] = {
    getTrips: async () => [trip],
    updateTrip: async (id, patch, strict) => {
      assert.equal(strict, true);
      if (typeof patch === 'function') patch = patch(trip);
      writes++;
      trip = { ...trip, ...patch };
    },
  };
  env.overrides['@/utils/photoProtection'] = {
    protectPhoto: async (source, owner) => {
      assert.equal(source, 'file:///gallery/original.jpeg');
      assert.equal(owner.project, 'Trajets');
      assert.equal(owner.folder, 'trip');
      trip = { ...trip, photos: [{ ...original, note: 'edited while copying' }] };
      return 'file:///app/files/photo_vault/permanent.jpeg';
    },
  };
  env.overrides['@/utils/tripEvents'] = { tripEvents: { emitTripUpdated: () => { emissions++; } } };
  const result = await env.load('utils/tripPhotoRecovery.ts').relinkTripPhoto('trip', 'p', 'file:///gallery/original.jpeg');
  assert.equal(result.photos.length, 1);
  assert.equal(result.photos[0].id, original.id);
  assert.equal(result.photos[0].note, 'edited while copying');
  assert.equal(result.photos[0].takenAt, 42);
  assert.equal(result.photos[0].routeIndex, 7);
  assert.equal(result.photos[0].placementMethod, 'manual');
  assert.equal(result.moments[0].photoId, 'p');
  assert.equal(writes, 1);
  assert.equal(emissions, 1);
});

test('gallery relink does not modify a missing souvenir or one whose new file cannot be protected', async () => {
  const env = environment();
  const trip = { id: 'trip', photos: [{ id: 'p', uri: 'old', note: 'keep' }] };
  let writes = 0, protections = 0;
  env.overrides['@/utils/tripStorage'] = {
    getTrips: async () => [trip],
    updateTrip: async () => { writes++; },
  };
  env.overrides['@/utils/photoProtection'] = {
    protectPhoto: async () => { protections++; throw new Error('source inaccessible'); },
  };
  env.overrides['@/utils/tripEvents'] = { tripEvents: { emitTripUpdated: () => {} } };
  const relink = env.load('utils/tripPhotoRecovery.ts').relinkTripPhoto;
  await assert.rejects(relink('trip', 'absent', 'new'), /introuvable/);
  assert.equal(protections, 0);
  await assert.rejects(relink('trip', 'p', 'new'), /inaccessible/);
  assert.equal(writes, 0);
  assert.equal(trip.photos[0].uri, 'old');
  assert.equal(trip.photos[0].note, 'keep');
});

test('the actual photo component tries alternatives then displays an explicit unavailable tile', async () => {
  const text = fs.readFileSync(path.join(ROOT, 'components/ProjectPhoto.tsx'), 'utf8');
  const ast = ts.createSourceFile('photo.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ResolvedPhoto');
  const code = ts.transpileModule(component.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  const values = [null, 0];
  let effect;
  let cursor;
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    useState: initial => {
      const index = cursor++;
      return [values[index], update => { values[index] = typeof update === 'function' ? update(values[index]) : update; }];
    },
    useEffect: fn => { effect = fn; },
    useColors: () => ({ card: '#111', mutedForeground: '#888', border: '#333' }),
    photoCandidates: async () => ['broken', 'fallback'],
    Image: 'Image', View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator',
    MaterialCommunityIcons: 'Icon', styles: { unavailable: {}, label: {} },
  });
  vm.runInContext(code, context);
  const render = () => {
    cursor = 0;
    return vm.runInContext('ResolvedPhoto({ uri: "original" })', context);
  };
  assert.equal(render().children[0].type, 'ActivityIndicator');
  effect();
  await new Promise(resolve => setImmediate(resolve));
  const first = render();
  assert.equal(first.props.source.uri, 'broken');
  first.props.onError();
  const fallback = render();
  assert.equal(fallback.props.source.uri, 'fallback');
  fallback.props.onError();
  assert.equal(render().props.accessibilityLabel, 'Photo inaccessible');
});
