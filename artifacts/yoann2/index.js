// ── Native crash reporter (reads previous crash from disk) ──────────────────
const { Platform } = require('react-native');
if (Platform.OS === 'android') {
  try {
    const FileSystem = require('expo-file-system');
    const crashPath = (FileSystem.documentDirectory || '').replace(/\/documents\/$/, '/') + 'native_crash.txt';
    FileSystem.readAsStringAsync(crashPath).then((msg) => {
      if (msg) {
        FileSystem.deleteAsync(crashPath, { idempotent: true }).catch(() => {});
        const { Alert } = require('react-native');
        Alert.alert('💥 Crash natif (run précédent)', msg.slice(0, 600), [{ text: 'OK' }]);
      }
    }).catch(() => {});
  } catch (_) {}
}

// ── JS crash interceptor ────────────────────────────────────────────────────
const prevHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  if (isFatal) {
    const { Alert } = require('react-native');
    setTimeout(() => {
      Alert.alert(
        '💥 Erreur JS fatale',
        `${error?.message || String(error)}\n\n${(error?.stack || '').slice(0, 400)}`,
        [{ text: 'OK' }]
      );
    }, 200);
  }
  if (typeof prevHandler === 'function') prevHandler(error, isFatal);
});

// ── Load the app ─────────────────────────────────────────────────────────────
try {
  require('expo-router/entry');
} catch (e) {
  const { Alert } = require('react-native');
  setTimeout(() => {
    Alert.alert(
      '💥 Erreur au chargement',
      `${e?.message || String(e)}\n\n${(e?.stack || '').slice(0, 400)}`,
      [{ text: 'OK' }]
    );
  }, 200);
}

// ── Android widget task handler (best-effort, non-fatal) ─────────────────────
if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./widgets/taskHandler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (e) {
    // widget registration failed — not fatal
  }
}
