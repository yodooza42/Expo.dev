---
name: RNTP TypeScript bundled assets
description: How to correctly type React Native require() assets for use with react-native-track-player 4.x.
---

## Rule
Cast bundled audio assets with `as unknown as string` when passing to `TrackPlayer.add()`.

**Why:** `AddTrack = Track & { url: string | ResourceObject }` — TypeScript resolves the intersection as `string & (string | number) = string`. So `url: number` (from `require()`) fails the type check even though RNTP accepts it at runtime. Same issue with `artwork` in `NowPlayingMetadata` (only accepts `string`, not `ResourceObject`).

**How to apply:**
```typescript
// Correct: cast for url
await TrackPlayer.add([{
  url: (audioFile as unknown) as string,
  title: '...',
  // Do NOT include artwork here — NowPlayingMetadata.artwork = string only
}]);

// Correct: no artwork in updateNowPlayingMetadata
await TrackPlayer.updateNowPlayingMetadata({ title, artist, album: 'App' });
```

Also: always wrap the track in an array `[{...}]` to force TypeScript to use overload 1 `(tracks: AddTrack[])` — passing a single object literal triggers ambiguous overload resolution.
