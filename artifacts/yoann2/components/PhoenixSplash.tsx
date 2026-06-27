import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const VIDEO       = require('@/assets/videos/phoenix-splash.mp4');
const PHOENIX_PNG = require('@/assets/images/phoenix-logo-cropped.png');

const { width: W } = Dimensions.get('window');

// PNG dimensions : 1079 × 970  →  ratio w/h = 1.1124
const PNG_RATIO   = 1079 / 970;
const LOGO_W      = W * 0.82;
const LOGO_H      = LOGO_W / PNG_RATIO;

const eOut = Easing.out(Easing.cubic);
const eIn  = Easing.in(Easing.quad);

type Phase = 'video' | 'title' | 'done';

interface Props { onDone: () => void }

export function PhoenixSplash({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('video');
  const doneCalledRef     = useRef(false);

  const overlayOp = useSharedValue(1);
  const videoOp   = useSharedValue(1);
  const logoOp    = useSharedValue(0);
  const titleOp   = useSharedValue(0);
  const titleTY   = useSharedValue(16);

  const player = useVideoPlayer(VIDEO, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => setPhase('title'));
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (phase === 'title') {
      // 1. Vidéo fondue vers 0 en 400ms
      videoOp.value = withTiming(0, { duration: 400, easing: eIn });
      // 2. Logo phénix arrive après que la vidéo soit éteinte (délai 450ms)
      logoOp.value  = withDelay(450, withTiming(1, { duration: 700, easing: eOut }));
      // 3. Texte 200ms après le logo
      titleOp.value = withDelay(650, withTiming(1, { duration: 600, easing: eOut }));
      titleTY.value = withDelay(650, withTiming(0,  { duration: 600, easing: eOut }));

      const t = setTimeout(() => setPhase('done'), 2800);
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
  const titleStyle   = useAnimatedStyle(() => ({
    opacity: titleOp.value,
    transform: [{ translateY: titleTY.value }],
  }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
      {/* ── Vidéo plein écran ── */}
      <Animated.View style={[StyleSheet.absoluteFill, videoStyle]}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      </Animated.View>

      {/* ── Logo phénix complet + texte (apparaît en fin de vidéo) ── */}
      <Animated.View style={[styles.logoBlock, logoStyle]}>
        <Image
          source={PHOENIX_PNG}
          style={{ width: LOGO_W, height: LOGO_H }}
          contentFit="contain"
        />
        <Animated.View style={[styles.textBlock, titleStyle]}>
          <View style={styles.titleRow}>
            <Text style={styles.titleMain}>YOANN</Text>
            <Text style={styles.titleVersion}>2.0</Text>
          </View>
          <View style={styles.subtitleRow}>
            <View style={styles.subtitleLine} />
            <Text style={styles.subtitle}>PRODUCTIVITY APP</Text>
            <View style={styles.subtitleLine} />
          </View>
        </Animated.View>
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
  logoBlock: {
    alignItems: 'center',
  },
  textBlock: {
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  titleRow: {
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
