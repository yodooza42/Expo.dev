import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const VIDEO = require('@/assets/videos/phoenix-splash.mp4');

const eOut = Easing.out(Easing.cubic);
const eIn  = Easing.in(Easing.quad);

type Phase = 'video' | 'title' | 'done';

interface Props { onDone: () => void }

export function PhoenixSplash({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('video');
  const doneCalledRef = useRef(false);

  const overlayOp = useSharedValue(1);
  const titleOp   = useSharedValue(0);
  const titleTY   = useSharedValue(24);

  const player = useVideoPlayer(VIDEO, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      setPhase('title');
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (phase === 'title') {
      titleOp.value = withTiming(1, { duration: 700, easing: eOut });
      titleTY.value = withTiming(0, { duration: 700, easing: eOut });
      const t = setTimeout(() => setPhase('done'), 2500);
      return () => clearTimeout(t);
    }
    if (phase === 'done' && !doneCalledRef.current) {
      doneCalledRef.current = true;
      overlayOp.value = withTiming(0, { duration: 500, easing: eIn });
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));
  const titleStyle   = useAnimatedStyle(() => ({
    opacity: titleOp.value,
    transform: [{ translateY: titleTY.value }],
  }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
      <Animated.View style={[styles.titleRow, titleStyle]}>
        <Text style={styles.titleMain}>YOANN</Text>
        <Text style={styles.titleVersion}>2.0</Text>
      </Animated.View>
      <Animated.View style={[styles.subtitleRow, titleStyle]}>
        <View style={styles.subtitleLine} />
        <Text style={styles.subtitle}>PRODUCTIVITY APP</Text>
        <View style={styles.subtitleLine} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  titleRow: {
    position: 'absolute',
    bottom: 185,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  titleMain: {
    fontSize: 38,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: 8,
  },
  titleVersion: {
    fontSize: 22,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFC107',
    letterSpacing: 3,
  },
  subtitleRow: {
    position: 'absolute',
    bottom: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subtitleLine: {
    width: 28,
    height: 1,
    backgroundColor: '#FFC107',
    opacity: 0.6,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#888',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
});
