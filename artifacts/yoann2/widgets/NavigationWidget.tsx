import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';

import type { NavShortcut } from '@/utils/navigationShortcuts';

const BG: ColorProp      = '#1A1A1A';
const SURFACE: ColorProp = '#202020';
const PRIMARY: ColorProp = '#FFC107';
const TEXT: ColorProp    = '#FFFFFF';
const MUTED: ColorProp   = '#9E9E9E';
const SCHEME = 'yoann2';

export function NavigationWidget({ shortcuts }: { shortcuts: NavShortcut[] }) {
  const slots: (NavShortcut | null)[] = Array.from({ length: 4 }, (_, i) => shortcuts[i] ?? null);

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'column',
        backgroundColor: BG,
        borderRadius: 16,
        padding: 10,
      }}
    >
      {/* Header row */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          width: 'match_parent',
          height: 28,
        }}
      >
        <TextWidget
          text="⬆ Y aller"
          style={{ fontSize: 14, color: PRIMARY, fontFamily: 'sans-serif-medium' }}
        />
      </FlexWidget>

      {/* Row 1: slots 0 + 1 */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          width: 'match_parent',
          flex: 1,
          flexGap: 6,
          marginTop: 6,
        }}
      >
        <ShortcutButton slot={slots[0] ?? null} />
        <ShortcutButton slot={slots[1] ?? null} />
      </FlexWidget>

      {/* Row 2: slots 2 + 3 */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          width: 'match_parent',
          flex: 1,
          flexGap: 6,
          marginTop: 6,
        }}
      >
        <ShortcutButton slot={slots[2] ?? null} />
        <ShortcutButton slot={slots[3] ?? null} />
      </FlexWidget>
    </FlexWidget>
  );
}

function ShortcutButton({ slot }: { slot: NavShortcut | null }) {
  const ready = slot != null && slot.lat != null && slot.lng != null;
  const uri = ready && slot != null
    ? `${SCHEME}:///navigation?shortcut=${slot.id}`
    : `${SCHEME}:///navigation`;

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
        padding: 6,
      }}
    >
      <TextWidget
        text={slot ? '⬆' : '+'}
        style={{
          fontSize: 16,
          color: ready ? PRIMARY : MUTED,
          fontFamily: 'sans-serif-medium',
        }}
      />
      <TextWidget
        text={slot ? slot.name : 'Ajouter'}
        style={{ fontSize: 11, color: slot ? TEXT : MUTED, fontFamily: 'sans-serif' }}
        maxLines={2}
      />
    </FlexWidget>
  );
}
