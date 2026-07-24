---
name: Walk route — skip OSRM, use GPS with fine epsilon
description: Why walk trips must never go through OSRM routing, and which epsilon to use for simplification.
---

## Rule
For `savedMode === 'balade'` in `taskHandler.tsx`, skip `matchRouteOSRM` entirely and simplify GPS points with `EPSILON_DEG_WALK` (≈ 4 m) from `routeSimplification.ts`.

**Why:** OSRM is a driving router — it snaps any route to bitumen roads and ignores trails, park paths, pond circuits, etc. Result: angular, wrong-road shape instead of the actual walking path.

**How to apply:**
- In `taskHandler.tsx`: `const isWalkMode = savedMode === 'balade'` → guard `matchRouteOSRM` call with `!isWalkMode`.
- In `routeSimplification.ts`: `EPSILON_DEG_WALK = 0.000036` (~4 m) exported alongside the default `EPSILON_DEG = 0.000135` (~15 m).
- `simplifyRoute` accepts an optional second `epsilon` arg — use `EPSILON_DEG_WALK` for walks.
- The "Recalculer tracé GPS" button in `trip-map.tsx` uses the same logic to fix old trips that were stored with an OSRM route.
