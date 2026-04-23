import {Box, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {StackScreenProps} from '@react-navigation/stack';
import {useFocusEffect} from '@react-navigation/native';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  Text as RNText,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {
  LIST_DIVIDER_DARK,
  LIST_DIVIDER_LIGHT,
  LIST_HORIZONTAL_INSET,
} from '../../../core/ui/listMetrics';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {safeNavigationState} from '../../../navigation/safeNavigationState';
import {PodcastsStackParamList} from '../../../navigation/types';
import {PodcastEpisode} from '../../../types';
import {EpisodeRow} from '../components/EpisodeRow';
import {usePlayerContext} from '../context/PlayerContext';
import {markEpisodeAsPlayed as markEpisodeAsPlayedInStorage} from '../services/markEpisodeAsPlayed';
import {runSerializedPodcastVaultRefresh} from '../services/podcastRssVaultSync';

type PodcastsScreenProps = StackScreenProps<PodcastsStackParamList, 'Podcasts'>;

type PodcastSectionListItem = {
  data: PodcastEpisode[];
  rssFeedUrl?: string;
  sectionIndex: number;
  title: string;
};

type PodcastSectionHeaderProps = {
  dividerColor: string;
  labelColor: string;
  listBackgroundColor: string;
  title: string;
};

function PodcastSectionHeader({
  dividerColor,
  labelColor,
  listBackgroundColor,
  title,
}: PodcastSectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, {backgroundColor: listBackgroundColor}]}>
      <View
        pointerEvents="none"
        style={[styles.sectionHeaderLine, {backgroundColor: dividerColor}]}
      />
      <View
        style={[
          styles.sectionHeaderLabelWrap,
          {backgroundColor: listBackgroundColor},
        ]}>
        <RNText style={[styles.sectionCaption, {color: labelColor}]}>
          {title.toUpperCase()}
        </RNText>
      </View>
    </View>
  );
}

