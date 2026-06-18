import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native';

import type { WidgetData } from '@/widgets/data';

const IMG_RESET = require('../assets/icons/icon-reset.png') as ImageSourcePropType;
const IMG_TASK  = require('../assets/icons/icon-task.png')  as ImageSourcePropType;
const IMG_IDEA  = require('../assets/icons/icon-idea.png')  as ImageSourcePropType;
const IMG_RDV   = require('../assets/icons/icon-rdv.png')   as ImageSourcePropType;
const IMG_MIC   = require('../assets/icons/icon-mic.png')   as ImageSourcePropType;
const IMG_HOME  = require('../assets/icons/icon-home.png')  as ImageSourcePropType;

const NAV_ICONS: ImageSourcePropType[] = [IMG_RESET, IMG_TASK, IMG_IDEA, IMG_RDV, IMG_MIC, IMG_HOME];

const CARD   = 'rgba(32,32,32,0.80)';
const NAVBAR = 'rgba(18,18,18,0.87)';
const WH     = '#FFFFFF';
const MUTED  = '#9E9E9E';

export function WidgetPreview({ data }: { data: WidgetData }) {
  const PRIMARY  = data.settings.primaryColor;
  const BG       = data.settings.bgColor;
  const bgImage  = data.settings.bgImageUri;
  const isRepos  = data.todayWork === 'Repos';

  const visibleTasks = data.tasks.slice(0, 4);
  const visibleAppts = data.widgetAppts.slice(0, 3);
  const moreTasks    = data.tasks.length > 4 ? data.tasks.length - 4 : 0;
  const moreAppts    = data.widgetAppts.length > 3 ? data.widgetAppts.length - 3 : 0;

  const inner = (
    <View style={[styles.inner, bgImage ? { backgroundColor: 'rgba(0,0,0,0.55)' } : {}]}>

      {/* ── Bloc 1 : Marie · Nounou · Travail · Pause ── */}
      <View style={styles.bloc1}>
        <View style={styles.bloc1Row}>

          {/* Gauche : cercle Marie + nounou */}
          <View style={styles.leftGroup}>
            <View style={[styles.marieCircle, { backgroundColor: data.marieCircleColor }]}>
              <Text style={styles.marieDayNum}>{data.todayDayNum}</Text>
            </View>
            {data.nounouName ? (
              <View style={styles.nounouCol}>
                <View style={[styles.nounouBadge, { backgroundColor: data.nounouColor + '33' }]}>
                  <Text style={[styles.nounouName, { color: data.nounouColor }]}>{data.nounouName}</Text>
                </View>
                <Text style={styles.nounouPeriod}>{data.nounouPeriod}</Text>
                <Text style={[styles.nounouDur, { color: MUTED }]}>{data.nounouDuration}</Text>
              </View>
            ) : null}
          </View>

          <View style={{ flex: 1 }} />

          {/* Droite : travail */}
          <View style={styles.workCol}>
            <View style={styles.workLabelRow}>
              <Text style={styles.workEmoji}>💼 </Text>
              <Text style={[styles.workLbl, { color: MUTED }]}>Travail</Text>
            </View>
            <Text style={[styles.workVal, { color: isRepos ? MUTED : PRIMARY }]}>
              {data.todayWork}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Bloc 2 : Tâches ── */}
      <View style={styles.bloc}>
        <View style={styles.blocHead}>
          <Text style={styles.headEmoji}>📋</Text>
          <Text style={[styles.headTxt, { color: MUTED }]}>Tâches</Text>
          {data.tasks.length > 0 && (
            <Text style={[styles.headCount, { color: PRIMARY }]}>{data.tasks.length}</Text>
          )}
        </View>
        {visibleTasks.length === 0 ? (
          <Text style={[styles.emptyTxt, { color: MUTED }]}>Aucune tâche en cours ✓</Text>
        ) : (
          visibleTasks.map((task, i) => (
            <View key={i} style={[styles.itemRow, i < visibleTasks.length - 1 && { marginBottom: 5 }]}>
              <View style={[styles.dot, { backgroundColor: task.color }]} />
              <Text style={[styles.itemTitle, { fontSize: data.settings.taskFontSize - 4 }]} numberOfLines={1}>
                {task.title}
              </Text>
              {task.deadline ? (
                <Text style={[styles.itemMeta, { color: MUTED }]}>{task.deadline}</Text>
              ) : null}
            </View>
          ))
        )}
        {moreTasks > 0 && (
          <Text style={[styles.moreTxt, { color: MUTED }]}>
            +{moreTasks} tâche{moreTasks > 1 ? 's' : ''}…
          </Text>
        )}
      </View>

      {/* ── Bloc 3 : Rendez-vous ── */}
      <View style={styles.bloc}>
        <View style={styles.blocHead}>
          <Text style={styles.headEmoji}>📅</Text>
          <Text style={[styles.headTxt, { color: MUTED }]}>Rendez-vous</Text>
          {data.widgetAppts.length > 0 && (
            <Text style={[styles.headCount, { color: PRIMARY }]}>{data.widgetAppts.length}</Text>
          )}
        </View>
        {visibleAppts.length === 0 ? (
          <Text style={[styles.emptyTxt, { color: MUTED }]}>Aucun RDV prévu</Text>
        ) : (
          visibleAppts.map((appt, i) => (
            <View key={i} style={[styles.itemRow, i < visibleAppts.length - 1 && { marginBottom: 5 }]}>
              <View style={[styles.dot, { backgroundColor: PRIMARY }]} />
              <Text style={styles.itemTitle} numberOfLines={1}>{appt.title}</Text>
              <Text style={[styles.itemMeta, { color: appt.color }]}>{appt.when}</Text>
            </View>
          ))
        )}
        {moreAppts > 0 && (
          <Text style={[styles.moreTxt, { color: MUTED }]}>+{moreAppts} RDV…</Text>
        )}
      </View>

      {/* ── Bloc 4 : Barre de navigation ── */}
      <View style={styles.navbar}>
        {NAV_ICONS.map((src, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={styles.navDiv} />}
            <View style={styles.navItem}>
              <Image source={src} style={styles.navIcon} resizeMode="contain" />
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );

  if (bgImage) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: bgImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        {inner}
      </View>
    );
  }
  return <View style={styles.container}>{inner}</View>;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  inner: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
  },

  /* Bloc 1 */
  bloc1: {
    backgroundColor: CARD,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  bloc1Row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  marieCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marieDayNum: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: WH,
  },
  nounouCol: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginLeft: 8,
  },
  nounouBadge: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 3,
  },
  nounouName: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  nounouPeriod: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: WH,
  },
  nounouDur: {
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  workCol: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  workLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  workEmoji: {
    fontSize: 10,
  },
  workLbl: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
  },
  workVal: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  /* Blocs 2 & 3 */
  bloc: {
    backgroundColor: CARD,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  blocHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  headEmoji: {
    fontSize: 11,
  },
  headTxt: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  headCount: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    marginLeft: 4,
  },
  emptyTxt: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 7,
    flexShrink: 0,
  },
  itemTitle: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: WH,
  },
  itemMeta: {
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
    marginLeft: 4,
    flexShrink: 0,
  },
  moreTxt: {
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
    marginTop: 3,
  },

  /* Nav bar */
  navbar: {
    flexDirection: 'row',
    backgroundColor: NAVBAR,
    borderRadius: 12,
    paddingHorizontal: 2,
    paddingVertical: 6,
    alignItems: 'center',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  navIcon: {
    width: 26,
    height: 26,
  },
  navDiv: {
    width: 1,
    height: 20,
    backgroundColor: '#3A3A3A',
  },
});
