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
  assert.ok(content.paddingBottom > 32, 'last chart clears the system navigation area');
  const body = scroll.getText(tree);
  for (const name of ['TripSpeedChart', 'TripAltitudeChart', 'trip.distanceKm']) {
    assert.ok(body.includes(name), `${name} must scroll with all memories`);
  }
});
