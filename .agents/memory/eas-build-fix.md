---
name: EAS Build fix — yoann2 Expo app
description: How to fix EAS build failures for yoann2 Expo app in pnpm monorepo (lockfile, minSdkVersion, VCS upload)
---

## Lockfile sync (always do first)
EAS detects the repo root as a pnpm workspace and runs `pnpm install --frozen-lockfile` on the WHOLE workspace. If root `pnpm-lock.yaml` is out of sync with `artifacts/yoann2/package.json`, the build fails immediately at "Install dependencies" with `ERR_PNPM_OUTDATED_LOCKFILE`.
Fix: `cd /home/runner/workspace && pnpm install` before every EAS build.

## Also required
- `.npmrc` in `artifacts/yoann2/` with `registry=https://registry.npmjs.org/` — Replit's npm is routed through a private firewall EAS servers cannot reach.
- No `expo-glass-effect` in package.json — only in Replit's private registry, not public npm.

## minSdkVersion (native dep needs ≥ 26)
`react-native-health-connect` pulls `androidx.health.connect:connect-client` which needs minSdkVersion ≥ 26, but expo prebuild defaults to 24 → manifest merger fails (`uses-sdk:minSdkVersion 24 cannot be smaller than 26`). EAS mislabels this as `EAS_BUILD_UNKNOWN_GRADLE_ERROR`.
**Fix:** use the `expo-build-properties` config plugin in app.json (NOT a bare `android.minSdkVersion` field — that field is silently ignored by prebuild):
```json
["expo-build-properties", { "android": { "minSdkVersion": 26 } }]
```
Verify with `npx expo config --type prebuild` (shows the plugin) — prebuild log then prints `- minSdk: 26`.
**Why:** EAS runs `expo prebuild` which CLEARS & REGENERATES the entire gitignored `android/` dir every build, so editing `android/*.gradle` directly is always wasted. Only tracked files (app.json, package.json, eas.json) reach EAS.

## VCS / uploading uncommitted changes
The NORMAL git flow (`eas build` with no EAS_NO_VCS) **does include uncommitted changes to tracked files** — confirmed: an uncommitted app.json edit reached EAS and changed the prebuild output. So just run the normal flow.
**Avoid `EAS_NO_VCS=1`** here: its compression step is very slow (archives the whole working dir) and reliably gets killed by the agent's tool timeout / on tool return (even with setsid/nohup background), so no build ever starts.

## Build command (works)
```
cd artifacts/yoann2 && export EXPO_TOKEN=$EXPO_TOKEN && EAS_SKIP_AUTO_FINGERPRINT=1 GIT_OPTIONAL_LOCKS=0 eas build --platform android --profile apk --non-interactive --no-wait
```
`GIT_OPTIONAL_LOCKS=0` avoids `.git/index.lock` errors. `EAS_SKIP_AUTO_FINGERPRINT=1` avoids fingerprint timeouts.
EXPO_TOKEN must be exported (inline `EXPO_TOKEN=... eas build` is killed by sandbox; `export EXPO_TOKEN=...` first works).

## Account (statut juillet 2026 — quota épuisé)
- Owner dans app.json : `yoann42s-team`
- projectId dans app.json : `5b936768-fba3-49ab-b3d6-ce5f820fb035`
- Le EXPO_TOKEN actuel est lié à `marie2.0` (confirmé par `eas whoami`) → pas d'accès au projet `5b936768`
- Situation : l'utilisateur a créé un NOUVEAU projet EAS sur un compte différent mais le token fourni
  est toujours celui de `marie2.0`. Il faut le token du compte qui POSSÈDE `5b936768`.
- Pour débloquer : demander le token Access Token du compte propriétaire de `5b936768` sur expo.dev

## Ancien compte (référence)
- `marie2.0`, slug `yoann20`, projectId `206ea9d5-49cb-43f9-9bfa-e632d0fd7297` — quota Free épuisé juillet 2026, reset 1er août

## Free plan quota
Quota reset le 1er de chaque mois. Si build échoue avec "This account has used its Android builds
from the Free plan this month", quota épuisé. Upgrade payant ou attendre.

## Reading EAS logs (brotli NDJSON)
Get log URLs via GraphQL `builds.byId(buildId).logFiles`, fetch each, then decode with Node: `zlib.brotliDecompressSync(raw).toString('utf8')`, split on `\n`, JSON.parse each line, read `.msg`. Python has no brotli module here — use Node. Status via `eas build:view <ID>` or the GraphQL `status` field.

## React Compiler
MUST stay disabled (`experiments.reactCompiler: false` in app.json babel config).
