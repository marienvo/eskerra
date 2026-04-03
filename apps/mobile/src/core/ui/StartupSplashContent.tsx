import {memo, useEffect, useMemo} from 'react';
import {StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {
  computeStartupBarDisplayGain,
  computeStartupSpectrumSample,
  MIDDLE_STARTUP_BARS_FULL,
  smoothSpectrumLevelsInPlace,
  STARTUP_SPECTRUM_SPATIAL_SMOOTH,
} from '@notebox/core';
import {ACCENT_COLOR} from './accentColor';
import packageJson from '../../../package.json';

/** Startup spectrum: speech-like formants, phrase gaps (frame callback). */
const BAR_COUNT = 10;
/** Uniform scale for bar heights, cluster width, and derived bar/gap pixels (bar count unchanged). */
const STARTUP_SPECTRUM_VISUAL_SCALE = 1.321918;
const MAX_BAR_H = Math.round(146 * STARTUP_SPECTRUM_VISUAL_SCALE);
const BAR_SPLIT = Math.ceil(BAR_COUNT / 2);
/** Spectrum cluster width versus full splash width (used to derive bar pixel widths). */
const SPECTRUM_WIDTH_FRAC = 0.3 * STARTUP_SPECTRUM_VISUAL_SCALE;

const BAR_INDICES = Array.from({length: BAR_COUNT}, (_, i) => i);

const STARTUP_BAR_DISPLAY_GAINS = Array.from({length: BAR_COUNT}, (_, i) =>
  computeStartupBarDisplayGain(i, BAR_COUNT, MIDDLE_STARTUP_BARS_FULL),
);

type SpectrumPack = {
  levels: number[];
};

type Props = {
  /** When false, spectrum uses accent-only bars (light-style). Default true for dark splash. */
  isDarkMode?: boolean;
};

type BarPlacement = 'up' | 'down';

function computeBarLayout(windowWidth: number): {
  barGapPx: number;
  barWidthPx: number;
  minBarH: number;
} {
  const clusterPx = windowWidth * SPECTRUM_WIDTH_FRAC;
  const colPx = clusterPx / BAR_COUNT;
  /** Column model: bar = 2/3 of column; gap between bar faces = 1/3 column = bar/2. */
  const barWidthPx = Math.max(4, Math.round((colPx * 2) / 3));
  const barGapPx = Math.max(2, Math.round(barWidthPx / 2));
  const minBarH =
    barWidthPx >= MAX_BAR_H
      ? MAX_BAR_H - Math.round(6 * STARTUP_SPECTRUM_VISUAL_SCALE)
      : barWidthPx;
  return {barGapPx, barWidthPx, minBarH};
}

function makeEmptySpectrum(): SpectrumPack {
  return {
    levels: Array.from({length: BAR_COUNT}, () => 0),
  };
}

type ColumnProps = {
  barWidthPx: number;
  displayGain: number;
  index: number;
  isDarkMode: boolean;
  minBarH: number;
  placement: BarPlacement;
  spectrumSV: SharedValue<SpectrumPack>;
};

const WaveColumn = memo(function WaveColumn({
  barWidthPx,
  displayGain,
  index,
  isDarkMode,
  minBarH,
  placement,
  spectrumSV,
}: ColumnProps) {
  const halfBar = barWidthPx * 0.5;
  /** Rounds the mirror-facing edge only near min so overlap hides square corners, not pill caps at full height. */
  const innerRadiusBand = halfBar * 2.5;

  const barStyle = useAnimatedStyle(() => {
    const {levels} = spectrumSV.value;
    const lv = (levels[index] ?? 0) * displayGain;
    const mn = minBarH;
    const h = mn + lv * (MAX_BAR_H - mn);
    const span = innerRadiusBand;
    const u = span > 1e-6 ? (h - mn) / span : 1;
    const cl = Math.min(1, Math.max(0, u));
    const hMaxR = h * 0.5;
    const outerR = Math.min(halfBar, hMaxR);
    const innerR = Math.min(halfBar * (1 - cl), hMaxR);
    if (placement === 'up') {
      return {
        borderBottomLeftRadius: innerR,
        borderBottomRightRadius: innerR,
        borderTopLeftRadius: outerR,
        borderTopRightRadius: outerR,
        height: h,
        opacity: 1,
      };
    }
    return {
      borderBottomLeftRadius: outerR,
      borderBottomRightRadius: outerR,
      borderTopLeftRadius: innerR,
      borderTopRightRadius: innerR,
      height: h,
      opacity: 1,
    };
  }, [displayGain, halfBar, index, innerRadiusBand, minBarH, placement]);

  const barColor =
    isDarkMode && index < BAR_SPLIT ? '#FFFFFF' : ACCENT_COLOR;

  const columnStyle = [
    placement === 'up' ? styles.columnUp : styles.columnDown,
    {width: barWidthPx},
  ];

  return (
    <View style={columnStyle}>
      <View
        style={
          placement === 'up' ? styles.barTrackUp : styles.barTrackDown
        }>
        <Animated.View
          style={[styles.bar, {backgroundColor: barColor}, barStyle]}
        />
      </View>
    </View>
  );
});

export function StartupSplashContent({isDarkMode = true}: Props) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const {width: windowWidth} = useWindowDimensions();
  const {barGapPx, barWidthPx, minBarH} = useMemo(
    () => computeBarLayout(windowWidth),
    [windowWidth],
  );

  const spectrumSV = useSharedValue<SpectrumPack>(makeEmptySpectrum());
  const reducedMotionSV = useSharedValue(reducedMotion ? 1 : 0);
  const enterOpacity = useSharedValue(0);

  const frame = useFrameCallback(frameInfo => {
    'worklet';
    const tSec = frameInfo.timeSinceFirstFrame / 1000;
    const rm = reducedMotionSV.value === 1;

    const prev = spectrumSV.value;
    const raw: number[] = new Array(BAR_COUNT);
    for (let i = 0; i < BAR_COUNT; i++) {
      raw[i] = computeStartupSpectrumSample(tSec, i, BAR_COUNT, rm);
    }

    const levels: number[] = new Array(BAR_COUNT);
    if (!rm) {
      const work = raw.slice();
      smoothSpectrumLevelsInPlace(work, STARTUP_SPECTRUM_SPATIAL_SMOOTH);
      const prevLv = prev.levels;
      for (let i = 0; i < BAR_COUNT; i++) {
        const r = raw[i] ?? 0;
        levels[i] = r >= (prevLv[i] ?? 0) ? r : (work[i] ?? 0);
      }
    } else {
      for (let i = 0; i < BAR_COUNT; i++) {
        levels[i] = raw[i] ?? 0;
      }
    }

    spectrumSV.value = {levels};
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
      duration: 90,
      easing: Easing.out(Easing.cubic),
    });
  }, [enterOpacity]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
  }));

  const rowStyle = (placement: BarPlacement) => [
    placement === 'up' ? styles.barsRowUp : styles.barsRowDown,
    {gap: barGapPx},
  ];

  const column = (keyPrefix: string, placement: BarPlacement) =>
    BAR_INDICES.map(i => (
      <WaveColumn
        key={`${keyPrefix}-${i}`}
        barWidthPx={barWidthPx}
        displayGain={STARTUP_BAR_DISPLAY_GAINS[i] ?? 1}
        index={i}
        isDarkMode={isDarkMode}
        minBarH={minBarH}
        placement={placement}
        spectrumSV={spectrumSV}
      />
    ));

  const halfBar = barWidthPx * 0.5;
  const waveBlockStyle = [
    styles.waveBlock,
    {height: MAX_BAR_H * 2 - barWidthPx},
  ];
  const spectrumClusterUpStyle = [
    styles.spectrumCluster,
    {marginBottom: -halfBar},
  ];
  const spectrumClusterDownStyle = [
    styles.spectrumCluster,
    {marginTop: -halfBar},
  ];

  return (
    <Animated.View style={[styles.root, enterStyle]}>
      <View
        style={[styles.brandTop, {paddingTop: insets.top + 24}]}
        pointerEvents="none">
        <Text style={styles.brandTitle}>Eskerra</Text>
        <Text style={styles.brandVersion}>{packageJson.version}</Text>
      </View>
      <View style={styles.waveArea}>
        <View style={waveBlockStyle}>
          <View style={spectrumClusterUpStyle}>
            <View style={rowStyle('up')}>{column('up', 'up')}</View>
          </View>
          <View style={spectrumClusterDownStyle}>
            <View style={rowStyle('down')}>{column('down', 'down')}</View>
          </View>
        </View>
      </View>
      <View
        style={[styles.brandBottom, {paddingBottom: insets.bottom + 20}]}
        pointerEvents="none">
        <Text style={styles.brandFooter}>Made in Rotterdam</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
    flex: 1,
    position: 'relative',
    width: '100%',
  },
  brandTop: {
    left: 0,
    paddingHorizontal: 24,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  brandBottom: {
    bottom: 0,
    left: 0,
    paddingHorizontal: 24,
    position: 'absolute',
    right: 0,
    zIndex: 2,
  },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  brandVersion: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 4,
  },
  brandFooter: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  waveArea: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  waveBlock: {
    justifyContent: 'flex-start',
    position: 'relative',
    width: '100%',
  },
  spectrumCluster: {
    alignSelf: 'center',
    width: `${SPECTRUM_WIDTH_FRAC * 100}%`,
  },
  barsRowUp: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    height: MAX_BAR_H,
    justifyContent: 'center',
    width: '100%',
  },
  barsRowDown: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    height: MAX_BAR_H,
    justifyContent: 'center',
    width: '100%',
  },
  columnUp: {
    height: MAX_BAR_H,
    justifyContent: 'flex-end',
  },
  columnDown: {
    height: MAX_BAR_H,
    justifyContent: 'flex-start',
  },
  barTrackUp: {
    height: MAX_BAR_H,
    justifyContent: 'flex-end',
    width: '100%',
  },
  barTrackDown: {
    height: MAX_BAR_H,
    justifyContent: 'flex-start',
    width: '100%',
  },
  bar: {
    alignSelf: 'stretch',
    width: '100%',
  },
});
