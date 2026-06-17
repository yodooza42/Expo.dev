---
name: EAS Build fix — pnpm workspace lockfile
description: How to fix EAS build failures for yoann2 Expo app in pnpm monorepo
---

## The problem
EAS detects the repo root as a pnpm workspace and runs `pnpm install --frozen-lockfile` on the WHOLE workspace. If `pnpm-lock.yaml` at the root is out of sync with `artifacts/yoann2/package.json`, the build fails immediately at "Install dependencies" with `ERR_PNPM_OUTDATED_LOCKFILE`.

## The fix
Before every EAS build, run `pnpm install` at the workspace root to sync the lockfile:
```
cd /home/runner/workspace && pnpm install
```

## Also required
- `.npmrc` in `artifacts/yoann2/` with `registry=https://registry.npmjs.org/` — Replit's npm is routed through a private firewall (`package-firewall.replit.local`) that EAS servers cannot reach.
- No `expo-glass-effect` in package.json — it only exists in Replit's private registry, not on public npm.

## Build command
```
cd artifacts/yoann2 && EXPO_TOKEN=$EXPO_TOKEN EAS_NO_VCS=1 EAS_SKIP_AUTO_FINGERPRINT=1 npx eas build --platform android --profile apk --non-interactive --no-wait
```

**Why:** `EAS_NO_VCS=1` bypasses git lock issues. `EAS_SKIP_AUTO_FINGERPRINT=1` avoids fingerprint timeouts.
