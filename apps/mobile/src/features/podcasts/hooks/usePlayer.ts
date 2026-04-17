import {
  buildPlaylistEntryForWrite,
  defaultEskerraSettings,
  isVaultR2PlaylistConfigured,
  MIN_PROGRESS_MS,
  type PlayerEpisodeSnapshot,
  type PlaylistEntry,
  podcastPlayerMachine,
  type PodcastPlayerDeps,
  type PodcastPlayerPlaybackState,
  getPlaybackSubstate,
} from '@eskerra/core';
import {useMachine} from '@xstate/react';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';

import {
  clearPlaylist,
  readPlaylistCoalesced,
  writePlaylist,
} from '../../../core/storage/eskerraStorage';
import {useVaultContext} from '../../../core/vault/VaultContext';
import type {PodcastEpisode} from '../../../types';
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
  /** XState playback sub-state (near-end zone, etc.). */
  playbackPhase: PodcastPlayerPlaybackState;
  /** True while a user-triggered playback action runs or native player reports loading/buffering (not during seek). */
  playbackTransportBusy: boolean;
  playbackSeeking: boolean;
  playEpisode: (episode: PodcastEpisode) => Promise<void>;
  progress: PlayerProgress;
  resyncPlaylistFromDisk: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  state: PlayerState;
  togglePlayback: () => Promise<void>;
};

