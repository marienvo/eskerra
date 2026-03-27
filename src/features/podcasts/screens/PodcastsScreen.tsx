import {Box, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {StackScreenProps} from '@react-navigation/stack';
import {useFocusEffect} from '@react-navigation/native';
import {useCallback, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {SectionList, StyleSheet, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {useVaultContext} from '../../../core/vault/VaultContext';
import {PodcastsStackParamList} from '../../../navigation/types';
import {PodcastEpisode} from '../../../types';
import {EpisodeRow} from '../components/EpisodeRow';
import {usePlayerContext} from '../context/PlayerContext';
import {markEpisodeAsPlayed as markEpisodeAsPlayedInStorage} from '../services/markEpisodeAsPlayed';

type PodcastsScreenProps = StackScreenProps<PodcastsStackParamList, 'Podcasts'>;

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

export function PodcastsScreen({navigation}: PodcastsScreenProps) {
  const {baseUri} = useVaultContext();
  const {
    activeEpisode,
    allEpisodes,
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
  const [markError, setMarkError] = useState<string | null>(null);
  const [isMarkingBatch, setIsMarkingBatch] = useState(false);
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<Set<string>>(new Set());
  const markInFlightRef = useRef(false);
  const colorMode = useColorMode();
  const dividerColor = colorMode === 'dark' ? '#4f4f4f' : '#d6d6d6';
  const mutedTextColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const selectedCount = selectedEpisodeIds.size;
  const hasSelection = selectedCount > 0;

  const episodeById = useMemo(
    () => new Map(allEpisodes.map(episode => [episode.id, episode])),
    [allEpisodes],
  );

  const isPodcastsTopRoute = useCallback((): boolean => {
    const state = navigation.getState();
    const activeRoute = state.routes[state.index];
    return activeRoute?.name === 'Podcasts';
  }, [navigation]);

  const toggleEpisodeSelection = useCallback((episodeId: string) => {
    setMarkError(null);
    setSelectedEpisodeIds(previousSelected => {
      const nextSelected = new Set(previousSelected);
      if (nextSelected.has(episodeId)) {
        nextSelected.delete(episodeId);
      } else {
        nextSelected.add(episodeId);
      }
      return nextSelected;
    });
  }, []);

  const handleMarkSelectedAsPlayed = useCallback(async () => {
    if (markInFlightRef.current || isMarkingBatch || !baseUri) {
      return;
    }
    const ids = Array.from(selectedEpisodeIds).filter(id => episodeById.has(id));
    if (ids.length === 0) {
      return;
    }

    setMarkError(null);
    markInFlightRef.current = true;
    setIsMarkingBatch(true);
    try {
      let anyUpdated = false;
      for (const id of ids) {
        const episode = episodeById.get(id);
        if (!episode) {
          continue;
        }
        const updated = await markEpisodeAsPlayedInStorage(baseUri, episode);
        if (updated) {
          anyUpdated = true;
        }
      }
      if (anyUpdated) {
        await refreshPodcasts();
      }
      setSelectedEpisodeIds(new Set());
    } catch (markEpisodesError) {
      const fallbackMessage = 'Could not mark selected episodes as played.';
      setMarkError(
        markEpisodesError instanceof Error ? markEpisodesError.message : fallbackMessage,
      );
    } finally {
      markInFlightRef.current = false;
      setIsMarkingBatch(false);
    }
  }, [baseUri, episodeById, isMarkingBatch, refreshPodcasts, selectedEpisodeIds]);

  const renderSelectionHeaderLeft = useCallback(
    () => (
      <TouchableOpacity
        hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
        onPress={() => {
          setMarkError(null);
          setSelectedEpisodeIds(new Set());
        }}
        style={styles.headerBackButton}>
        <MaterialIcons color="#ffffff" name="arrow-back" size={22} />
      </TouchableOpacity>
    ),
    [],
  );

  const renderSelectionHeaderRight = useCallback(
    () => (
      <TouchableOpacity
        disabled={isMarkingBatch}
        hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
        onPress={() => {
          handleMarkSelectedAsPlayed().catch(() => undefined);
        }}
        style={styles.headerActionButton}>
        {isMarkingBatch ? (
          <Spinner size="small" />
        ) : (
          <MaterialIcons color="#ffffff" name="archive" size={24} />
        )}
      </TouchableOpacity>
    ),
    [handleMarkSelectedAsPlayed, isMarkingBatch],
  );

  useLayoutEffect(() => {
    if (!isPodcastsTopRoute()) {
      return;
    }
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }

    if (!hasSelection) {
      tabNavigation.setOptions({
        headerLeft: undefined,
        headerRight: undefined,
        headerTitle: 'Podcasts',
      });
      return;
    }

    tabNavigation.setOptions({
      headerLeft: renderSelectionHeaderLeft,
      headerRight: renderSelectionHeaderRight,
      headerTitle: `${selectedCount} selected`,
    });

    return () => {
      tabNavigation.setOptions({
        headerLeft: undefined,
        headerRight: undefined,
        headerTitle: 'Podcasts',
      });
    };
  }, [
    hasSelection,
    isPodcastsTopRoute,
    navigation,
    renderSelectionHeaderLeft,
    renderSelectionHeaderRight,
    selectedCount,
  ]);

  useFocusEffect(
    useCallback(() => {
      const tabNavigation = navigation.getParent();
      if (!tabNavigation) {
        return;
      }

      const applyHeader = () => {
        if (!isPodcastsTopRoute()) {
          return;
        }
        tabNavigation.setOptions({
          headerShown: true,
          headerLeft: hasSelection ? renderSelectionHeaderLeft : undefined,
          headerRight: hasSelection ? renderSelectionHeaderRight : undefined,
          headerTitle: hasSelection ? `${selectedCount} selected` : 'Podcasts',
        });
      };

      applyHeader();
      const frameId = requestAnimationFrame(() => {
        applyHeader();
      });
      return () => cancelAnimationFrame(frameId);
    }, [
      hasSelection,
      isPodcastsTopRoute,
      navigation,
      renderSelectionHeaderLeft,
      renderSelectionHeaderRight,
      selectedCount,
    ]),
  );

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
      {markError ? <Text style={styles.status}>{markError}</Text> : null}
      <SectionList
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
            isBatchMarking={isMarkingBatch}
            isSelected={selectedEpisodeIds.has(item.id)}
            mutedTextColor={mutedTextColor}
            onMarkAsPlayed={markEpisodeAsPlayed}
            onPlayEpisode={playEpisode}
            onToggleSelect={() => {
              toggleEpisodeSelection(item.id);
            }}
            playbackLoading={playbackLoading}
            playbackState={playbackState}
            sectionRssFeedUrl={section.rssFeedUrl}
            selectionActive={hasSelection}
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
  },
  listContent: {
    paddingBottom: 24,
    paddingHorizontal: 20,
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
  headerBackButton: {
    marginLeft: 12,
  },
  headerActionButton: {
    marginRight: 12,
  },
  spinner: {
    marginVertical: 10,
    paddingHorizontal: 20,
  },
  status: {
    marginVertical: 10,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
});
