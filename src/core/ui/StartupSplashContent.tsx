import {memo, useEffect} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {ACCENT_COLOR} from './accentColor';
import {
  computeStartupSpectrumSample,
  smoothSpectrumLevelsInPlace,
  STARTUP_SPECTRUM_SPATIAL_SMOOTH,
} from './startupSplashSpectrum';

/** Startup spectrum: speech-like formants, phrase gaps, Winamp peak-hold + decay (frame callback). */
const BAR_COUNT = 30;
const MAX_BAR_H = 152;
const MIN_BAR_H = 6;
const TICK_HEIGHT = 6;
const TICK_GAP = 2;
const MIRROR_OPACITY = 0.28;
/** Normalized units/sec; higher = peaks track rapid syllable changes more closely. */
const PEAK_FALL_SPEED = 1.35;
/** Bar uses this fraction of each column slot; equal margin on both sides gives gap == bar width. */
const BAR_WIDTH_FRACTION = 0.5;

const BAR_INDICES = Array.from({length: BAR_COUNT}, (_, i) => i);

type SpectrumPack = {
  levels: number[];
  peaks: number[];
};

type Props = {
  isDarkMode: boolean;
};

function makeEmptySpectrum(): SpectrumPack {
  return {
    levels: Array.from({length: BAR_COUNT}, () => 0),
    peaks: Array.from({length: BAR_COUNT}, () => 0),
  };
}

function centerMaskMultiplier(index: number, n: number): number {
  'worklet';
  if (n <= 1) {
    return 0.36;
  }
  const norm = index / (n - 1);
  const distFromCenter = Math.abs(norm - 0.5) * 2;
  return 0.3 + 0.7 * Math.pow(distFromCenter, 1.38);
}

type ColumnProps = {
  index: number;
  isDarkMode: boolean;
  spectrumSV: SharedValue<SpectrumPack>;
};

const WaveColumn = memo(function WaveColumn({index, isDarkMode, spectrumSV}: ColumnProps) {
  const barStyle = useAnimatedStyle(() => {
    const {levels} = spectrumSV.value;
    const lv = levels[index] ?? 0;
    const h = MIN_BAR_H + lv * (MAX_BAR_H - MIN_BAR_H);
    const mask = centerMaskMultiplier(index, BAR_COUNT);
    const baseOpacity = isDarkMode ? 0.55 : 0.42;
    return {
      height: h,
      opacity: baseOpacity * mask,
    };
  }, [index, isDarkMode]);

  const tickStyle = useAnimatedStyle(() => {
    const {levels, peaks} = spectrumSV.value;
    const lv = levels[index] ?? 0;
    const pk = peaks[index] ?? 0;
    const hPeak = MIN_BAR_H + pk * (MAX_BAR_H - MIN_BAR_H);
    const mask = centerMaskMultiplier(index, BAR_COUNT);
    const accentBoost = pk > lv + 0.006 ? 1 : 0.9;
    return {
      bottom: hPeak + TICK_GAP,
      opacity: Math.min(
        1,
        Math.max(0.58 * mask, (0.68 + 0.32 * pk) * mask * accentBoost),
      ),
    };
  }, [index]);

  return (
    <View style={styles.column}>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.tick, tickStyle]} />
        <Animated.View
          style={[
            styles.bar,
            isDarkMode ? styles.barFillDark : styles.barFillLight,
            barStyle,
          ]}
        />
      </View>
    </View>
  );
});

export function StartupSplashContent({isDarkMode}: Props) {
  const reducedMotion = useReducedMotion();

  const spectrumSV = useSharedValue<SpectrumPack>(makeEmptySpectrum());
  const reducedMotionSV = useSharedValue(reducedMotion ? 1 : 0);
  const enterOpacity = useSharedValue(0);

  const frame = useFrameCallback(frameInfo => {
    'worklet';
    const tSec = frameInfo.timeSinceFirstFrame / 1000;
    const rm = reducedMotionSV.value === 1;
    const dt =
      frameInfo.timeSincePreviousFrame === null
        ? 16 / 1000
        : frameInfo.timeSincePreviousFrame / 1000;

    const prev = spectrumSV.value;
    const levels: number[] = new Array(BAR_COUNT);
    const peaks: number[] = new Array(BAR_COUNT);

    for (let i = 0; i < BAR_COUNT; i++) {
      levels[i] = computeStartupSpectrumSample(tSec, i, BAR_COUNT, rm);
    }
    if (!rm) {
      smoothSpectrumLevelsInPlace(levels, STARTUP_SPECTRUM_SPATIAL_SMOOTH);
    }
    for (let i = 0; i < BAR_COUNT; i++) {
      const level = levels[i] ?? 0;
      let pk = prev.peaks[i] ?? 0;
      if (rm) {
        pk = level;
      } else if (level >= pk) {
        pk = level;
      } else {
        pk = Math.max(level, pk - PEAK_FALL_SPEED * dt);
      }
      peaks[i] = pk;
    }

    spectrumSV.value = {levels, peaks};
  }, false);

  useEffect(() => {
    reducedMotionSV.value = reducedMotion ? 1 : 0;
  }, [reducedMotion, reducedMotionSV]);

  useEffect(() => {
    frame.setActive(true);
    return () => frame.setActive(false);
  }, [frame]);

  useEffect(() => {
    enterOpacity.value = withTiming(1, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });
  }, [enterOpacity]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
  }));

  const column = (keyPrefix: string) =>
    BAR_INDICES.map(i => (
      <WaveColumn
        key={`${keyPrefix}-${i}`}
        index={i}
        isDarkMode={isDarkMode}
        spectrumSV={spectrumSV}
      />
    ));

  return (
    <Animated.View style={[styles.root, enterStyle]}>
      <View style={styles.waveBlock}>
        <View style={styles.barsRow}>{column('t')}</View>
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.brand, isDarkMode ? styles.brandDark : styles.brandLight]}>
          Eskerra
        </Text>
        <View style={styles.mirrorShell}>
          <View style={styles.barsRow}>{column('m')}</View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
    width: '100%',
  },
  waveBlock: {
    height: MAX_BAR_H * 2 + 56,
    justifyContent: 'flex-start',
    position: 'relative',
    width: '100%',
  },
  barsRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 0,
    height: MAX_BAR_H,
    width: '100%',
  },
  mirrorShell: {
    opacity: MIRROR_OPACITY,
    transform: [{scaleY: -1}],
    width: '100%',
  },
  column: {
    flex: 1,
    height: MAX_BAR_H,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  barTrack: {
    alignSelf: 'center',
    height: MAX_BAR_H,
    justifyContent: 'flex-end',
    position: 'relative',
    width: `${BAR_WIDTH_FRACTION * 100}%`,
  },
  bar: {
    alignSelf: 'stretch',
    borderRadius: 0,
    width: '100%',
  },
  barFillDark: {
    backgroundColor: '#e8e8e8',
  },
  barFillLight: {
    backgroundColor: '#252525',
  },
  tick: {
    backgroundColor: ACCENT_COLOR,
    borderRadius: 0,
    height: TICK_HEIGHT,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  brand: {
    fontSize: 36,
    fontWeight: '200',
    left: 0,
    letterSpacing: 4,
    position: 'absolute',
    right: 0,
    textAlign: 'center',
    top: MAX_BAR_H - 22,
    zIndex: 2,
  },
  brandDark: {
    color: '#f5f5f5',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  brandLight: {
    color: '#1a1a1a',
    textShadowColor: 'rgba(255,255,255,0.85)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
});
