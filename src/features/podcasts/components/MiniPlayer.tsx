import {Box, Pressable, Text, useColorMode} from '@gluestack-ui/themed';
import {Image, StyleSheet, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {useVaultContext} from '../../../core/vault/VaultContext';
import {usePlayerContext} from '../context/PlayerContext';
import {usePodcastArtwork} from '../hooks/usePodcastArtwork';

function formatProgress(positionMs: number, durationMs: number | null): string {
  const safePosition = Math.max(0, Math.floor(positionMs / 1000));
  const safeDuration =
    durationMs === null ? null : Math.max(0, Math.floor(durationMs / 1000));

  const minutes = Math.floor(safePosition / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (safePosition % 60).toString().padStart(2, '0');

  if (safeDuration === null) {
    return `${minutes}:${seconds}`;
  }

  const totalMinutes = Math.floor(safeDuration / 60)
    .toString()
    .padStart(2, '0');
  const totalSeconds = (safeDuration % 60).toString().padStart(2, '0');

  return `${minutes}:${seconds} / ${totalMinutes}:${totalSeconds}`;
}

export function MiniPlayer() {
  const {baseUri} = useVaultContext();
  const {
    activeEpisode,
    playbackLoading,
    playbackState,
    progress,
    togglePlayback,
  } = usePlayerContext();
  const colorMode = useColorMode();
  const artworkUri = usePodcastArtwork(baseUri, activeEpisode?.rssFeedUrl, {
    allowBackgroundFetch: true,
  });

  if (!activeEpisode) {
    return null;
  }

  const isPlaying = playbackState === 'playing';
  const progressRatio =
    progress.durationMs && progress.durationMs > 0
      ? Math.min(progress.positionMs / progress.durationMs, 1)
      : 0;
  const backgroundColor = colorMode === 'dark' ? '#1f1f1f' : '#ffffff';
  const borderColor = colorMode === 'dark' ? '#3f3f3f' : '#d7d7d7';
  const progressColor = colorMode === 'dark' ? '#7dc4ff' : '#0d6efd';
  const progressTrackColor = colorMode === 'dark' ? '#383838' : '#ebebeb';
  const mutedTextColor = colorMode === 'dark' ? '#c8c8c8' : '#616161';

  return (
    <Box
      style={[
        styles.container,
        {
          backgroundColor,
          borderColor,
        },
      ]}>
      <View style={styles.topRow}>
        {artworkUri ? (
          <Image source={{uri: artworkUri}} style={styles.artwork} />
        ) : (
          <View style={styles.artworkPlaceholder}>
            <MaterialIcons color="#8f8f8f" name="music-note" size={20} />
          </View>
        )}
        <View style={styles.textWrap}>
          <Text numberOfLines={1} style={styles.title}>
            {activeEpisode.title}
          </Text>
          <Text numberOfLines={1} style={[styles.subtitle, {color: mutedTextColor}]}>
            {activeEpisode.seriesName}
          </Text>
        </View>
        <Pressable
          disabled={playbackLoading}
          onPress={() => {
            togglePlayback().catch(() => undefined);
          }}
          style={styles.playButton}>
          <MaterialIcons
            color={mutedTextColor}
            name={isPlaying ? 'pause-circle-filled' : 'play-circle-filled'}
            size={34}
          />
        </Pressable>
      </View>
      <View style={[styles.progressTrack, {backgroundColor: progressTrackColor}]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: progressColor,
              width: `${progressRatio * 100}%`,
            },
          ]}
        />
      </View>
      <Text style={[styles.progressText, {color: mutedTextColor}]}>
        {formatProgress(progress.positionMs, progress.durationMs)}
      </Text>
    </Box>
  );
}

const styles = StyleSheet.create({
  artwork: {
    borderRadius: 8,
    height: 40,
    marginRight: 10,
    width: 40,
  },
  artworkPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#e2e2e2',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    marginRight: 10,
    width: 40,
  },
  container: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  playButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  progressFill: {
    height: 4,
  },
  progressText: {
    fontSize: 12,
    marginTop: 6,
  },
  progressTrack: {
    borderRadius: 100,
    height: 4,
    marginTop: 8,
    overflow: 'hidden',
    width: '100%',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});
