---
name: Widget trip live refresh — must call updateTodoWidget from GPS task
description: The Android widget never auto-refreshes km/time during a trip unless explicitly triggered from the GPS background task.
---

## Rule
`updateTodoWidget()` must be called (throttled) from inside the `background-location-task` TaskManager task in `locationTracking.ts` to push km/elapsed-time updates to the widget during an active trip.

**Why:** Android only delivers `WIDGET_UPDATE` every ~30 min. The widget task handler only re-renders on explicit actions (clicks, app foreground). Without a call from the GPS task, the distance and elapsed time displayed on the widget stay frozen at their value when the trip started.

**How to apply:**
- Import `updateTodoWidget` from `@/widgets/updateWidget` in `locationTracking.ts`.
- Add a module-level `_lastWidgetUpdateMs` throttle variable (`WIDGET_UPDATE_THROTTLE_MS = 30_000`).
- After `AsyncStorage.setItem(TRIP_DIST_KEY, ...)`, call `updateTodoWidget().catch(() => {})` if `Date.now() - _lastWidgetUpdateMs >= WIDGET_UPDATE_THROTTLE_MS`.
- The import resolves to the no-op stub on iOS — safe cross-platform.
