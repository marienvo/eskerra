import {Pressable, Text, useColorMode} from '@gluestack-ui/themed';
import {StyleSheet, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {LIST_HORIZONTAL_INSET} from '../../../core/ui/listMetrics';
import {formatRelativeCalendarLabelFromIsoDate} from '../../../core/utils/relativeCalendarLabel';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {PodcastEpisode} from '../../../types';
import {PodcastArtworkImage} from './PodcastArtworkImage';
import {usePodcastArtwork} from '../hooks/usePodcastArtwork';
import {PlayerState} from '../services/audioPlayer';

/** Android Image blur when the row is selected (paired with selection overlay). */
export const SELECTED_ARTWORK_IMAGE_BLUR_RADIUS = 6;

type EpisodeRowProps = {
  activeEpisodeId: string | null;
  dividerColor: string;
  episode: PodcastEpisode;
  isBatchMarking?: boolean;
  isSelected?: boolean;
  mutedTextColor: string;
  onPlayEpisode: (episode: PodcastEpisode) => Promise<void>;
  onToggleSelect: () => void;
  playbackLoading: boolean;
  playbackState: PlayerState;
  sectionRssFeedUrl?: string;
  isLastRow?: boolean;
};

export function EpisodeRow({
  activeEpisodeId,
  dividerColor,
  episode,
  isBatchMarking = false,
  isSelected = false,
  mutedTextColor,
  onPlayEpisode,
  onToggleSelect,
  playbackLoading,
  playbackState,
  sectionRssFeedUrl,
  isLastRow = false,
}: EpisodeRowProps) {
  const colorMode = useColorMode();
  const {baseUri} = useVaultContext();
  const rssFeedUrlForArtwork =
    episode.rssFeedUrl?.trim() || sectionRssFeedUrl?.trim() || undefined;
  const artworkUri = usePodcastArtwork(baseUri, rssFeedUrlForArtwork, {
    allowBackgroundFetch: true,
  });
  const isActive = activeEpisodeId === episode.id;
  const isPlaying = isActive && playbackState === 'playing';
  /** Strong gray tint; artwork is also blurred via Image.blurRadius when selected. */
  const overlayBackgroundColor =
    colorMode === 'dark' ? 'rgba(174,174,174,0.5)' : 'rgba(186,186,186,0.5)';

  const rowDisabled = playbackLoading || isBatchMarking;

  return (
    <View
      style={[
        styles.episodeRowOuter,
        {borderBottomColor: dividerColor},
        isLastRow ? styles.episodeRowOuterLast : null,
      ]}>
      <View style={styles.episodeRowInner}>
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
              blurRadius={isSelected ? SELECTED_ARTWORK_IMAGE_BLUR_RADIUS : 0}
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
    </View>
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
  episodeRowOuter: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -LIST_HORIZONTAL_INSET,
  },
  episodeRowOuterLast: {
    borderBottomWidth: 0,
  },
  episodeRowInner: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: LIST_HORIZONTAL_INSET,
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
});
