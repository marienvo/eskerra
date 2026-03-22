import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {
  clearPlaylist,
  readPlaylist,
  writePlaylist,
} from '../../../core/storage/noteboxStorage';
import {PlaylistEntry, PodcastEpisode} from '../../../types';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {getAudioPlayer, PlayerProgress, PlayerState} from '../services/audioPlayer';

type UsePlayerResult = {
  activeEpisode: PodcastEpisode | null;
  error: string | null;
  isLoading: boolean;
  playEpisode: (episode: PodcastEpisode) => Promise<void>;
  progress: PlayerProgress;
  seekTo: (positionMs: number) => Promise<void>;
  state: PlayerState;
  togglePlayback: () => Promise<void>;
};

type UsePlayerOptions = {
  onMarkAsPlayed: (episode: PodcastEpisode) => Promise<void>;
};

function toPlaylistEntry(
  episode: PodcastEpisode,
  progress: PlayerProgress,
): PlaylistEntry {
  return {
    durationMs: progress.durationMs,
    episodeId: episode.id,
    mp3Url: episode.mp3Url,
    positionMs: progress.positionMs,
  };
}

const emptyProgress: PlayerProgress = {
  durationMs: null,
  positionMs: 0,
};

export function usePlayer(
  episodesById: Map<string, PodcastEpisode>,
  {onMarkAsPlayed}: UsePlayerOptions,
): UsePlayerResult {
  const {baseUri} = useVaultContext();
  const player = useMemo(() => getAudioPlayer(), []);
  const activeEpisodeRef = useRef<PodcastEpisode | null>(null);
  const loadedEpisodeIdRef = useRef<string | null>(null);

  const [activeEpisode, setActiveEpisode] = useState<PodcastEpisode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<PlayerProgress>(emptyProgress);
  const [state, setState] = useState<PlayerState>('idle');

  useEffect(() => {
    activeEpisodeRef.current = activeEpisode;
  }, [activeEpisode]);

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

      onMarkAsPlayed(activeEpisodeAtEnd).catch(markError => {
        const fallbackMessage = 'Could not mark episode as played.';
        setError(markError instanceof Error ? markError.message : fallbackMessage);
      });
    });

    return () => {
      removeProgressListener();
      removeStateListener();
      removeEndedListener();
    };
  }, [onMarkAsPlayed, player]);

  const persistCurrentProgress = useCallback(async () => {
    if (!baseUri || !activeEpisodeRef.current) {
      return null;
    }

    const latestProgress = await player.getProgress();
    setProgress(latestProgress);
    await writePlaylist(
      baseUri,
      toPlaylistEntry(activeEpisodeRef.current, latestProgress),
    );
    return latestProgress;
  }, [baseUri, player]);

  useEffect(() => {
    if (!baseUri) {
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
        const saved = await readPlaylist(baseUri);
        if (!saved) {
          return;
        }

        const matchingEpisode = episodesById.get(saved.episodeId);
        if (!matchingEpisode) {
          await clearPlaylist(baseUri);
          return;
        }

        if (!isMounted) {
          return;
        }

        setActiveEpisode(matchingEpisode);
        setProgress({
          durationMs: saved.durationMs,
          positionMs: saved.positionMs,
        });
        setState('paused');
      } catch (restoreError) {
        if (!isMounted) {
          return;
        }

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
  }, [baseUri, episodesById, player]);

  const playEpisode = useCallback(
    async (episode: PodcastEpisode) => {
      setError(null);
      setIsLoading(true);
      try {
        let startPositionMs = 0;
        if (baseUri) {
          const saved = await readPlaylist(baseUri);
          if (saved && saved.episodeId === episode.id) {
            startPositionMs = saved.positionMs;
          }
        }

        await player.play(
          {
            artist: episode.seriesName,
            id: episode.id,
            title: episode.title,
            url: episode.mp3Url,
          },
          startPositionMs,
        );

        loadedEpisodeIdRef.current = episode.id;
        setActiveEpisode(episode);
        setState('playing');
      } catch (playError) {
        const fallbackMessage = 'Could not start playback.';
        setError(playError instanceof Error ? playError.message : fallbackMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [baseUri, player],
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
        const latestProgress = await persistCurrentProgress();
        const activeEpisodeForMarking = activeEpisodeRef.current;
        const playbackRatio =
          latestProgress?.durationMs && latestProgress.durationMs > 0
            ? latestProgress.positionMs / latestProgress.durationMs
            : 0;
        if (activeEpisodeForMarking && playbackRatio >= 0.8) {
          await onMarkAsPlayed(activeEpisodeForMarking);
        }
        setState('paused');
        return;
      }

      const loadedEpisodeId = loadedEpisodeIdRef.current;
      const active = activeEpisodeRef.current;
      if (loadedEpisodeId !== active.id) {
        await playEpisode(active);
        return;
      }

      await player.resume();
      setState('playing');
    } catch (toggleError) {
      const fallbackMessage = 'Could not change playback state.';
      setError(toggleError instanceof Error ? toggleError.message : fallbackMessage);
    } finally {
      setIsLoading(false);
    }
  }, [onMarkAsPlayed, persistCurrentProgress, playEpisode, player, state]);

  const seekTo = useCallback(
    async (positionMs: number) => {
      if (!activeEpisodeRef.current) {
        return;
      }

      await player.seekTo(positionMs);
      const nextProgress: PlayerProgress = {
        durationMs: progress.durationMs,
        positionMs,
      };
      setProgress(nextProgress);

      if (baseUri) {
        await writePlaylist(
          baseUri,
          toPlaylistEntry(activeEpisodeRef.current, nextProgress),
        );
      }
    },
    [baseUri, player, progress.durationMs],
  );

  return {
    activeEpisode,
    error,
    isLoading,
    playEpisode,
    progress,
    seekTo,
    state,
    togglePlayback,
  };
}
