import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// ─── Screen dimensions ────────────────────────────────────────────────────────
const { width: W, height: H } = Dimensions.get('window');

// ─── Layout constants (relative so they adapt to any Android screen) ──────────
const TEXT_Y       = H * 0.24;                                // "YOANN" text baseline area
const PX_SIZE      = Math.min(W * 0.74, H * 0.44);           // phoenix never overflows screen
const PX_CENTER_Y  = H * 0.60;                                // phoenix center in standing pos
const PX_TOP       = PX_CENTER_Y - PX_SIZE / 2;
const PX_LEFT      = (W - PX_SIZE) / 2;

// Initial translateY offset so phoenix starts below final pos (birth from smoke)
const PX_BIRTH_OFFSET = H * 0.16;

// ─── Particle config ──────────────────────────────────────────────────────────
const N_FIRE  = 28;
const N_RAIN  = 52;
const N_SMOKE = 12;
const N_EXPL  = 42;

const FIRE_COLS  = ['#FF4500','#FF6B35','#FFC107','#FF9800','#FFD54F','#FFEB3B'] as const;
const EXPL_COLS  = ['#FF4500','#FF6B35','#FFC107','#FF9800','#FFEB3B','#FF1744'] as const;

// ─── Particle types ───────────────────────────────────────────────────────────
type FP = {
  sx: number; sy: number;
  tx: Animated.Value; ty: Animated.Value; op: Animated.Value;
  size: number; color: string; rise: number; drift: number; dur: number; delay: number;
};
type RP = {
  sx: number; sy: number;
  ty: Animated.Value;
  w: number; h: number; fall: number; dur: number; delay: number;
};
type SP = {
  sx: number; sy: number;
  tx: Animated.Value; ty: Animated.Value; op: Animated.Value; sc: Animated.Value;
  size: number; rise: number; drift: number; dur: number; delay: number;
};
type EP = {
  sx: number; sy: number;
  tx: Animated.Value; ty: Animated.Value; op: Animated.Value;
  size: number; color: string; dx: number; dy: number; dur: number;
};

// ─── Factories ────────────────────────────────────────────────────────────────
const rnd = Math.random;

function makeFire(): FP[] {
  const cx = W / 2;
  const sy = TEXT_Y + 62;
  return Array.from({ length: N_FIRE }, () => ({
    sx: cx + (rnd() - 0.5) * 240,
    sy,
    tx:  new Animated.Value(0),
    ty:  new Animated.Value(0),
    op:  new Animated.Value(0),
    size: 4 + rnd() * 10,
    color: FIRE_COLS[Math.floor(rnd() * FIRE_COLS.length)],
    rise:  -(55 + rnd() * 115),
    drift: (rnd() - 0.5) * 52,
    dur:   870 + rnd() * 730,
    delay: rnd() * 1600,
  }));
}

function makeRain(): RP[] {
  return Array.from({ length: N_RAIN }, () => {
    const dur = 460 + rnd() * 380;
    return {
      sx:    rnd() * W,
      sy:   -(10 + rnd() * H * 0.45),
      ty:    new Animated.Value(0),
      w:     1 + rnd() * 1.5,
      h:     9  + rnd() * 16,
      fall:  H + 60,
      dur,
      delay: rnd() * 2700,
    };
  });
}

function makeSmoke(): SP[] {
  const cx = W / 2;
  return Array.from({ length: N_SMOKE }, () => ({
    sx: cx + (rnd() - 0.5) * 180,
    sy: TEXT_Y + 45,
    tx:  new Animated.Value(0),
    ty:  new Animated.Value(0),
    op:  new Animated.Value(0),
    sc:  new Animated.Value(0.25),
    size: 52 + rnd() * 92,
    rise:  -(105 + rnd() * 185),
    drift: (rnd() - 0.5) * 72,
    dur:   2300 + rnd() * 1900,
    delay: rnd() * 950,
  }));
}

