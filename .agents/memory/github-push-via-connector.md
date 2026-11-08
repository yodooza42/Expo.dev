---
name: GitHub push via Replit connector
description: The GitHub OAuth connection and the terminal Git credential helper are separate in Replit.
---

When an authorized GitHub connection is not attached to the current Repl, bind the existing `connection` before using it. Even after binding, shell `git push` may remain unauthenticated; use the connector API without exposing credentials. An empty GitHub repository must first receive a bootstrap Contents commit, then its Git blobs/tree/commit/ref can be created through the API. Throttle connector requests below the proxy's rate limit. Before telling this user a GitHub build contains recent edits, verify that those edits are on the requested remote branch.

**Why:** Replit's connector proxy injects credentials for API calls but does not install a GitHub credential helper into the shell, and the proxy rate-limits bursts.

**How to apply:** Verify the target repository and branch, refuse to overwrite an existing branch automatically, preserve file modes and binary content, and verify key files through GitHub after publishing.

**Why:** The user wants builds launched from GitHub to contain the latest project changes.

**How to apply:** When a build is expected from GitHub, check that the latest requested code is present on its source branch; don't claim a local-only change will be in that build.