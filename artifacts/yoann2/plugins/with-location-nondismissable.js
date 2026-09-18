/**
 * Plugin Expo : rend la notification GPS non-swipeable sur Android 14+.
 *
 * Sur Android 14+ (API 34+, Samsung One UI 7), les FGS de type "location"
 * peuvent être supprimées par l'utilisateur depuis le panneau de notifications.
 * La SEULE exception garantie par l'OS : foregroundServiceType="mediaPlayback".
 * Les notifications FGS de type mediaPlayback ne peuvent jamais être swipées
 * tant que le service est actif.
 *
 * Ce plugin ajoute "mediaPlayback" au foregroundServiceType du service
 * expo-location (LocationTaskConsumer). Le type "location" est conservé
 * car expo-location en a besoin pour fonctionner. La permission
 * FOREGROUND_SERVICE_MEDIA_PLAYBACK est déjà déclarée dans app.json
 * (requise pour expo-video / carPlayer).
 *
 * Pas de touche au code JS — uniquement une modification de l'AndroidManifest.
 */

const { withAndroidManifest } = require('expo/config-plugins');

const LOCATION_SERVICE = 'expo.modules.location.taskmanagers.LocationTaskConsumer';

const withLocationNondismissable = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const app = manifest.application[0];
    if (!app.service) app.service = [];

    const entry = {
      $: {
        'android:name':                  LOCATION_SERVICE,
        'android:exported':              'false',
        'android:foregroundServiceType': 'location|mediaPlayback',
        'tools:replace':                 'android:foregroundServiceType',
      },
    };

    const idx = app.service.findIndex(
      (s) => s.$?.['android:name'] === LOCATION_SERVICE,
    );

    if (idx >= 0) {
      app.service[idx] = entry;
    } else {
      app.service.push(entry);
    }

    return config;
  });
};

module.exports = withLocationNondismissable;
