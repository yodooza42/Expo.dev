---
name: notifee Expo plugin absent
description: @notifee/react-native 9.x has no Expo config plugin — do not add it to app.json plugins array or the build will crash.
---

## Rule
Do NOT add `"@notifee/react-native"` to the `plugins` array in `app.json`.

**Why:** Version 9.1.8 ships no `app.plugin.js` and its main export is not a valid Expo config plugin. Adding it causes `expo config` to throw `PluginError: Unable to resolve a valid config plugin`, which blocks the EAS build before any code is compiled.

**How to apply:** The notifee AAR declares its own `NotifeeInitProvider` in its `AndroidManifest.xml`; the Gradle manifest merger includes it automatically during the EAS build. No extra plugin entry is needed. Just install the package, call `notifee.registerForegroundService()` at module level in `app/_layout.tsx`, and declare any extra permissions manually in `app.json`:
- `android.permission.FOREGROUND_SERVICE_DATA_SYNC` (for dataSync FGS type on Android 14+)
- `android.permission.POST_NOTIFICATIONS` (Android 13+, also covered by expo-notifications plugin)
- `android.permission.WAKE_LOCK` (optional but recommended for background service stability)
