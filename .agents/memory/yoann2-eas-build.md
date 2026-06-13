---
name: Yoann2 EAS APK builds
description: How to authenticate and run the Android APK build for the yoann2 Expo artifact, with the non-obvious gotchas.
---

# Building the yoann2 Android APK (EAS)

Run from `artifacts/yoann2`. eas-cli is installed globally. The `apk` profile in `eas.json` is internal-distribution, `buildType: apk`.

Command that works:
`EAS_NO_VCS=1 eas build --platform android --profile apk --non-interactive --no-wait`

**Auth:** EAS authenticates via the `EXPO_TOKEN` **secret** (account `yoann42`). 
**Why:** A token pasted into chat is NOT stored anywhere the shell can read it — `setEnvVars` cannot set secrets, so you must use the environment-secrets `requestEnvVar` secure field. After it's added, new shells get `$EXPO_TOKEN` automatically; verify with `eas whoami`.

**Gotchas / why:**
- `EAS_NO_VCS=1` is required because the build runs inside a pnpm monorepo; without it EAS tries to use VCS and misresolves the project. (Expo warns this is "not recommended" — that warning is expected, ignore it.)
- Backgrounding the build with `nohup ... &` failed silently (empty log, no build submitted) — the credential-resolution step needs a foreground TTY-ish context. **Run it in the foreground.** Use `--no-wait` so the command returns right after upload+queue (well under the 2-min bash timeout) instead of blocking ~20 min.
- Native changes (e.g. adding a native module) require a **full APK rebuild** — `eas update` (OTA) only ships JS and cannot deliver native code.
- Bump `android.versionCode` in `app.json` for each new build so the phone installs over the old one.
- Poll status with `eas build:list --platform android --limit 3` or `eas build:view <id>`; the artifact `.apk` URL appears when finished.
