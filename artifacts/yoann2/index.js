// Intercept any fatal JS crash and show it on-screen instead of silently closing
const prevHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  if (isFatal) {
    const { Alert } = require('react-native');
    setTimeout(() => {
      Alert.alert(
        'Erreur de démarrage',
        `${error?.message || String(error)}\n\n${(error?.stack || '').slice(0, 400)}`,
        [{ text: 'OK' }]
      );
    }, 300);
  }
  if (typeof prevHandler === 'function') prevHandler(error, isFatal);
});

// Load the app — catch any import-time throw
try {
  require('expo-router/entry');
} catch (e) {
  const { Alert } = require('react-native');
  setTimeout(() => {
    Alert.alert(
      'Erreur au chargement',
      `${e?.message || String(e)}\n\n${(e?.stack || '').slice(0, 400)}`,
      [{ text: 'OK' }]
    );
  }, 300);
}

// Android widget task handler (best-effort, non-fatal)
const { Platform } = require('react-native');
if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./widgets/taskHandler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (e) {
    // widget registration failed — not fatal
  }
}
