import React from 'react';
import {
  FlexWidget,
  ImageWidget,
  OverlapWidget,
  TextWidget,
} from 'react-native-android-widget';
import type { ColorProp, ImageWidgetSource } from 'react-native-android-widget';

import type { WidgetData } from './data';

const CARD: ColorProp = '#2A2A2A';
const TEXT: ColorProp = '#FFFFFF';
const MUTED: ColorProp = '#9E9E9E';
const OVERLAY: ColorProp = '#BB000000';
const SCHEME = 'yoann2';

export function TodoWidget({ nextEvent, todayWork, settings, todayLabel }: WidgetData) {
  const PRIMARY = settings.primaryColor as ColorProp;
  const BG = settings.bgColor as ColorProp;
  const bgImage = settings.bgImageUri;
  const containerBg: ColorProp = bgImage ? OVERLAY : BG;
  const isRepos = todayWork === 'Repos';

  function wrapWithBg(content: React.ReactElement): React.ReactElement {
    if (!bgImage) return content;
    return (
      <OverlapWidget style={{ height: 'match_parent', width: 'match_parent' }}>
        <ImageWidget
          image={bgImage as ImageWidgetSource}
          resizeMode="cover"
          radius={16}
          style={{ height: 'match_parent', width: 'match_parent' }}
        />
        {content}
      </OverlapWidget>
    );
  }

  function NavItem({
    emoji,
    label,
    clickAction,
    uri,
  }: {
    emoji: string;
    label: string;
    clickAction: string;
    uri?: string;
  }) {
    return (
      <FlexWidget
        clickAction={clickAction}
        clickActionData={uri ? { uri } : undefined}
        style={{
          flex: 1,
          height: 36,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <TextWidget text={emoji} style={{ fontSize: 15 }} />
        <TextWidget text={label} style={{ fontSize: 9, color: MUTED, marginTop: 1 }} />
      </FlexWidget>
    );
  }

  const Divider = () => (
    <FlexWidget style={{ width: 1, height: 18, backgroundColor: CARD }} />
  );

  return wrapWithBg(
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: containerBg,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 6,
        flexDirection: 'column',
      }}
    >
      {/* Bloc 1 — Heures de travail du jour */}
      <FlexWidget
        style={{
          width: 'match_parent',
          backgroundColor: CARD,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 9,
          marginBottom: 8,
          flexDirection: 'column',
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
          <TextWidget text="💼" style={{ fontSize: 12, marginRight: 6 }} />
          <TextWidget text="Travail aujourd'hui" style={{ fontSize: 11, color: MUTED }} />
          <FlexWidget style={{ flex: 1 }} />
          <TextWidget text={todayLabel} style={{ fontSize: 10, color: MUTED }} />
        </FlexWidget>
        <TextWidget
          text={todayWork}
          style={{ fontSize: 19, color: isRepos ? MUTED : PRIMARY, fontWeight: 'bold', marginTop: 3 }}
        />
      </FlexWidget>

      {/* Bloc 2 — Prochain événement */}
      <FlexWidget
        style={{
          flex: 1,
          width: 'match_parent',
          backgroundColor: CARD,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 9,
          marginBottom: 8,
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginBottom: 5 }}>
          <TextWidget text="📌" style={{ fontSize: 12, marginRight: 6 }} />
          <TextWidget text="Prochain événement" style={{ fontSize: 11, color: MUTED }} />
        </FlexWidget>
        {nextEvent ? (
          <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
              <FlexWidget
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: nextEvent.color as ColorProp,
                  marginRight: 7,
                }}
              />
              <TextWidget
                text={nextEvent.title}
                maxLines={1}
                truncate="END"
                style={{ fontSize: 15, color: TEXT, fontWeight: 'bold' }}
              />
            </FlexWidget>
            <TextWidget text={nextEvent.when} style={{ fontSize: 12, color: PRIMARY, marginTop: 3 }} />
          </FlexWidget>
        ) : (
          <TextWidget text="Rien de prévu ✓" style={{ fontSize: 14, color: MUTED }} />
        )}
      </FlexWidget>

      {/* Barre de navigation */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          width: 'match_parent',
          alignItems: 'center',
          backgroundColor: CARD,
          borderRadius: 12,
          paddingHorizontal: 2,
          paddingVertical: 1,
        }}
      >
        <NavItem emoji="↺" label="Reset" clickAction="REFRESH" />
        <Divider />
        <NavItem emoji="📝" label="Tâche" clickAction="OPEN_URI" uri={`${SCHEME}:///task/new`} />
        <Divider />
        <NavItem emoji="💡" label="Idée" clickAction="OPEN_URI" uri={`${SCHEME}:///task/new?idea=1`} />
        <Divider />
        <NavItem emoji="📅" label="RDV" clickAction="OPEN_URI" uri={`${SCHEME}:///appointment/new`} />
        <Divider />
        <NavItem emoji="🏠" label="Accueil" clickAction="OPEN_APP" />
      </FlexWidget>
    </FlexWidget>
  );
}
