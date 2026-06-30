---
name: react-native-android-widget color format
description: The library uses CSS #RRGGBBAA order, NOT Android's #AARRGGBB order. Using the wrong format produces transparent/wrong-color cards.
---

## Rule
`react-native-android-widget` uses **CSS hex order: `#RRGGBBAA`**, not Android's `#AARRGGBB`.

**Why:** `#FF202020` is parsed as R=255 (full red), G=32, B=32, A=12% → nearly transparent pink. The intended anthracite `#202020` with full opacity must be written `#202020FF`.

**How to apply:**
- Use `buildCardColor(bgColor, opacity)` and `buildNavbarColor(bgColor, opacity)` from `widgetSettings.ts` — they output the correct `#RRGGBBAA` format.
- Never hardcode `#AARRGGBB`-style constants in widget components.
- `TRANSPARENT` (`#00000000`) works in both orders since all bytes are zero — do not use it as a test case.