export function PodcastsScreen({navigation}: PodcastsScreenProps) {
  const {baseUri} = useVaultContext();
  const {
    activeEpisode,
    allEpisodes,
    clearMiniPlayerArtworkSelection,
    markEpisodeAsPlayed,
    miniPlayerArtworkSelected,
    playbackError,
    playbackTransportBusy,
    playbackState,
    playEpisode,
    podcastError,
    podcastsLoading,
    refreshPodcasts,
    sections,
    setPodcastsVaultRefreshUi,
  } = usePlayerContext();
  const [markError, setMarkError] = useState<string | null>(null);
  const [pullRefreshInProgress, setPullRefreshInProgress] = useState(false);
  const [refreshPullError, setRefreshPullError] = useState<string | null>(null);
  const [isMarkingArtwork, setIsMarkingArtwork] = useState(false);
  const [isMarkingBatch, setIsMarkingBatch] = useState(false);
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<Set<string>>(new Set());
  const markInFlightRef = useRef(false);
  const colorMode = useColorMode();
  const dividerColor = colorMode === 'dark' ? LIST_DIVIDER_DARK : LIST_DIVIDER_LIGHT;
  const listBackgroundColor = colorMode === 'dark' ? '#121212' : '#ffffff';
  const sectionLabelColor = colorMode === 'dark' ? '#6a6a6a' : '#7a7a7a';
  const mutedTextColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const selectedCount = selectedEpisodeIds.size;
  const hasSelection = selectedCount > 0;
  const isPodcastsHeaderSelectionMode = hasSelection || miniPlayerArtworkSelected;

  const episodeById = useMemo(
    () => new Map(allEpisodes.map(episode => [episode.id, episode])),
    [allEpisodes],
  );

  const handlePodcastsPullRefresh = useCallback(async () => {
    if (!baseUri) {
      return;
    }
    setRefreshPullError(null);
    setPullRefreshInProgress(true);
    setPodcastsVaultRefreshUi({visible: true, percent: null});
    try {
      await runSerializedPodcastVaultRefresh(baseUri, refreshPodcasts, {
        onProgress: payload => {
          const n = payload.percent;
          if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100) {
            setPodcastsVaultRefreshUi({percent: n});
          }
        },
      });
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : 'Could not refresh podcasts.';
      setRefreshPullError(message);
      if (__DEV__) {
        console.warn('[Podcasts] pull refresh failed', refreshError);
      }
    } finally {
      setPodcastsVaultRefreshUi({visible: false});
      setPullRefreshInProgress(false);
    }
  }, [baseUri, refreshPodcasts, setPodcastsVaultRefreshUi]);

  const isPodcastsTopRoute = useCallback((): boolean => {
    const state = safeNavigationState(navigation);
    if (!state?.routes?.length) {
      return false;
    }
    const activeRoute = state.routes[state.index ?? 0];
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

  useEffect(() => {
    if (miniPlayerArtworkSelected) {
      setSelectedEpisodeIds(new Set());
    }
  }, [miniPlayerArtworkSelected]);

  useEffect(() => {
    if (selectedCount > 0) {
      clearMiniPlayerArtworkSelection();
    }
  }, [clearMiniPlayerArtworkSelection, selectedCount]);

  const handleMarkArtworkEpisodeAsPlayed = useCallback(async () => {
    if (markInFlightRef.current || isMarkingArtwork || !activeEpisode) {
      return;
    }

    setMarkError(null);
    markInFlightRef.current = true;
    setIsMarkingArtwork(true);
    try {
      await markEpisodeAsPlayed(activeEpisode);
    } catch (markEpisodeError) {
      const fallbackMessage = 'Could not mark episode as played.';
      setMarkError(
        markEpisodeError instanceof Error ? markEpisodeError.message : fallbackMessage,
      );
    } finally {
      markInFlightRef.current = false;
      setIsMarkingArtwork(false);
    }
  }, [activeEpisode, isMarkingArtwork, markEpisodeAsPlayed]);

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
        disabled={isMarkingBatch || isMarkingArtwork}
        hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
        onPress={() => {
          if (hasSelection) {
            handleMarkSelectedAsPlayed().catch(() => undefined);
          } else if (miniPlayerArtworkSelected && activeEpisode) {
            handleMarkArtworkEpisodeAsPlayed().catch(() => undefined);
          }
        }}
        style={styles.headerActionButton}>
        {isMarkingBatch || isMarkingArtwork ? (
          <Spinner size="small" />
        ) : (
          <MaterialIcons color="#ffffff" name="archive" size={24} />
        )}
      </TouchableOpacity>
    ),
    [
      activeEpisode,
      handleMarkArtworkEpisodeAsPlayed,
      handleMarkSelectedAsPlayed,
      hasSelection,
      isMarkingArtwork,
      isMarkingBatch,
      miniPlayerArtworkSelected,
    ],
  );

  useLayoutEffect(() => {
    if (!isPodcastsTopRoute()) {
      return;
    }
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }

    if (!isPodcastsHeaderSelectionMode) {
      tabNavigation.setOptions({
        headerLeft: undefined,
        headerRight: undefined,
        headerTitle: 'Episodes',
      });
      return;
    }

    tabNavigation.setOptions({
      headerLeft: hasSelection ? renderSelectionHeaderLeft : undefined,
      headerRight: renderSelectionHeaderRight,
      headerTitle: hasSelection ? `${selectedCount} selected` : 'Episodes',
    });

    return () => {
      tabNavigation.setOptions({
        headerLeft: undefined,
        headerRight: undefined,
        headerTitle: 'Episodes',
      });
    };
  }, [
    hasSelection,
    isPodcastsHeaderSelectionMode,
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
          headerRight: isPodcastsHeaderSelectionMode ? renderSelectionHeaderRight : undefined,
          headerTitle: hasSelection ? `${selectedCount} selected` : 'Episodes',
        });
      };

      applyHeader();
      const frameId = requestAnimationFrame(() => {
        applyHeader();
      });
      return () => cancelAnimationFrame(frameId);
    }, [
      hasSelection,
      isPodcastsHeaderSelectionMode,
      isPodcastsTopRoute,
      navigation,
      renderSelectionHeaderLeft,
      renderSelectionHeaderRight,
      selectedCount,
    ]),
  );

  const sectionData: PodcastSectionListItem[] = useMemo(
    () =>
      sections.map((section, sectionIndex) => ({
        data: section.episodes,
        rssFeedUrl: section.rssFeedUrl,
        sectionIndex,
        title: section.title,
      })),
    [sections],
  );

  return (
    <Box style={styles.container}>
      {podcastsLoading && sections.length === 0 ? (
        <Spinner style={styles.spinner} />
      ) : null}
      {podcastError ? <Text style={styles.status}>{podcastError}</Text> : null}
      {playbackError ? <Text style={styles.status}>{playbackError}</Text> : null}
      {markError ? <Text style={styles.status}>{markError}</Text> : null}
      {refreshPullError ? <Text style={styles.status}>{refreshPullError}</Text> : null}
      <SectionList
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              handlePodcastsPullRefresh().catch(() => undefined);
            }}
            // Keep false while work runs: pull affordance matches Inbox (default colors); after
            // release, header strip carries progress so the list needs no floating spinner.
            refreshing={false}
          />
        }
        sections={sectionData}
        keyExtractor={item => item.id}
        renderItem={({index, item, section}) => {
          const isLastRow =
            section.sectionIndex === sectionData.length - 1 &&
            index === section.data.length - 1;

          return (
            <EpisodeRow
              activeEpisodeId={activeEpisode?.id ?? null}
              dividerColor={dividerColor}
              episode={item}
              isBatchMarking={isMarkingBatch}
              isLastRow={isLastRow}
              isSelected={selectedEpisodeIds.has(item.id)}
              mutedTextColor={mutedTextColor}
              onPlayEpisode={playEpisode}
              onToggleSelect={() => {
                toggleEpisodeSelection(item.id);
              }}
              playbackTransportBusy={playbackTransportBusy}
              playbackState={playbackState}
              sectionRssFeedUrl={section.rssFeedUrl}
            />
          );
        }}
        renderSectionHeader={({section}) => (
          <PodcastSectionHeader
            dividerColor={dividerColor}
            labelColor={sectionLabelColor}
            listBackgroundColor={listBackgroundColor}
            title={section.title}
          />
        )}
        ListEmptyComponent={
          !podcastsLoading && !pullRefreshInProgress ? (
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
    paddingHorizontal: LIST_HORIZONTAL_INSET,
  },
  sectionHeader: {
    justifyContent: 'center',
    marginHorizontal: -LIST_HORIZONTAL_INSET,
    marginTop: 6,
    minHeight: 28,
  },
  sectionHeaderLabelWrap: {
    alignSelf: 'center',
    paddingHorizontal: 10,
  },
  sectionHeaderLine: {
    height: StyleSheet.hairlineWidth,
    left: 0,
    position: 'absolute',
    right: 0,
    top: '50%',
  },
  sectionCaption: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.9,
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
