import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const { width: W, height: H } = Dimensions.get('window');
const PHOENIX = require('@/assets/images/phoenix-transparent.png');

// ── Easing shortcuts ────────────────────────────────────────────────────────
const eOut  = Easing.out(Easing.cubic);
const eIn   = Easing.in(Easing.quad);
const eIO   = Easing.inOut(Easing.quad);

// ── Pre-generated particle configs ─────────────────────────────────────────

// 16 ash particles converge from the outside (phase 1)
const ASH_PARTICLES = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2;
  const r = 130 + (i % 4) * 30;
  return {
    startX: Math.cos(angle) * r,
    startY: Math.sin(angle) * r,
    delay: 60 + i * 55,
    size: 3 + (i % 4),
    color: i % 3 === 0 ? '#FF3300' : i % 3 === 1 ? '#FF7700' : '#FFC107',
  };
});

// 14 burst particles explode outward when wings spread (1500ms)
const BURST_PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 - Math.PI / 2;
  const r = 180 + (i % 3) * 55;
  return {
    endX: Math.cos(angle) * r,
    endY: Math.sin(angle) * r,
    delay: 1550 + i * 35,
    size: 4 + (i % 5),
    color: i % 2 === 0 ? '#FFC107' : '#FF5500',
  };
});

// 10 falling embers during final phase (8000ms+)
const FALL_PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  x: -130 + i * 29,
  delay: 8050 + i * 120,
  size: 2 + (i % 3),
}));

// ── Ash particle (converges toward center) ──────────────────────────────────
function AshParticle({ startX, startY, delay, size, color }: (typeof ASH_PARTICLES)[0]) {
  const x = useSharedValue(startX);
  const y = useSharedValue(startY);
  const op = useSharedValue(0);

  useEffect(() => {
    op.value = withSequence(
      withTiming(0,   { duration: delay }),
      withTiming(0.9, { duration: 200 }),
      withTiming(0.8, { duration: 900 }),
      withTiming(0,   { duration: 400 }),
    );
    x.value = withSequence(
      withTiming(startX, { duration: delay }),
      withTiming(0, { duration: 1300, easing: eIn }),
    );
    y.value = withSequence(
      withTiming(startY, { duration: delay }),
      withTiming(0, { duration: 1300, easing: eIn }),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return (
    <Animated.View style={[
      styles.particle, style,
      { width: size, height: size, borderRadius: size / 2, backgroundColor: color,
        shadowColor: color, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
    ]} />
  );
}

// ── Burst particle (explodes outward at wing spread) ────────────────────────
function BurstParticle({ endX, endY, delay, size, color }: (typeof BURST_PARTICLES)[0]) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const op = useSharedValue(0);
  const sc = useSharedValue(1);

  useEffect(() => {
    op.value = withSequence(
      withTiming(0, { duration: delay }),
      withTiming(1, { duration: 100 }),
      withTiming(0.7, { duration: 700 }),
      withTiming(0, { duration: 500 }),
    );
    x.value = withSequence(
      withTiming(0, { duration: delay }),
      withTiming(endX, { duration: 1300, easing: eOut }),
    );
    y.value = withSequence(
      withTiming(0, { duration: delay }),
      withTiming(endY, { duration: 1300, easing: eOut }),
    );
    sc.value = withSequence(
      withTiming(1, { duration: delay }),
      withTiming(1.5, { duration: 300 }),
      withTiming(0.4, { duration: 1000 }),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: sc.value }],
  }));

  return (
    <Animated.View style={[
      styles.particle, style,
      { width: size, height: size, borderRadius: size / 2, backgroundColor: color,
        shadowColor: color, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
    ]} />
  );
}

// ── Falling ember (final phase) ─────────────────────────────────────────────
function FallingEmber({ x, delay, size }: (typeof FALL_PARTICLES)[0]) {
  const ty = useSharedValue(-20);
  const op = useSharedValue(0);

  useEffect(() => {
    op.value = withSequence(
      withTiming(0,   { duration: delay }),
      withTiming(0.8, { duration: 300 }),
      withTiming(0.5, { duration: 1200 }),
      withTiming(0,   { duration: 400 }),
    );
    ty.value = withSequence(
      withTiming(-20, { duration: delay }),
      withTiming(H * 0.55, { duration: 1900, easing: eIn }),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.View style={[
      styles.fallingEmber, style,
      { width: size, height: size, borderRadius: size / 2, left: W / 2 + x },
    ]} />
  );
}

// ── Eye glow ────────────────────────────────────────────────────────────────
function EyeGlow() {
  const op = useSharedValue(0);
  const sc = useSharedValue(0.5);

  useEffect(() => {
    // Eyes ignite at 3500ms, pulse 3× then fade slowly
    op.value = withSequence(
      withTiming(0,   { duration: 3500 }),
      withTiming(1,   { duration: 120 }),
      withTiming(0.6, { duration: 200 }),
      withTiming(1,   { duration: 200 }),
      withTiming(0.6, { duration: 200 }),
      withTiming(1,   { duration: 200 }),
      withTiming(0.5, { duration: 580 }),  // → 5000ms total
      withTiming(0,   { duration: 5500 }), // fade out to 10500ms
    );
    sc.value = withSequence(
      withTiming(0.5, { duration: 3500 }),
      withTiming(1.6, { duration: 120 }),
      withTiming(1.0, { duration: 880 }),
      withTiming(0.9, { duration: 6000 }),
    );
  }, []);

  const leftStyle  = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scale: sc.value }] }));
  const rightStyle = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scale: sc.value }] }));

  return (
    <>
      <Animated.View style={[styles.eye, styles.eyeLeft,  leftStyle]}  />
      <Animated.View style={[styles.eye, styles.eyeRight, rightStyle]} />
    </>
  );
}

