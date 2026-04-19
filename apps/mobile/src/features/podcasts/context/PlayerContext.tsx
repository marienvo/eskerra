import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {PodcastEpisode, PodcastSection} from '../../../types';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {
  MarkEpisodeAsPlayedOptions,
  usePlayer,
} from '../hooks/usePlayer';
import {
  prepareMarkEpisodeAsPlayed,
  writePreparedMarkEpisodeAsPlayed,
} from '../services/markEpisodeAsPlayed';
import {RefreshPodcastsOptions, usePodcasts} from '../hooks/usePodcasts';
import type {PodcastPlayerPlaybackState} from '@eskerra/core';

import {PlayerProgress, PlayerState} from '../services/audioPlayer';

export type PodcastsVaultRefreshUiPatch = {
  visible?: boolean;
  percent?: number | null;
};

type PlayerContextValue = {
  activeEpisode: PodcastEpisode | null;
  allEpisodes: PodcastEpisode[];
  clearMiniPlayerArtworkSelection: () => void;
  /** Stops playback and clears playlist for the active episode when `episodeId` matches; does not mark played. */
  clearNowPlayingIfMatchesEpisode: (episodeId: string) => Promise<void>;
  markEpisodeAsPlayed: (
    episode: PodcastEpisode,
    options?: MarkEpisodeAsPlayedOptions,
  ) => Promise<void>;
  miniPlayerArtworkSelected: boolean;
  playEpisode: (episode: PodcastEpisode) => Promise<void>;
  playbackError: string | null;
  /** True while starting/stopping playback or while the native player reports loading/buffering. */
  playbackTransportBusy: boolean;
  playbackPhase: PodcastPlayerPlaybackState;
  playbackSeeking: boolean;
  playbackState: PlayerState;
  podcastError: string | null;
  podcastsLoading: boolean;
  podcastsVaultRefreshPercent: number | null;
  podcastsVaultRefreshVisible: boolean;
  progress: PlayerProgress;
  refreshPodcasts: (options?: RefreshPodcastsOptions) => Promise<void>;
  sections: PodcastSection[];
  seekTo: (positionMs: number) => Promise<void>;
  setPodcastsVaultRefreshUi: (patch: PodcastsVaultRefreshUiPatch) => void;
  toggleMiniPlayerArtworkSelection: () => void;
  togglePlayback: () => Promise<void>;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

type PlayerProviderProps = {
  children: ReactNode;
};

export function PlayerProvider({children}: PlayerProviderProps) {
  const {baseUri} = useVaultContext();
  const onMarkAsPlayedRef = useRef<
    (episode: PodcastEpisode, options?: MarkEpisodeAsPlayedOptions) => Promise<void>
  >(async () => {});
  const [miniPlayerArtworkSelected, setMiniPlayerArtworkSelected] = useState(false);
  const [podcastsVaultRefreshVisible, setPodcastsVaultRefreshVisible] = useState(false);
  const [podcastsVaultRefreshPercent, setPodcastsVaultRefreshPercent] = useState<
    number | null
  >(null);

  const setPodcastsVaultRefreshUi = useCallback((patch: PodcastsVaultRefreshUiPatch) => {
    if (patch.visible !== undefined) {
      setPodcastsVaultRefreshVisible(patch.visible);
    }
    if (patch.percent !== undefined) {
      setPodcastsVaultRefreshPercent(patch.percent);
    }
    if (patch.visible === false) {
      setPodcastsVaultRefreshPercent(null);
    }
  }, []);

  const stableOnMarkAsPlayed = useCallback(
    async (episode: PodcastEpisode, options?: MarkEpisodeAsPlayedOptions) => {
      await onMarkAsPlayedRef.current(episode, options);
    },
    [],
  );

  const {
    allEpisodes,
    applyOptimisticEpisodePlayed,
    catalogReady: podcastsCatalogReady,
    error: podcastError,
    isLoading: podcastsLoading,
    refresh: refreshPodcasts,
    sections,
  } = usePodcasts();

  const episodesById = useMemo(
    () => new Map(allEpisodes.map(episode => [episode.id, episode])),
    [allEpisodes],
  );

  const {
    activeEpisode,
    clearNowPlayingIfMatchesEpisode,
    error: playbackError,
    playbackPhase,
    playbackSeeking,
    playbackTransportBusy,
    playEpisode,
    progress,
    resyncPlaylistFromDisk,
    seekTo,
    state: playbackState,
    togglePlayback,
  } = usePlayer(episodesById, {
    onMarkAsPlayed: stableOnMarkAsPlayed,
    podcastsCatalogReady,
    podcastsLoading,
  });

  const handleMarkEpisodeAsPlayed = useCallback(
    async (
      episode: PodcastEpisode,
      options: MarkEpisodeAsPlayedOptions = {},
    ) => {
      if (!baseUri) {
        return;
      }

      const prepared = await prepareMarkEpisodeAsPlayed(baseUri, episode);
      if (!prepared) {
        return;
      }

      const dismissNowPlaying = options.dismissNowPlaying !== false;

      applyOptimisticEpisodePlayed(episode.id);
      if (dismissNowPlaying) {
        await clearNowPlayingIfMatchesEpisode(episode.id);
      }

      try {
        await writePreparedMarkEpisodeAsPlayed(prepared.fileUri, prepared.nextContent);
      } catch (writeError) {
        await refreshPodcasts();
        await resyncPlaylistFromDisk();
        throw writeError;
      }
    },
    [
      applyOptimisticEpisodePlayed,
      baseUri,
      clearNowPlayingIfMatchesEpisode,
      refreshPodcasts,
      resyncPlaylistFromDisk,
    ],
  );

  useEffect(() => {
    onMarkAsPlayedRef.current = handleMarkEpisodeAsPlayed;
  }, [handleMarkEpisodeAsPlayed]);

  const toggleMiniPlayerArtworkSelection = useCallback(() => {
    setMiniPlayerArtworkSelected(previous => !previous);
  }, []);

  const clearMiniPlayerArtworkSelection = useCallback(() => {
    setMiniPlayerArtworkSelected(false);
  }, []);

  useEffect(() => {
    if (!activeEpisode) {
      setMiniPlayerArtworkSelected(false);
    }
  }, [activeEpisode]);

  const value = useMemo(
    () => ({
      activeEpisode,
      allEpisodes,
      clearMiniPlayerArtworkSelection,
      clearNowPlayingIfMatchesEpisode,
      markEpisodeAsPlayed: handleMarkEpisodeAsPlayed,
      miniPlayerArtworkSelected,
      playEpisode,
      playbackError,
      playbackPhase,
      playbackSeeking,
      playbackTransportBusy,
      playbackState,
      podcastError,
      podcastsLoading,
      podcastsVaultRefreshPercent,
      podcastsVaultRefreshVisible,
      progress,
      refreshPodcasts,
      sections,
      seekTo,
      setPodcastsVaultRefreshUi,
      toggleMiniPlayerArtworkSelection,
      togglePlayback,
    }),
    [
      activeEpisode,
      allEpisodes,
      clearMiniPlayerArtworkSelection,
      clearNowPlayingIfMatchesEpisode,
      handleMarkEpisodeAsPlayed,
      miniPlayerArtworkSelected,
      playEpisode,
      playbackError,
      playbackPhase,
      playbackSeeking,
      playbackTransportBusy,
      playbackState,
      podcastError,
      podcastsLoading,
      podcastsVaultRefreshPercent,
      podcastsVaultRefreshVisible,
      progress,
      refreshPodcasts,
      sections,
      seekTo,
      setPodcastsVaultRefreshUi,
      toggleMiniPlayerArtworkSelection,
      togglePlayback,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayerContext(): PlayerContextValue {
  const context = useContext(PlayerContext);

  if (!context) {
    throw new Error('usePlayerContext must be used inside PlayerProvider.');
  }

  return context;
}
