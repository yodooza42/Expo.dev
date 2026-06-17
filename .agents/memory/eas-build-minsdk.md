---
name: EAS Build minSdkVersion fix
description: How to override expo-root-project's minSdkVersion forcing for Health Connect support
---

## Problem
`expo-modules-autolinking`'s `expo-root-project` Gradle plugin forces `minSdkVersion=24` on all subprojects.
`react-native-health-connect` depends on `androidx.health.connect:connect-client:1.1.0-alpha11` which requires `minSdkVersion=26`.
This causes manifest merger to fail: "minSdkVersion 24 cannot be smaller than version 26 declared in library".

## Root Cause
The `expo-root-project` plugin reads `ext.minSdkVersion` from the root project **during its `apply()` call** (not in afterEvaluate).
It captures this value at apply time. If `ext.minSdkVersion` is not yet set when the plugin applies, it defaults to 24 and captures 24 for all subsequent hooks.

## Failed Approaches
1. `ext.minSdkVersion = 26` AFTER `apply plugin: "expo-root-project"` — too late, plugin already captured 24
2. `afterEvaluate { android.defaultConfig.minSdkVersion 26 }` in `app/build.gradle` — AGP finalizes inputs between plugin's afterEvaluate and ours
3. `<uses-sdk android:minSdkVersion="24" tools:overrideLibrary="androidx.health.connect.client"/>` in AndroidManifest.xml — AGP replaces the `<uses-sdk>` element entirely from build.gradle value, so `tools:overrideLibrary` is lost

## Working Fix
In `android/build.gradle`, set `ext.minSdkVersion = 26` **BEFORE** `apply plugin: "expo-root-project"`:

```groovy
// Must be set BEFORE expo-root-project applies — it reads ext.minSdkVersion during apply()
ext.minSdkVersion = 26

apply plugin: "expo-root-project"
apply plugin: "com.facebook.react.rootproject"
```

**Why:** The plugin reads `rootProject.ext.minSdkVersion` during `apply()`. Setting it before the apply ensures the plugin captures 26. It then propagates 26 to all subprojects via its internal `allprojects { afterEvaluate {} }` hooks.

**How to apply:** Any time `expo-modules-autolinking` is updated and minSdk issues reappear, check that `ext.minSdkVersion` is declared before `apply plugin: "expo-root-project"` in `android/build.gradle`.

Also keep `minSdkVersion 26` in `android/app/build.gradle` `defaultConfig` as a secondary guarantee.
