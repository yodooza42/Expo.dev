import { Image } from 'expo-image';
import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const { height } = Dimensions.get('window');
const ICON = require('@/assets/images/icon.png');

const EMBERS: { x: number; delay: number; size: number }[] = [
  { x: -58, delay: 0,   size: 6 },
  { x:  42, delay: 100, size: 5 },
  { x: -22, delay: 200, size: 8 },
  { x:  68, delay: 280, size: 4 },
  { x: -78, delay: 360, size: 5 },
  { x:  28, delay: 440, size: 7 },
];

function Ember({ x, delay, size }: { x: number; delay: number; size: number }) {
  const translateY = useSharedValue(0);
  const opacity    = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withSequence(
      withTiming(0.9, { duration: 200 }),
      withTiming(0.9, { duration: 700 }),
      withTiming(0,   { duration: 400 }),
    ));
    translateY.value = withDelay(delay, withTiming(
      -height * 0.42,
      { duration: 1300, easing: Easing.out(Easing.quad) },
    ));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.ember,
        style,
        { marginLeft: x, width: size, height: size, borderRadius: size / 2 },
      ]}
    />
  );
}

interface Props { onDone: () => void }

export function PhoenixSplash({ onDone }: Props) {
  const ease = Easing.out(Easing.cubic);

  const phoenixOpacity = useSharedValue(0);
  const phoenixScale   = useSharedValue(0.25);
  const phoenixY       = useSharedValue(0);
  const glowOpacity    = useSharedValue(0);
  const glowScale      = useSharedValue(0.5);
  const textOpacity    = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    const APPEAR   = 450;
    const FLY      = 1050;
    const FADE_OUT = 400;

    phoenixOpacity.value = withSequence(
      withTiming(1, { duration: APPEAR, easing: ease }),
      withTiming(1, { duration: FLY - FADE_OUT }),
      withTiming(0, { duration: FADE_OUT, easing: ease }),
    );
    phoenixScale.value = withSequence(
      withTiming(1.0,  { duration: APPEAR, easing: ease }),
      withTiming(0.68, { duration: FLY,    easing: Easing.in(Easing.quad) }),
    );
    phoenixY.value = withSequence(
      withTiming(0,             { duration: APPEAR }),
      withTiming(-height * 0.5, { duration: FLY, easing: Easing.in(Easing.quad) }),
    );

    glowOpacity.value = withSequence(
      withTiming(0.55, { duration: 350, easing: ease }),
      withTiming(0.35, { duration: 800 }),
      withTiming(0,    { duration: 350, easing: ease }),
    );
    glowScale.value = withSequence(
      withTiming(1.0,  { duration: 350, easing: ease }),
      withTiming(0.45, { duration: 1150, easing: ease }),
    );

    textOpacity.value = withDelay(220, withSequence(
      withTiming(1, { duration: 320, easing: ease }),
      withTiming(1, { duration: 780 }),
      withTiming(0, { duration: 320, easing: ease }),
    ));

    overlayOpacity.value = withDelay(
      1650,
      withTiming(0, { duration: 380, easing: ease }, (finished) => {
        if (finished) runOnJS(onDone)();
      }),
    );
  }, []);

  const phoenixStyle = useAnimatedStyle(() => ({
    opacity: phoenixOpacity.value,
    transform: [{ scale: phoenixScale.value }, { translateY: phoenixY.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }, { translateY: phoenixY.value * 0.8 }],
  }));

  const textStyle   = useAnimatedStyle(() => ({ opacity: textOpacity.value }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
      <Animated.View style={[styles.glow, glowStyle]} />

      {EMBERS.map((e, i) => (
        <Ember key={i} {...e} />
      ))}

      <Animated.View style={[styles.phoenixWrap, phoenixStyle]}>
        <Image source={ICON} style={styles.phoenix} contentFit="contain" />
      </Animated.View>

      <Animated.View style={[styles.titleRow, textStyle]}>
        <Animated.Text style={styles.titleMain}>YOANN</Animated.Text>
        <Animated.Text style={styles.titleVersion}>2.0</Animated.Text>
      </Animated.View>

      <Animated.View style={[styles.subtitleRow, textStyle]}>
        <Animated.View style={styles.subtitleLine} />
        <Animated.Text style={styles.subtitle}>Productivity App</Animated.Text>
        <Animated.View style={styles.subtitleLine} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0E0E0E',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  glow: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#FFC107',
    shadowColor: '#FFC107',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 90,
    elevation: 40,
  },
  ember: {
    position: 'absolute',
    top: '50%',
    backgroundColor: '#FFC107',
    shadowColor: '#FFC107',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 8,
  },
  phoenixWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoenix: {
    width: 160,
    height: 160,
  },
  titleRow: {
    position: 'absolute',
    bottom: 220,
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
    bottom: 196,
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
