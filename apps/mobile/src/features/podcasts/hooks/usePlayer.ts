import {buildPlaylistEntryForWrite, MIN_PLAYLIST_PERSIST_POSITION_MS} from '@eskerra/core';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {
  clearPlaylist,
  readPlaylistCoalesced,
  writePlaylist,
} from '../../../core/storage/eskerraStorage';
import {PlaylistEntry, PodcastEpisode} from '../../../types';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {getAudioPlayer, PlayerProgress, PlayerState} from '../services/audioPlayer';
import {
  getCachedPodcastArtworkUri,
  warmPodcastArtworkCache,
} from '../services/podcastImageCache';

type UsePlayerResult = {
  activeEpisode: PodcastEpisode | null;
  clearNowPlayingIfMatchesEpisode: (episodeId: string) => Promise<void>;
  error: string | null;
  isLoading: boolean;
  /** True while a user-triggered playback action runs or native player reports loading/buffering. */
  playbackTransportBusy: boolean;
  playEpisode: (episode: PodcastEpisode) => Promise<void>;
  progress: PlayerProgress;
  resyncPlaylistFromDisk: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  state: PlayerState;
  togglePlayback: () => Promise<void>;
};

export type MarkEpisodeAsPlayedOptions = {
  /** When false, vault/files still update but the mini player stays open (e.g. pause past 80%). */
  dismissNowPlaying?: boolean;
};

type UsePlayerOptions = {
  onMarkAsPlayed: (
    episode: PodcastEpisode,
    options?: MarkEpisodeAsPlayedOptions,
  ) => Promise<void>;
  podcastsCatalogReady: boolean;
  podcastsLoading: boolean;
};

function toPlaylistEntry(
  episode: PodcastEpisode,
  progress: PlayerProgress,
  prior: PlaylistEntry | null,
  deviceInstanceId: string,
  nowMs: number,
): PlaylistEntry {
  const base: PlaylistEntry =
    prior?.episodeId === episode.id
      ? prior
      : {
          durationMs: progress.durationMs,
          episodeId: episode.id,
          mp3Url: episode.mp3Url,
          positionMs: 0,
          updatedAt: 0,
          playbackOwnerId: '',
          controlRevision: 0,
        };
  return buildPlaylistEntryForWrite(
    base,
    {
      durationMs: progress.durationMs,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: progress.positionMs,
    },
    deviceInstanceId,
    'control',
    nowMs,
  );
}

const emptyProgress: PlayerProgress = {
  durationMs: null,
  positionMs: 0,
};

