import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';

import type { WidgetData } from './data';

const BG = '#121212';
const CARD = '#2A2A2A';
const PRIMARY = '#FFC107';
const TEXT = '#FFFFFF';
const MUTED = '#9E9E9E';

const SCHEME = 'yoann2';

export function TodoWidget({ tasks, todayAppts, nextApptLabel }: WidgetData) {
  const bottomText =
    todayAppts.length > 0
      ? "Aujourd'hui : " +
        todayAppts
          .map(a => (a.time ? `${a.time} ${a.title}` : a.title))
          .join('  ·  ')
      : nextApptLabel;

  const bottomColor = todayAppts.length > 0 ? PRIMARY : MUTED;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: BG,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 8,
        flexDirection: 'column',
      }}
    >
      {/* Tasks — fills all available vertical space */}
      <FlexWidget style={{ flex: 1, flexDirection: 'column', width: 'match_parent' }}>
        {tasks.length === 0 ? (
          <FlexWidget
            style={{ flex: 1, width: 'match_parent', justifyContent: 'center', alignItems: 'center' }}
          >
            <TextWidget
              text="Aucune tâche en cours ✓"
              style={{ fontSize: 15, color: MUTED }}
            />
          </FlexWidget>
        ) : (
          tasks.map((t, i) => (
            <FlexWidget
              key={`t${i}`}
              clickAction="OPEN_URI"
              clickActionData={{ uri: `${SCHEME}:///task/${t.id}` }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                width: 'match_parent',
                marginBottom: 8,
              }}
            >
              <FlexWidget
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: t.color as ColorProp,
                  marginRight: 8,
                }}
              />
              <TextWidget
                text={t.deadline ? `${t.title}  ·  ${t.deadline}` : t.title}
                maxLines={1}
                truncate="END"
                style={{ fontSize: 16, color: TEXT }}
              />
            </FlexWidget>
          ))
        )}
      </FlexWidget>

      {/* Bottom bar — divider + appointments + refresh */}
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        <FlexWidget
          style={{ height: 1, width: 'match_parent', backgroundColor: CARD, marginBottom: 6 }}
        />
        <FlexWidget
          style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}
        >
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget
              text={bottomText}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 11, color: bottomColor }}
            />
          </FlexWidget>
          <FlexWidget
            clickAction="REFRESH"
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: CARD,
              justifyContent: 'center',
              alignItems: 'center',
              marginLeft: 8,
            }}
          >
            <TextWidget
              text="↺"
              style={{ fontSize: 14, color: MUTED }}
            />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
