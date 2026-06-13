import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';

import type { WidgetDayData } from './data';

const BG = '#121212';
const CARD = '#1E1E1E';
const CARD_DIM = '#181818';
const PRIMARY = '#FFC107';
const TEXT = '#FFFFFF';
const MUTED = '#9E9E9E';

export function TodoWidget(props: WidgetDayData) {
  const { dayLabel, dateLabel, items, moreCount, canPrev } = props;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: BG,
        borderRadius: 16,
        padding: 12,
        flexDirection: 'column',
      }}
    >
      <FlexWidget
        style={{
          flexDirection: 'row',
          width: 'match_parent',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <FlexWidget clickAction="OPEN_APP" style={{ flexDirection: 'column' }}>
          <TextWidget text={dayLabel} style={{ fontSize: 16, fontWeight: 'bold', color: PRIMARY }} />
          <TextWidget text={dateLabel} style={{ fontSize: 11, color: MUTED }} />
        </FlexWidget>

        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <FlexWidget
            clickAction="PREV"
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: canPrev ? CARD : CARD_DIM,
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 6,
            }}
          >
            <TextWidget text="‹" style={{ fontSize: 20, fontWeight: 'bold', color: canPrev ? TEXT : '#444444' }} />
          </FlexWidget>
          <FlexWidget
            clickAction="NEXT"
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: CARD,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <TextWidget text="›" style={{ fontSize: 20, fontWeight: 'bold', color: TEXT }} />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>

      {items.length === 0 ? (
        <FlexWidget
          clickAction="OPEN_APP"
          style={{ flex: 1, width: 'match_parent', justifyContent: 'center', alignItems: 'center' }}
        >
          <TextWidget text="Rien de prévu ✓" style={{ fontSize: 14, color: MUTED }} />
        </FlexWidget>
      ) : (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
          {items.map((it, i) => (
            <FlexWidget
              key={`${i}`}
              clickAction="OPEN_APP"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                width: 'match_parent',
                marginBottom: 6,
              }}
            >
              <FlexWidget
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: it.color as ColorProp, marginRight: 8 }}
              />
              <TextWidget
                text={(it.meta ? it.meta + '  ' : '') + it.title}
                maxLines={1}
                truncate="END"
                style={{ fontSize: 13, color: it.done ? MUTED : TEXT }}
              />
            </FlexWidget>
          ))}
          {moreCount > 0 && (
            <TextWidget
              text={'+ ' + moreCount + ' autre' + (moreCount > 1 ? 's' : '')}
              clickAction="OPEN_APP"
              style={{ fontSize: 11, color: PRIMARY, marginTop: 2 }}
            />
          )}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
