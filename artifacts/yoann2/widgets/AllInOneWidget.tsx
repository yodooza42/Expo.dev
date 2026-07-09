import React from 'react';
import {
  FlexWidget,
  ImageWidget,
  TextWidget,
} from 'react-native-android-widget';
import type { ColorProp, ImageWidgetSource } from 'react-native-android-widget';

import type { WidgetData } from './data';

const CARD: ColorProp    = '#202020';
const NAVBAR: ColorProp  = '#121212';
const TEXT: ColorProp    = '#FFFFFF';
const MUTED: ColorProp   = '#9E9E9E';
const PRIMARY: ColorProp = '#FFC107';
const GREEN: ColorProp   = '#4CAF50';
const ORANGE: ColorProp  = '#FF9800';
const RED: ColorProp     = '#F44336';
const SCHEME = 'yoann2';

const IMG_RESET  = require('../assets/icons/icon-reset.png') as ImageWidgetSource;
const IMG_HOME   = require('../assets/icons/icon-home.png')  as ImageWidgetSource;

export interface AllInOneWidgetProps extends WidgetData {
  shortcuts: { name: string; lat: number | null; lng: number | null }[];
  tripStatus?: 'idle' | 'active' | 'paused';
  spinAngle?: number;
}

export function AllInOneWidget({
  tasks, widgetAppts, todayWork, settings, todayDayNum,
  marieCircleColor, shortcuts, tripStatus = 'idle', spinAngle = 0,
}: AllInOneWidgetProps) {
  const isRepos = todayWork === 'Repos';

  // Next appt short label
  const nextAppt = widgetAppts[0] ?? null;
  const nextApptShort = nextAppt ? nextAppt.when.replace("Aujourd'hui · ", "").replace("Aujourd'hui", "") : null;

  function NavItem({
    image,
    emoji,
    label,
    clickAction,
    uri,
    rotation,
    accent = false,
    wide = false,
  }: {
    image?: ImageWidgetSource;
    emoji?: string;
    label: string;
    clickAction: string;
    uri?: string;
    rotation?: number;
    accent?: boolean;
    wide?: boolean;
  }) {
    return (
      <FlexWidget
        clickAction={clickAction}
        clickActionData={uri ? { uri } : undefined}
        style={{
          flex: wide ? 1.5 : 1,
          height: 'match_parent',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: accent ? '#1A2A00' as ColorProp : CARD,
          borderRadius: 10,
          padding: 4,
        }}
      >
        {image ? (
          <ImageWidget image={image} style={{ width: 22, height: 22, rotation: rotation ?? 0 }} />
        ) : (
          <TextWidget text={emoji ?? ''} style={{ fontSize: 20, color: accent ? GREEN : TEXT }} />
        )}
        {label ? (
          <TextWidget
            text={label}
            style={{
              fontSize: 10,
              color: accent ? GREEN : MUTED,
              marginTop: 2,
            }}
          />
        ) : null}
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: NAVBAR,
        borderRadius: 16,
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 6,
        flexDirection: 'column',
      }}
    >
      {/* ── Row 1: Info bar ── */}
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 6,
          paddingHorizontal: 4,
        }}
      >
        {/* Day circle */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: `${SCHEME}:///marie` }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: marieCircleColor as ColorProp,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TextWidget
            text={String(todayDayNum)}
            style={{ fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' }}
          />
        </FlexWidget>

        {/* Work info */}
        <FlexWidget
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flex: 1,
            marginLeft: 8,
          }}
        >
          <TextWidget text="💼 " style={{ fontSize: 11 }} />
          <TextWidget
            text={isRepos ? 'Repos' : todayWork}
            style={{ fontSize: 12, color: isRepos ? MUTED : PRIMARY, fontWeight: 'bold' }}
          />
        </FlexWidget>

        {/* Tasks count */}
        <FlexWidget
          style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}
        >
          <TextWidget text="📋" style={{ fontSize: 11, marginRight: 3 }} />
          <TextWidget text={`${tasks.length}`} style={{ fontSize: 11, color: TEXT, fontWeight: 'bold' }} />
        </FlexWidget>

        {/* Next appt */}
        {nextAppt ? (
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextWidget text="📅" style={{ fontSize: 11, marginRight: 3 }} />
            <TextWidget
              text={nextAppt.title}
              style={{ fontSize: 11, color: PRIMARY }}
              maxLines={1}
              truncate="END"
            />
          </FlexWidget>
        ) : null}
      </FlexWidget>

      {/* ── Row 2: Nav buttons ── */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          width: 'match_parent',
          alignItems: 'center',
          flexGap: 6,
          flex: 1,
        }}
      >
        <NavItem
          emoji="🧭"
          label="Naviguer"
          clickAction="OPEN_URI"
          uri={`${SCHEME}:///navigate-to`}
          wide
        />

        {/* Trip button changes based on status */}
        {tripStatus === 'paused' ? (
          <>
            <NavItem
              emoji="▶"
              label="Reprendre"
              clickAction="MANUAL_TRIP_RESUME"
              accent
            />
            <NavItem
              emoji="⏹"
              label="Terminer"
              clickAction="MANUAL_TRIP_END"
            />
          </>
        ) : (
          <NavItem
            emoji={tripStatus === 'active' ? '⏸' : '▶'}
            label={tripStatus === 'active' ? 'Pause' : 'Départ'}
            clickAction={tripStatus === 'active' ? 'MANUAL_TRIP_PAUSE' : 'MANUAL_TRIP_START'}
            accent={tripStatus !== 'active'}
          />
        )}

        <NavItem
          emoji="⛽"
          label="Essence"
          clickAction="OPEN_URI"
          uri={`${SCHEME}:///navigation?action=fuel`}
        />

        <NavItem
          image={IMG_RESET}
          label=""
          clickAction="REFRESH"
          rotation={spinAngle}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
