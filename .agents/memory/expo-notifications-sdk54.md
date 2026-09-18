---
name: Expo SDK 54 notification triggers
description: How to schedule weekly and monthly recurring notifications in Expo SDK 54.
---

## Rule
Use `SchedulableTriggerInputTypes` from `expo-notifications` for typed triggers.

- **Weekly (Sunday 16h):** `type: SchedulableTriggerInputTypes.WEEKLY`, `weekday: 1` (1 = Sunday in Expo), `hour: 16`, `minute: 0`.
- **Monthly last day:** No built-in "last day of month" trigger. Use `type: SchedulableTriggerInputTypes.DATE` with a one-shot Date set to the last day of the current (or next) month at 16h, then reschedule on each fire.

**Why:** Expo notifications does not have a native "last day of month" recurring trigger. The DATE one-shot approach is the only reliable way. The weekday numbering starts at 1 = Sunday (not Monday) in `SchedulableTriggerInputTypes.WEEKLY`.

**How to apply:** In `utils/notificationScheduler.ts`, `scheduleWeeklyReport` uses WEEKLY trigger, `scheduleMonthlyReport` computes the next last-day Date and uses a DATE trigger.
