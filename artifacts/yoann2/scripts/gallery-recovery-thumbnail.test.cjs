const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness(resolve = async asset => asset) {
  const slots = [], effects = [];
  let cursor = 0, selected = 0, unavailable = 0;
  const element = (type, props) => ({ type, props });
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(value) {
      const index = cursor++;
      return slots[index] ?? (slots[index] = { current: value });
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => value !== slots[index][i])) {
        slots[index] = deps;
        effects.push(fn);
      }
    },
  };
  const filename = path.resolve(__dirname, '../components/GalleryRecoveryThumbnail.tsx');
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module, exports: module.exports, Error, setTimeout: () => 1, clearTimeout: () => {},
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element };
      if (name === '@expo/vector-icons') return { MaterialCommunityIcons: 'Icon' };
      if (name === 'expo-image') return { Image: 'Image' };
      if (name === 'react-native') return {
        ActivityIndicator: 'Spinner', Pressable: 'Pressable', Text: 'Text', View: 'View',
        StyleSheet: { absoluteFill: { position: 'absolute' } },
      };
      if (name === '@/hooks/useColors') return { useColors: () => ({}) };
      if (name === '@/utils/galleryPhotoRecovery') return { resolveRecoveryAsset: resolve };
      throw new Error(name);
    },
  });
  function render() {
    cursor = 0;
    const tree = module.exports.GalleryRecoveryThumbnail({
      asset: { assetId: '42', uri: 'content://gallery/42', filename: 'IMG_42.jpg' },
      size: 96, onSelect: () => selected++, onUnavailable: () => unavailable++,
    });
    effects.splice(0).forEach(fn => fn());
    return tree;
  }
  function find(tree, type) {
    if (!tree || typeof tree !== 'object') return null;
    if (tree.type === type) return tree;
    const children = tree.props?.children;
    for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
      const found = find(child, type);
      if (found) return found;
    }
    return null;
  }
  return { render, find, selected: () => selected, unavailable: () => unavailable };
}

test('native candidates have explicit pixel dimensions and cannot be chosen before decoding', () => {
  const h = harness();
  let tree = h.render();
  assert.equal(h.find(tree, 'Pressable').props.style.width, 96);
  assert.equal(h.find(tree, 'Pressable').props.style.height, 96);
  assert.equal(h.find(tree, 'Image').props.style.width, 92);
  assert.ok(h.find(tree, 'Spinner'));
  h.find(tree, 'Pressable').props.onPress();
  assert.equal(h.selected(), 0);
  h.find(tree, 'Image').props.onLoad();
  tree = h.render();
  assert.equal(h.find(tree, 'Spinner'), null);
  h.find(tree, 'Pressable').props.onPress();
  assert.equal(h.selected(), 1);
});

test('failed gallery URI retries with MediaLibrary local URI before reporting failure', async () => {
  const h = harness(async asset => ({ ...asset, uri: 'file:///gallery/original.jpg' }));
  h.find(h.render(), 'Image').props.onError();
  await new Promise(setImmediate);
  assert.equal(h.find(h.render(), 'Image').props.source.uri, 'file:///gallery/original.jpg');
  assert.equal(h.unavailable(), 0);
  h.find(h.render(), 'Image').props.onError();
  await new Promise(setImmediate);
  let tree = h.render();
  assert.equal(h.unavailable(), 1);
  assert.equal(h.find(tree, 'Spinner'), null);
  h.find(tree, 'Pressable').props.onPress();
  assert.equal(h.selected(), 0);
  tree = h.render();
  assert.ok(h.find(tree, 'Spinner'));
});

test('unavailable cloud photos show the real reason rather than a selectable black tile', async () => {
  const h = harness(async () => { throw new Error('Original uniquement dans le cloud'); });
  h.find(h.render(), 'Image').props.onError();
  await new Promise(setImmediate);
  const tree = h.render();
  assert.match(JSON.stringify(tree), /Original uniquement dans le cloud/);
  assert.equal(h.unavailable(), 1);
  assert.equal(h.selected(), 0);
});
