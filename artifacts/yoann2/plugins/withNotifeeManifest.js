/**
 * Plugin Expo : override android:foregroundServiceType du ForegroundService notifee.
 *
 * Le AAR core notifee (202108261754) déclare son service avec
 * foregroundServiceType="shortService". Sur Android 14+ (API 34+), shortService
 * est limité à 3 minutes max — le service est tué immédiatement sur certains OEM
 * (Samsung One UI 7). On remplace par "dataSync" (durée illimitée, permission
 * FOREGROUND_SERVICE_DATA_SYNC déjà déclarée dans app.json).
 */

const { withAndroidManifest } = require('expo/config-plugins');

const withNotifeeManifest = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // xmlns:tools requis pour tools:replace
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const app = manifest.application[0];
    if (!app.service) app.service = [];

    const entry = {
      $: {
        'android:name': 'app.notifee.core.ForegroundService',
        'android:exported': 'false',
        'android:foregroundServiceType': 'dataSync',
        'tools:replace': 'android:foregroundServiceType',
      },
    };

    const idx = app.service.findIndex(
      (s) => s.$?.['android:name'] === 'app.notifee.core.ForegroundService',
    );

    if (idx >= 0) {
      app.service[idx] = entry;
    } else {
      app.service.push(entry);
    }

    return config;
  });
};

module.exports = withNotifeeManifest;
