---
name: Yoann2 Android home-screen widget
description: How the react-native-android-widget feature shares data and is wired into the Expo entry point without breaking the web bundle.
---

# Yoann2 home-screen widget (react-native-android-widget)

The "TodoWidget" shows the day's tasks + appointments with PREV/NEXT day navigation. Code lives in `artifacts/yoann2/widgets/`.

**Data sharing (key insight):** the widget's headless task handler reads the SAME `AsyncStorage` keys the app writes (`@yoann2_tasks`, `@yoann2_appointments`). AsyncStorage IS readable from the react-native-android-widget headless JS context — no native bridge or SharedPreferences plumbing needed. The selected day is persisted in `@yoann2_widget_offset`.
**Why it matters:** this is the whole reason an offline AsyncStorage app can power a widget; don't reach for a custom native module.

**Two render paths:**
- Headless (`taskHandler.tsx`): reads everything from storage (`getWidgetDataFromStorage`).
- App-triggered (`updateWidget.android.tsx`): builds widget data from in-memory React state (`buildWidgetData`) to avoid a stale read right after a mutation; only the offset is read from storage.

**Entry-point / web-safety pattern (don't break the web preview):**
- `package.json` `main` is `index.js`, which does `import 'expo-router/entry'` then registers the widget handler **only** inside `if (Platform.OS === 'android')` via `require(...)`.
- `updateWidget.ts` is a web/iOS no-op; `updateWidget.android.tsx` is the real impl. Platform-file resolution keeps the Android-only `react-native-android-widget` imports out of the web runtime. AppContext imports `./updateWidget` and calls it from a `useEffect([tasks, appointments, loading])`.
**Why:** importing the native widget lib on web would break the Replit web preview; the Android guards + `.android` files prevent that. Always re-verify the web preview after touching the entry point.

**CRITICAL gotcha — React Compiler breaks the widget render:** with Expo's `experiments.reactCompiler: true`, the widget renders its STRUCTURE (so it's placed and clickable/tappable to open the app) but paints **completely blank/invisible** — no text or background. react-native-android-widget renders the component tree in a headless React root with its own reconciler, and the React Compiler's transform breaks it.
**Fix:** set `experiments.reactCompiler: false` in `app.json` and rebuild the APK. (Targeted alternative: a `"use no memo"` directive on the widget components, but disabling the flag is the reliable one-shot fix.) Symptom signature to recognize: "widget invisible but I can click it to open the app."

**Other notes:**
- `clickAction="OPEN_APP"` is handled natively by the library (opens the app); it does NOT reach the JS task handler. `OPEN_URI` needs `clickActionData:{uri}`.
- Widget colors are the app's DEFAULT priority palette; it intentionally does NOT follow the user's custom ThemeContext colors.
- The widget only appears in an installed APK, never in Expo Go.
