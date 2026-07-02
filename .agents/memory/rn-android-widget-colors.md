---
name: react-native-android-widget color format
description: Color format pitfall when setting backgroundColor in react-native-android-widget FlexWidget — 8-digit hex is CSS RRGGBBAA, not Android AARRGGBB.
---

## Rule

Always use **6-digit `#RRGGBB`** hex for `ColorProp` values in `react-native-android-widget` components (e.g. `FlexWidget`, `TextWidget`).

Never use 8-digit hex for opaque colors. `#FF121212` looks like "fully-opaque dark" in Android notation (`AA=FF`) but React Native parses it as CSS `#RRGGBBAA` where the last two digits are the alpha channel — so `#FF121212` = R=255 G=18 B=18 A=18 = **nearly-transparent red**.

## Why

React Native's color parser follows the CSS/W3C standard (`#RRGGBBAA`), not Android's convention (`#AARRGGBB`). The library passes colors through React Native's parser, so Android's convention does not apply anywhere in the JS/TS layer.

## How to apply

- Solid opaque colors: use `#121212`, `#202020`, `#FFFFFF` (6 digits, no alpha).
- Semi-transparent colors: use `rgba(r, g, b, a)` string or `#RRGGBBAA` with the alpha at the END (e.g. `#12121280` = `#121212` at 50% opacity).
- When reviewing existing `ColorProp` values, treat any 8-digit hex starting with `#FF` as a bug — it will render red with ~7% opacity, not the intended opaque color.

## Native layer belt-and-suspenders

The `rn_widget.xml` root `FrameLayout` from the library has no background. Override it in the app at `android/app/src/main/res/layout/rn_widget.xml` (and `layout-night/`) with `android:background="#121212"`. App-level resources take priority over library resources in Gradle's resource merge, so this override survives library upgrades only if the layout structure stays the same — recheck after upgrading `react-native-android-widget`.
