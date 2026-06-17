---
name: EAS build minSdkVersion fix (bare workflow)
description: How to resolve minSdkVersion conflicts when expo-root-project plugin forces SDK 24 and a library requires SDK 26+
---

## Rule
Do NOT use `android.minSdkVersion` in `app.json` — invalid Expo schema, blocks builds.
Do NOT rely on Gradle overrides (`defaultConfig { minSdkVersion 26 }`, `afterEvaluate { ... }`) — the `expo-root-project` plugin uses `allprojects { afterEvaluate {} }` and overwrites ALL of these. Even a 3-layer approach fails.

**Correct fix:** Add the following to `android/app/src/main/AndroidManifest.xml` (MUST include BOTH attributes on the same element):
```xml
<uses-sdk android:minSdkVersion="24" tools:overrideLibrary="androidx.health.connect.client"/>
```

**CRITICAL:** `tools:overrideLibrary` alone (without `android:minSdkVersion`) is silently ignored by the manifest merger and the build still fails. Both attributes must be present on the same `<uses-sdk>` element.

**Why:** `expo-root-project` (from `expo-modules-autolinking`) sets `rootProject.ext.minSdkVersion = 24` and configures all subprojects via `allprojects` — it runs its `afterEvaluate` AFTER the app module's own `afterEvaluate`, so the plugin always wins in Gradle. The manifest approach bypasses Gradle entirely. Safe because `useHealthConnect.ts` already guards all Health Connect calls with runtime availability checks.

**How to apply:** When any library raises "uses-sdk:minSdkVersion X cannot be smaller than version Y" during manifest merge, use `<uses-sdk android:minSdkVersion="X" tools:overrideLibrary="<library.package.name>"/>` in the app's `AndroidManifest.xml` — not a Gradle workaround.
