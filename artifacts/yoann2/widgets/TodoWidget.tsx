import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';

import type { WidgetData } from './data';

const BG = '#121212';
const CARD = '#2A2A2A';
const PRIMARY = '#FFC107';
const TEXT = '#FFFFFF';
const MUTED = '#9E9E9E';

export function TodoWidget({ tasks, todayAppts, moreCount }: WidgetData) {
  const apptLine =
    todayAppts.length === 0
      ? "pas de rendez-vous aujourd'hui"
      : todayAppts
          .map(a => (a.time ? `${a.time} ${a.title}` : a.title))
          .join('  ·  ');

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: BG,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        {tasks.length === 0 ? (
          <FlexWidget
            style={{ width: 'match_parent', justifyContent: 'center', alignItems: 'center', paddingVertical: 8 }}
          >
            <TextWidget
              text="Aucune tâche en cours ✓"
              style={{ fontSize: 13, color: MUTED }}
            />
          </FlexWidget>
        ) : (
          <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
            {tasks.map((t, i) => (
              <FlexWidget
                key={`t${i}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  width: 'match_parent',
                  marginBottom: 7,
                }}
              >
                <FlexWidget
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: t.color as ColorProp,
                    marginRight: 8,
                  }}
                />
                <TextWidget
                  text={t.deadline ? `${t.title}  ·  ${t.deadline}` : t.title}
                  maxLines={1}
                  truncate="END"
                  style={{ fontSize: 13, color: TEXT }}
                />
              </FlexWidget>
            ))}
            {moreCount > 0 && (
              <TextWidget
                text={`+ ${moreCount} autre${moreCount > 1 ? 's' : ''}`}
                style={{ fontSize: 11, color: MUTED }}
              />
            )}
          </FlexWidget>
        )}
      </FlexWidget>

      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        <FlexWidget
          style={{
            height: 1,
            width: 'match_parent',
            backgroundColor: CARD,
            marginBottom: 7,
          }}
        />
        <TextWidget
          text={`Aujourd'hui : ${apptLine}`}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: 11,
            color: todayAppts.length > 0 ? PRIMARY : MUTED,
          }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
