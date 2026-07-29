---
name: EAS Build fix — yoann2 Expo app
description: How to fix EAS build failures for yoann2 Expo app in pnpm monorepo (lockfile, minSdkVersion, VCS upload, quota)
---

## Lockfile sync (always do first)
EAS detects the repo root as a pnpm workspace and runs `pnpm install --frozen-lockfile` on the WHOLE workspace. If root `pnpm-lock.yaml` is out of sync with `artifacts/yoann2/package.json`, the build fails immediately at "Install dependencies" with `ERR_PNPM_OUTDATED_LOCKFILE`.
Fix: `cd /home/runner/workspace && pnpm install` before every EAS build.

## Also required
- `.npmrc` in `artifacts/yoann2/` with `registry=https://registry.npmjs.org/` — Replit's npm is routed through a private firewall EAS servers cannot reach.
- No `expo-glass-effect` in package.json — only in Replit's private registry, not public npm.

## minSdkVersion (native dep needs ≥ 26)
`react-native-health-connect` pulls `androidx.health.connect:connect-client` which needs minSdkVersion ≥ 26, but expo prebuild defaults to 24 → manifest merger fails. Fix via `expo-build-properties` plugin in app.json.

## Build command (works)
Use `--no-wait` flag so bash doesn't timeout. The global eas binary is at `/home/runner/workspace/.config/npm/node_global/bin/eas`.
```bash
cd /home/runner/workspace/artifacts/yoann2 && export EXPO_TOKEN=$EXPO_TOKEN && GIT_OPTIONAL_LOCKS=0 /home/runner/workspace/.config/npm/node_global/bin/eas build --platform android --profile production --non-interactive --no-wait 2>&1
```
Archive is ~171MB (after adding .easignore?), uploads in ~3s. Command exits quickly with "See logs: https://..." URL.

## Before running build — owner check
Run `eas whoami` first to confirm the EXPO_TOKEN matches the `owner` in app.json. If they differ, the build fails with "Owner of project identified by extra.eas.projectId does not match owner specified in the owner field."

## Account history (monthly quota)
| Account | Slug | Project ID | Status |
|---|---|---|---|
| marie2.0 | yoann20 | 206ea9d5… | exhausted Jul 2026 |
| yoann42s-team | application-yoann20 | 875e84e9… | exhausted Jul 2026 |
| stpyoann | yoann-20 | 5b936768… | exhausted Jul 2026 |
| yozvfkzucbzbc | yoann-20 | 6774b277… | exhausted Jul 2026 |
| yoann420-team | yoann-20 | 4c6f8706… | exhausted Jul 2026 |
| yo13juills-team | yo13juill | 0e087e7f… | exhausted Jul 2026 |
| yoann42s-teami | yoann-20 | 206fa3d3… | exhausted Jul 2026 |
| stpyoann202027rbfifs-team | yoann-20 | 2bfd24b3… | exhausted Jul 2026 |
| yo1907cjeicjebfs-team | yoann-20 | 80f5b084-24ba-42e5-8377-5c6b055e4538 | exhausted Jul 2026 |
| **yoluran2307s-team** | **yoann-20** | **6b473886-5625-4512-aad4-c933c55218ef** | **ACTIVE — dernier build 29 Jul 2026** |

**app.json currently points to: yoluran2307s-team / yoann-20 / 6b473886-5625-4512-aad4-c933c55218ef**

When user provides new token: update `EXPO_TOKEN` secret AND `app.json` → `expo.owner` + `expo.extra.eas.projectId`.
Then run `eas whoami` to confirm account name, then check owner in app.json matches before running build.

## Free plan quota
~30 Android builds/month per account. Reset 1st of each month. Error: "This account has used its Android builds from the Free plan this month".

## Reading EAS logs (brotli NDJSON)
Get log URLs via GraphQL `builds.byId(buildId).logFiles`, fetch each, decode with Node: `zlib.brotliDecompressSync(raw).toString('utf8')`, split on `\n`, JSON.parse each line, read `.msg`.

## React Compiler
MUST stay disabled (`experiments.reactCompiler: false` in app.json babel config).

## android/ dir in workspace (benign)
`artifacts/yoann2/android/` exists (previous prebuild). EAS warns "android directory detected" but still builds fine. Cosmetic warning only.
