import React from 'react';
import {
  FlexWidget,
  ImageWidget,
  TextWidget,
} from 'react-native-android-widget';
import type { ColorProp, ImageWidgetSource } from 'react-native-android-widget';

import type { WidgetData } from './data';

const CARD: ColorProp   = '#202020';
const NAVBAR: ColorProp = '#121212';
const TEXT: ColorProp   = '#FFFFFF';
const MUTED: ColorProp  = '#9E9E9E';
const PRIMARY: ColorProp = '#FFC107';
const ACCENT_BG         = '#1A2A00' as ColorProp;

const IMG_RESET = require('../assets/icons/icon-reset.png') as ImageWidgetSource;
const IMG_NAV   = require('../assets/icons/icon-nav.png')   as ImageWidgetSource;
const IMG_PLAY  = require('../assets/icons/icon-play.png')  as ImageWidgetSource;
const IMG_PAUSE = require('../assets/icons/icon-pause.png') as ImageWidgetSource;
const IMG_GAS   = require('../assets/icons/icon-gas.png')   as ImageWidgetSource;
const IMG_STOP  = require('../assets/icons/icon-stop.png')  as ImageWidgetSource;

export interface AllInOneWidgetProps extends WidgetData {
  shortcuts: { name: string; lat: number | null; lng: number | null }[];
  tripStatus?: 'idle' | 'active' | 'paused';
  spinAngle?: number;
}

/**
 * Bouton générique — clickAction est n'importe quelle chaîne custom ou OPEN_URI.
 * Pour OPEN_URI, passer uri. Pour tout le reste le handler JS prend le relais.
 */
function Btn({
  image,
  clickAction,
  uri,
  bg = CARD,
  flex = 1,
  rotation = 0,
}: {
  image: ImageWidgetSource;
  clickAction: string;
  uri?: string;
  bg?: ColorProp;
  flex?: number;
  rotation?: number;
}) {
  return (
    <FlexWidget
      clickAction={clickAction}
      clickActionData={uri ? { uri } : undefined}
      style={{
        flex,
        height: 'match_parent',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: bg,
        borderRadius: 10,
        padding: 4,
      }}
    >
      <ImageWidget image={image} style={{ width: 32, height: 32, rotation }} />
    </FlexWidget>
  );
}

export function AllInOneWidget({
  tasks,
  widgetAppts,
  todayWork,
  todayDayNum,
  marieCircleColor,
  tripStatus = 'idle',
  spinAngle = 0,
}: AllInOneWidgetProps) {
  const isRepos    = todayWork === 'Repos';
  const nextAppt   = widgetAppts[0] ?? null;

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
      {/* ─── Ligne 1 : infos ─── */}
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 6,
          paddingHorizontal: 2,
        }}
      >
        {/* Cercle jour → planning Marie */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'yoann2:///marie' }}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: marieCircleColor as ColorProp,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TextWidget
            text={String(todayDayNum)}
            style={{ fontSize: 15, fontWeight: 'bold', color: '#FFFFFF' }}
          />
        </FlexWidget>

        {/* Travail */}
        <FlexWidget
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}
        >
          <TextWidget text="💼 " style={{ fontSize: 11 }} />
          <TextWidget
            text={isRepos ? 'Repos' : todayWork}
            style={{ fontSize: 12, color: isRepos ? MUTED : PRIMARY, fontWeight: 'bold' }}
            maxLines={1}
            truncate="END"
          />
        </FlexWidget>

        {/* Tâches */}
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
          <TextWidget text="📋 " style={{ fontSize: 11 }} />
          <TextWidget
            text={String(tasks.length)}
            style={{ fontSize: 11, color: TEXT, fontWeight: 'bold' }}
          />
        </FlexWidget>

        {/* Prochain RDV */}
        {nextAppt ? (
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextWidget text="📅 " style={{ fontSize: 11 }} />
            <TextWidget
              text={nextAppt.title}
              style={{ fontSize: 11, color: PRIMARY }}
              maxLines={1}
              truncate="END"
            />
          </FlexWidget>
        ) : null}
      </FlexWidget>

      {/* ─── Ligne 2 : boutons ─── */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          width: 'match_parent',
          alignItems: 'center',
          flexGap: 6,
          flex: 1,
        }}
      >
        {/*
          Naviguer vers — action custom NAVIGATE_TO traitée par le handler JS.
          Le handler fait Linking.openURL('yoann2:///navigate-to') pour ouvrir
          la liste des destinations et choisir une navigation Waze.
        */}
        <Btn image={IMG_NAV} clickAction="NAVIGATE_TO" bg={CARD} flex={2} />

        {/*
          Bouton trajet : change selon l'état.
          idle   → Play (MANUAL_TRIP_START)
          active → Pause (MANUAL_TRIP_PAUSE)
          paused → Play + Stop (MANUAL_TRIP_RESUME / MANUAL_TRIP_END)
        */}
        {tripStatus === 'idle' && (
          <Btn image={IMG_PLAY} clickAction="MANUAL_TRIP_START" bg={ACCENT_BG} />
        )}
        {tripStatus === 'active' && (
          <Btn image={IMG_PAUSE} clickAction="MANUAL_TRIP_PAUSE" bg={CARD} />
        )}
        {tripStatus === 'paused' && (
          <>
            <Btn image={IMG_PLAY}  clickAction="MANUAL_TRIP_RESUME" bg={ACCENT_BG} />
            <Btn image={IMG_STOP}  clickAction="MANUAL_TRIP_END"    bg={CARD} />
          </>
        )}

        {/* Carburant — ouvre la page trajets/fuel via deep link */}
        <Btn image={IMG_GAS} clickAction="OPEN_FUEL" bg={CARD} />

        {/* Rafraîchir */}
        <Btn image={IMG_RESET} clickAction="REFRESH" bg={CARD} rotation={spinAngle} />
      </FlexWidget>
    </FlexWidget>
  );
}