export type MarkEpisodeAsPlayedOptions = {
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

function toSnapshot(ep: PodcastEpisode): PlayerEpisodeSnapshot {
  return {
    id: ep.id,
    mp3Url: ep.mp3Url,
    title: ep.title,
    artist: ep.seriesName,
  };
}

export function usePlayer(
  episodesById: Map<string, PodcastEpisode>,
  {onMarkAsPlayed, podcastsCatalogReady, podcastsLoading}: UsePlayerOptions,
): UsePlayerResult {
  const {baseUri, localSettings, settings, playlistSyncGeneration} = useVaultContext();
  const player = useMemo(() => getAudioPlayer(), []);
  const baseUriRef = useRef<string | null>(null);
  const episodesByIdRef = useRef(episodesById);
  const onMarkAsPlayedRef = useRef(onMarkAsPlayed);
  const nearEndNonceHandledRef = useRef(0);
  const userPlaybackDepthRef = useRef(0);
  const loadedEpisodeIdRef = useRef<string | null>(null);
  /** One cold restore per vault; transient R2 null must not clear an already-hydrated episode. */
  const hasRestoredForBaseUriRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useLayoutEffect(() => {
    episodesByIdRef.current = episodesById;
  }, [episodesById]);
  useLayoutEffect(() => {
    onMarkAsPlayedRef.current = onMarkAsPlayed;
  }, [onMarkAsPlayed]);
  useLayoutEffect(() => {
    baseUriRef.current = baseUri ?? null;
  }, [baseUri]);

  useLayoutEffect(() => {
    hasRestoredForBaseUriRef.current = null;
  }, [baseUri]);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const deps = useMemo<PodcastPlayerDeps>(
    () => ({
      hasR2: () =>
        Boolean(
          baseUriRef.current &&
            isVaultR2PlaylistConfigured(
              settingsRef.current ?? defaultEskerraSettings,
            ),
        ),
      persist: async entry => {
        const uri = baseUriRef.current;
        if (!uri) {
          return {kind: 'skipped'};
        }
        return writePlaylist(uri, entry);
      },
      clearRemotePlaylist: async () => {
        const uri = baseUriRef.current;
        if (!uri) {
          return;
        }
        await clearPlaylist(uri);
      },
      markEpisodeListened: async (episodeId, dismissNowPlaying) => {
        const ep = episodesByIdRef.current.get(episodeId);
        if (!ep) {
          return;
        }
        await onMarkAsPlayedRef.current(ep, {dismissNowPlaying});
      },
    }),
    [],
  );

  const [snapshot, send] = useMachine(podcastPlayerMachine, {
    input: {deps},
  });

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const snapCtx = snapshot.context;
  const playbackSub = getPlaybackSubstate(snapshot);

  const activeEpisode =
    snapCtx.episode != null ? episodesById.get(snapCtx.episode.id) ?? null : null;

  useEffect(() => {
    if (!snapCtx.episode) {
      loadedEpisodeIdRef.current = null;
    }
  }, [snapCtx.episode]);

  const progress: PlayerProgress = useMemo(
    () => ({
      durationMs: snapCtx.durationMs,
      positionMs: snapCtx.positionMs,
    }),
    [snapCtx.durationMs, snapCtx.positionMs],
  );

  const state: PlayerState = snapCtx.native;

  useEffect(() => {
    if (!podcastsCatalogReady || podcastsLoading) {
      return;
    }
    if (episodesById.size === 0) {
      return;
    }
    const id = snapCtx.episode?.id;
    if (!id) {
      return;
    }
    if (!episodesById.has(id)) {
      send({type: 'RESET'});
    }
  }, [episodesById, podcastsCatalogReady, podcastsLoading, send, snapCtx.episode]);

  useEffect(() => {
    if (!baseUri) {
      send({type: 'RESET'});
      return;
    }

    let isMounted = true;

    const restore = async () => {
      try {
        if (!podcastsCatalogReady || podcastsLoading) {
          return;
        }
        if (hasRestoredForBaseUriRef.current === baseUri) {
          return;
        }
        if (snapshotRef.current.context.episode != null) {
          hasRestoredForBaseUriRef.current = baseUri;
          return;
        }

        const savedPromise = readPlaylistCoalesced(baseUri);
        const setupPromise = player.ensureSetup();

        const saved = await savedPromise;
        if (!isMounted) {
          return;
        }
        if (!saved) {
          await setupPromise;
          if (!isMounted) {
            return;
          }
          if (snapshotRef.current.context.episode == null) {
            send({type: 'RESET'});
            hasRestoredForBaseUriRef.current = baseUri;
          }
          return;
        }
        const catalogEp = episodesByIdRef.current.get(saved.episodeId);
        if (!catalogEp) {
          await setupPromise;
          if (!isMounted) {
            return;
          }
          try {
            await player.stop();
          } catch {
            // ignore stop errors during invalid-restore cleanup
          }
          await clearPlaylist(baseUri);
          send({type: 'RESET'});
          hasRestoredForBaseUriRef.current = baseUri;
          return;
        }
        if (catalogEp.isListened) {
          await setupPromise;
          if (!isMounted) {
            return;
          }
          try {
            await player.stop();
          } catch {
            // ignore stop errors during invalid-restore cleanup
          }
          await clearPlaylist(baseUri);
          send({type: 'RESET'});
          hasRestoredForBaseUriRef.current = baseUri;
          return;
        }
        send({
          type: 'HYDRATE',
          episode: toSnapshot(catalogEp),
          entry: saved,
          baseline: saved,
        });
        hasRestoredForBaseUriRef.current = baseUri;

        await setupPromise;
        if (!isMounted) {
          return;
        }
        const st = await player.getState();
        if (st === 'playing' || userPlaybackDepthRef.current > 0) {
          return;
        }
      } catch (restoreError) {
        if (!isMounted) {
          return;
        }
        setError(
          restoreError instanceof Error ? restoreError.message : 'Could not restore player state.',
        );
      }
    };

    restore().catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [baseUri, player, podcastsCatalogReady, podcastsLoading, send]);

  useEffect(() => {
    if (!baseUri || !podcastsCatalogReady || podcastsLoading) {
      return;
    }

    let cancelled = false;

    const syncRemotePlaylist = async () => {
      const ctx = snapshotRef.current.context;
      if (ctx.native === 'playing') {
        return;
      }
      try {
        const savedPromise = readPlaylistCoalesced(baseUri);
        const setupPromise = player.ensureSetup();

        await setupPromise;
        if (cancelled) {
          return;
        }
        const st = await player.getState();
        if (cancelled) {
          return;
        }
        if (st === 'playing' || userPlaybackDepthRef.current > 0) {
          return;
        }

        const saved = await savedPromise;
        if (cancelled) {
          return;
        }

        const currentCtx = snapshotRef.current.context;

        if (!saved) {
          // Another device cleared R2 `playlist.json`; skip while we are in our own near-end flow.
          if (currentCtx.inNearEndZone) {
            return;
          }
          send({type: 'RESET'});
          return;
        }

        const catalogEp = episodesByIdRef.current.get(saved.episodeId);
        if (!catalogEp || catalogEp.isListened) {
          try {
            await player.stop();
          } catch {
            // ignore stop errors during invalid-remote cleanup
          }
          await clearPlaylist(baseUri);
          send({type: 'RESET'});
          return;
        }

        const snapEpId = currentCtx.episode?.id;
        if (saved.episodeId === snapEpId) {
          send({
            type: 'HYDRATE',
            episode: toSnapshot(catalogEp),
            entry: saved,
            baseline: saved,
          });
          return;
        }

        if (!snapEpId) {
          send({
            type: 'HYDRATE',
            episode: toSnapshot(catalogEp),
            entry: saved,
            baseline: saved,
          });
          return;
        }

        send({type: 'RESET'});
        send({
          type: 'HYDRATE',
          episode: toSnapshot(catalogEp),
          entry: saved,
          baseline: saved,
        });
      } catch (syncError) {
        if (!cancelled) {
          setError(
            syncError instanceof Error ? syncError.message : 'Could not sync playlist from remote.',
          );
        }
      }
    };

    syncRemotePlaylist().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [baseUri, playlistSyncGeneration, podcastsCatalogReady, podcastsLoading, player, send]);

  useEffect(() => {
    if (snapCtx.nearEndResyncNonce === nearEndNonceHandledRef.current) {
      return;
    }
    if (snapCtx.inNearEndZone || !snapCtx.episode || !baseUri) {
      nearEndNonceHandledRef.current = snapCtx.nearEndResyncNonce;
      return;
    }
    const deviceId = localSettings?.deviceInstanceId?.trim() ?? '';
    if (!deviceId) {
      nearEndNonceHandledRef.current = snapCtx.nearEndResyncNonce;
      return;
    }
    const ep = episodesById.get(snapCtx.episode.id);
    if (!ep) {
      nearEndNonceHandledRef.current = snapCtx.nearEndResyncNonce;
      return;
    }
    nearEndNonceHandledRef.current = snapCtx.nearEndResyncNonce;
    const ctx = snapshotRef.current.context;
    const base: PlaylistEntry =
      ctx.playlistBaseline?.episodeId === ep.id
        ? ctx.playlistBaseline
        : {
            durationMs: ctx.durationMs,
            episodeId: ep.id,
            mp3Url: ep.mp3Url,
            positionMs: 0,
            updatedAt: 0,
            playbackOwnerId: '',
            controlRevision: 0,
          };
    const entry = buildPlaylistEntryForWrite(
      base,
      {
        durationMs: ctx.durationMs,
        episodeId: ep.id,
        mp3Url: ep.mp3Url,
        positionMs: ctx.positionMs,
      },
      deviceId,
      Date.now(),
    );
    send({type: 'QUEUE_PERSIST', entry});
  }, [
    baseUri,
    episodesById,
    localSettings?.deviceInstanceId,
    send,
    snapCtx.episode,
    snapCtx.durationMs,
    snapCtx.inNearEndZone,
    snapCtx.nearEndResyncNonce,
    snapCtx.positionMs,
  ]);

  useEffect(() => {
    const removeProgressListener = player.addProgressListener(nextProgress => {
      send({
        type: 'PROGRESS',
        positionMs: nextProgress.positionMs,
        durationMs: nextProgress.durationMs,
      });
    });
    const removeStateListener = player.addStateListener(nextState => {
      const sub = getPlaybackSubstate(snapshotRef.current);
      if (sub === 'primed' && nextState === 'idle') {
        return;
      }
      send({type: 'NATIVE', state: nextState});
    });
    const removeEndedListener = player.addEndedListener(() => {
      send({type: 'NATIVE', state: 'ended'});
    });

    return () => {
      removeProgressListener();
      removeStateListener();
      removeEndedListener();
    };
  }, [player, send]);

  useEffect(() => {
    if (!baseUri) {
      send({type: 'RESET'});
      setError(null);
      return;
    }
  }, [baseUri, send]);

  const queuePersist = useCallback(
    (episode: PodcastEpisode, positionMs: number, durationMs: number | null) => {
      const uri = baseUriRef.current;
      const deviceId = localSettings?.deviceInstanceId?.trim() ?? '';
      if (!uri || !deviceId) {
        return;
      }
      const ctx = snapshotRef.current.context;
      const base: PlaylistEntry =
        ctx.playlistBaseline?.episodeId === episode.id
          ? ctx.playlistBaseline
          : {
              durationMs,
              episodeId: episode.id,
              mp3Url: episode.mp3Url,
              positionMs: 0,
              updatedAt: 0,
              playbackOwnerId: '',
              controlRevision: 0,
            };
      const entry = buildPlaylistEntryForWrite(
        base,
        {
          durationMs,
          episodeId: episode.id,
          mp3Url: episode.mp3Url,
          positionMs,
        },
        deviceId,
        Date.now(),
      );
      send({type: 'QUEUE_PERSIST', entry});
    },
    [localSettings?.deviceInstanceId, send],
  );

  const playEpisode = useCallback(
    async (episode: PodcastEpisode) => {
      setError(null);
      setIsLoading(true);
      userPlaybackDepthRef.current += 1;
      try {
        const stEarly = await player.getState();
        if (stEarly === 'playing' && loadedEpisodeIdRef.current === episode.id) {
          return;
        }
        const ctx = snapshotRef.current.context;
        const uri = baseUriRef.current;
        const deviceId = localSettings?.deviceInstanceId?.trim() ?? '';

        let startPositionMs = 0;
        let prior: PlaylistEntry | null = null;
        if (uri) {
          prior = await readPlaylistCoalesced(uri);
          if (prior?.episodeId === episode.id) {
            startPositionMs = prior.positionMs;
          }
        }
        if (ctx.episode != null && ctx.episode.id !== episode.id) {
          startPositionMs = 0;
        }

        let artwork: string | undefined;
        if (uri && episode.rssFeedUrl) {
          artwork = (await getCachedPodcastArtworkUri(uri, episode.rssFeedUrl)) ?? undefined;
          warmPodcastArtworkCache(uri, episode.rssFeedUrl);
        }

        send({
          type: 'EPISODE_PLAY',
          episode: toSnapshot(episode),
          baseline: ctx.playlistBaseline,
        });

        if (deviceId && uri) {
          const base: PlaylistEntry =
            prior?.episodeId === episode.id
              ? prior
              : {
                  durationMs: null,
                  episodeId: episode.id,
                  mp3Url: episode.mp3Url,
                  positionMs: 0,
                  updatedAt: 0,
                  playbackOwnerId: '',
                  controlRevision: 0,
                };
          const entry = buildPlaylistEntryForWrite(
            base,
            {
              durationMs: null,
              episodeId: episode.id,
              mp3Url: episode.mp3Url,
              positionMs: startPositionMs,
            },
            deviceId,
            Date.now(),
          );
          send({type: 'QUEUE_PERSIST', entry});
        } else if (uri && !deviceId) {
          setError('Device id missing from local settings.');
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
      } catch (playError) {
        setError(playError instanceof Error ? playError.message : 'Could not start playback.');
        send({type: 'ERROR', message: playError instanceof Error ? playError.message : String(playError)});
      } finally {
        setIsLoading(false);
        userPlaybackDepthRef.current -= 1;
      }
    },
    [localSettings?.deviceInstanceId, player, send],
  );

  const playEpisodeRef = useRef(playEpisode);
  playEpisodeRef.current = playEpisode;

  const togglePlayback = useCallback(async () => {
    const epSnap = snapshotRef.current.context.episode;
    if (!epSnap) {
      return;
    }
    const ep = episodesByIdRef.current.get(epSnap.id);
    if (!ep) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const st = await player.getState();
      if (st === 'playing') {
        await player.pause();
        const latestProgress = await player.getProgress();
        send({
          type: 'PROGRESS',
          positionMs: latestProgress.positionMs,
          durationMs: latestProgress.durationMs,
        });
        send({type: 'NATIVE', state: 'paused'});

        const uri = baseUriRef.current;
        if (!uri) {
          return;
        }
        const deviceId = localSettings?.deviceInstanceId?.trim() ?? '';
        if (!deviceId) {
          setError('Device id missing from local settings.');
          return;
        }
        if (latestProgress.positionMs < MIN_PROGRESS_MS) {
          await clearPlaylist(uri);
          return;
        }
        queuePersist(ep, latestProgress.positionMs, latestProgress.durationMs);
        return;
      }

      if (loadedEpisodeIdRef.current !== ep.id) {
        await playEpisodeRef.current(ep);
        return;
      }

      await player.resume();
      const resumeProgress = await player.getProgress();
      send({
        type: 'PROGRESS',
        positionMs: resumeProgress.positionMs,
        durationMs: resumeProgress.durationMs,
      });
      send({type: 'NATIVE', state: await player.getState()});

      const uriResume = baseUriRef.current;
      const deviceIdResume = localSettings?.deviceInstanceId?.trim() ?? '';
      if (uriResume && deviceIdResume) {
        queuePersist(ep, resumeProgress.positionMs, resumeProgress.durationMs);
      } else if (uriResume && !deviceIdResume) {
        setError('Device id missing from local settings.');
      }
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Could not change playback state.');
    } finally {
      setIsLoading(false);
    }
  }, [localSettings?.deviceInstanceId, player, queuePersist, send]);

  const seekTo = useCallback(
    async (positionMs: number) => {
      const epSnap = snapshotRef.current.context.episode;
      const ep = epSnap ? episodesByIdRef.current.get(epSnap.id) ?? null : null;
      if (!ep) {
        return;
      }
      send({type: 'SEEK_START'});
      try {
        await player.seekTo(positionMs);
        const nextProgress = await player.getProgress();
        send({
          type: 'PROGRESS',
          positionMs: nextProgress.positionMs,
          durationMs: nextProgress.durationMs,
        });
        const uri = baseUriRef.current;
        const deviceId = localSettings?.deviceInstanceId?.trim() ?? '';
        if (uri && deviceId) {
          queuePersist(ep, nextProgress.positionMs, nextProgress.durationMs);
        }
      } finally {
        send({type: 'SEEK_END'});
      }
    },
    [localSettings?.deviceInstanceId, player, queuePersist, send],
  );

  const clearNowPlayingIfMatchesEpisode = useCallback(
    async (episodeId: string) => {
      const matches = snapshotRef.current.context.episode?.id === episodeId;
      if (!matches) {
        return;
      }
      send({type: 'RESET'});
      const uri = baseUriRef.current;
      if (!uri) {
        return;
      }
      try {
        await player.stop();
        await clearPlaylist(uri);
      } catch (cleanupError) {
        setError(
          cleanupError instanceof Error ? cleanupError.message : 'Could not clear playlist after marking as played.',
        );
      }
    },
    [player, send],
  );

  const resyncPlaylistFromDisk = useCallback(async () => {
    const uri = baseUriRef.current;
    if (!uri) {
      send({type: 'RESET'});
      return;
    }
    try {
      const savedPromise = readPlaylistCoalesced(uri);
      const setupPromise = player.ensureSetup();
      const saved = await savedPromise;
      if (!saved) {
        await setupPromise;
        send({type: 'RESET'});
        return;
      }
      const catalogEp = episodesByIdRef.current.get(saved.episodeId);
      if (!catalogEp || catalogEp.isListened) {
        await setupPromise;
        try {
          await player.stop();
        } catch {
          // ignore stop errors during invalid-resync cleanup
        }
        await clearPlaylist(uri);
        send({type: 'RESET'});
        return;
      }
      send({
        type: 'HYDRATE',
        episode: toSnapshot(catalogEp),
        entry: saved,
        baseline: saved,
      });
      await setupPromise;
    } catch (resyncError) {
      setError(resyncError instanceof Error ? resyncError.message : 'Could not restore player state.');
    }
  }, [player, send]);

  const playbackTransportBusy =
    isLoading || (snapCtx.native === 'loading' && !snapCtx.seeking);

  return {
    activeEpisode,
    clearNowPlayingIfMatchesEpisode,
    error,
    isLoading,
    playbackPhase: playbackSub,
    playbackSeeking: snapCtx.seeking,
    playbackTransportBusy,
    playEpisode,
    progress,
    resyncPlaylistFromDisk,
    seekTo,
    state,
    togglePlayback,
  };
}
