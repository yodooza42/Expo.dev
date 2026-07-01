---
name: EAS project coordinates — yoann-20
description: Correct slug, owner, and projectId for EAS builds after account migration
---

## Coordinates (as of 2026-07-01)

| Field      | Value                                  |
|------------|----------------------------------------|
| slug       | `yoann-20`                             |
| owner      | `yozvfkzucbzbc`                        |
| projectId  | `6774b277-b066-4921-bcbb-b88f0959acb4` |

These live in `artifacts/yoann2/app.json` (lines `slug`, `owner`, `extra.eas.projectId`).

**Why:** The old account `stpyoann48fbeocbekc` was replaced by `yozvfkzucbzbc` (the Replit-provisioned account). Builds using the old projectId `13c352b8-8396-4e9a-a06f-a57aa8f801bc` fail with "Entity not authorized: AppEntity[13c352b8...]".

**How to apply:** Always verify these three fields match before running `eas build`. If a build returns "Entity not authorized", re-check that `app.json` has the current values above, not the old stpyoann48fbeocbekc ones.

## Build command

```bash
cd artifacts/yoann2 && GIT_OPTIONAL_LOCKS=0 EAS_SKIP_AUTO_FINGERPRINT=1 eas build --platform android --profile apk --non-interactive --no-wait
```
