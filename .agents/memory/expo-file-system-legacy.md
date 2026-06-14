---
name: expo-file-system v19 legacy API
description: expo-file-system v19+ changed its module structure; legacy API needs a different import path.
---

## Rule
Import from `expo-file-system/legacy` (not `expo-file-system`) to access the classic API.

```ts
// WRONG (breaks in v19+)
import * as FileSystem from 'expo-file-system';
FileSystem.documentDirectory  // TS error: property does not exist

// CORRECT
import * as FileSystem from 'expo-file-system/legacy';
FileSystem.documentDirectory  // works
FileSystem.EncodingType.UTF8  // works
```

**Why:** expo-file-system v19 (Expo SDK 54) restructured exports into a new Next API. The classic helpers (`documentDirectory`, `EncodingType`, `writeAsStringAsync`, etc.) are only available via the `/legacy` sub-path export.

**How to apply:** Any file that imports `expo-file-system` and uses `documentDirectory`, `EncodingType`, `readAsStringAsync`, `writeAsStringAsync`, `makeDirectoryAsync`, `getInfoAsync`, or `deleteAsync` must use the `/legacy` path.
