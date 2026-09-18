---
name: Expo package versions
description: Installing Expo native modules with the correct SDK-compatible version
---

Always install Expo modules with `npx expo install <package>` (run inside the
artifact dir), never plain `pnpm add <package>`.

**Why:** Plain `pnpm add expo-image-manipulator` pulled version `^56.0.18` into an
Expo SDK 54 app (which needs `~14.0.x`). The version mismatch produced a native
module whose ABI was incompatible with the runtime, and the installed APK crashed
immediately on launch ("l'application ne fonctionne plus du tout") — not a JS error,
a hard native crash at startup.

**How to apply:** When adding any `expo-*` native module to a Replit Expo artifact,
use `npx expo install`. If an app that previously worked starts crashing right after
adding a dependency, check the installed version against the SDK's expected version
first — `expo install --check` / comparing to sibling expo-* package majors is the
fast diagnostic.
