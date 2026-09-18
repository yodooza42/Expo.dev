---
name: Expo Android release crash diagnosis
description: How to localize an immediate-launch crash in an Expo Android release APK from the visible symptom, plus the New Architecture / Reanimated 4 constraint.
---

# Diagnosing "app launches then closes" on a release APK

Map the user-visible symptom to the crash location (works because the native
splash theme shows the instant the process starts, before any JS runs):

- **Closes instantly, nothing shown** → native crash in `MainApplication.onCreate`
  (a native module's package init). JS-level try/catch cannot help.
- **Native splash appears, THEN closes (no app UI)** → uncaught error during JS
  *bundle execution* or root render, BEFORE the first screen. This is the window
  of `index.js` + the root `_layout` provider tree.
- **A real screen flashes, then closes** → error while rendering that screen.

**Key narrowing rule:** an `ErrorBoundary` only catches JS render errors *inside*
its subtree — it shows a fallback, it does NOT close the app. So if the app
hard-closes, the fault is either (a) JS code that runs *outside* React (e.g.
`index.js`, or the root component's own body above the ErrorBoundary), or (b) a
native crash. Anything thrown by providers wrapped in ErrorBoundary would render
the fallback, not close the app — use that to rule large areas out.

**Highest-risk app code:** synchronous native/module calls at the top of
`index.js` run before React mounts and before any ErrorBoundary, so an exception
there is a fatal startup crash. Always wrap them in try/catch (e.g.
`registerWidgetTaskHandler` from `react-native-android-widget`). Likewise make
top-level `SplashScreen.preventAutoHideAsync()` non-throwing with `.catch()`.

**When you cannot fix it from symptom alone:** the only ground truth for a native
crash is `adb logcat` from the device. Exhaust the symptom-based narrowing first.
A useful intermediate step before logcat: inject a global `ErrorUtils.setGlobalHandler`
+ `try/catch` around `require('expo-router/entry')` in `index.js` to show an on-screen
Alert for any JS crash. If no alert appears despite the guard, the crash is definitely
native (ruled out JS entirely without needing the user to install adb tools).

**Confirmed native crash case — react-native-health-connect:** In Expo SDK 54 /
RN 0.81.5 + New Architecture, `react-native-health-connect@3.5.3` caused a silent
native startup crash ("splash then close", zero JS alert) on Android. Fix: remove
the library + its plugin block from `app.json` + its entry from `package.json`.
Likely cause: native module init fails on devices where Health Connect is absent or
unsupported (requires Android 14 / Health Connect app). This pattern applies to any
health/sensor native module with hard device requirements.

# Reanimated 4 ⇒ New Architecture is mandatory

`react-native-reanimated@4.x` only supports the New Architecture (Fabric). Do NOT
set `expo.newArchEnabled = false` while Reanimated 4 is installed — it breaks the
build/runtime differently. Disabling New Arch would require downgrading Reanimated
to 3.x, a much larger change. **Why:** generic "turn off new arch to reduce risk"
advice is wrong for this stack. **How to apply:** if you suspect a new-arch native
incompat, get logcat and fix the offending module instead of disabling new arch.

# Babel worklets plugin is auto-added on SDK 54

`babel-preset-expo@54` automatically adds `react-native-worklets/plugin` when
`react-native-worklets` is installed. Do NOT add it manually to `babel.config.js`
— a duplicate plugin can cause issues. Verify with a grep of the installed
`babel-preset-expo/build/index.js` before touching babel.
