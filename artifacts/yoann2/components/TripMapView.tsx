import React, { useMemo } from 'react';
import { Circle, Polyline, Rect, Svg } from 'react-native-svg';

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
}

const PAD = 0.12;

export function TripMapView({ route, width, height, bgColor = '#1A1A1A', lineColor = '#FFC107', waypoints }: Props) {
  const { pointsStr, startX, startY, endX, endY, toX, toY } = useMemo(() => {
    if (!route || route.length < 2) return { pointsStr: '', startX: 0, startY: 0, endX: 0, endY: 0, toX: () => 0, toY: () => 0 };

    const lats = route.map(p => p.lat);
    const lngs = route.map(p => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latRange = maxLat - minLat || 0.0001;
    const lngRange = maxLng - minLng || 0.0001;

    // Preserve geographic aspect ratio
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

    return {
      pointsStr,
      startX: toX(s.lng),
      startY: toY(s.lat),
      endX: toX(e.lng),
      endY: toY(e.lat),
      toX,
      toY,
    };
  }, [route, width, height]);

  if (!route || route.length < 2) return null;

  return (
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
      {/* Intermediate waypoints — yellow diamond-ish dots */}
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
      {/* Start — green */}
      <Circle cx={startX} cy={startY} r={6} fill="#4CAF50" opacity={0.9} />
      <Circle cx={startX} cy={startY} r={3} fill="#fff" />
      {/* End — amber */}
      <Circle cx={endX} cy={endY} r={6} fill={lineColor} opacity={0.9} />
      <Circle cx={endX} cy={endY} r={3} fill="#121212" />
    </Svg>
  );
}
