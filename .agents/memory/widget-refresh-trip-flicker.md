---
name: Android widget refresh flicker — trip data
description: Why the widget's manual refresh (spin) button flickered trip distance/duration back to 0.
---

The widget's manual "refresh" button handler (`handleRefresh` in `widgets/taskHandler.tsx`) rendered `AllInOneWidget` during its spin animation using only `getWidgetDataFromStorage()` + `getNavShortcuts()` + trip status — it never computed `tripMode`/`tripDistKm`/`tripElapsedMs`, which default to 0/null in the component. Meanwhile the periodic background render path (`renderWidget`) *did* compute these fields from `getManualTripState()` + `@yoann2_trip_dist_km`. Any manual refresh during an active trip briefly zeroed the displayed distance/time until the next background update overwrote it back — a visible flicker.

**Why:** two separate code paths (`renderWidget` for background/periodic updates, `handleRefresh` for the manual spin-button) each built the `AllInOneWidget` props independently, and only one of them included the trip fields.

**How to apply:** any widget render path that displays live trip/session data must go through a single shared prop-computation helper (now extracted as `computeTripFields(status)` in `widgets/taskHandler.tsx`) rather than each call site re-deriving (or omitting) fields ad hoc. When adding a new widget action/render path, always reuse that helper instead of duplicating the AllInOneWidget prop list.
