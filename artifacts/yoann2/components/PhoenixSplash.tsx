import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const VIDEO = require('@/assets/videos/phoenix-splash.mp4');

const eIn = Easing.in(Easing.quad);

interface Props { onDone: () => void }

export function PhoenixSplash({ onDone }: Props) {
  const doneCalledRef = useRef(false);
  const overlayOp     = useSharedValue(1);

  const player = useVideoPlayer(VIDEO, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    let started = false;
    const sub = player.addListener('statusChange', (payload: { status: string }) => {
      if (payload.status === 'readyToPlay') {
        started = true;
      }
      if (started && payload.status === 'idle') {
        if (!doneCalledRef.current) {
          doneCalledRef.current = true;
          overlayOp.value = withTiming(0, { duration: 500, easing: eIn });
          setTimeout(onDone, 500);
        }
        sub.remove();
      }
    });
    return () => sub.remove();
  }, [player]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
      <VideoView
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
