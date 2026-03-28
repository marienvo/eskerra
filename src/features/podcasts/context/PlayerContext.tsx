import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import {PodcastEpisode, PodcastSection} from '../../../types';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {usePlayer} from '../hooks/usePlayer';
import {markEpisodeAsPlayed as markEpisodeAsPlayedInStorage} from '../services/markEpisodeAsPlayed';
import {RefreshPodcastsOptions, usePodcasts} from '../hooks/usePodcasts';
import {PlayerProgress, PlayerState} from '../services/audioPlayer';

export type PodcastsVaultRefreshUiPatch = {
  visible?: boolean;
  percent?: number | null;
};

type PlayerContextValue = {
  activeEpisode: PodcastEpisode | null;
  allEpisodes: PodcastEpisode[];
  playbackError: string | null;
  playbackLoading: boolean;
  playbackState: PlayerState;
  markEpisodeAsPlayed: (episode: PodcastEpisode) => Promise<void>;
  playEpisode: (episode: PodcastEpisode) => Promise<void>;
  progress: PlayerProgress;
  podcastError: string | null;
  podcastsLoading: boolean;
  podcastsVaultRefreshPercent: number | null;
  podcastsVaultRefreshVisible: boolean;
  refreshPodcasts: (options?: RefreshPodcastsOptions) => Promise<void>;
  sections: PodcastSection[];
  seekTo: (positionMs: number) => Promise<void>;
  setPodcastsVaultRefreshUi: (patch: PodcastsVaultRefreshUiPatch) => void;
  togglePlayback: () => Promise<void>;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

type PlayerProviderProps = {
  children: ReactNode;
};

export function PlayerProvider({children}: PlayerProviderProps) {
  const {baseUri} = useVaultContext();
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

  const {
    allEpisodes,
    error: podcastError,
    isLoading: podcastsLoading,
    refresh: refreshPodcasts,
    sections,
  } = usePodcasts();

  const episodesById = useMemo(
    () => new Map(allEpisodes.map(episode => [episode.id, episode])),
    [allEpisodes],
  );

  const handleMarkEpisodeAsPlayed = useCallback(
    async (episode: PodcastEpisode) => {
      if (!baseUri) {
        return;
      }

      const wasUpdated = await markEpisodeAsPlayedInStorage(baseUri, episode);
      if (wasUpdated) {
        await refreshPodcasts();
      }
    },
    [baseUri, refreshPodcasts],
  );

  const {
    activeEpisode,
    error: playbackError,
    isLoading: playbackLoading,
    playEpisode,
    progress,
    seekTo,
    state: playbackState,
    togglePlayback,
  } = usePlayer(episodesById, {onMarkAsPlayed: handleMarkEpisodeAsPlayed});

  const value = useMemo(
    () => ({
      activeEpisode,
      allEpisodes,
      playbackError,
      playbackLoading,
      playbackState,
      markEpisodeAsPlayed: handleMarkEpisodeAsPlayed,
      playEpisode,
      progress,
      podcastError,
      podcastsLoading,
      podcastsVaultRefreshPercent,
      podcastsVaultRefreshVisible,
      refreshPodcasts,
      sections,
      seekTo,
      setPodcastsVaultRefreshUi,
      togglePlayback,
    }),
    [
      activeEpisode,
      allEpisodes,
      playbackError,
      playbackLoading,
      playbackState,
      handleMarkEpisodeAsPlayed,
      playEpisode,
      podcastError,
      podcastsLoading,
      podcastsVaultRefreshPercent,
      podcastsVaultRefreshVisible,
      progress,
      refreshPodcasts,
      sections,
      seekTo,
      setPodcastsVaultRefreshUi,
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
