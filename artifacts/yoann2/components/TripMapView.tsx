import React, { useMemo } from 'react';
import { GestureResponderEvent, View } from 'react-native';
import { Circle, Line as SvgLine, Polyline, Rect, Svg, Text as SvgText } from 'react-native-svg';

import type { RoutePoint } from '@/types/trips';

interface Props {
  route: RoutePoint[];
  width: number;
  height: number;
  /** Background color, default #1A1A1A */
  bgColor?: string;
  /** Route line color, default #FFC107 */
  lineColor?: string;
  /** Intermediate stop positions — rendered as yellow waypoint dots */
  waypoints?: Array<{ lat: number; lng: number }>;
  /** Scrub position — rendered as an orange circle on the route */
  scrubPoint?: { lat: number; lng: number };
  /** Route indices of already-anchored photo markers — rendered as small pins */
  photoMarkerIndices?: number[];
  /** When true, tapping the map selects the nearest route point via onSelectPoint. */
  selectMode?: boolean;
  /** Called with the nearest route index when the user taps the map in selectMode. */
  onSelectPoint?: (index: number) => void;
}

const PAD = 0.12;

/** Pick the largest "nice" km value that fits within maxFrac of drawW pixels */
function pickScaleKm(totalWidthKm: number, drawW: number, maxFrac = 0.28): { km: number; px: number; label: string } {
  const niceKm = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  const targetKm = totalWidthKm * maxFrac;
  let chosen = niceKm[0]!;
  for (const v of niceKm) {
    if (v <= targetKm) chosen = v;
    else break;
  }
  const px = (chosen / totalWidthKm) * drawW;
  const label = chosen < 1 ? `${Math.round(chosen * 1000)} m` : `${chosen} km`;
  return { km: chosen, px, label };
}

export function TripMapView({
  route, width, height, bgColor = '#1A1A1A', lineColor = '#FFC107', waypoints, scrubPoint,
  photoMarkerIndices, selectMode, onSelectPoint,
}: Props) {
  const { pointsStr, startX, startY, endX, endY, toX, toY, scale } = useMemo(() => {
    if (!route || route.length < 2) return { pointsStr: '', startX: 0, startY: 0, endX: 0, endY: 0, toX: () => 0, toY: () => 0, scale: null };

    const lats = route.map(p => p.lat);
    const lngs = route.map(p => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latRange = maxLat - minLat || 0.0001;
    const lngRange = maxLng - minLng || 0.0001;

    const latMeters = latRange * 111_320;
    const lngMeters = lngRange * 111_320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const geoAspect = lngMeters / latMeters;
    const viewAspect = width / height;

    let scaleX = 1;
    let scaleY = 1;
    if (geoAspect > viewAspect) {
      scaleY = viewAspect / geoAspect;
    } else {
      scaleX = geoAspect / viewAspect;
    }

    const drawW = width * (1 - 2 * PAD) * scaleX;
    const drawH = height * (1 - 2 * PAD) * scaleY;
    const offX = (width - drawW) / 2;
    const offY = (height - drawH) / 2;

    function toX(lng: number): number {
      return offX + ((lng - minLng) / lngRange) * drawW;
    }
    function toY(lat: number): number {
      return offY + ((maxLat - lat) / latRange) * drawH;
    }

    const pointsStr = route.map(p => `${toX(p.lng).toFixed(1)},${toY(p.lat).toFixed(1)}`).join(' ');
    const s = route[0]!;
    const e = route[route.length - 1]!;

    const totalWidthKm = lngMeters / 1000;
    const scale = pickScaleKm(totalWidthKm, drawW);
    const scaleX2 = width - 12;
    const scaleX1 = scaleX2 - scale.px;
    const scaleBarY = height - 14;

    return {
      pointsStr,
      startX: toX(s.lng),
      startY: toY(s.lat),
      endX: toX(e.lng),
      endY: toY(e.lat),
      toX,
      toY,
      scale: { x1: scaleX1, x2: scaleX2, y: scaleBarY, label: scale.label },
    };
  }, [route, width, height]);

  if (!route || route.length < 2) return null;

  function handleTap(evt: GestureResponderEvent) {
    if (!selectMode || !onSelectPoint) return;
    const { locationX, locationY } = evt.nativeEvent;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < route.length; i++) {
      const dx = toX(route[i]!.lng) - locationX;
      const dy = toY(route[i]!.lat) - locationY;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    onSelectPoint(bestIdx);
  }

  return (
    <View onStartShouldSetResponder={() => !!selectMode} onResponderRelease={handleTap}>
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill={bgColor} />
      <Polyline
        points={pointsStr}
        fill="none"
        stroke={lineColor}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.9}
      />
      {/* Photo markers already anchored on this route */}
      {photoMarkerIndices?.map((idx, i) => {
        const p = route[Math.max(0, Math.min(idx, route.length - 1))]!;
        const cx = toX(p.lng), cy = toY(p.lat);
        return (
          <React.Fragment key={`pm-${i}`}>
            <Circle cx={cx} cy={cy} r={8} fill="#E91E63" opacity={0.9} />
            <Circle cx={cx} cy={cy} r={3} fill="#fff" />
          </React.Fragment>
        );
      })}
      {/* Intermediate waypoints */}
      {waypoints?.map((wp, i) => {
        const cx = toX(wp.lng);
        const cy = toY(wp.lat);
        return (
          <React.Fragment key={i}>
            <Circle cx={cx} cy={cy} r={5} fill="#FFC107" opacity={0.95} />
            <Circle cx={cx} cy={cy} r={2.5} fill="#121212" />
          </React.Fragment>
        );
      })}
      {/* Scrub position — orange circle */}
      {scrubPoint && (
        <>
          <Circle cx={toX(scrubPoint.lng)} cy={toY(scrubPoint.lat)} r={9} fill="#FF980055" />
          <Circle cx={toX(scrubPoint.lng)} cy={toY(scrubPoint.lat)} r={6} fill="#FF9800" opacity={0.95} />
          <Circle cx={toX(scrubPoint.lng)} cy={toY(scrubPoint.lat)} r={3} fill="#fff" />
        </>
      )}
      {/* Start — green */}
      <Circle cx={startX} cy={startY} r={6} fill="#4CAF50" opacity={0.9} />
      <Circle cx={startX} cy={startY} r={3} fill="#fff" />
      {/* End — amber */}
      <Circle cx={endX} cy={endY} r={6} fill={lineColor} opacity={0.9} />
      <Circle cx={endX} cy={endY} r={3} fill="#121212" />
      {/* Scale bar */}
      {scale && (
        <>
          {/* Horizontal bar */}
          <SvgLine x1={scale.x1} y1={scale.y} x2={scale.x2} y2={scale.y} stroke="#AAAAAA" strokeWidth={1.5} />
          {/* Left tick */}
          <SvgLine x1={scale.x1} y1={scale.y - 4} x2={scale.x1} y2={scale.y + 4} stroke="#AAAAAA" strokeWidth={1.5} />
          {/* Right tick */}
          <SvgLine x1={scale.x2} y1={scale.y - 4} x2={scale.x2} y2={scale.y + 4} stroke="#AAAAAA" strokeWidth={1.5} />
          {/* Label centered above bar */}
          <SvgText
            x={(scale.x1 + scale.x2) / 2}
            y={scale.y - 6}
            textAnchor="middle"
            fontSize={9}
            fill="#AAAAAA"
            fontFamily="Arial,sans-serif"
          >
            {scale.label}
          </SvgText>
        </>
      )}
    </Svg>
    </View>
  );
}
