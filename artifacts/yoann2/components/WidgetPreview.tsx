import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native';

import type { WidgetData } from '@/widgets/data';

const IMG_RESET = require('../assets/icons/icon-reset.png') as ImageSourcePropType;
const IMG_NAV   = require('../assets/icons/icon-nav.png')   as ImageSourcePropType;
const IMG_PLAY  = require('../assets/icons/icon-play.png')  as ImageSourcePropType;
const IMG_PAUSE = require('../assets/icons/icon-pause.png') as ImageSourcePropType;
const IMG_GAS   = require('../assets/icons/icon-gas.png')   as ImageSourcePropType;
const IMG_STOP  = require('../assets/icons/icon-stop.png')  as ImageSourcePropType;

const CARD   = '#202020';
const NAVBAR = '#121212';
const WH     = '#FFFFFF';
const MUTED  = '#9E9E9E';
const PRIMARY = '#FFC107';
const GREEN  = '#4CAF50';

export function WidgetPreview({ data }: { data: WidgetData }) {
  const isRepos = data.todayWork === 'Repos';
  const nextAppt = data.widgetAppts[0] ?? null;

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        {/* ── Row 1: Info bar ── */}
        <View style={styles.rowInfo}>
          {/* Day circle */}
          <View style={[styles.dayCircle, { backgroundColor: data.marieCircleColor }]}>
            <Text style={styles.dayNum}>{data.todayDayNum}</Text>
          </View>

          {/* Work */}
          <View style={styles.workGroup}>
            <Text style={styles.workEmoji}>💼 </Text>
            <Text style={[styles.workTxt, { color: isRepos ? MUTED : PRIMARY }]}>
              {isRepos ? 'Repos' : data.todayWork}
            </Text>
          </View>

          {/* Tasks count */}
          <View style={styles.badgeGroup}>
            <Text style={styles.badgeEmoji}>📋</Text>
            <Text style={styles.badgeCount}>{data.tasks.length}</Text>
          </View>

          {/* Next appt */}
          {nextAppt ? (
            <View style={styles.apptGroup}>
              <Text style={styles.badgeEmoji}>📅</Text>
              <Text style={[styles.apptTxt, { color: PRIMARY }]} numberOfLines={1}>
                {nextAppt.title}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Row 2: Action buttons ── */}
        <View style={styles.rowActions}>
          <View style={[styles.btn, styles.btnWide]}>
            <Image source={IMG_NAV} style={styles.btnIcon} resizeMode="contain" />
          </View>
          <View style={styles.btn}>
            <Image source={IMG_PLAY} style={styles.btnIcon} resizeMode="contain" />
          </View>
          <View style={styles.btn}>
            <Image source={IMG_GAS} style={styles.btnIcon} resizeMode="contain" />
          </View>
          <View style={styles.btn}>
            <Image source={IMG_RESET} style={styles.btnIcon} resizeMode="contain" />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: NAVBAR,
  },
  inner: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 6,
  },
  rowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: WH,
  },
  workGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    flex: 1,
  },
  workEmoji: {
    fontSize: 11,
  },
  workTxt: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  badgeEmoji: {
    fontSize: 11,
    marginRight: 3,
  },
  badgeCount: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: WH,
  },
  apptGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 120,
  },
  apptTxt: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  btn: {
    flex: 1,
    height: 48,
    backgroundColor: CARD,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  btnWide: {
    flex: 1.5,
  },
  btnEmoji: {
    fontSize: 24,
    color: WH,
  },
  btnIcon: {
    width: 32,
    height: 32,
  },
});
