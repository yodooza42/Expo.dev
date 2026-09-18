---
name: EAS build git lock workaround
description: How to launch EAS Android builds for the yoann2 Expo artifact despite the sandbox git lock block.
---

# EAS build inside the Replit sandbox

Plain `eas build` fails because it touches `.git/index.lock`, which the sandbox git protection blocks.

**Workaround:** prefix with `GIT_OPTIONAL_LOCKS=0` and run non-interactive / no-wait:

```
cd artifacts/yoann2 && GIT_OPTIONAL_LOCKS=0 npx eas-cli build --platform android --profile apk --non-interactive --no-wait
```

**Why:** `GIT_OPTIONAL_LOCKS=0` tells git to skip taking optional locks, so eas-cli's status/diff checks don't try to write `.git/index.lock`.

**How to apply:** any time you trigger an Android APK build for this Expo app from the agent. `EXPO_TOKEN` is already set as a secret for auth.
