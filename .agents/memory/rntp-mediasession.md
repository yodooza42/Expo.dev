---
name: RNTP non-swipeable notification
description: react-native-track-player creates a non-swipeable MediaStyle notification via Android MediaSession STATE_PLAYING — the Spotify approach.
---

## Rule
Use `react-native-track-player` (not notifee `ongoing:true`) to achieve a truly non-swipeable trip notification on One UI / Android 14+.

**Why:** Samsung removed the `ongoing:true` swipe protection on Android 14+ (One UI 6+). The only reliable way to prevent swipe is an active Android MediaSession in `STATE_PLAYING`, which is what Spotify/music apps use. RNTP's `MusicService` creates this MediaSession automatically when playing.

**How to apply:**
- `autoHandleInterruptions: false` in `setupPlayer()` maps to `handleAudioFocus = false` in ExoPlayer (verified in MusicService.kt line 146) → Spotify is never interrupted
- Ghost audio: short WAV sinusoid at ~2.4% amplitude, played in loop at 1% volume (inaudible but not total silence — One UI doesn't cut non-silent streams as battery optimization)
- `pauseTripSession()` must keep RNTP playing (just update metadata) — pausing RNTP would set MediaSession to PAUSED and make the notification swipeable again
- RNTP manifest declares `MusicService` with `foregroundServiceType="mediaPlayback"` — merges automatically via Gradle, no Expo plugin needed
- Add `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK` to `app.json` permissions manually
- `registerPlaybackService()` must be called at module level in `app/_layout.tsx` BEFORE any `setupPlayer()` call
