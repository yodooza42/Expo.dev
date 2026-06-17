---
name: EAS build minSdkVersion fix (bare workflow)
description: How to correctly set minSdkVersion 26 for health-connect in a committed android/ folder project
---

## Rule
`android.minSdkVersion` in `app.json` is NOT a valid Expo schema field — `expo doctor` fails on it and blocks EAS builds.

**Why:** Expo's config schema rejects unknown fields under `android`. The `minSdkVersion` key only works during `expo prebuild` for managed workflow. In bare workflow (committed `android/` folder), it's ignored anyway.

## How to set minSdkVersion 26 in bare workflow

Three layers needed because `expo-root-project` Gradle plugin forces `minSdkVersion = 24` via `allprojects`:

1. `android/build.gradle` — add AFTER the plugin applies:
   ```groovy
   ext.minSdkVersion = 26
   ```

2. `android/app/build.gradle` — hardcode in `defaultConfig`:
   ```groovy
   minSdkVersion 26
   ```

3. `android/app/build.gradle` — add at the end to guarantee last-word:
   ```groovy
   afterEvaluate {
       android.defaultConfig.minSdkVersion 26
   }
   ```

**Why:** The `expo-root-project` plugin sets `rootProject.ext.minSdkVersion = 24` and may override `defaultConfig` via `allprojects`. The `afterEvaluate` block in the app module runs after all plugin hooks and cannot be overridden.
