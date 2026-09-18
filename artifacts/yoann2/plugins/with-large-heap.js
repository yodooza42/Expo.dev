const path = require('path');

// @expo/config-plugins is not a direct dependency of this workspace package,
// but it is always bundled with expo itself. We resolve it via expo's package
// root so this works regardless of the module resolver (pnpm, yarn, npm).
const expoRoot = path.dirname(require.resolve('expo/package.json'));
const { withAndroidManifest } = require(
  require.resolve('@expo/config-plugins', { paths: [expoRoot] }),
);

/**
 * Config plugin: sets android:largeHeap="true" on the <application> tag.
 * Raises the per-process heap limit from ~256 MB to ~512 MB so that
 * expo-print can embed multiple full-res photos without OOM crashes.
 */
module.exports = function withLargeHeap(config) {
  return withAndroidManifest(config, async (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:largeHeap'] = 'true';
    }
    return modConfig;
  });
};
