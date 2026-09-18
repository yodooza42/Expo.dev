import React, { useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Defs, LinearGradient, Path, Polyline, Stop, Svg, Text as SvgText } from 'react-native-svg';

import { useColors } from '@/hooks/useColors';
import type { PortfolioDataPoint } from '@/utils/marketStorage';
import { fmtEuro } from '@/utils/money';

type Period = 'all' | '6M' | '3M' | '1M';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: '6M',  label: '6 mois' },
  { key: '3M',  label: '3 mois' },
  { key: '1M',  label: '1 mois' },
];

const MKT_GREEN  = '#8B5CF6';
const COST_COLOR = '#6B7280';
const CHART_H    = 130;
const MINI_H     = 80;
const PAD_TOP    = 8;
const PAD_BOT    = 24;
const MINI_PAD_BOT = 4;

interface Props {
  data: PortfolioDataPoint[];
  masked?: boolean;
  mini?: boolean;
}

export function PortfolioChart({ data, masked = false, mini = false }: Props) {
  const colors = useColors();
  const [period, setPeriod] = useState<Period>('all');
  const W = mini
    ? Dimensions.get('window').width - 64
    : Dimensions.get('window').width - 32;

  const filtered = useMemo(() => {
    if (period === 'all' || data.length === 0) return data;
    const cutoff = new Date();
    if (period === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
    else if (period === '3M') cutoff.setMonth(cutoff.getMonth() - 3);
    else cutoff.setMonth(cutoff.getMonth() - 1);
    const cutStr = cutoff.toISOString().slice(0, 10);
    const slice = data.filter(d => d.date >= cutStr);
    return slice.length >= 2 ? slice : data.slice(-2);
  }, [data, period]);

  const chart = useMemo(() => {
    if (filtered.length < 2) return null;
    const n      = filtered.length;
    const chartH = mini ? MINI_H : CHART_H;
    const padBot = mini ? MINI_PAD_BOT : PAD_BOT;
    const allV = [...filtered.map(d => d.projectedValue), ...filtered.map(d => d.costBasis)];
    const minV = Math.min(...allV) * 0.97;
    const maxV = Math.max(...allV) * 1.03;
    const range = maxV - minV || 1;
    const cH   = chartH - PAD_TOP - padBot;

    const toX = (i: number) => (i / (n - 1)) * W;
    const toY = (v: number) => PAD_TOP + cH - ((v - minV) / range) * cH;

    const valPts  = filtered.map((d, i) => `${toX(i)},${toY(d.projectedValue)}`).join(' ');
    const costPts = filtered.map((d, i) => `${toX(i)},${toY(d.costBasis)}`).join(' ');

    const bottomY  = PAD_TOP + cH;
    const areaPath = `M 0,${toY(filtered[0].projectedValue)} ${valPts} L ${toX(n - 1)},${bottomY} L 0,${bottomY} Z`;

    const midIdx = Math.floor(n / 2);
    const dateLabels = mini ? [] : [
      { x: toX(0),       label: fmtMonthYear(filtered[0].date),       anchor: 'start'  },
      { x: toX(midIdx),  label: fmtMonthYear(filtered[midIdx].date),   anchor: 'middle' },
      { x: toX(n - 1),   label: fmtMonthYear(filtered[n - 1].date),    anchor: 'end'    },
    ];

    return { valPts, costPts, areaPath, dateLabels, last: filtered[n - 1], chartH };
  }, [filtered, W, mini]);

  if (data.length < 2 || !chart) return null;

  const pnl    = chart.last.projectedValue - chart.last.costBasis;
  const pnlPct = chart.last.costBasis > 0 ? (pnl / chart.last.costBasis) * 100 : 0;
  const pnlColor = pnl >= 0 ? MKT_GREEN : '#EF4444';

  if (mini) {
    return (
      <View style={styles.miniContainer}>
        <Svg width={W} height={MINI_H} style={{ overflow: 'hidden' }}>
          <Defs>
            <LinearGradient id="miniGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor={MKT_GREEN} stopOpacity={0.20} />
              <Stop offset="100%" stopColor={MKT_GREEN} stopOpacity={0.01} />
            </LinearGradient>
          </Defs>
          <Path     d={chart.areaPath} fill="url(#miniGrad)" />
          <Polyline points={chart.costPts} fill="none" stroke={COST_COLOR} strokeWidth={1} strokeDasharray="3,3" />
          <Polyline points={chart.valPts}  fill="none" stroke={MKT_GREEN}  strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.periodRow}>
        {PERIODS.map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => setPeriod(key)}
            style={[
              styles.periodBtn,
              { borderColor: 'transparent' },
              period === key && { backgroundColor: MKT_GREEN + '20', borderColor: MKT_GREEN + '60' },
            ]}
          >
            <Text style={[styles.periodTxt, { color: period === key ? MKT_GREEN : colors.mutedForeground }]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Svg width={W} height={CHART_H} style={{ overflow: 'hidden' }}>
        <Defs>
          <LinearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"   stopColor={MKT_GREEN} stopOpacity={0.22} />
            <Stop offset="100%" stopColor={MKT_GREEN} stopOpacity={0.01} />
          </LinearGradient>
        </Defs>
        <Path     d={chart.areaPath} fill="url(#portGrad)" />
        <Polyline points={chart.costPts} fill="none" stroke={COST_COLOR} strokeWidth={1}   strokeDasharray="4,3" />
        <Polyline points={chart.valPts}  fill="none" stroke={MKT_GREEN}  strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        {chart.dateLabels.map((l, i) => (
          <SvgText key={i} x={l.x} y={CHART_H - 5} fontSize={8.5} fill={colors.mutedForeground} textAnchor={l.anchor as any}>
            {l.label}
          </SvgText>
        ))}
      </Svg>

      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLbl, { color: colors.mutedForeground }]}>
          Investi :{' '}
          <Text style={{ color: colors.foreground }}>
            {masked ? '••••' : fmtEuro(chart.last.costBasis)}
          </Text>
        </Text>
        {pnl !== 0 && (
          <View style={[styles.pnlBadge, { backgroundColor: pnlColor + '18' }]}>
            <Text style={[styles.pnlTxt, { color: pnlColor }]}>
              {masked
                ? `${pnl >= 0 ? '+' : '-'}•••€ (${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`
                : `${pnl >= 0 ? '+' : ''}${fmtEuro(pnl)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function fmtMonthYear(isoDate: string): string {
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    paddingBottom: 10,
    overflow: 'hidden',
  },
  miniContainer: {
    marginTop: 8,
    marginBottom: 4,
    overflow: 'hidden',
    borderRadius: 8,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  periodBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  periodTxt: {
    fontSize: 11,
    fontWeight: '500',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  summaryLbl: {
    fontSize: 11,
  },
  pnlBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pnlTxt: {
    fontSize: 11,
    fontWeight: '600',
  },
});
