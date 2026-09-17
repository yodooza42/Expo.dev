---
name: Widget recovery after long trips
description: Android widget and GPS state recovery after a manual trip lasting many hours.
---

Long manual trips must not leave an unbounded raw GPS day in AsyncStorage, and the foreground location service must be fully stopped before the next trip is armed. A stale active state without a registered location task must be treated as recoverable and reset.

**Why:** Android AsyncStorage stores each GPS day as one value. A very long trip can make that value large enough for later widget state writes to fail, while an un-awaited service stop can race with the next start.

**How to apply:** Keep daily raw GPS history sampled to a bounded size, compact old days before starting a new trip, clear the active trip mode when ending, await service shutdown, and verify state persistence before rendering the widget as active.