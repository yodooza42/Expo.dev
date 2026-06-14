import React from 'react';
import {
  FlexWidget,
  ImageWidget,
  OverlapWidget,
  TextWidget,
} from 'react-native-android-widget';
import type { ColorProp, ImageWidgetSource } from 'react-native-android-widget';

import type { WidgetData } from './data';

const CARD = '#2A2A2A';
const TEXT: ColorProp = '#FFFFFF';
const MUTED: ColorProp = '#9E9E9E';
const GREEN: ColorProp = '#4CAF50';
const OVERLAY: ColorProp = '#BB000000';
const SCHEME = 'yoann2';

export function TodoWidget({ tasks, todayAppts, nextApptLabel, confirmTask, settings, todayLabel }: WidgetData) {
  const PRIMARY = settings.primaryColor as ColorProp;
  const BG = settings.bgColor as ColorProp;
  const bgImage = settings.bgImageUri;
  const taskFs = settings.taskFontSize;
  const btnFs = 12;

  const apptText =
    todayAppts.length > 0
      ? "Aujourd'hui : " + todayAppts.map(a => (a.time ? `${a.time} ${a.title}` : a.title)).join('  ·  ')
      : nextApptLabel;
  const apptColor: ColorProp = todayAppts.length > 0 ? PRIMARY : MUTED;

  const containerBg: ColorProp = bgImage ? OVERLAY : BG;

  function wrapWithBg(content: React.ReactElement): React.ReactElement {
    if (!bgImage) return content;
    return (
      <OverlapWidget style={{ height: 'match_parent', width: 'match_parent' }}>
        <ImageWidget
          image={bgImage as ImageWidgetSource}
          imageWidth={400}
          imageHeight={200}
          radius={16}
          style={{ height: 'match_parent', width: 'match_parent' }}
        />
        {content}
      </OverlapWidget>
    );
  }

  if (confirmTask) {
    const label = confirmTask.deadline
      ? `${confirmTask.title}  ·  ${confirmTask.deadline}`
      : confirmTask.title;

    return wrapWithBg(
      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: containerBg,
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'column',
        }}
      >
        <FlexWidget
          style={{ flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}
        >
          <TextWidget
            text="Marquer comme terminée ?"
            style={{ fontSize: 14, color: TEXT, fontWeight: 'bold' }}
          />
          <TextWidget
            text={label}
            maxLines={2}
            truncate="END"
            style={{ fontSize: 12, color: MUTED, marginTop: 8 }}
          />
        </FlexWidget>

        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent' }}>
          <FlexWidget
            clickAction="CONFIRM"
            style={{
              flex: 1,
              height: 40,
              borderRadius: 10,
              backgroundColor: GREEN,
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 8,
            }}
          >
            <TextWidget text="✓  Oui" style={{ fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' as ColorProp }} />
          </FlexWidget>
          <FlexWidget
            clickAction="CANCEL"
            style={{
              flex: 1,
              height: 40,
              borderRadius: 10,
              backgroundColor: CARD as ColorProp,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <TextWidget text="✗  Non" style={{ fontSize: 14, color: TEXT }} />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    );
  }

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
      <FlexWidget style={{ flex: 1, flexDirection: 'column', width: 'match_parent' }}>
        {tasks.length === 0 ? (
          <FlexWidget
            style={{ flex: 1, width: 'match_parent', justifyContent: 'center', alignItems: 'center' }}
          >
            <TextWidget text="Aucune tâche en cours ✓" style={{ fontSize: taskFs - 1, color: MUTED }} />
          </FlexWidget>
        ) : (
          tasks.map((t, i) => (
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
                clickAction={`CHECK_${i}`}
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: 3,
                  borderWidth: 1,
                  borderColor: MUTED,
                  marginRight: 7,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: '#00000000' as ColorProp,
                }}
              />
              <FlexWidget
                clickAction="OPEN_URI"
                clickActionData={{ uri: `${SCHEME}:///task/${t.id}` }}
                style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}
              >
                <FlexWidget
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: t.color as ColorProp,
                    marginRight: 7,
                  }}
                />
                <TextWidget
                  text={t.deadline ? `${t.title}  ·  ${t.deadline}` : t.title}
                  maxLines={1}
                  truncate="END"
                  style={{ fontSize: taskFs, color: TEXT }}
                />
              </FlexWidget>
            </FlexWidget>
          ))
        )}
      </FlexWidget>

      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        <FlexWidget
          style={{ height: 1, width: 'match_parent', backgroundColor: CARD as ColorProp, marginBottom: 5 }}
        />

        <TextWidget
          text={apptText}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 12, color: apptColor, marginBottom: 5 }}
        />

        <FlexWidget
          style={{ height: 1, width: 'match_parent', backgroundColor: CARD as ColorProp, marginBottom: 4 }}
        />

        <FlexWidget
          style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'center', height: 28 }}
        >
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: `${SCHEME}:///task/new` }}
            style={{ flex: 1, height: 28, justifyContent: 'center', alignItems: 'center' }}
          >
            <TextWidget text="+ Tâche" style={{ fontSize: btnFs, color: PRIMARY }} />
          </FlexWidget>

          <FlexWidget
            style={{ width: 1, height: 16, backgroundColor: CARD as ColorProp }}
          />

          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: `${SCHEME}:///project/new` }}
            style={{ flex: 1, height: 28, justifyContent: 'center', alignItems: 'center' }}
          >
            <TextWidget text="+ Projet" style={{ fontSize: btnFs, color: PRIMARY }} />
          </FlexWidget>

          <FlexWidget
            style={{ width: 1, height: 16, backgroundColor: CARD as ColorProp }}
          />

          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: `${SCHEME}:///appointment/new` }}
            style={{ flex: 1, height: 28, justifyContent: 'center', alignItems: 'center' }}
          >
            <TextWidget text="+ RDV" style={{ fontSize: btnFs, color: PRIMARY }} />
          </FlexWidget>

          <FlexWidget
            style={{ width: 1, height: 16, backgroundColor: CARD as ColorProp }}
          />

          <FlexWidget
            style={{ flex: 1, height: 28, justifyContent: 'center', alignItems: 'center' }}
          >
            <TextWidget text={todayLabel} style={{ fontSize: btnFs, color: MUTED }} />
          </FlexWidget>

          <FlexWidget
            clickAction="REFRESH"
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: CARD as ColorProp,
              justifyContent: 'center',
              alignItems: 'center',
              marginLeft: 4,
            }}
          >
            <TextWidget text="↺" style={{ fontSize: 12, color: MUTED }} />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
