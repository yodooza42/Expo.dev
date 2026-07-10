"use no memo";
import React from 'react';
import {
  FlexWidget,
  ImageWidget,
  TextWidget,
} from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';

import type { WidgetData } from './data';

const CARD: ColorProp   = '#202020';
const NAVBAR: ColorProp = '#121212';
const TEXT: ColorProp   = '#FFFFFF';
const MUTED: ColorProp  = '#9E9E9E';
const PRIMARY: ColorProp = '#FFC107';
const ACCENT_BG         = '#1A2A00' as ColorProp;

// Drawable resource names — resolus depuis android/res/drawable-nodpi/
// Évite Image.resolveAssetSource() qui retourne asset:// non géré par ResourceUtils
const IMG_RESET = 'icon_reset';
const IMG_NAV   = 'icon_nav';
const IMG_PLAY  = 'icon_play';
const IMG_PAUSE = 'icon_pause';
const IMG_GAS   = 'icon_gas';
const IMG_STOP  = 'icon_stop';

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
  image: string;
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
      <ImageWidget image={image as any} style={{ width: 32, height: 32, rotation }} />
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
          <TextWidget
            text={isRepos ? 'Repos' : todayWork}
            style={{ fontSize: 12, color: isRepos ? MUTED : PRIMARY, fontWeight: 'bold' }}
            maxLines={1}
            truncate="END"
          />
        </FlexWidget>

        {/* Tâches */}
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
          <TextWidget
            text={`${tasks.length} tache${tasks.length > 1 ? 's' : ''}`}
            style={{ fontSize: 11, color: TEXT }}
          />
        </FlexWidget>

        {/* Prochain RDV */}
        {nextAppt ? (
          <TextWidget
            text={nextAppt.title}
            style={{ fontSize: 11, color: PRIMARY }}
            maxLines={1}
            truncate="END"
          />
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
        <Btn image={IMG_NAV} clickAction="NAVIGATE_TO" bg={CARD} flex={2} />

        {tripStatus === 'idle' && (
          <Btn image={IMG_PLAY} clickAction="MANUAL_TRIP_START" bg={ACCENT_BG} />
        )}
        {tripStatus === 'active' && (
          <Btn image={IMG_PAUSE} clickAction="MANUAL_TRIP_PAUSE" bg={CARD} />
        )}
        {tripStatus === 'paused' && (
          <Btn image={IMG_PLAY} clickAction="MANUAL_TRIP_RESUME" bg={ACCENT_BG} />
        )}
        {tripStatus === 'paused' && (
          <Btn image={IMG_STOP} clickAction="MANUAL_TRIP_END" bg={CARD} />
        )}

        <Btn image={IMG_GAS} clickAction="OPEN_FUEL" bg={CARD} />

        <Btn image={IMG_RESET} clickAction="REFRESH" bg={CARD} rotation={spinAngle} />
      </FlexWidget>
    </FlexWidget>
  );
}
