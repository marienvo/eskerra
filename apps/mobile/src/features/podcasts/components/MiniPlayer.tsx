import {Box, Pressable, Text} from '@gluestack-ui/themed';
import Slider from '@react-native-community/slider';
import {useCallback, useState} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {ACCENT_COLOR} from '../../../core/ui/accentColor';
import {formatRelativeCalendarLabelFromIsoDate} from '@eskerra/core';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {usePlayerContext} from '../context/PlayerContext';
import {PodcastArtworkImage} from './PodcastArtworkImage';
import {usePodcastArtwork} from '../hooks/usePodcastArtwork';

const SKIP_MS = 10_000;
const SKIP_ICON_SIZE = 34;
const PLAY_ICON_SIZE = 52;

/** Match bottom tab bar dark chrome; transport uses light fg so enabled/disabled read on dark in all color modes. */
const MINI_PLAYER_BG = '#1d1d1d';
const MINI_PLAYER_BORDER = '#2d2d2d';
const MINI_PLAYER_PROGRESS_TRACK = '#383838';
const MINI_PLAYER_TITLE = '#ffffff';
const MINI_PLAYER_MUTED = 'rgba(255,255,255,0.72)';
const MINI_PLAYER_TRANSPORT = '#ffffff';
const MINI_PLAYER_TRANSPORT_DISABLED = 'rgba(255,255,255,0.4)';
const MINI_PLAYER_PLACEHOLDER_BG = '#3a3a3a';

/**
 * Approximate total height when MiniPlayer is visible. Used for keyboard footer offset;
 * update if container padding, artwork row, or progress block changes.
 */
export const MINI_PLAYER_LAYOUT_HEIGHT =
  1 + 20 + 64 + 8 + 40 + 6 + 52;// + 20;

const MS_PER_SECOND = 1000;
/** Mid-episode resume: show "Resuming…" instead of "Buffering…" when position is past this threshold. */
const RESUMING_COPY_THRESHOLD_MS = 10_000;

function formatClockFromMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / MS_PER_SECOND));
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (safe % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function clampSeekMs(
  positionMs: number,
  durationMs: number | null,
  deltaMs: number,
): number {
  const next = positionMs + deltaMs;
  if (next < 0) {
    return 0;
  }
  if (durationMs != null && durationMs > 0) {
    return Math.min(durationMs, next);
  }
  return next;
}

export function MiniPlayer() {
  const {baseUri} = useVaultContext();
  const {
    activeEpisode,
    miniPlayerArtworkSelected,
    playbackPhase,
    playbackSeeking,
    playbackTransportBusy,
    playbackState,
    progress,
    seekTo,
    toggleMiniPlayerArtworkSelection,
    togglePlayback,
  } = usePlayerContext();
  const artworkUri = usePodcastArtwork(baseUri, activeEpisode?.rssFeedUrl, {
    allowBackgroundFetch: true,
  });

  const [sliderDragging, setSliderDragging] = useState(false);
  const [sliderDragMs, setSliderDragMs] = useState(0);

  const handleSeekBy = useCallback(
    (deltaMs: number) => {
      if (!activeEpisode) {
        return;
      }
      const next = clampSeekMs(progress.positionMs, progress.durationMs, deltaMs);
      seekTo(next).catch(() => undefined);
    },
    [activeEpisode, progress.durationMs, progress.positionMs, seekTo],
  );

  const onSliderComplete = useCallback(
    (valueMs: number) => {
      setSliderDragging(false);
      seekTo(valueMs).catch(() => undefined);
    },
    [seekTo],
  );

  if (!activeEpisode) {
    return null;
  }

  const isPlaying = playbackState === 'playing';
  const showTransportSpinner =
    playbackState === 'loading' ||
    (playbackTransportBusy && playbackState === 'paused');
  const nearEndCopy =
    playbackPhase === 'nearEndPlaying' || playbackPhase === 'nearEndPaused'
      ? 'Bijna klaar'
      : null;
  const bufferingSubtitle =
    nearEndCopy ??
    (showTransportSpinner && playbackState === 'loading'
      ? progress.positionMs >= RESUMING_COPY_THRESHOLD_MS
        ? 'Resuming…'
        : 'Buffering…'
      : showTransportSpinner && playbackState === 'paused'
        ? 'Starting…'
        : null);
  const skipDisabled = playbackState === 'loading' && !playbackSeeking;
  const durationMs = progress.durationMs ?? 0;
  const sliderMaxMs =
    durationMs > 0 ? durationMs : Math.max(progress.positionMs, 1);
  const sliderValueMs = sliderDragging ? sliderDragMs : progress.positionMs;

  const transportIconColor = playbackTransportBusy
    ? MINI_PLAYER_TRANSPORT_DISABLED
    : MINI_PLAYER_TRANSPORT;
  const artworkBorderColor = miniPlayerArtworkSelected ? ACCENT_COLOR : 'transparent';
  const elapsedLabel = formatClockFromMs(sliderValueMs);
  const durationLabel =
    progress.durationMs != null && progress.durationMs > 0
      ? formatClockFromMs(progress.durationMs)
      : '\u2014';

  return (
    <Box
      style={[
        styles.container,
        {
          backgroundColor: MINI_PLAYER_BG,
          borderColor: MINI_PLAYER_BORDER,
        },
      ]}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            toggleMiniPlayerArtworkSelection();
          }}
          style={[styles.artworkPressable, {borderColor: artworkBorderColor}]}>
          <PodcastArtworkImage
            artworkUri={artworkUri}
            imageStyle={styles.artwork}
            placeholderStyle={styles.artworkPlaceholder}
          />
        </Pressable>
        <View style={styles.textWrap}>
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={[styles.title, {color: MINI_PLAYER_TITLE}]}>
            {activeEpisode.title}
          </Text>
          <Text numberOfLines={1} style={[styles.subtitle, {color: MINI_PLAYER_MUTED}]}>
            {activeEpisode.seriesName}
          </Text>
          <Text numberOfLines={1} style={[styles.dateLine, {color: MINI_PLAYER_MUTED}]}>
            {bufferingSubtitle ?? formatRelativeCalendarLabelFromIsoDate(activeEpisode.date)}
          </Text>
        </View>
      </View>
      <Slider
        maximumTrackTintColor={MINI_PLAYER_PROGRESS_TRACK}
        maximumValue={sliderMaxMs}
        minimumTrackTintColor={ACCENT_COLOR}
        minimumValue={0}
        onSlidingComplete={onSliderComplete}
        onSlidingStart={() => {
          setSliderDragging(true);
          setSliderDragMs(progress.positionMs);
        }}
        onValueChange={value => {
          setSliderDragMs(value);
        }}
        style={styles.slider}
        thumbTintColor={ACCENT_COLOR}
        value={Math.min(sliderValueMs, sliderMaxMs)}
      />
      <View style={styles.transportRow}>
        <Text style={[styles.transportTime, {color: MINI_PLAYER_MUTED}]}>{elapsedLabel}</Text>
        <View style={styles.transportCenter}>
          <Pressable
            accessibilityLabel="Rewind 10 seconds"
            disabled={skipDisabled}
            hitSlop={8}
            onPress={() => {
              handleSeekBy(-SKIP_MS);
            }}
            style={styles.skipButton}>
            <MaterialIcons color={transportIconColor} name="replay-10" size={SKIP_ICON_SIZE} />
          </Pressable>
          <Pressable
            accessibilityHint={
              showTransportSpinner
                ? 'Playback is loading or starting.'
                : undefined
            }
            accessibilityLabel={
              showTransportSpinner
                ? playbackState === 'loading'
                  ? 'Buffering'
                  : 'Starting playback'
                : isPlaying
                  ? 'Pause'
                  : 'Play'
            }
            accessibilityState={{busy: showTransportSpinner}}
            disabled={playbackTransportBusy}
            onPress={() => {
              togglePlayback().catch(() => undefined);
            }}
            style={styles.playButton}>
            {showTransportSpinner ? (
              <ActivityIndicator color={MINI_PLAYER_TRANSPORT} size="large" />
            ) : (
              <MaterialIcons
                color={transportIconColor}
                name={isPlaying ? 'pause-circle-filled' : 'play-circle-filled'}
                size={PLAY_ICON_SIZE}
              />
            )}
          </Pressable>
          <Pressable
            accessibilityLabel="Forward 10 seconds"
            disabled={skipDisabled}
            hitSlop={8}
            onPress={() => {
              handleSeekBy(SKIP_MS);
            }}
            style={styles.skipButton}>
            <MaterialIcons color={transportIconColor} name="forward-10" size={SKIP_ICON_SIZE} />
          </Pressable>
        </View>
        <Text style={[styles.transportTime, styles.transportTimeEnd, {color: MINI_PLAYER_MUTED}]}>
          {durationLabel}
        </Text>
      </View>
    </Box>
  );
}

const styles = StyleSheet.create({
  artwork: {
    borderRadius: 8,
    height: 64,
    width: 64,
  },
  artworkPlaceholder: {
    alignItems: 'center',
    backgroundColor: MINI_PLAYER_PLACEHOLDER_BG,
    borderRadius: 8,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  artworkPressable: {
    borderRadius: 10,
    borderWidth: 2,
    marginRight: 10,
  },
  container: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dateLine: {
    fontSize: 11,
    marginTop: 2,
  },
  playButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  slider: {
    height: 40,
    marginTop: 8,
    width: '100%',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  transportCenter: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    justifyContent: 'center',
  },
  transportRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 2,
    minHeight: PLAY_ICON_SIZE,
  },
  transportTime: {
    flex: 1,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  transportTimeEnd: {
    textAlign: 'right',
  },
});
