---
name: ImagePicker URIs are temporary
description: expo-image-picker returns cache URIs that disappear after app restart, causing black images.
---

## Rule
Never store a raw `expo-image-picker` URI. Always copy the file to `documentDirectory` immediately after picking, then store the permanent URI.

```ts
import * as FileSystem from 'expo-file-system/legacy';

async function persistPhoto(tempUri: string): Promise<string> {
  const dir = FileSystem.documentDirectory + 'task_photos/';
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const ext = tempUri.split('.').pop()?.split('?')[0] ?? 'jpg';
  const dest = dir + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;
  await FileSystem.copyAsync({ from: tempUri, to: dest });
  return dest;
}
```

Call `persistPhoto(asset.uri)` right after `launchCameraAsync` or `launchImageLibraryAsync`, before storing in state or context.

**Why:** On Android, `expo-image-picker` returns `file:///data/user/0/<pkg>/cache/ImagePicker/xxx.jpg`. Android clears the app cache at any time (low memory, app restart, system GC). When the cache file is gone, React Native renders the image black instead of erroring. `documentDirectory` is under the app's private files directory and is never cleared by the OS.

**How to apply:** Any screen that uses `ImagePicker.launchCameraAsync` or `ImagePicker.launchImageLibraryAsync` must run the URI through `persistPhoto` before saving. This applies to all photo-picking flows in the app (tasks, and any future flows added for projects, expenses, etc.).
