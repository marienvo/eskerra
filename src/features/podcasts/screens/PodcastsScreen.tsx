import {useEffect} from 'react';
import {Box, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {Image, SectionList, StyleSheet, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {useVaultContext} from '../../../core/vault/VaultContext';
import {usePlayerContext} from '../context/PlayerContext';
import {PodcastEpisode} from '../../../types';
import {EpisodeRow} from '../components/EpisodeRow';
import {usePodcastArtwork} from '../hooks/usePodcastArtwork';
import {warmPodcastArtworkCache} from '../services/podcastImageCache';

type PodcastSectionListItem = {
  data: PodcastEpisode[];
  rssFeedUrl?: string;
  title: string;
};

type PodcastSectionHeaderProps = {
  dividerColor: string;
  rssFeedUrl?: string;
  title: string;
};

function PodcastSectionHeader({
  dividerColor,
  rssFeedUrl,
  title,
}: PodcastSectionHeaderProps) {
  const {baseUri} = useVaultContext();
  const artworkUri = usePodcastArtwork(baseUri, rssFeedUrl, {
    allowBackgroundFetch: false,
  });

  return (
    <View style={[styles.sectionHeader, {borderBottomColor: dividerColor}]}>
      {artworkUri ? (
        <Image source={{uri: artworkUri}} style={styles.artwork} />
      ) : (
        <View style={styles.artworkPlaceholder}>
          <MaterialIcons color="#8f8f8f" name="music-note" size={20} />
        </View>
      )}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export function PodcastsScreen() {
  const {baseUri} = useVaultContext();
  const {
    activeEpisode,
    markEpisodeAsPlayed,
    playbackError,
    playbackLoading,
    playbackState,
    playEpisode,
    podcastError,
    podcastsLoading,
    refreshPodcasts,
    sections,
  } = usePlayerContext();
  const colorMode = useColorMode();
  const dividerColor = colorMode === 'dark' ? '#4f4f4f' : '#d6d6d6';
  const mutedTextColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const sectionData: PodcastSectionListItem[] = sections.map(section => ({
    data: section.episodes,
    rssFeedUrl: section.rssFeedUrl,
    title: section.title,
  }));

  useEffect(() => {
    if (!baseUri) {
      return;
    }

    const distinctFeedUrls = new Set<string>();
    for (const section of sections) {
      const normalizedFeedUrl = section.rssFeedUrl?.trim();
      if (normalizedFeedUrl) {
        distinctFeedUrls.add(normalizedFeedUrl);
      }
    }

    if (distinctFeedUrls.size === 0) {
      return;
    }

    const task = setTimeout(() => {
      for (const feedUrl of distinctFeedUrls) {
        warmPodcastArtworkCache(baseUri, feedUrl);
      }
    }, 0);

    return () => {
      clearTimeout(task);
    };
  }, [baseUri, sections]);

  return (
    <Box style={styles.container}>
      {podcastsLoading && sections.length === 0 ? (
        <Spinner style={styles.spinner} />
      ) : null}
      {podcastError ? <Text style={styles.status}>{podcastError}</Text> : null}
      {playbackError ? <Text style={styles.status}>{playbackError}</Text> : null}
      <SectionList
        // SectionList expects each section to expose a `data` array.
        contentContainerStyle={styles.listContent}
        onRefresh={refreshPodcasts}
        refreshing={podcastsLoading}
        sections={sectionData}
        keyExtractor={item => item.id}
        renderItem={({item}) => {
          return (
            <EpisodeRow
              activeEpisodeId={activeEpisode?.id ?? null}
              dividerColor={dividerColor}
              episode={item}
              mutedTextColor={mutedTextColor}
              onMarkAsPlayed={markEpisodeAsPlayed}
              onPlayEpisode={playEpisode}
              playbackLoading={playbackLoading}
              playbackState={playbackState}
            />
          );
        }}
        renderSectionHeader={({section}) => (
          <PodcastSectionHeader
            dividerColor={dividerColor}
            rssFeedUrl={section.rssFeedUrl}
            title={section.title}
          />
        )}
        ListEmptyComponent={
          !podcastsLoading ? (
            <Text style={styles.status}>
              No unplayed podcast episodes found in vault root.
            </Text>
          ) : null
        }
      />
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
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  listContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingBottom: 6,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  spinner: {
    marginVertical: 10,
  },
  status: {
    marginVertical: 10,
    textAlign: 'center',
  },
});
