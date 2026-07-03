import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';

import { getShortcutEmoji } from '@/utils/navigationShortcuts';
import type { NavShortcut } from '@/utils/navigationShortcuts';

const BG: ColorProp      = '#1A1A1A';
const SURFACE: ColorProp = '#202020';
const PRIMARY: ColorProp = '#FFC107';
const TEXT: ColorProp    = '#FFFFFF';
const MUTED: ColorProp   = '#9E9E9E';
const SCHEME = 'yoann2';

export interface TodayApptNav {
  title: string;
  time: string;
  lat: number;
  lng: number;
}

export function NavigationWidget({
  shortcuts,
}: {
  shortcuts: NavShortcut[];
  todayAppt?: TodayApptNav | null;
}) {
  // 3 shortcut slots + 1 fuel button = 4 columns
  const slots: (NavShortcut | null)[] = Array.from({ length: 3 }, (_, i) => shortcuts[i] ?? null);

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'row',
        backgroundColor: BG,
        borderRadius: 16,
        padding: 8,
        flexGap: 8,
      }}
    >
      <ShortcutButton slot={slots[0] ?? null} />
      <ShortcutButton slot={slots[1] ?? null} />
      <ShortcutButton slot={slots[2] ?? null} />
      <FuelButton />
    </FlexWidget>
  );
}

function ShortcutButton({ slot }: { slot: NavShortcut | null }) {
  const ready = slot != null && slot.lat != null && slot.lng != null;
  const uri = ready && slot != null
    ? `waze://?ll=${slot.lat},${slot.lng}&navigate=yes`
    : `${SCHEME}:///navigation`;

  const emoji = slot ? getShortcutEmoji(slot.icon) : '+';
  const label = slot ? slot.name : 'Ajouter';

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      style={{
        flex: 1,
        height: 'match_parent',
        backgroundColor: SURFACE,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
      }}
    >
      <TextWidget
        text={emoji}
        style={{
          fontSize: 24,
          color: ready ? PRIMARY : MUTED,
          fontFamily: 'sans-serif-medium',
        }}
      />
    </FlexWidget>
  );
}

function FuelButton() {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: `${SCHEME}:///navigation?action=fuel` }}
      style={{
        flex: 1,
        height: 'match_parent',
        backgroundColor: SURFACE,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
      }}
    >
      <TextWidget
        text="⛽"
        style={{ fontSize: 24, color: MUTED, fontFamily: 'sans-serif-medium' }}
      />
    </FlexWidget>
  );
}
