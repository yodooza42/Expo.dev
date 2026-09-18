# EAS Build Result

**Status:** FINISHED ✅  
**Build ID:** `58bd94ad-e2c3-43ca-879c-a491ac226a65`  
**Platform:** Android (APK — internal distribution)  
**Version:** 2.0.0 (versionCode 15)  
**SDK:** Expo SDK 54.0.0  
**Project:** `@yoann42s-team/application-yoann20`

**Started:** 2026-06-17T01:56:16Z  
**Finished:** 2026-06-17T02:11:04Z

## Download

**APK URL:**  
https://expo.dev/artifacts/eas/vl5w1tINxWH-xEQwVUsLzRjn_07d6vmUL_udvW3EBdo.apk

**Build page:**  
https://expo.dev/accounts/yoann42s-team/projects/application-yoann20/builds/58bd94ad-e2c3-43ca-879c-a491ac226a65

## What fixed the build

1. **`pnpm-lock.yaml` out of sync** — EAS runs `pnpm install --frozen-lockfile` on the whole monorepo. Running `pnpm install` at the workspace root re-synced the lockfile with `package.json` changes.
2. **Private Replit npm registry** — Added `.npmrc` with `registry=https://registry.npmjs.org/` so EAS servers can reach packages.
3. **`expo-glass-effect` removed** — This package only exists on Replit's private registry, not on public npm.
