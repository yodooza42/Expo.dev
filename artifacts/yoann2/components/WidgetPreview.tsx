import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native';

import type { WidgetData } from '@/widgets/data';

const IMG_HOME      = require('../assets/icons/icon-home.png')      as ImageSourcePropType;
const IMG_GAS       = require('../assets/icons/icon-gas.png')       as ImageSourcePropType;
const IMG_NAV       = require('../assets/icons/icon-nav.png')       as ImageSourcePropType;
const IMG_ADD       = require('../assets/icons/icon-add.png')       as ImageSourcePropType;
const IMG_PLAY      = require('../assets/icons/icon-play.png')      as ImageSourcePropType;
const IMG_COFFEE    = require('../assets/icons/icon-coffee.png')    as ImageSourcePropType;
const IMG_CIGARETTE = require('../assets/icons/icon-cigarette.png') as ImageSourcePropType;

const CARD    = '#202020';
const NAVBAR  = '#121212';
const WH      = '#FFFFFF';
const MUTED   = '#9E9E9E';
const PRIMARY = '#FFC107';
const ACCENT  = '#1A2A00';

function Btn({ img, accent = false }: { img: ImageSourcePropType; accent?: boolean }) {
  return (
    <View style={[styles.btn, accent && { backgroundColor: ACCENT }]}>
      <Image source={img} style={styles.btnIcon} resizeMode="contain" />
    </View>
  );
}

export function WidgetPreview({ data }: { data: WidgetData }) {
  const isRepos  = data.todayWork === 'Repos';
  const nextAppt = data.widgetAppts[0] ?? null;

  return (
    <View style={styles.widget}>
      {/* ── Row 1 : infos ── */}
      <View style={styles.rowInfo}>
        {/* Anneau shift Marie */}
        <View style={[styles.ring, { backgroundColor: data.marieCircleColor }]}>
          <View style={styles.ringInner}>
            <Text style={styles.ringNum}>{data.todayDayNum}</Text>
          </View>
        </View>

        <Text style={[styles.work, { color: isRepos ? MUTED : PRIMARY }]}>
          {isRepos ? 'Repos' : data.todayWork}
        </Text>

        <View style={{ flex: 1 }} />

        <Text style={styles.tasks}>{data.tasks.length} taches</Text>
        {nextAppt ? (
          <Text style={styles.appt} numberOfLines={1}> · {nextAppt.title}</Text>
        ) : null}
      </View>

      {/* ── Row 2 : boutons ── */}
      <View style={styles.rowBtns}>
        <Btn img={IMG_HOME} />
        <Btn img={IMG_GAS} />
        <Btn img={IMG_NAV} />
        <Btn img={IMG_ADD} />
        <Btn img={IMG_PLAY} accent />
        <View style={styles.sep} />
        <Btn img={IMG_COFFEE} />
        <Btn img={IMG_CIGARETTE} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  widget: {
    backgroundColor: NAVBAR,
    borderRadius: 14,
    paddingHorizontal: 5,
    paddingTop: 3,
    paddingBottom: 3,
    gap: 2,
  },
  rowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    gap: 6,
  },
  ring: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: NAVBAR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringNum: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: WH,
  },
  work: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  tasks: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: WH,
  },
  appt: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: PRIMARY,
    flexShrink: 1,
  },
  rowBtns: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 2,
    height: 44,
  },
  btn: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnIcon: {
    width: 40,
    height: 40,
  },
  sep: {
    width: 4,
    backgroundColor: NAVBAR,
  },
});