export function usePlayer(
  episodesById: Map<string, PodcastEpisode>,
  {onMarkAsPlayed, podcastsCatalogReady, podcastsLoading}: UsePlayerOptions,
): UsePlayerResult {
  const {baseUri, localSettings, playlistSyncGeneration} = useVaultContext();
  const player = useMemo(() => getAudioPlayer(), []);
  const activeEpisodeRef = useRef<PodcastEpisode | null>(null);
  const loadedEpisodeIdRef = useRef<string | null>(null);
  const baseUriRef = useRef<string | null>(null);

  const [activeEpisode, setActiveEpisode] = useState<PodcastEpisode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<PlayerProgress>(emptyProgress);
  const [savedPlaylistEntry, setSavedPlaylistEntry] = useState<PlaylistEntry | null>(null);
  const savedPlaylistEntryRef = useRef<PlaylistEntry | null>(null);
  /** True when `savedPlaylistEntry` reflects `playlist.json` on disk (restore / resync / normal pause persist). */
  const playlistEntryPersistedToDiskRef = useRef(false);
  const [state, setState] = useState<PlayerState>('idle');

  useEffect(() => {
    savedPlaylistEntryRef.current = savedPlaylistEntry;
  }, [savedPlaylistEntry]);

  useEffect(() => {
    activeEpisodeRef.current = activeEpisode;
  }, [activeEpisode]);

  useEffect(() => {
    baseUriRef.current = baseUri ?? null;
  }, [baseUri]);

  useEffect(() => {
    const removeProgressListener = player.addProgressListener(nextProgress => {
      setProgress(nextProgress);
    });
    const removeStateListener = player.addStateListener(nextState => {
      setState(nextState);
    });
    const removeEndedListener = player.addEndedListener(() => {
      setState('ended');
      const activeEpisodeAtEnd = activeEpisodeRef.current;
      if (!activeEpisodeAtEnd) {
        return;
      }

      const uri = baseUriRef.current;
      playlistEntryPersistedToDiskRef.current = false;
      setSavedPlaylistEntry(null);
      (async () => {
        try {
          if (uri) {
            await clearPlaylist(uri);
          }
          await onMarkAsPlayed(activeEpisodeAtEnd, {dismissNowPlaying: true});
        } catch (markError) {
          const fallbackMessage = 'Could not mark episode as played.';
          setError(markError instanceof Error ? markError.message : fallbackMessage);
        }
      })().catch(() => undefined);
    });

    return () => {
      removeProgressListener();
      removeStateListener();
      removeEndedListener();
    };
  }, [onMarkAsPlayed, player]);

  useEffect(() => {
    if (!baseUri) {
      playlistEntryPersistedToDiskRef.current = false;
      setSavedPlaylistEntry(null);
      setActiveEpisode(null);
      setProgress(emptyProgress);
      setState('idle');
      setError(null);
      return;
    }

    let isMounted = true;

    const restorePlayerState = async () => {
      try {
        await player.ensureSetup();
        const saved = await readPlaylistCoalesced(baseUri);
        if (!isMounted) {
          return;
        }
        playlistEntryPersistedToDiskRef.current = saved != null;
        setSavedPlaylistEntry(saved);
      } catch (restoreError) {
        if (!isMounted) {
          return;
        }

        playlistEntryPersistedToDiskRef.current = false;

        const fallbackMessage = 'Could not restore player state.';
        setError(
          restoreError instanceof Error ? restoreError.message : fallbackMessage,
        );
      }
    };

    restorePlayerState().catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [baseUri, player, playlistSyncGeneration]);

  useEffect(() => {
    if (!savedPlaylistEntry) {
      return;
    }

    const matchingEpisode = episodesById.get(savedPlaylistEntry.episodeId);
    if (!matchingEpisode || matchingEpisode.isListened) {
      return;
    }

    setActiveEpisode(matchingEpisode);
    setProgress({
      durationMs: savedPlaylistEntry.durationMs,
      positionMs: savedPlaylistEntry.positionMs,
    });
    setState(previousState => (previousState === 'idle' ? 'paused' : previousState));
  }, [episodesById, savedPlaylistEntry]);

  useEffect(() => {
    if (!baseUri || !savedPlaylistEntry || podcastsLoading || !podcastsCatalogReady) {
      return;
    }

    const catalogEpisode = episodesById.get(savedPlaylistEntry.episodeId);
    const missingFromCatalog = !catalogEpisode;
    const staleListened =
      Boolean(catalogEpisode?.isListened) && playlistEntryPersistedToDiskRef.current;
    if (!missingFromCatalog && !staleListened) {
      return;
    }

    playlistEntryPersistedToDiskRef.current = false;
    setSavedPlaylistEntry(null);
    setActiveEpisode(null);
    setProgress(emptyProgress);
    setState('idle');
    loadedEpisodeIdRef.current = null;

    (async () => {
      try {
        await player.stop();
        await clearPlaylist(baseUri);
      } catch (cleanupError) {
        const fallbackMessage = 'Could not clear stale playlist.';
        setError(
          cleanupError instanceof Error ? cleanupError.message : fallbackMessage,
        );
      }
    })().catch(() => undefined);
  }, [baseUri, episodesById, player, podcastsCatalogReady, podcastsLoading, savedPlaylistEntry]);

  const playEpisode = useCallback(
    async (episode: PodcastEpisode) => {
      const currentState = await player.getState();
      if (currentState === 'playing') {
        return;
      }

      setError(null);
      setIsLoading(true);
      try {
        let startPositionMs = 0;
        let artwork: string | undefined;
        if (baseUri) {
          const saved = await readPlaylistCoalesced(baseUri);
          if (saved && saved.episodeId === episode.id) {
            startPositionMs = saved.positionMs;
          }
          if (episode.rssFeedUrl) {
            artwork = (await getCachedPodcastArtworkUri(baseUri, episode.rssFeedUrl)) ?? undefined;
            warmPodcastArtworkCache(baseUri, episode.rssFeedUrl);
          }
        }

        await player.play(
          {
            artist: episode.seriesName,
            artwork,
            id: episode.id,
            title: episode.title,
            url: episode.mp3Url,
          },
          startPositionMs,
        );

        loadedEpisodeIdRef.current = episode.id;
        setActiveEpisode(episode);
        setState(await player.getState());

        const uriForPlay = baseUriRef.current;
        const deviceIdForPlay = localSettings?.deviceInstanceId?.trim() ?? '';
        if (uriForPlay && deviceIdForPlay) {
          (async () => {
            try {
              const latestProgress = await player.getProgress();
              const entry = toPlaylistEntry(
                episode,
                latestProgress,
                savedPlaylistEntryRef.current,
                deviceIdForPlay,
                Date.now(),
              );
              const writeResult = await writePlaylist(uriForPlay, entry, {
                mode: 'control',
              });
              setSavedPlaylistEntry(writeResult.entry);
              playlistEntryPersistedToDiskRef.current = true;
            } catch (persistError) {
              const fallbackMessage = 'Could not save playback position.';
              setError(
                persistError instanceof Error ? persistError.message : fallbackMessage,
              );
            }
          })().catch(() => undefined);
        } else if (uriForPlay && !deviceIdForPlay) {
          setError('Device id missing from local settings.');
        }
      } catch (playError) {
        const fallbackMessage = 'Could not start playback.';
        setError(playError instanceof Error ? playError.message : fallbackMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [baseUri, localSettings?.deviceInstanceId, player],
  );

  const togglePlayback = useCallback(async () => {
    if (!activeEpisodeRef.current) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      if (state === 'playing') {
        await player.pause();
        const latestProgress = await player.getProgress();
        setProgress(latestProgress);
        setState('paused');

        const activeEpisodeForMarking = activeEpisodeRef.current;
        const playbackRatio =
          latestProgress.durationMs && latestProgress.durationMs > 0
            ? latestProgress.positionMs / latestProgress.durationMs
            : 0;
        const uri = baseUriRef.current;

        (async () => {
          try {
            if (!uri || !activeEpisodeForMarking) {
              return;
            }
            const deviceId = localSettings?.deviceInstanceId?.trim() ?? '';
            if (!deviceId) {
              setError('Device id missing from local settings.');
              return;
            }
            if (latestProgress.positionMs < MIN_PLAYLIST_PERSIST_POSITION_MS) {
              playlistEntryPersistedToDiskRef.current = false;
              await clearPlaylist(uri);
              setSavedPlaylistEntry(null);
              return;
            }
            const shouldMarkPastThresholdKeepingPlayer =
              playbackRatio >= 0.8 &&
              latestProgress.positionMs >= MIN_PLAYLIST_PERSIST_POSITION_MS &&
              Boolean(activeEpisodeForMarking);
            if (shouldMarkPastThresholdKeepingPlayer) {
              await onMarkAsPlayed(activeEpisodeForMarking!, {
                dismissNowPlaying: false,
              });
            }
            const entry = toPlaylistEntry(
              activeEpisodeForMarking,
              latestProgress,
              savedPlaylistEntryRef.current,
              deviceId,
              Date.now(),
            );
            if (shouldMarkPastThresholdKeepingPlayer) {
              await clearPlaylist(uri);
              setSavedPlaylistEntry(entry);
              playlistEntryPersistedToDiskRef.current = false;
            } else {
              const writeResult = await writePlaylist(uri, entry, {mode: 'control'});
              setSavedPlaylistEntry(writeResult.entry);
              playlistEntryPersistedToDiskRef.current = true;
            }
          } catch (persistError) {
            const fallbackMessage = 'Could not save playback position.';
            setError(
              persistError instanceof Error ? persistError.message : fallbackMessage,
            );
          }
        })().catch(() => undefined);

        return;
      }

      const loadedEpisodeId = loadedEpisodeIdRef.current;
      const active = activeEpisodeRef.current;
      if (loadedEpisodeId !== active.id) {
        await playEpisode(active);
        return;
      }

      await player.resume();
      setState(await player.getState());

      const uriResume = baseUriRef.current;
      const deviceIdResume = localSettings?.deviceInstanceId?.trim() ?? '';
      if (uriResume && deviceIdResume) {
        (async () => {
          try {
            const latestProgress = await player.getProgress();
            setProgress(latestProgress);
            const entry = toPlaylistEntry(
              active,
              latestProgress,
              savedPlaylistEntryRef.current,
              deviceIdResume,
              Date.now(),
            );
            const writeResult = await writePlaylist(uriResume, entry, {
              mode: 'control',
            });
            setSavedPlaylistEntry(writeResult.entry);
            playlistEntryPersistedToDiskRef.current = true;
          } catch (persistError) {
            const fallbackMessage = 'Could not save playback position.';
            setError(
              persistError instanceof Error ? persistError.message : fallbackMessage,
            );
          }
        })().catch(() => undefined);
      } else if (uriResume && !deviceIdResume) {
        setError('Device id missing from local settings.');
      }
    } catch (toggleError) {
      const fallbackMessage = 'Could not change playback state.';
      setError(toggleError instanceof Error ? toggleError.message : fallbackMessage);
    } finally {
      setIsLoading(false);
    }
  }, [localSettings?.deviceInstanceId, onMarkAsPlayed, playEpisode, player, state]);

  const seekTo = useCallback(
    async (positionMs: number) => {
      if (!activeEpisodeRef.current) {
        return;
      }

      await player.seekTo(positionMs);
      const nextProgress = await player.getProgress();
      setProgress(nextProgress);
    },
    [player],
  );

  const clearNowPlayingIfMatchesEpisode = useCallback(
    async (episodeId: string) => {
      const uri = baseUriRef.current;
      const matchesActive = activeEpisodeRef.current?.id === episodeId;
      const matchesSaved = savedPlaylistEntryRef.current?.episodeId === episodeId;
      if (!matchesActive && !matchesSaved) {
        return;
      }

      playlistEntryPersistedToDiskRef.current = false;
      setSavedPlaylistEntry(null);
      setActiveEpisode(null);
      setProgress(emptyProgress);
      setState('idle');
      loadedEpisodeIdRef.current = null;

      if (!uri) {
        return;
      }

      try {
        await player.stop();
        await clearPlaylist(uri);
      } catch (cleanupError) {
        const fallbackMessage = 'Could not clear playlist after marking as played.';
        setError(cleanupError instanceof Error ? cleanupError.message : fallbackMessage);
      }
    },
    [player],
  );

  const resyncPlaylistFromDisk = useCallback(async () => {
    const uri = baseUriRef.current;
    if (!uri) {
      playlistEntryPersistedToDiskRef.current = false;
      setSavedPlaylistEntry(null);
      setActiveEpisode(null);
      setProgress(emptyProgress);
      setState('idle');
      loadedEpisodeIdRef.current = null;
      return;
    }

    try {
      await player.ensureSetup();
      const saved = await readPlaylistCoalesced(uri);
      playlistEntryPersistedToDiskRef.current = saved != null;
      setSavedPlaylistEntry(saved);
    } catch (resyncError) {
      const fallbackMessage = 'Could not restore player state.';
      setError(resyncError instanceof Error ? resyncError.message : fallbackMessage);
    }
  }, [player]);

  const playbackTransportBusy = isLoading || state === 'loading';

  return {
    activeEpisode,
    clearNowPlayingIfMatchesEpisode,
    error,
    isLoading,
    playbackTransportBusy,
    playEpisode,
    progress,
    resyncPlaylistFromDisk,
    seekTo,
    state,
    togglePlayback,
  };
}
