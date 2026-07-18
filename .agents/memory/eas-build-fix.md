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
**Use the Replit workflow approach** (archive is ~347MB, compression takes ~66s, total >120s — bash tool times out):
```javascript
await configureWorkflow({
  name: "EAS Build vXX",
  command: `cd /home/runner/workspace/artifacts/yoann2 && EXPO_TOKEN="<token>" GIT_OPTIONAL_LOCKS=0 EAS_SKIP_AUTO_FINGERPRINT=1 /home/runner/workspace/.config/npm/node_global/bin/eas build --platform android --profile production --non-interactive --no-wait 2>&1`,
  outputType: "console",
  autoStart: true
});
// Wait ~2.5 minutes (compression 66s + upload 5s + auth), then:
const s = await getWorkflowStatus({ name: "EAS Build vXX", maxScrollbackLines: 100 });
// Look for "See logs: https://..." in s.output
await removeWorkflow({ name: "EAS Build vXX" });
```
The global eas binary is at `/home/runner/workspace/.config/npm/node_global/bin/eas`.

## Account history (monthly quota)
| Account | Slug | Project ID | Status |
|---|---|---|---|
| marie2.0 | yoann20 | 206ea9d5… | exhausted Jul 2026 |
| yoann42s-team | application-yoann20 | 875e84e9… | exhausted Jul 2026 |
| stpyoann | yoann-20 | 5b936768-fba3-49ab-b3d6-ce5f820fb035 | exhausted Jul 2026 |
| yozvfkzucbzbc | yoann-20 | 6774b277-b066-4921-bcbb-b88f0959acb4 | exhausted Jul 2026 |
| yoann420-team | yoann-20 | 4c6f8706-6d85-44d4-aeea-9c1edf3be837 | exhausted Jul 2026 |
| yo13juills-team | yo13juill | 0e087e7f-e0c6-45ca-844a-ea88ee3701a8 | exhausted Jul 2026 |
| yoann42s-teami | yoann-20 | 206fa3d3-8913-4c38-be7e-d228bdcc2e01 | exhausted Jul 2026 |
| **stpyoann202027rbfifs-team** | **yoann-20** | **2bfd24b3-58f5-470c-92d8-487b9d469576** | **ACTIVE — build v85 soumis Jul 2026** |

**app.json currently points to: stpyoann202027rbfifs-team / yoann-20 / 2bfd24b3-58f5-470c-92d8-487b9d469576**

When user provides new token: update `EXPO_TOKEN` secret AND `app.json` → `expo.owner` + `expo.extra.eas.projectId`.
Then check `eas whoami` output to confirm owner name matches before running build.

## Free plan quota
~30 Android builds/month per account. Reset 1st of each month. Error: "This account has used its Android builds from the Free plan this month".

## Reading EAS logs (brotli NDJSON)
Get log URLs via GraphQL `builds.byId(buildId).logFiles`, fetch each, decode with Node: `zlib.brotliDecompressSync(raw).toString('utf8')`, split on `\n`, JSON.parse each line, read `.msg`.

## React Compiler
MUST stay disabled (`experiments.reactCompiler: false` in app.json babel config).

## android/ dir in workspace (benign)
`artifacts/yoann2/android/` exists (previous prebuild). EAS warns "android directory detected" but still builds fine. Cosmetic warning only.
