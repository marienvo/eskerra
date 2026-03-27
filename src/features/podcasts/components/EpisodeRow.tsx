import {Pressable, Text, useColorMode} from '@gluestack-ui/themed';
import {useCallback, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {formatRelativeCalendarLabelFromIsoDate} from '../../../core/utils/relativeCalendarLabel';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {PodcastEpisode} from '../../../types';
import {PodcastArtworkImage} from './PodcastArtworkImage';
import {usePodcastArtwork} from '../hooks/usePodcastArtwork';
import {PlayerState} from '../services/audioPlayer';

type EpisodeRowProps = {
  activeEpisodeId: string | null;
  dividerColor: string;
  episode: PodcastEpisode;
  isBatchMarking?: boolean;
  isSelected?: boolean;
  mutedTextColor: string;
  onMarkAsPlayed: (episode: PodcastEpisode) => Promise<void>;
  onPlayEpisode: (episode: PodcastEpisode) => Promise<void>;
  onToggleSelect: () => void;
  playbackLoading: boolean;
  playbackState: PlayerState;
  sectionRssFeedUrl?: string;
  selectionActive?: boolean;
};

export function EpisodeRow({
  activeEpisodeId,
  dividerColor,
  episode,
  isBatchMarking = false,
  isSelected = false,
  mutedTextColor,
  onMarkAsPlayed,
  onPlayEpisode,
  onToggleSelect,
  playbackLoading,
  playbackState,
  sectionRssFeedUrl,
  selectionActive = false,
}: EpisodeRowProps) {
  const colorMode = useColorMode();
  const {baseUri} = useVaultContext();
  const rssFeedUrlForArtwork =
    episode.rssFeedUrl?.trim() || sectionRssFeedUrl?.trim() || undefined;
  const artworkUri = usePodcastArtwork(baseUri, rssFeedUrlForArtwork, {
    allowBackgroundFetch: true,
  });
  const swipeableRef = useRef<Swipeable | null>(null);
  const [isMarkingAsPlayed, setIsMarkingAsPlayed] = useState(false);
  const isActive = activeEpisodeId === episode.id;
  const isPlaying = isActive && playbackState === 'playing';
  /** Strong gray tint; artwork is also blurred via Image.blurRadius when selected. */
  const overlayBackgroundColor =
    colorMode === 'dark' ? 'rgba(174,174,174,0.5)' : 'rgba(186,186,186,0.5)';

  const renderSwipeAction = useCallback(
    () => (
      <View style={[styles.swipeAction, {borderBottomColor: dividerColor}]}>
        <MaterialIcons color="#2e7d32" name="check-circle" size={28} />
      </View>
    ),
    [dividerColor],
  );

  const markAsPlayed = useCallback(async () => {
    if (isMarkingAsPlayed) {
      return;
    }

    setIsMarkingAsPlayed(true);
    try {
      await onMarkAsPlayed(episode);
      swipeableRef.current?.close();
    } finally {
      setIsMarkingAsPlayed(false);
    }
  }, [episode, isMarkingAsPlayed, onMarkAsPlayed]);

  const rowDisabled =
    playbackLoading || isMarkingAsPlayed || isBatchMarking;
  const swipeEnabled =
    !rowDisabled && !selectionActive;

  return (
    <Swipeable
      ref={swipeableRef}
      enabled={swipeEnabled}
      friction={2}
      leftThreshold={56}
      onSwipeableOpen={() => {
        markAsPlayed().catch(() => undefined);
      }}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={renderSwipeAction}
      renderRightActions={renderSwipeAction}
      rightThreshold={56}>
      <View style={[styles.episodeRow, {borderBottomColor: dividerColor}]}>
        <Pressable
          accessibilityLabel={
            isSelected ? 'Deselect episode' : 'Select episode'
          }
          disabled={rowDisabled}
          onPress={onToggleSelect}
          style={styles.artworkPressable}>
          <View style={styles.artworkContainer}>
            <PodcastArtworkImage
              artworkUri={artworkUri}
              imageStyle={styles.artworkImage}
              placeholderStyle={styles.artworkPlaceholderInner}
            />
            {isSelected ? (
              <>
                <View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFill, styles.artworkOverlay, {backgroundColor: overlayBackgroundColor}]}
                />
                <View pointerEvents="none" style={styles.checkOverlay}>
                  <MaterialIcons color="#000000" name="check" size={28} />
                </View>
              </>
            ) : null}
          </View>
        </Pressable>
        <Pressable
          disabled={rowDisabled}
          onPress={() => {
            onPlayEpisode(episode).catch(() => undefined);
          }}
          style={styles.episodeContent}>
          <Text style={styles.episodeTitle}>{episode.title}</Text>
          <Text style={[styles.meta, {color: mutedTextColor}]}>
            {episode.seriesName} - {formatRelativeCalendarLabelFromIsoDate(episode.date)}
          </Text>
          <Text style={[styles.meta, {color: mutedTextColor}]}>
            {isPlaying ? 'Playing' : isActive ? 'Paused' : 'Tap to play'}
          </Text>
        </Pressable>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  artworkContainer: {
    borderRadius: 8,
    height: 40,
    overflow: 'hidden',
    width: 40,
  },
  artworkImage: {
    borderRadius: 8,
    height: 40,
    width: 40,
  },
  artworkOverlay: {
    borderRadius: 8,
  },
  artworkPlaceholderInner: {
    alignItems: 'center',
    backgroundColor: '#e2e2e2',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  artworkPressable: {
    marginRight: 10,
  },
  checkOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeContent: {
    flex: 1,
  },
  episodeRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingVertical: 12,
  },
  episodeTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
    marginTop: 4,
  },
  swipeAction: {
    alignItems: 'center',
    borderBottomWidth: 1,
    justifyContent: 'center',
    width: 72,
  },
});
