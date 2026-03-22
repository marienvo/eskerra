import {Pressable, Text} from '@gluestack-ui/themed';
import {useCallback, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {PodcastEpisode} from '../../../types';
import {PlayerState} from '../services/audioPlayer';

type EpisodeRowProps = {
  activeEpisodeId: string | null;
  dividerColor: string;
  episode: PodcastEpisode;
  mutedTextColor: string;
  onMarkAsPlayed: (episode: PodcastEpisode) => Promise<void>;
  onPlayEpisode: (episode: PodcastEpisode) => Promise<void>;
  playbackLoading: boolean;
  playbackState: PlayerState;
};

export function EpisodeRow({
  activeEpisodeId,
  dividerColor,
  episode,
  mutedTextColor,
  onMarkAsPlayed,
  onPlayEpisode,
  playbackLoading,
  playbackState,
}: EpisodeRowProps) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const [isMarkingAsPlayed, setIsMarkingAsPlayed] = useState(false);
  const isActive = activeEpisodeId === episode.id;
  const isPlaying = isActive && playbackState === 'playing';

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

  return (
    <Swipeable
      ref={swipeableRef}
      enabled={!playbackLoading && !isMarkingAsPlayed}
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
      <Pressable
        disabled={playbackLoading || isMarkingAsPlayed}
        onPress={() => {
          onPlayEpisode(episode).catch(() => undefined);
        }}
        style={[styles.episodeRow, {borderBottomColor: dividerColor}]}>
        <Text style={styles.episodeTitle}>{episode.title}</Text>
        <Text style={[styles.meta, {color: mutedTextColor}]}>
          {episode.seriesName} - {episode.date}
        </Text>
        <Text style={[styles.meta, {color: mutedTextColor}]}>
          {isPlaying ? 'Playing' : isActive ? 'Paused' : 'Tap to play'}
        </Text>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  episodeRow: {
    borderBottomWidth: 1,
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
