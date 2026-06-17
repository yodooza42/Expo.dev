---
name: EAS build minSdkVersion fix (bare workflow)
description: How to resolve minSdkVersion conflicts when expo-root-project plugin forces SDK 24 and a library requires SDK 26+
---

## Rule
`android.minSdkVersion` in `app.json` est invalide — `expo doctor` le rejette et bloque les builds EAS.

Les overrides Gradle (`defaultConfig { minSdkVersion 26 }`, `afterEvaluate { ... }`, `ext.minSdkVersion = 26`) NE FONCTIONNENT PAS — le plugin `expo-root-project` utilise `allprojects { afterEvaluate {} }` et réécrit toutes ces valeurs. Même une approche à 3 couches échoue.

**Correct fix:** Ajouter `<uses-sdk tools:overrideLibrary="androidx.health.connect.client"/>` directement dans `android/app/src/main/AndroidManifest.xml`. Cela indique au manifest merger d'ignorer la contrainte minSdk de la bibliothèque. Safe tant que la disponibilité est vérifiée au runtime (ce que `useHealthConnect.ts` fait déjà).

**Why:** `expo-root-project` (de `expo-modules-autolinking`) set `rootProject.ext.minSdkVersion = 24` et configure tous les sous-projets via `allprojects`. Son `afterEvaluate` tourne APRÈS celui du module app — le plugin gagne toujours côté Gradle. L'approche manifest bypasse Gradle entièrement.

**How to apply:** Quand une bibliothèque lève "uses-sdk:minSdkVersion X cannot be smaller than version Y" lors du manifest merge, utiliser `tools:overrideLibrary="<library.package.name>"` — pas un workaround Gradle.
