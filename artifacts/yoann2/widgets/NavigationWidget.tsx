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
  todayAppt,
}: {
  shortcuts: NavShortcut[];
  todayAppt?: TodayApptNav | null;
}) {
  // 3 slots in a single row
  const slots: (NavShortcut | null)[] = Array.from({ length: 3 }, (_, i) => shortcuts[i] ?? null);

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
          height: 26,
          justifyContent: 'space-between',
        }}
      >
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'yoann2:///navigation' }}
        >
          <TextWidget
            text="Yoann 2.0"
            style={{ fontSize: 13, color: PRIMARY, fontFamily: 'sans-serif-medium' }}
          />
        </FlexWidget>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: `${SCHEME}:///navigation?action=fuel` }}
          style={{
            backgroundColor: SURFACE,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TextWidget
            text="⛽ Carburant"
            style={{ fontSize: 10, color: MUTED, fontFamily: 'sans-serif' }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* RDV du jour */}
      {todayAppt != null && (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: `waze://?ll=${todayAppt.lat},${todayAppt.lng}&navigate=yes` }}
          style={{
            width: 'match_parent',
            backgroundColor: '#7C3AED40',
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 5,
            marginTop: 5,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text={`📅 ${todayAppt.title}${todayAppt.time ? '  ' + todayAppt.time : ''}  ⬆`}
            style={{ fontSize: 11, color: TEXT, fontFamily: 'sans-serif' }}
            maxLines={1}
          />
        </FlexWidget>
      )}

      {/* Single row of 3 shortcuts */}
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
        <ShortcutButton slot={slots[2] ?? null} />
      </FlexWidget>
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
          fontSize: 20,
          color: ready ? PRIMARY : MUTED,
          fontFamily: 'sans-serif-medium',
        }}
      />
      <TextWidget
        text={label}
        style={{ fontSize: 10, color: slot ? TEXT : MUTED, fontFamily: 'sans-serif' }}
        maxLines={1}
      />
    </FlexWidget>
  );
}
