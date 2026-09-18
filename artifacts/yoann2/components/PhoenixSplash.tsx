import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const VIDEO = require('@/assets/videos/phoenix-splash.mp4');

interface Props { onDone: () => void }

export function PhoenixSplash({ onDone }: Props) {
  const doneCalledRef = useRef(false);
  const overlayOp     = useSharedValue(1);

  const finish = useCallback(() => {
    if (doneCalledRef.current) return;
    doneCalledRef.current = true;
    overlayOp.value = withTiming(0, { duration: 500, easing: Easing.in(Easing.quad) });
    setTimeout(onDone, 500);
  }, [onDone, overlayOp]);

  const player = useVideoPlayer(VIDEO, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    let started = false;
    const sub = player.addListener('statusChange', (payload: { status: string }) => {
      if (payload.status === 'readyToPlay') started = true;
      if (started && payload.status === 'idle') {
        sub.remove();
        finish();
      }
    });
    return () => sub.remove();
  }, [player, finish]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={finish} />
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
