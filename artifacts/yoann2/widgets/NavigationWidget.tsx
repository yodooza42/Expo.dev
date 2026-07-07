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
const GREEN: ColorProp   = '#4CAF50';
const ORANGE: ColorProp  = '#FF9800';
const RED: ColorProp     = '#F44336';
const SCHEME = 'yoann2';

export interface TodayApptNav {
  title: string;
  time: string;
  lat: number;
  lng: number;
}

export function NavigationWidget({
  shortcuts,
  tripStatus = 'idle',
}: {
  shortcuts: NavShortcut[];
  todayAppt?: TodayApptNav | null;
  tripStatus?: 'idle' | 'active' | 'paused';
}) {
  const slots: (NavShortcut | null)[] = Array.from({ length: 2 }, (_, i) => shortcuts[i] ?? null);

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
      <TripButton status={tripStatus} />
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
        flexDirection: 'column',
        padding: 4,
        flexGap: 2,
      }}
    >
      <TextWidget
        text={emoji}
        style={{
          fontSize: 22,
          color: ready ? PRIMARY : MUTED,
          fontFamily: 'sans-serif-medium',
        }}
      />
      <TextWidget
        text={label}
        style={{
          fontSize: 10,
          color: ready ? TEXT : MUTED,
          fontFamily: 'sans-serif',
        }}
      />
    </FlexWidget>
  );
}

function TripButton({ status }: { status: 'idle' | 'active' | 'paused' }) {
  if (status === 'paused') {
    // État pause : deux boutons côte à côte (Reprendre + Terminer), flex:2
    return (
      <FlexWidget
        style={{
          flex: 2,
          height: 'match_parent',
          flexDirection: 'row',
          flexGap: 4,
        }}
      >
        <FlexWidget
          clickAction="MANUAL_TRIP_RESUME"
          style={{
            flex: 1,
            height: 'match_parent',
            backgroundColor: '#1A2A1A',
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            padding: 4,
            flexGap: 2,
          }}
        >
          <TextWidget
            text="▶"
            style={{ fontSize: 20, color: GREEN, fontFamily: 'sans-serif-medium' }}
          />
          <TextWidget
            text="Reprendre"
            style={{ fontSize: 9, color: GREEN, fontFamily: 'sans-serif' }}
          />
        </FlexWidget>

        <FlexWidget
          clickAction="MANUAL_TRIP_END"
          style={{
            flex: 1,
            height: 'match_parent',
            backgroundColor: '#2A1A1A',
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            padding: 4,
            flexGap: 2,
          }}
        >
          <TextWidget
            text="⏹"
            style={{ fontSize: 20, color: RED, fontFamily: 'sans-serif-medium' }}
          />
          <TextWidget
            text="Terminer"
            style={{ fontSize: 9, color: RED, fontFamily: 'sans-serif' }}
          />
        </FlexWidget>
      </FlexWidget>
    );
  }

  // États idle et active : un seul bouton, flex:1
  const isActive = status === 'active';
  return (
    <FlexWidget
      clickAction={isActive ? 'MANUAL_TRIP_PAUSE' : 'MANUAL_TRIP_START'}
      style={{
        flex: 1,
        height: 'match_parent',
        backgroundColor: isActive ? '#1A2200' : '#1A1A2A',
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        padding: 4,
        flexGap: 2,
      }}
    >
      <TextWidget
        text={isActive ? '⏸' : '▶'}
        style={{
          fontSize: 22,
          color: isActive ? ORANGE : GREEN,
          fontFamily: 'sans-serif-medium',
        }}
      />
      <TextWidget
        text={isActive ? 'Pause' : 'Départ'}
        style={{
          fontSize: 10,
          color: isActive ? ORANGE : GREEN,
          fontFamily: 'sans-serif',
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
        flexDirection: 'column',
        padding: 4,
        flexGap: 2,
      }}
    >
      <TextWidget
        text="⛽"
        style={{ fontSize: 22, color: MUTED, fontFamily: 'sans-serif-medium' }}
      />
      <TextWidget
        text="Essence"
        style={{ fontSize: 10, color: MUTED, fontFamily: 'sans-serif' }}
      />
    </FlexWidget>
  );
}