function makeExplosion(): EP[] {
  const cx = W / 2;
  const cy = PX_CENTER_Y;
  return Array.from({ length: N_EXPL }, (_, i) => {
    const angle = (i / N_EXPL) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const dist  = 85 + rnd() * 230;
    return {
      sx: cx, sy: cy,
      tx:  new Animated.Value(0),
      ty:  new Animated.Value(0),
      op:  new Animated.Value(1),
      size: 5 + rnd() * 13,
      color: EXPL_COLS[Math.floor(rnd() * EXPL_COLS.length)],
      dx:   Math.cos(angle) * dist,
      dy:   Math.sin(angle) * dist,
      dur:  520 + rnd() * 480,
    };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { onDone: () => void }

export function PhoenixSplashAnimated({ onDone }: Props) {
  const doneRef   = useRef(false);
  const timers    = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fireAnims = useRef<Animated.CompositeAnimation[]>([]);
  const rainAnims = useRef<Animated.CompositeAnimation[]>([]);

  // Particles — created once
  const fireRef  = useRef<FP[] | undefined>(undefined);  if (!fireRef.current)  fireRef.current  = makeFire();
  const rainRef  = useRef<RP[] | undefined>(undefined);  if (!rainRef.current)  rainRef.current  = makeRain();
  const smokeRef = useRef<SP[] | undefined>(undefined);  if (!smokeRef.current) smokeRef.current = makeSmoke();
  const fp = fireRef.current;
  const rp = rainRef.current;
  const sp = smokeRef.current;

  // Explosion — triggered at the end, rendered via state
  const [expl, setExpl] = useState<EP[]>([]);

  // Non-phoenix text animated values
  const yoannOp = useRef(new Animated.Value(0)).current;
  const v20Op   = useRef(new Animated.Value(0)).current;
  const dtOp    = useRef(new Animated.Value(0)).current;
  const [dateStr, setDateStr] = useState('');

  // Phoenix — Reanimated (for smooth combined transforms)
  const pxOp  = useSharedValue(0);
  const pxSc  = useSharedValue(0.18);
  const pxTy  = useSharedValue(PX_BIRTH_OFFSET);
  const pxRot = useSharedValue(0);
  const gOp   = useSharedValue(1); // global fade for the final out

  const phoenixStyle = useAnimatedStyle(() => ({
    opacity:   pxOp.value,
    transform: [
      { scale:      pxSc.value },
      { translateY: pxTy.value },
      { rotate:    `${pxRot.value}deg` },
    ],
  }));
  const globalStyle = useAnimatedStyle(() => ({ opacity: gOp.value }));

  // ─── Phase helpers ─────────────────────────────────────────────────────────

  const startFire = useCallback(() => {
    fp.forEach(p => {
      const a = Animated.loop(Animated.sequence([
        Animated.parallel([
          Animated.timing(p.op, { toValue: 0, duration: 1, useNativeDriver: true }),
          Animated.timing(p.ty, { toValue: 0, duration: 1, useNativeDriver: true }),
          Animated.timing(p.tx, { toValue: 0, duration: 1, useNativeDriver: true }),
        ]),
        Animated.delay(p.delay % 950),
        Animated.parallel([
          Animated.timing(p.op, { toValue: 0.88, duration: 180,  useNativeDriver: true }),
          Animated.timing(p.ty, { toValue: p.rise,  duration: p.dur, useNativeDriver: true }),
          Animated.timing(p.tx, { toValue: p.drift, duration: p.dur, useNativeDriver: true }),
        ]),
        Animated.timing(p.op, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]));
      fireAnims.current.push(a);
      a.start();
    });
  }, [fp]);

  const stopFire = useCallback(() => {
    fireAnims.current.forEach(a => a.stop());
    fireAnims.current = [];
    Animated.parallel(
      fp.map(p => Animated.timing(p.op, { toValue: 0, duration: 480, useNativeDriver: true }))
    ).start();
  }, [fp]);

  const startRain = useCallback(() => {
    rp.forEach(p => {
      const a = Animated.loop(Animated.sequence([
        Animated.timing(p.ty, { toValue: 0,     duration: 1,     useNativeDriver: true }),
        Animated.delay(p.delay % (p.dur * 2)),
        Animated.timing(p.ty, { toValue: p.fall, duration: p.dur, useNativeDriver: true }),
      ]));
      rainAnims.current.push(a);
      a.start();
    });
  }, [rp]);

  const stopRain = useCallback(() => {
    rainAnims.current.forEach(a => a.stop());
    rainAnims.current = [];
    Animated.parallel(
      rp.map(p => Animated.timing(p.ty, { toValue: p.fall, duration: 380, useNativeDriver: true }))
    ).start();
  }, [rp]);

  const startSmoke = useCallback(() => {
    sp.forEach(p => {
      Animated.sequence([
        Animated.delay(p.delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(p.op, { toValue: 0.46, duration: 680,           useNativeDriver: true }),
            Animated.timing(p.op, { toValue: 0,    duration: p.dur - 680,   useNativeDriver: true }),
          ]),
          Animated.timing(p.ty, { toValue: p.rise,  duration: p.dur, useNativeDriver: true }),
          Animated.timing(p.tx, { toValue: p.drift, duration: p.dur, useNativeDriver: true }),
          Animated.timing(p.sc, { toValue: 1.65,    duration: p.dur, useNativeDriver: true }),
        ]),
      ]).start();
    });
  }, [sp]);

  const triggerExplosion = useCallback(() => {
    setExpl(makeExplosion());
  }, []);

  // Animate explosion particles once they enter the tree
  useEffect(() => {
    if (!expl.length) return;
    expl.forEach(p => {
      Animated.parallel([
        Animated.timing(p.tx, { toValue: p.dx, duration: p.dur, useNativeDriver: true }),
        Animated.timing(p.ty, { toValue: p.dy, duration: p.dur, useNativeDriver: true }),
        Animated.timing(p.op, { toValue: 0,    duration: p.dur, useNativeDriver: true }),
      ]).start();
    });
  }, [expl]);

  const finish = useCallback((immediate: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    stopFire();
    stopRain();

    const doExplosion = () => {
      triggerExplosion();
      Animated.timing(dtOp, { toValue: 0, duration: 280, useNativeDriver: true }).start();
      gOp.value = withTiming(0, { duration: 1100 });
      timers.current.push(setTimeout(onDone, 1150));
    };

    if (immediate) {
      // Snap phoenix to final logo state, then explode 400ms later
      Animated.timing(yoannOp, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      Animated.timing(v20Op,   { toValue: 1, duration: 150, useNativeDriver: true }).start();
      pxOp.value  = 1;
      pxSc.value  = 1;
      pxTy.value  = 0;
      pxRot.value = 0;
      timers.current.push(setTimeout(doExplosion, 420));
    } else {
      doExplosion();
    }
  }, [onDone, stopFire, stopRain, triggerExplosion, dtOp, gOp, yoannOp, v20Op, pxOp, pxSc, pxTy, pxRot]);

  // ─── Main timeline ─────────────────────────────────────────────────────────
  useEffect(() => {
    const T = (ms: number, fn: () => void) => {
      const t = setTimeout(fn, ms);
      timers.current.push(t);
    };

    // 0→2s — YOANN fades in
    Animated.timing(yoannOp, { toValue: 1, duration: 1600, useNativeDriver: true }).start();

    // 2s — Fire on letters
    T(2000, startFire);

    // 5s — Rain, fire extinguishes
    T(5000, () => { stopFire(); startRain(); });

    // 8s — Smoke rises, phoenix born from smoke
    T(8000, () => {
      stopRain();
      startSmoke();
      // Phoenix fades in slowly through smoke
      pxOp.value = withTiming(1,    { duration: 2800 });
      pxSc.value = withTiming(0.78, { duration: 2800 });
      pxTy.value = withTiming(H * 0.06, { duration: 2800 });
    });

    // 11s — Phoenix rises to standing, date/time shows
    T(11000, () => {
      const now  = new Date();
      const day  = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      setDateStr(`${day.charAt(0).toUpperCase()}${day.slice(1)}  ·  ${time}`);
      Animated.timing(dtOp, { toValue: 1, duration: 1000, useNativeDriver: true }).start();

      pxSc.value  = withTiming(1.0, { duration: 2300, easing: Easing.out(Easing.cubic) });
      pxTy.value  = withTiming(0,   { duration: 2300, easing: Easing.out(Easing.cubic) });
      pxRot.value = withTiming(-8,  { duration: 1700 }); // slight lean back = looking up
    });

    // 14s — Wing flap, ascending
    T(14000, () => {
      pxRot.value = withRepeat(
        withSequence(
          withTiming(-13, { duration: 330 }),
          withTiming(-4,  { duration: 330 }),
        ),
        -1,
        false,
      );
      pxTy.value = withTiming(-H * 0.042, { duration: 3000, easing: Easing.out(Easing.quad) });
      pxSc.value = withTiming(1.09, { duration: 3000 });
    });

    // 17s — "2.0" appears, phoenix settles into logo pose
    T(17000, () => {
      pxRot.value = withTiming(0, { duration: 480 });
      pxTy.value  = withTiming(0, { duration: 480 });
      pxSc.value  = withTiming(1, { duration: 480 });
      Animated.timing(v20Op, { toValue: 1, duration: 1400, useNativeDriver: true }).start();
    });

    // 19–21s — Static logo hold (nothing to animate)

    // 21s — Explosion and fade to black
    T(21000, () => finish(false));

    return () => { timers.current.forEach(clearTimeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Reanimated.View style={[styles.root, globalStyle]}>
      <StatusBar hidden />

      {/* ── Rain ── */}
      {rp.map((p, i) => (
        <Animated.View
          key={`r${i}`}
          style={[
            styles.rain,
            {
              left:   p.sx,
              top:    p.sy,
              width:  p.w,
              height: p.h,
              transform: [{ translateY: p.ty }],
            },
          ]}
        />
      ))}

      {/* ── Smoke ── */}
      {sp.map((p, i) => (
        <Animated.View
          key={`s${i}`}
          style={[
            styles.smoke,
            {
              left:         p.sx - p.size / 2,
              top:          p.sy - p.size / 2,
              width:        p.size,
              height:       p.size,
              borderRadius: p.size / 2,
              opacity:      p.op,
              transform:    [{ translateY: p.ty }, { translateX: p.tx }, { scale: p.sc }],
            },
          ]}
        />
      ))}

      {/* ── Phoenix (appears in smoke phase, NEVER disappears after) ── */}
      <Reanimated.View style={[styles.phoenixWrap, phoenixStyle]}>
        <Image
          source={require('@/assets/images/phoenix-logo-final.png')}
          style={styles.phoenixImg}
        />
      </Reanimated.View>

      {/* ── Fire particles (on letters) ── */}
      {fp.map((p, i) => (
        <Animated.View
          key={`f${i}`}
          style={[
            styles.particle,
            {
              left:            p.sx - p.size / 2,
              top:             p.sy - p.size / 2,
              width:           p.size,
              height:          p.size,
              borderRadius:    p.size / 2,
              backgroundColor: p.color,
              opacity:         p.op,
              transform:       [{ translateY: p.ty }, { translateX: p.tx }],
            },
          ]}
        />
      ))}

      {/* ── YOANN · 2.0 text ── */}
      <View style={[styles.textRow, { top: TEXT_Y }]} pointerEvents="none">
        <Animated.Text style={[styles.yoannTxt, { opacity: yoannOp }]}>
          YOANN
        </Animated.Text>
        <Animated.Text style={[styles.v20Txt, { opacity: v20Op }]}>
          {' 2.0'}
        </Animated.Text>
      </View>

      {/* ── Date / time — appears above phoenix when it looks up ── */}
      {!!dateStr && (
        <Animated.Text
          style={[
            styles.dateTime,
            { top: PX_TOP - 48, opacity: dtOp },
          ]}
        >
          {dateStr}
        </Animated.Text>
      )}

      {/* ── Explosion particles (fire burst at the end) ── */}
      {expl.map((p, i) => (
        <Animated.View
          key={`e${i}`}
          style={[
            styles.particle,
            {
              left:            p.sx - p.size / 2,
              top:             p.sy - p.size / 2,
              width:           p.size,
              height:          p.size,
              borderRadius:    p.size / 2,
              backgroundColor: p.color,
              opacity:         p.op,
              transform:       [{ translateX: p.tx }, { translateY: p.ty }],
            },
          ]}
        />
      ))}

      {/* ── Tap to skip ── */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => finish(true)} />
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 9999,
  },
  textRow: {
    position: 'absolute',
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
  },
  yoannTxt: {
    color:        '#FFC107',
    fontSize:     Math.round(W * 0.114), // scales with screen width
    fontWeight:   '800',
    letterSpacing: Math.round(W * 0.02),
  },
  v20Txt: {
    color:        '#FFC107',
    fontSize:     Math.round(W * 0.114),
    fontWeight:   '800',
    letterSpacing: Math.round(W * 0.008),
  },
  phoenixWrap: {
    position: 'absolute',
    top:    PX_TOP,
    left:   PX_LEFT,
    width:  PX_SIZE,
    height: PX_SIZE,
  },
  phoenixImg: {
    width:      '100%',
    height:     '100%',
    resizeMode: 'contain',
  },
  dateTime: {
    position:      'absolute',
    left: 0, right: 0,
    textAlign:     'center',
    color:         'rgba(255,193,7,0.82)',
    fontSize:      Math.max(13, Math.round(W * 0.032)),
    fontWeight:    '300',
    letterSpacing: 3,
  },
  rain:     { position: 'absolute', backgroundColor: 'rgba(140,205,255,0.55)' },
  smoke:    { position: 'absolute', backgroundColor: 'rgba(210,210,210,0.36)' },
  particle: { position: 'absolute' },
});
