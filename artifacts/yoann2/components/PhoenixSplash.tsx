import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const VIDEO       = require('@/assets/videos/phoenix-splash.mp4');
const PHOENIX_PNG = require('@/assets/images/phoenix-logo-final.png');

const { width: W } = Dimensions.get('window');

const eOut = Easing.out(Easing.cubic);
const eIn  = Easing.in(Easing.quad);

type Phase = 'video' | 'logo' | 'done';

interface Props { onDone: () => void }

export function PhoenixSplash({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('video');
  const doneCalledRef     = useRef(false);

  const overlayOp = useSharedValue(1);
  const videoOp   = useSharedValue(1);
  const logoOp    = useSharedValue(0);

  const player = useVideoPlayer(VIDEO, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => setPhase('logo'));
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (phase === 'logo') {
      // Vidéo s'éteint en 400ms
      videoOp.value = withTiming(0, { duration: 400, easing: eIn });
      // Logo final arrive après coupure noire (délai 450ms)
      logoOp.value = withDelay(450, withTiming(1, { duration: 700, easing: eOut }));

      const t = setTimeout(() => setPhase('done'), 2200);
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
  const videoStyle   = useAnimatedStyle(() => ({ opacity: videoOp.value }));
  const logoStyle    = useAnimatedStyle(() => ({ opacity: logoOp.value }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
      {/* ── Vidéo plein écran (8s) ── */}
      <Animated.View style={[StyleSheet.absoluteFill, videoStyle]}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      </Animated.View>

      {/* ── Logo final (phénix + YOANN 2.0 intégré) ── */}
      <Animated.View style={[styles.logoWrap, logoStyle]}>
        <Image
          source={PHOENIX_PNG}
          style={styles.logoImg}
          contentFit="contain"
        />
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
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: {
    width: W * 0.72,
    height: W * 0.72,
  },
});
