import type {BottomTabHeaderProps} from '@react-navigation/bottom-tabs';
import {getHeaderTitle, Header} from '@react-navigation/elements';
import {useEffect} from 'react';
import {LayoutChangeEvent, Platform, StyleSheet, View} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import {usePlayerContext} from '../context/PlayerContext';

/** App accent; see repo `specs/design/accent-colors.md`. */
const ACCENT = '#4FAFE6';

const STRIP_HEIGHT = 3;
const SEGMENT_FRACTION = 0.38;

/** Tab header for Podcasts: default Header plus vault-refresh progress strip. */
export function PodcastsTabHeader({layout, options, route}: BottomTabHeaderProps) {
  const {podcastsVaultRefreshPercent, podcastsVaultRefreshVisible} = usePlayerContext();

  return (
    <View style={styles.wrapper}>
      <Header {...options} layout={layout} title={getHeaderTitle(options, route.name)} />
      <VaultRefreshStrip
        percent={podcastsVaultRefreshPercent}
        visible={podcastsVaultRefreshVisible}
      />
    </View>
  );
}

type VaultRefreshStripProps = {
  percent: number | null;
  visible: boolean;
};

function VaultRefreshStrip({percent, visible}: VaultRefreshStripProps) {
  const trackWidth = useSharedValue(0);
  const sweep = useSharedValue(0);

  const determinate =
    percent != null && Number.isFinite(percent) && percent >= 0 && percent <= 100;

  useEffect(() => {
    if (!visible || determinate) {
      cancelAnimation(sweep);
      sweep.value = 0;
      return;
    }
    sweep.value = withRepeat(
      withTiming(1, {duration: 1200, easing: Easing.inOut(Easing.ease)}),
      -1,
      true,
    );
    return () => cancelAnimation(sweep);
  }, [determinate, visible, sweep]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    trackWidth.value = e.nativeEvent.layout.width;
  };

  const indeterminateStyle = useAnimatedStyle(() => {
    const w = trackWidth.value;
    const seg = w * SEGMENT_FRACTION;
    const travel = Math.max(0, w - seg);
    return {
      transform: [{translateX: sweep.value * travel}],
      width: seg > 0 ? seg : w * SEGMENT_FRACTION,
    };
  });

  return (
    <View
      style={[styles.stripSlot, visible ? styles.stripSlotActive : styles.stripSlotIdle]}
      onLayout={onTrackLayout}>
      {visible ? (
        determinate ? (
          <View style={[styles.determinateFill, {width: `${percent}%`}]} />
        ) : (
          <Animated.View style={[styles.indeterminateSegment, indeterminateStyle]} />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#1d1d1d',
  },
  /** Fixed slot so header height does not jump when refresh starts or ends. */
  stripSlot: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    height: STRIP_HEIGHT,
    overflow: 'hidden',
    width: '100%',
    ...Platform.select({
      android: {elevation: 0},
      default: {},
    }),
  },
  stripSlotIdle: {
    backgroundColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  stripSlotActive: {
    backgroundColor: 'rgba(79, 175, 230, 0.12)',
    borderBottomColor: 'rgba(79, 175, 230, 0.35)',
  },
  determinateFill: {
    backgroundColor: ACCENT,
    height: '100%',
  },
  indeterminateSegment: {
    backgroundColor: ACCENT,
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
