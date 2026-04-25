import {Box, Pressable, Text} from '@gluestack-ui/themed';
import Slider from '@react-native-community/slider';
import {useCallback, useEffect, useState} from 'react';
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
/** Icon-only episode actions when artwork is selected (matches ~64px artwork row). */
const MINI_PLAYER_ACTION_ICON_SIZE = 30;

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
 * Artwork action mode matches the same ~64px text column height; an error line below actions
 * can add ~22px but is omitted here to keep the offset conservative.
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
    clearNowPlayingIfMatchesEpisode,
    markEpisodeAsPlayed,
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
  const [miniPlayerActionKind, setMiniPlayerActionKind] = useState<null | 'dismiss' | 'mark'>(null);
  const [miniPlayerActionError, setMiniPlayerActionError] = useState<string | null>(null);
  const miniPlayerActionBusy = miniPlayerActionKind !== null;

  useEffect(() => {
    if (!miniPlayerArtworkSelected) {
      setMiniPlayerActionError(null);
      setMiniPlayerActionKind(null);
    }
  }, [miniPlayerArtworkSelected]);

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

  const handleMiniPlayerMarkPlayed = useCallback(async () => {
    if (miniPlayerActionBusy || !activeEpisode) {
      return;
    }
    setMiniPlayerActionError(null);
    setMiniPlayerActionKind('mark');
    try {
      await markEpisodeAsPlayed(activeEpisode);
    } catch (e) {
      setMiniPlayerActionError(
        e instanceof Error ? e.message : 'Kon aflevering niet als beluisterd markeren.',
      );
    } finally {
      setMiniPlayerActionKind(null);
    }
  }, [activeEpisode, markEpisodeAsPlayed, miniPlayerActionBusy]);

  const handleMiniPlayerDismissWithoutPlayed = useCallback(async () => {
    if (miniPlayerActionBusy || !activeEpisode) {
      return;
    }
    setMiniPlayerActionError(null);
    setMiniPlayerActionKind('dismiss');
    try {
      await clearNowPlayingIfMatchesEpisode(activeEpisode.id);
    } catch (e) {
      setMiniPlayerActionError(
        e instanceof Error ? e.message : 'Kon aflevering niet sluiten.',
      );
    } finally {
      setMiniPlayerActionKind(null);
    }
  }, [activeEpisode, clearNowPlayingIfMatchesEpisode, miniPlayerActionBusy]);

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
  let bufferingSubtitle = nearEndCopy;
  if (bufferingSubtitle == null) {
    if (showTransportSpinner && playbackState === 'loading') {
      bufferingSubtitle =
        progress.positionMs >= RESUMING_COPY_THRESHOLD_MS ? 'Resuming…' : 'Buffering…';
    } else if (showTransportSpinner && playbackState === 'paused') {
      bufferingSubtitle = 'Starting…';
    } else {
      bufferingSubtitle = null;
    }
  }
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
  let transportAccessibilityLabel = 'Play';
  if (showTransportSpinner) {
    transportAccessibilityLabel = playbackState === 'loading' ? 'Buffering' : 'Starting playback';
  } else if (isPlaying) {
    transportAccessibilityLabel = 'Pause';
  }

  const actionIconColor = miniPlayerActionBusy
    ? MINI_PLAYER_TRANSPORT_DISABLED
    : MINI_PLAYER_TRANSPORT;

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
          {miniPlayerArtworkSelected ? (
            <>
              <View style={styles.actionsRow}>
                <Pressable
                  accessibilityLabel="Markeer als beluisterd"
                  accessibilityRole="button"
                  accessibilityState={{
                    busy: miniPlayerActionKind === 'mark',
                    disabled: miniPlayerActionBusy,
                  }}
                  disabled={miniPlayerActionBusy}
                  hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
                  onPress={() => {
                    handleMiniPlayerMarkPlayed();
                  }}
                  style={styles.actionIconButton}>
                  {miniPlayerActionKind === 'mark' ? (
                    <ActivityIndicator color={MINI_PLAYER_TRANSPORT} size="small" />
                  ) : (
                    <MaterialIcons color={actionIconColor} name="archive" size={MINI_PLAYER_ACTION_ICON_SIZE} />
                  )}
                </Pressable>
                <Pressable
                  accessibilityLabel="Sluit aflevering zonder als beluisterd te markeren"
                  accessibilityRole="button"
                  accessibilityState={{
                    busy: miniPlayerActionKind === 'dismiss',
                    disabled: miniPlayerActionBusy,
                  }}
                  disabled={miniPlayerActionBusy}
                  hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
                  onPress={() => {
                    handleMiniPlayerDismissWithoutPlayed();
                  }}
                  style={styles.actionIconButton}>
                  {miniPlayerActionKind === 'dismiss' ? (
                    <ActivityIndicator color={MINI_PLAYER_TRANSPORT} size="small" />
                  ) : (
                    <MaterialIcons color={actionIconColor} name="close" size={MINI_PLAYER_ACTION_ICON_SIZE} />
                  )}
                </Pressable>
              </View>
              {miniPlayerActionError ? (
                <Text numberOfLines={2} style={[styles.actionError, {color: MINI_PLAYER_MUTED}]}>
                  {miniPlayerActionError}
                </Text>
              ) : null}
            </>
          ) : (
            <>
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
            </>
          )}
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
            accessibilityLabel={transportAccessibilityLabel}
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
  actionError: {
    fontSize: 11,
    marginTop: 4,
  },
  actionIconButton: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  actionsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
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
