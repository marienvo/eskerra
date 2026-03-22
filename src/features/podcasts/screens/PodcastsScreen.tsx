import {Box, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {SectionList, StyleSheet, View} from 'react-native';

import {usePlayerContext} from '../context/PlayerContext';
import {PodcastEpisode} from '../../../types';
import {EpisodeRow} from '../components/EpisodeRow';

type PodcastSectionListItem = {
  data: PodcastEpisode[];
  rssFeedUrl?: string;
  title: string;
};

type PodcastSectionHeaderProps = {
  dividerColor: string;
  title: string;
};

function PodcastSectionHeader({dividerColor, title}: PodcastSectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, {borderBottomColor: dividerColor}]}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export function PodcastsScreen() {
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
        onRefresh={() => {
          refreshPodcasts({forceFullScan: true}).catch(() => undefined);
        }}
        refreshing={podcastsLoading && sections.length > 0}
        sections={sectionData}
        keyExtractor={item => item.id}
        renderItem={({item, section}) => (
          <EpisodeRow
            activeEpisodeId={activeEpisode?.id ?? null}
            dividerColor={dividerColor}
            episode={item}
            mutedTextColor={mutedTextColor}
            onMarkAsPlayed={markEpisodeAsPlayed}
            onPlayEpisode={playEpisode}
            playbackLoading={playbackLoading}
            playbackState={playbackState}
            sectionRssFeedUrl={section.rssFeedUrl}
          />
        )}
        renderSectionHeader={({section}) => (
          <PodcastSectionHeader
            dividerColor={dividerColor}
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
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  listContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
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
