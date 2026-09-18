const path = require('path');

// @expo/config-plugins is not a direct dependency of this workspace package,
// but it is always bundled with expo itself. We resolve it via expo's package
// root so this works regardless of the module resolver (pnpm, yarn, npm).
const expoRoot = path.dirname(require.resolve('expo/package.json'));
const { withAndroidManifest } = require(
  require.resolve('@expo/config-plugins', { paths: [expoRoot] }),
);

/**
 * Config plugin : déclare l'app comme application de navigation auprès
 * d'Android (comme Waze/Google Maps) :
 *
 *  - android:appCategory="maps" sur <application> — Samsung One UI et le
 *    gestionnaire de batterie Android traitent les apps "maps" avec plus de
 *    clémence : le foreground service GPS et sa notification ne sont pas
 *    tués/masqués par l'optimisation batterie agressive.
 *  - <uses-feature android.hardware.location.gps> — signale l'usage GPS
 *    matériel comme fonctionnalité centrale de l'app.
 */
module.exports = function withNavigationApp(config) {
  return withAndroidManifest(config, async (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    const application = manifest.application?.[0];
    if (application) {
      application.$['android:appCategory'] = 'maps';
    }

    if (!manifest['uses-feature']) manifest['uses-feature'] = [];
    const features = manifest['uses-feature'];
    if (!features.some((f) => f.$?.['android:name'] === 'android.hardware.location.gps')) {
      features.push({
        $: {
          'android:name': 'android.hardware.location.gps',
          'android:required': 'false',
        },
      });
    }

    return modConfig;
  });
};
