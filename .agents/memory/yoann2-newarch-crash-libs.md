---
name: yoann2 New Arch crash — removed libraries
description: Two libraries caused a native startup crash (splash-then-close) on New Architecture Android in yoann2. Removing them fixed the crash.
---

## Rule
When `newArchEnabled=true`, libraries with Old-Arch-only native modules crash Android at startup before JS runs — no Alert ever shows.

## Libraries that caused the crash

- **react-native-maps@1.20.1** — auto-linked native module crashes on New Arch. Git history commit `478b2c4` said "Replace map with WebView to avoid crashes" but only changed the UI; the library was never removed from `package.json`. Fixed by removing from `package.json` entirely; `map.native.tsx` already uses WebView (Leaflet via react-native-webview).
- **@react-native-ml-kit/text-recognition@2.0.0** — excluded from `expo doctor` compatibility check, signalling known New Arch incompatibility. Used via dynamic `await import(...)` in `OcrScanModal.tsx` (lazy, inside try-catch) but the native module was still auto-linked and crashed on startup. Fixed by removing from `package.json` and replacing the dynamic import with a graceful "OCR indisponible" fallback.

**Why:** Native module auto-linking registers ALL packages in `package.json` at build time regardless of whether JS ever imports them. Old Arch modules that don't implement TurboModule/JSI crash during RN init, before JS runs.

**How to apply:** If the app shows splash-then-close with no JS error Alert: check for Old-Arch-only libraries in `package.json`. Even if the UI code was replaced, the library must be fully removed from `package.json` (not just its import).

## Diagnostic tool added
`MainApplication.kt` has `installNativeCrashReporter()` (UncaughtExceptionHandler → writes to `filesDir/native_crash.txt`) and `showPreviousCrashIfExists()` (reads crash file BEFORE `loadReactNative()` → Toast + persistent notification). This shows the crash even if the app crashes again immediately.