// ── Main splash ─────────────────────────────────────────────────────────────
interface Props { onDone: () => void }

export function PhoenixSplash({ onDone }: Props) {
  // Total animation: 10 500 ms (10 s visible + 500 ms fade-out)
  const T = 10500;

  const overlayOp = useSharedValue(1);

  // Glow sphere
  const glowOp = useSharedValue(0);
  const glowSc = useSharedValue(0.3);

  // Phoenix
  const pxOp  = useSharedValue(0);
  const pxSc  = useSharedValue(0.08);
  const pxScX = useSharedValue(0.3);  // wing spread
  const pxTX  = useSharedValue(0);
  const pxTY  = useSharedValue(30);
  const pxRot = useSharedValue(0);

  // Title
  const titleOp = useSharedValue(0);
  const titleTY = useSharedValue(20);

  useEffect(() => {
    // ── glowOp ──────────────────────────────────────────────────────
    // P1(0→1500): 800 fade-in + 700 hold
    // P2(1500→3500): 400 flash + 1600 settle
    // P3(3500→4000): 500 slight boost
    // P4(4000→6500): 2500 diminish
    // P5(6500→8000): 1500 return
    // P6(8000→10000): 2000 static
    // fade(10000→10500): 500
    glowOp.value = withSequence(
      withTiming(0.35, { duration: 800,  easing: eOut }),
      withTiming(0.35, { duration: 700  }),
      withTiming(0.85, { duration: 400,  easing: eOut }),
      withTiming(0.45, { duration: 1600, easing: eOut }),
      withTiming(0.50, { duration: 500  }),
      withTiming(0.20, { duration: 2500, easing: eIO  }),
      withTiming(0.30, { duration: 1500, easing: eOut }),
      withTiming(0.25, { duration: 2000 }),
      withTiming(0,    { duration: 500,  easing: eIn  }),
    );

    // ── glowSc ──────────────────────────────────────────────────────
    glowSc.value = withSequence(
      withTiming(0.70, { duration: 1500, easing: eOut }),
      withTiming(1.60, { duration: 300,  easing: eOut }),
      withTiming(1.00, { duration: 1700, easing: eOut }),
      withTiming(1.00, { duration: 1000 }),
      withTiming(0.80, { duration: 2500, easing: eIO  }),
      withTiming(0.90, { duration: 1500, easing: eOut }),
      withTiming(0.90, { duration: 3000 }),
    );

    // ── pxOp (phoenix opacity) ───────────────────────────────────────
    // P1: flicker reconstitution in 1500ms
    pxOp.value = withSequence(
      withTiming(0.15, { duration: 300 }),
      withTiming(0.00, { duration: 150 }),
      withTiming(0.35, { duration: 250 }),
      withTiming(0.05, { duration: 100 }),
      withTiming(0.65, { duration: 300 }),
      withTiming(0.40, { duration: 80  }),
      withTiming(1.00, { duration: 320, easing: eOut }),
      // P2-P6: hold at 1 for 8500ms
      withTiming(1.00, { duration: 8500 }),
      // fade out
      withTiming(0,    { duration: 500, easing: eIn  }),
    );

    // ── pxSc (uniform scale) ─────────────────────────────────────────
    pxSc.value = withSequence(
      // P1: rise
      withTiming(0.85, { duration: 1500, easing: eOut }),
      // P2: wings spread overshoot
      withTiming(1.05, { duration: 400, easing: eOut }),
      withTiming(1.00, { duration: 200, easing: eOut }),
      // hold 1400ms (covers rest of P2)
      withTiming(1.00, { duration: 1400 }),
      // P3: wing beats (4 × 125ms = 500ms)
      withTiming(1.08, { duration: 125 }),
      withTiming(0.96, { duration: 125 }),
      withTiming(1.05, { duration: 125 }),
      withTiming(1.00, { duration: 125 }),
      // P4: hold while bouncing (2500ms)
      withTiming(1.00, { duration: 2500 }),
      // P5: settle slightly smaller (600ms)
      withTiming(0.95, { duration: 600, easing: eOut }),
      // P6+fade: hold (3400ms)
      withTiming(0.95, { duration: 3400 }),
    );

    // ── pxScX (wing spread) ───────────────────────────────────────────
    pxScX.value = withSequence(
      // P1: wings still folded, open slightly
      withTiming(0.40, { duration: 1500, easing: eOut }),
      // P2: wings full open with overshoot
      withTiming(1.10, { duration: 450, easing: eOut }),
      withTiming(1.00, { duration: 150, easing: eOut }),
      // hold for rest
      withTiming(1.00, { duration: 8400 }),
    );

    // ── pxTY (vertical) ───────────────────────────────────────────────
    pxTY.value = withSequence(
      // P1: rise into frame
      withTiming(0, { duration: 1500, easing: eOut }),
      // P2: wing-flap vertical bounce
      withTiming(-12, { duration: 200 }),
      withTiming( 12, { duration: 200 }),
      withTiming(-18, { duration: 200 }),
      withTiming(  6, { duration: 200 }),
      withTiming(  0, { duration: 700, easing: eOut }),
      // P3 hold (500ms)
      withTiming(0, { duration: 500 }),
      // P4 flutter while bouncing (2500ms = 7 × ~357ms)
      withRepeat(
        withSequence(
          withTiming(-7, { duration: 180 }),
          withTiming( 7, { duration: 180 }),
        ),
        7, true,
      ),
      // P5 settle (1500ms)
      withTiming(0, { duration: 1500, easing: eOut }),
      // P6+fade (2500ms)
      withTiming(0, { duration: 2500 }),
    );

    // ── pxTX (horizontal bounce — trapped in screen) ──────────────────
    pxTX.value = withSequence(
      // P1+P2+P3: centered (4000ms)
      withTiming(0, { duration: 4000 }),
      // P4: bounce off walls, diminishing amplitude
      withTiming( W * 0.32, { duration: 300, easing: eOut }),
      withTiming(-W * 0.28, { duration: 380, easing: eIO  }),
      withTiming( W * 0.22, { duration: 290, easing: eIO  }),
      withTiming(-W * 0.17, { duration: 360, easing: eIO  }),
      withTiming( W * 0.12, { duration: 250, easing: eIO  }),
      withTiming(-W * 0.08, { duration: 320, easing: eIO  }),
      withTiming( W * 0.04, { duration: 200, easing: eIO  }),
      withTiming( 0,         { duration: 400, easing: eOut }),
      // P5+P6+fade: centered (6000ms)
      withTiming(0, { duration: 6000 }),
    );

    // ── pxRot (tilt during bounce) ────────────────────────────────────
    pxRot.value = withSequence(
      // P1-P3: no rotation (4000ms)
      withTiming(0, { duration: 4000 }),
      // P4: tilt following bounce direction
      withTiming( 8, { duration: 300 }),
      withTiming(-8, { duration: 380 }),
      withTiming( 6, { duration: 290 }),
      withTiming(-6, { duration: 360 }),
      withTiming( 4, { duration: 250 }),
      withTiming(-4, { duration: 320 }),
      withTiming( 2, { duration: 200 }),
      withTiming( 0, { duration: 400, easing: eOut }),
      // P5+P6+fade
      withTiming(0, { duration: 6000 }),
    );

    // ── Title ──────────────────────────────────────────────────────────
    titleOp.value = withSequence(
      withTiming(0, { duration: 6600 }),
      withTiming(1, { duration: 700, easing: eOut }),
      withTiming(1, { duration: 2700 }),
      withTiming(0, { duration: 500, easing: eIn }),
    );
    titleTY.value = withSequence(
      withTiming(20, { duration: 6600 }),
      withTiming(0,  { duration: 700, easing: eOut }),
      withTiming(0,  { duration: 3200 }),
    );

    // ── Overlay fade-out at 10 000ms ────────────────────────────────
    overlayOp.value = withSequence(
      withTiming(1, { duration: 10000 }),
      withTiming(0, { duration: 500, easing: eIn }, (done) => {
        if (done) runOnJS(onDone)();
      }),
    );
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOp.value,
    transform: [{ scale: glowSc.value }],
  }));

  const phoenixStyle = useAnimatedStyle(() => ({
    opacity: pxOp.value,
    transform: [
      { translateX: pxTX.value },
      { translateY: pxTY.value },
      { scale: pxSc.value },
      { scaleX: pxScX.value },
      { rotate: `${pxRot.value}deg` },
    ],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOp.value,
    transform: [{ translateY: titleTY.value }],
  }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
      {/* Ambient glow */}
      <Animated.View style={[styles.glow, glowStyle]} />

      {/* Ash particles converging */}
      {ASH_PARTICLES.map((p, i) => <AshParticle key={`a${i}`} {...p} />)}

      {/* Eye glow (phase 3) */}
      <EyeGlow />

      {/* Phoenix image */}
      <Animated.View style={[styles.phoenixWrap, phoenixStyle]}>
        <Image source={PHOENIX} style={styles.phoenix} contentFit="contain" />
      </Animated.View>

      {/* Ember burst (wings spread) */}
      {BURST_PARTICLES.map((p, i) => <BurstParticle key={`b${i}`} {...p} />)}

      {/* Falling embers (final phase) */}
      {FALL_PARTICLES.map((p, i) => <FallingEmber key={`f${i}`} {...p} />)}

      {/* Title */}
      <Animated.View style={[styles.titleRow, titleStyle]}>
        <Text style={styles.titleMain}>YOANN</Text>
        <Text style={styles.titleVersion}>2.0</Text>
      </Animated.View>
      <Animated.View style={[styles.subtitleRow, titleStyle]}>
        <View style={styles.subtitleLine} />
        <Text style={styles.subtitle}>Productivity App</Text>
        <View style={styles.subtitleLine} />
      </Animated.View>
    </Animated.View>
  );
}

// ── Camera + $ icon for Finances header ─────────────────────────────────────
export function CameraOcrIcon({ size = 20, color = '#FFC107' }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name="camera" size={size} color={color} />
      <Text style={{
        position: 'absolute',
        fontSize: Math.round(size * 0.3),
        fontFamily: 'Inter_700Bold',
        color: '#121212',
        lineHeight: Math.round(size * 0.35),
        marginTop: Math.round(size * 0.05),
      }}>$</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#FF5500',
    shadowColor: '#FF8800',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 110,
    elevation: 50,
  },
  particle: { position: 'absolute' },
  fallingEmber: {
    position: 'absolute',
    top: H * 0.28,
    backgroundColor: '#FFC107',
    shadowColor: '#FFC107',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  eye: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#FFE040',
    shadowColor: '#FFC107',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 12,
    marginTop: -32,
  },
  eyeLeft:  { marginLeft: -22 },
  eyeRight: { marginLeft:  22 },
  phoenixWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoenix: { width: 210, height: 210 },
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
