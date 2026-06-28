import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const PART1 = require('@/assets/videos/phoenix-splash.mp4');
const PART2 = require('@/assets/videos/phoenix-splash-part2.mp4');

const eIn = Easing.in(Easing.quad);

interface Props { onDone: () => void }

export function PhoenixSplash({ onDone }: Props) {
  const doneCalledRef  = useRef(false);
  const [part, setPart] = useState<1 | 2>(1);
  const overlayOp      = useSharedValue(1);

  const player = useVideoPlayer(part === 1 ? PART1 : PART2, (p) => {
    p.loop = false;
    p.play();
  });

  const finish = useCallback(() => {
    if (doneCalledRef.current) return;
    doneCalledRef.current = true;
    overlayOp.value = withTiming(0, { duration: 600, easing: eIn });
    setTimeout(onDone, 600);
  }, [onDone, overlayOp]);

  useEffect(() => {
    let started = false;
    const sub = player.addListener('statusChange', (payload: { status: string }) => {
      if (payload.status === 'readyToPlay') started = true;
      if (started && payload.status === 'idle') {
        sub.remove();
        if (part === 1) {
          setPart(2);
        } else {
          finish();
        }
      }
    });
    return () => sub.remove();
  }, [player, part, finish]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
      <VideoView
        key={part}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 9999,
  },
});
