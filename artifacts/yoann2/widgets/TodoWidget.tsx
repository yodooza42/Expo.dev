import React from 'react';
import {
  FlexWidget,
  ImageWidget,
  OverlapWidget,
  TextWidget,
} from 'react-native-android-widget';
import type { ColorProp, ImageWidgetSource } from 'react-native-android-widget';

import type { WidgetData } from './data';

const CARD: ColorProp    = '#2A2A2A';
const NAVBAR: ColorProp  = '#0D1B3E';
const TEXT: ColorProp    = '#FFFFFF';
const MUTED: ColorProp   = '#9E9E9E';
const OVERLAY: ColorProp = '#BB000000';
const SCHEME = 'yoann2';

const IMG_RESET  = require('../assets/icons/icon-reset.png') as ImageWidgetSource;
const IMG_TASK   = require('../assets/icons/icon-task.png')  as ImageWidgetSource;
const IMG_IDEA   = require('../assets/icons/icon-idea.png')  as ImageWidgetSource;
const IMG_RDV    = require('../assets/icons/icon-rdv.png')   as ImageWidgetSource;
const IMG_HOME   = require('../assets/icons/icon-home.png')  as ImageWidgetSource;

export function TodoWidget({ tasks, widgetAppts, todayWork, settings, todayLabel, pauseActive, pauseElapsedLabel }: WidgetData) {
  const PRIMARY = settings.primaryColor as ColorProp;
  const BG      = settings.bgColor as ColorProp;
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
    image,
    label,
    clickAction,
    uri,
  }: {
    image: ImageWidgetSource;
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
          height: 44,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ImageWidget image={image} style={{ width: 26, height: 26 }} />
      </FlexWidget>
    );
  }

  const Divider = () => (
    <FlexWidget style={{ width: 1, height: 20, backgroundColor: '#3A3A3A' }} />
  );

  const visibleTasks  = tasks.slice(0, 4);
  const visibleAppts  = widgetAppts.slice(0, 3);
  const moreTasks     = tasks.length > 4  ? tasks.length - 4   : 0;
  const moreAppts     = widgetAppts.length > 3 ? widgetAppts.length - 3 : 0;

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
      {/* ── Bloc 1 : Heures de travail ── */}
      <FlexWidget
        style={{
          width: 'match_parent',
          backgroundColor: CARD,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 9,
          marginBottom: 6,
          flexDirection: 'column',
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
          <TextWidget text="💼" style={{ fontSize: 12, marginRight: 6 }} />
          <TextWidget text="Travail aujourd'hui" style={{ fontSize: 11, color: MUTED }} />
          <FlexWidget style={{ flex: 1 }} />
          <TextWidget text={todayLabel} style={{ fontSize: 10, color: MUTED }} />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginTop: 4 }}>
          <TextWidget
            text={todayWork}
            style={{ fontSize: 17, color: isRepos ? MUTED : PRIMARY, fontWeight: 'bold' }}
          />
          <FlexWidget style={{ flex: 1 }} />
          {/* Bouton pause */}
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: `${SCHEME}:///pause-toggle` }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: pauseActive ? '#1B2E1B' : '#2A2A2A',
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <TextWidget
              text={pauseActive ? `⏸ ${pauseElapsedLabel}` : '☕'}
              style={{ fontSize: 11, color: pauseActive ? '#4CAF50' : MUTED }}
            />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>

      {/* ── Bloc 2 : Tâches ── */}
      <FlexWidget
        style={{
          flex: 1,
          width: 'match_parent',
          backgroundColor: CARD,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 6,
          marginBottom: 6,
          flexDirection: 'column',
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginBottom: 6 }}>
          <TextWidget text="📋" style={{ fontSize: 11, marginRight: 6 }} />
          <TextWidget text="Tâches" style={{ fontSize: 11, color: MUTED }} />
          {tasks.length > 0 && (
            <TextWidget
              text={`${tasks.length}`}
              style={{ fontSize: 10, color: PRIMARY, marginLeft: 5 }}
            />
          )}
        </FlexWidget>
        {visibleTasks.length === 0 ? (
          <TextWidget text="Aucune tâche en cours ✓" style={{ fontSize: 11, color: MUTED }} />
        ) : (
          visibleTasks.map((task, i) => (
            <FlexWidget
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                width: 'match_parent',
                marginBottom: i < visibleTasks.length - 1 ? 5 : 0,
              }}
            >
              <FlexWidget
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: task.color as ColorProp,
                  marginRight: 7,
                }}
              />
              <FlexWidget style={{ flex: 1 }}>
                <TextWidget
                  text={task.title}
                  maxLines={1}
                  truncate="END"
                  style={{ fontSize: 12, color: TEXT }}
                />
              </FlexWidget>
              {task.deadline ? (
                <TextWidget
                  text={task.deadline}
                  style={{ fontSize: 9, color: MUTED, marginLeft: 4 }}
                />
              ) : null}
            </FlexWidget>
          ))
        )}
        {moreTasks > 0 && (
          <TextWidget
            text={`+${moreTasks} tâche${moreTasks > 1 ? 's' : ''}…`}
            style={{ fontSize: 9, color: MUTED, marginTop: 3 }}
          />
        )}
      </FlexWidget>

      {/* ── Bloc 3 : Rendez-vous ── */}
      <FlexWidget
        style={{
          flex: 1,
          width: 'match_parent',
          backgroundColor: CARD,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 6,
          marginBottom: 6,
          flexDirection: 'column',
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginBottom: 6 }}>
          <TextWidget text="📅" style={{ fontSize: 11, marginRight: 6 }} />
          <TextWidget text="Rendez-vous" style={{ fontSize: 11, color: MUTED }} />
          {widgetAppts.length > 0 && (
            <TextWidget
              text={`${widgetAppts.length}`}
              style={{ fontSize: 10, color: PRIMARY, marginLeft: 5 }}
            />
          )}
        </FlexWidget>
        {visibleAppts.length === 0 ? (
          <TextWidget text="Aucun RDV prévu" style={{ fontSize: 11, color: MUTED }} />
        ) : (
          visibleAppts.map((appt, i) => (
            <FlexWidget
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                width: 'match_parent',
                marginBottom: i < visibleAppts.length - 1 ? 5 : 0,
              }}
            >
              <FlexWidget
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: PRIMARY,
                  marginRight: 7,
                }}
              />
              <FlexWidget style={{ flex: 1 }}>
                <TextWidget
                  text={appt.title}
                  maxLines={1}
                  truncate="END"
                  style={{ fontSize: 12, color: TEXT }}
                />
              </FlexWidget>
              <TextWidget
                text={appt.when}
                style={{ fontSize: 9, color: PRIMARY, marginLeft: 4 }}
              />
            </FlexWidget>
          ))
        )}
        {moreAppts > 0 && (
          <TextWidget
            text={`+${moreAppts} RDV…`}
            style={{ fontSize: 9, color: MUTED, marginTop: 3 }}
          />
        )}
      </FlexWidget>

      {/* ── Bloc 4 : Barre de navigation ── */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          width: 'match_parent',
          alignItems: 'center',
          backgroundColor: NAVBAR,
          borderRadius: 12,
          paddingHorizontal: 2,
          paddingVertical: 2,
        }}
      >
        <NavItem image={IMG_RESET} label="Reset"   clickAction="REFRESH" />
        <Divider />
        <NavItem image={IMG_TASK}  label="Tâche"   clickAction="OPEN_URI" uri={`${SCHEME}:///task/new`} />
        <Divider />
        <NavItem image={IMG_IDEA}  label="Idée"    clickAction="OPEN_URI" uri={`${SCHEME}:///task/new?idea=1`} />
        <Divider />
        <NavItem image={IMG_RDV}   label="RDV"     clickAction="OPEN_URI" uri={`${SCHEME}:///appointment/new`} />
        <Divider />
        <NavItem image={IMG_HOME}  label="Accueil" clickAction="OPEN_APP" />
      </FlexWidget>
    </FlexWidget>
  );
}
