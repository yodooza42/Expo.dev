const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../app/trip-map.tsx'), 'utf8');
const tree = ts.createSourceFile('trip-map.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
function visit(node) {
  nodes.push(node);
  ts.forEachChild(node, visit);
}
visit(tree);
const attr = (node, name) => node.attributes.properties.find(
  item => ts.isJsxAttribute(item) && item.name.getText(tree) === name,
);
const expression = (node, name) => attr(node, name)?.initializer?.expression?.getText(tree);
const objectValue = (text, context = {}) => vm.runInNewContext(`(${text})`, context);

test('the hidden Android story renderer cannot consume the trip statistics viewport', () => {
  const webView = nodes.find(node => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(tree) === 'WebView'
    && expression(node, 'ref') === 'storyWebViewRef');
  assert.ok(webView);
  const host = webView.parent;
  assert.ok(ts.isJsxElement(host));
  assert.equal(host.openingElement.tagName.getText(tree), 'View');
  assert.equal(expression(host.openingElement, 'style'), 'styles.storyWebView');
  assert.equal(expression(host.openingElement, 'collapsable'), 'false');
  assert.equal(attr(host.openingElement, 'pointerEvents').initializer.text, 'none');
  const style = nodes.find(node => ts.isPropertyAssignment(node)
    && node.name.getText(tree) === 'storyWebView');
  const hostStyle = objectValue(style.initializer.getText(tree));
  assert.equal(hostStyle.position, 'absolute');
  assert.equal(hostStyle.width, 1);
  assert.equal(hostStyle.height, 1);
  assert.equal(hostStyle.opacity, 0);
  assert.equal(hostStyle.overflow, 'hidden');
  // react-native-webview's Android wrapper defaults to flex:1 independently
  // of the inner native view's style. Constrain both, not only the inner view.
  for (const property of ['containerStyle', 'style']) {
    const styleValue = objectValue(expression(webView, property));
    assert.equal(styleValue.flex, 0);
    assert.equal(styleValue.width, 1);
    assert.equal(styleValue.height, 1);
  }
});

test('memories, trip totals and both charts stay in one bounded scroll area', () => {
  const details = nodes.find(node => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(tree) === 'ActivityDetails');
  const scroll = details.parent;
  assert.ok(ts.isJsxElement(scroll));
  assert.equal(scroll.openingElement.tagName.getText(tree), 'ScrollView');
  const style = objectValue(expression(scroll.openingElement, 'style'));
  assert.equal(style.flex, 1);
  assert.equal(style.minHeight, 0);
  assert.equal(expression(scroll.openingElement, 'removeClippedSubviews'), 'false');
  const content = objectValue(expression(scroll.openingElement, 'contentContainerStyle'), {
    insets: { bottom: 32 },
  });
  assert.ok(content.paddingBottom > 32, 'last content clears the system navigation area');
  const body = scroll.getText(tree);
  for (const name of ['TripSpeedChart', 'TripAltitudeChart', 'trip.distanceKm']) {
    assert.ok(body.includes(name), `${name} must scroll with all memories`);
  }
  const memories = nodes.find(node => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(tree) === 'ActivityMemories');
  assert.ok(memories);
  assert.equal(memories.parent, scroll, 'memories use the same scroll area, not a nested scroll');
  assert.ok(details.pos < bodyStart('trip.distanceKm'), 'the activity header remains above the totals');
  assert.ok(memories.pos > bodyStart('<TripSpeedChart'));
  assert.ok(memories.pos > bodyStart('<TripAltitudeChart'), 'all photos and notes follow both charts');
  function bodyStart(text) {
    const position = source.indexOf(text, scroll.pos);
    assert.ok(position >= scroll.pos);
    return position;
  }
});

test('the relocated memories preserve all photos, notes and positions, and hide an empty section', () => {
  const text = fs.readFileSync(path.join(__dirname, '../components/ActivityDetails.tsx'), 'utf8');
  const ast = ts.createSourceFile('ActivityDetails.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node)
    && node.name?.text === 'ActivityMemories');
  assert.ok(component);
  const compiled = ts.transpileModule(component.getText(ast).replace(/^export /, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  const render = trip => vm.runInNewContext(`${compiled}; ActivityMemories({trip, vehicles: []})`, {
    trip,
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    Image: 'Image', Text: 'Text', View: 'View',
    useColors: () => ({ foreground: '#fff', mutedForeground: '#888', border: '#333' }),
    activityForTrip: () => 'bike',
  });
  assert.equal(render({ activityMoments: [] }), null);
  assert.equal(render({}), null);
  const trip = {
    photos: Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, uri: `content://photo-${i}` })),
    activityMoments: Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`, photoId: `p${i}`, note: `Souvenir ${i}`, lat: 45, lng: 1,
      placementMethod: i === 0 ? 'estimated' : 'manual',
    })),
  };
  const before = JSON.stringify(trip);
  const rendered = render(trip);
  const elements = [];
  function flatten(value) {
    if (Array.isArray(value)) return value.forEach(flatten);
    if (value && typeof value === 'object') {
      elements.push(value);
      flatten(value.children);
    }
  }
  flatten(rendered);
  const photos = elements.filter(node => node.type === 'Image');
  assert.equal(photos.length, 20);
  assert.equal(photos[19].props.source.uri, 'content://photo-19');
  const content = JSON.stringify(rendered);
  for (let i = 0; i < 20; i++) assert.ok(content.includes(`Souvenir ${i}`));
  assert.ok(content.includes('Position estimée sur le parcours'));
  assert.ok(content.includes('Souvenir placé sur le parcours'));
  assert.equal(JSON.stringify(trip), before, 'reordering sections does not change stored memories');
});
