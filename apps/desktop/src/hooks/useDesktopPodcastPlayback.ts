import {
  buildPlaylistEntryForWrite,
  MIN_PLAYLIST_PERSIST_POSITION_MS,
  type PlayerState,
  type PlaylistEntry,
  type VaultFilesystem,
} from '@notebox/core';
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';

import {getDesktopAudioPlayer, isAbortError} from '../lib/htmlAudioPlayer';
import type {PodcastEpisode} from '../lib/podcasts/podcastTypes';
import {
  clearPlaylistEntry,
  readPlaylistEntry,
  writePlaylistEntry,
} from '../lib/vaultBootstrap';

export type DesktopPlayerLabel =
  | 'ended'
  | 'error'
  | 'idle'
  | 'paused'
  | 'playing'
  | 'loading';

export type UseDesktopPodcastPlaybackOptions = {
  vaultRoot: string | null;
  /** From `.notebox/settings-local.json`; used as `playbackOwnerId` for control writes. */
  deviceInstanceId: string;
  fs: VaultFilesystem;
  onError: (msg: string | null) => void;
  onAutoShowPlayerDock?: () => void;
  onPlaylistDiskUpdated?: () => void;
  playlistRevision: number;
  /** Flat episode list from the podcasts catalog (Episodes tab). */
  consumeEpisodes: PodcastEpisode[];
  /**
   * True when the Episodes tab is mounted and its latest refresh has finished (`!loading`),
   * so `consumeEpisodes` can be trusted for playlist reconciliation.
   */
  consumeCatalogReady: boolean;
};

export type UseDesktopPodcastPlaybackResult = {
  activeEpisode: PodcastEpisode | null;
  playerLabel: DesktopPlayerLabel;
  positionMs: number;
  durationMs: number | null;
  playEpisode: (ep: PodcastEpisode) => Promise<void>;
  resumeFromVault: () => Promise<void>;
  togglePause: () => Promise<void>;
};

export function useDesktopPodcastPlayback({
  vaultRoot,
  deviceInstanceId,
  fs,
  onError,
  onAutoShowPlayerDock,
  onPlaylistDiskUpdated,
  playlistRevision,
  consumeEpisodes,
  consumeCatalogReady,
}: UseDesktopPodcastPlaybackOptions): UseDesktopPodcastPlaybackResult {
  const [activeEpisode, setActiveEpisode] = useState<PodcastEpisode | null>(null);
  const [diskPlaylist, setDiskPlaylist] = useState<PlaylistEntry | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [playerLabel, setPlayerLabel] = useState<DesktopPlayerLabel>('idle');

  const playbackRef = useRef<{episodeId: string; mp3Url: string} | null>(null);
  const diskPlaylistRef = useRef<PlaylistEntry | null>(null);
  const prevPlayerStateRef = useRef<PlayerState | null>(null);
  const lastPrimedPlaylistKeyRef = useRef<string | null>(null);
  /** Catalog list identity changes every parent render; priming only needs latest rows for lookup. */
  const consumeEpisodesRef = useRef(consumeEpisodes);
  useLayoutEffect(() => {
    consumeEpisodesRef.current = consumeEpisodes;
  });

  const activeEpisodeRef = useRef<PodcastEpisode | null>(null);
  useLayoutEffect(() => {
    activeEpisodeRef.current = activeEpisode;
  });

  /** Skip vault priming while `playEpisode` / `resumeFromVault` owns the HTML audio element. */
  const userPlaybackDepthRef = useRef(0);

  useEffect(() => {
    diskPlaylistRef.current = diskPlaylist;
  }, [diskPlaylist]);

  useEffect(() => {
    lastPrimedPlaylistKeyRef.current = null;
  }, [vaultRoot]);

  useEffect(() => {
    let cancelled = false;
    if (!vaultRoot) {
      queueMicrotask(() => {
        if (!cancelled) {
          setDiskPlaylist(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    void readPlaylistEntry(vaultRoot, fs)
      .then(pl => {
        if (!cancelled) {
          setDiskPlaylist(pl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDiskPlaylist(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [vaultRoot, fs, playlistRevision]);

  useEffect(() => {
    const player = getDesktopAudioPlayer();
    let cancelled = false;
    void player.getState().then(s => {
      if (!cancelled) {
        prevPlayerStateRef.current = s;
      }
    });
    const unsub = player.addStateListener(s => {
      const prev = prevPlayerStateRef.current;
      prevPlayerStateRef.current = s;
      if (s === 'error') {
        lastPrimedPlaylistKeyRef.current = null;
      }
      if (prev !== 'playing' && s === 'playing') {
        onAutoShowPlayerDock?.();
      }
      if (s === 'playing') {
        setPlayerLabel('playing');
      } else if (s === 'paused') {
        setPlayerLabel('paused');
      } else if (s === 'loading') {
        setPlayerLabel('loading');
      } else if (s === 'ended') {
        setPlayerLabel('ended');
      } else if (s === 'error') {
        setPlayerLabel('error');
      } else {
        setPlayerLabel('idle');
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [onAutoShowPlayerDock]);

  useEffect(() => {
    if (!vaultRoot || !deviceInstanceId) {
      return;
    }
    const player = getDesktopAudioPlayer();
    const unsubProg = player.addProgressListener(p => {
      setPositionMs(p.positionMs);
      setDurationMs(p.durationMs);
      const s = playbackRef.current;
      if (!s?.mp3Url) {
        return;
      }
      const pl = diskPlaylistRef.current;
      if (!pl || pl.episodeId !== s.episodeId) {
        return;
      }
      const entry = buildPlaylistEntryForWrite(
        pl,
        {durationMs: p.durationMs, positionMs: p.positionMs},
        deviceInstanceId,
        'progress',
        Date.now(),
      );
      void writePlaylistEntry(vaultRoot, fs, entry, {mode: 'progress'})
        .then(wr => {
          if (wr.kind === 'superseded') {
            setDiskPlaylist(wr.entry);
            onPlaylistDiskUpdated?.();
          } else if (wr.kind === 'saved') {
            setDiskPlaylist(wr.entry);
          }
        })
        .catch(() => undefined);
    });
    return () => {
      unsubProg();
    };
  }, [vaultRoot, fs, onPlaylistDiskUpdated, deviceInstanceId]);

  useEffect(() => {
    if (!vaultRoot || !consumeCatalogReady || !diskPlaylist) {
      return;
    }

    let cancelled = false;

    void (async () => {
      if (userPlaybackDepthRef.current > 0) {
        return;
      }
      const pl = diskPlaylist;
      const byId = new Map(consumeEpisodesRef.current.map(e => [e.id, e]));
      const catalogEp = byId.get(pl.episodeId);
      const missing = !catalogEp;
      const listened = Boolean(catalogEp?.isListened);

      if (missing || listened) {
        try {
          await getDesktopAudioPlayer().stop();
          await clearPlaylistEntry(vaultRoot, fs);
          if (cancelled) {
            return;
          }
          setDiskPlaylist(null);
          setActiveEpisode(null);
          playbackRef.current = null;
          setPositionMs(0);
          setDurationMs(null);
          lastPrimedPlaylistKeyRef.current = null;
          onPlaylistDiskUpdated?.();
        } catch {
          /* ignore */
        }
        return;
      }

      const trackUrl = catalogEp.mp3Url;
      const key = `${catalogEp.id}:${pl.positionMs}:${trackUrl}`;
      if (key === lastPrimedPlaylistKeyRef.current) {
        return;
      }

      const player = getDesktopAudioPlayer();
      let st = await player.getState();
      if (cancelled) {
        return;
      }

      if (st === 'playing') {
        const currentId = player.getCurrentTrackEpisodeId();
        if (currentId === pl.episodeId) {
          lastPrimedPlaylistKeyRef.current = key;
          setActiveEpisode(catalogEp);
          playbackRef.current = {episodeId: catalogEp.id, mp3Url: trackUrl};
          return;
        }
        await player.stop();
        st = await player.getState();
      } else if (st === 'loading') {
        const loadingEpisodeId = player.getCurrentTrackEpisodeId();
        if (loadingEpisodeId === pl.episodeId) {
          lastPrimedPlaylistKeyRef.current = key;
          return;
        }
        if (loadingEpisodeId != null && loadingEpisodeId !== pl.episodeId) {
          await player.stop();
          st = await player.getState();
        }
      }

      if (cancelled) {
        return;
      }

      if (st === 'paused' || st === 'ended') {
        const currentId = player.getCurrentTrackEpisodeId();
        const loaded = player.getLoadedTrack();
        if (
          currentId === pl.episodeId &&
          loaded != null &&
          loaded.url === trackUrl
        ) {
          await player.seekTo(pl.positionMs);
          if (cancelled) {
            return;
          }
          lastPrimedPlaylistKeyRef.current = key;
          setActiveEpisode(catalogEp);
          playbackRef.current = {episodeId: catalogEp.id, mp3Url: trackUrl};
          return;
        }
      }

      if (cancelled) {
        return;
      }

      try {
        await player.primePausedAt(
          {
            artist: catalogEp.seriesName,
            id: catalogEp.id,
            title: catalogEp.title,
            url: trackUrl,
          },
          pl.positionMs,
        );
        if (cancelled) {
          return;
        }
        lastPrimedPlaylistKeyRef.current = key;
        setActiveEpisode(catalogEp);
        playbackRef.current = {episodeId: catalogEp.id, mp3Url: trackUrl};
      } catch (e) {
        try {
          await getDesktopAudioPlayer().stop();
        } catch {
          /* ignore */
        }
        if (!cancelled) {
          onError(
            e instanceof Error
              ? e.message
              : 'Could not load episode audio for resume preview.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    vaultRoot,
    fs,
    diskPlaylist,
    consumeCatalogReady,
    onPlaylistDiskUpdated,
    onError,
  ]);

  const playEpisode = useCallback(
    async (ep: PodcastEpisode) => {
      if (!vaultRoot || !deviceInstanceId) {
        return;
      }
      userPlaybackDepthRef.current += 1;
      try {
      const switchingFromAnother =
        activeEpisodeRef.current != null &&
        activeEpisodeRef.current.id !== ep.id;

      const player = getDesktopAudioPlayer();
      const st = await player.getState();
      const loadedId = player.getCurrentTrackEpisodeId();
      const loadedTrack = player.getLoadedTrack();
      const sameLoadedEp =
        loadedId === ep.id &&
        loadedTrack != null &&
        loadedTrack.url === ep.mp3Url;

      if (st === 'playing' && sameLoadedEp) {
        return;
      }

      if (!sameLoadedEp) {
        await player.stop();
      }

      lastPrimedPlaylistKeyRef.current = null;
      onAutoShowPlayerDock?.();
      onError(null);
      setPositionMs(0);
      setDurationMs(null);
      setActiveEpisode(ep);
      playbackRef.current = {episodeId: ep.id, mp3Url: ep.mp3Url};
      let startPositionMs = 0;
      let prior: PlaylistEntry | null = null;
      try {
        prior = await readPlaylistEntry(vaultRoot, fs);
        if (prior?.episodeId === ep.id) {
          startPositionMs = prior.positionMs;
        }
      } catch {
        /* same as missing playlist */
      }
      if (switchingFromAnother) {
        startPositionMs = 0;
      }
      try {
        const base: PlaylistEntry =
          prior?.episodeId === ep.id
            ? prior
            : {
                durationMs: null,
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
            durationMs: null,
            episodeId: ep.id,
            mp3Url: ep.mp3Url,
            positionMs: startPositionMs,
          },
          deviceInstanceId,
          'control',
          Date.now(),
        );
        const wr = await writePlaylistEntry(vaultRoot, fs, entry, {mode: 'control'});
        if (wr.kind === 'superseded') {
          setDiskPlaylist(wr.entry);
        } else if (wr.kind === 'saved') {
          setDiskPlaylist(wr.entry);
        }
        onPlaylistDiskUpdated?.();
        await getDesktopAudioPlayer().play(
          {
            artist: ep.seriesName,
            id: ep.id,
            title: ep.title,
            url: ep.mp3Url,
          },
          startPositionMs,
        );
      } catch (e) {
        if (isAbortError(e)) {
          return;
        }
        onError(e instanceof Error ? e.message : String(e));
      }
      } finally {
        userPlaybackDepthRef.current -= 1;
      }
    },
    [vaultRoot, deviceInstanceId, fs, onAutoShowPlayerDock, onError, onPlaylistDiskUpdated],
  );

  const resumeFromVault = useCallback(async () => {
    if (!vaultRoot || !deviceInstanceId) {
      return;
    }
    if (!consumeCatalogReady) {
      onError('Podcast catalog is still loading.');
      return;
    }
    userPlaybackDepthRef.current += 1;
    try {
    lastPrimedPlaylistKeyRef.current = null;
    onAutoShowPlayerDock?.();
    onError(null);
    try {
      const pl = await readPlaylistEntry(vaultRoot, fs);
      if (!pl) {
        onError('No playlist entry in vault.');
        return;
      }
      const catalogEp = consumeEpisodes.find(e => e.id === pl.episodeId);
      if (!catalogEp) {
        onError('Episode is no longer in the catalog.');
        await getDesktopAudioPlayer().stop();
        await clearPlaylistEntry(vaultRoot, fs);
        setDiskPlaylist(null);
        setActiveEpisode(null);
        playbackRef.current = null;
        onPlaylistDiskUpdated?.();
        return;
      }
      if (catalogEp.isListened) {
        onError('Episode is already marked as listened.');
        await getDesktopAudioPlayer().stop();
        await clearPlaylistEntry(vaultRoot, fs);
        setDiskPlaylist(null);
        setActiveEpisode(null);
        playbackRef.current = null;
        onPlaylistDiskUpdated?.();
        return;
      }
      playbackRef.current = {episodeId: catalogEp.id, mp3Url: catalogEp.mp3Url};
      setActiveEpisode(catalogEp);
      const entry = buildPlaylistEntryForWrite(
        pl,
        {
          durationMs: pl.durationMs,
          episodeId: catalogEp.id,
          mp3Url: catalogEp.mp3Url,
          positionMs: pl.positionMs,
        },
        deviceInstanceId,
        'control',
        Date.now(),
      );
      const wr = await writePlaylistEntry(vaultRoot, fs, entry, {mode: 'control'});
      if (wr.kind === 'superseded') {
        setDiskPlaylist(wr.entry);
      } else if (wr.kind === 'saved') {
        setDiskPlaylist(wr.entry);
      }
      onPlaylistDiskUpdated?.();
      await getDesktopAudioPlayer().play(
        {
          artist: catalogEp.seriesName,
          id: catalogEp.id,
          title: catalogEp.title,
          url: catalogEp.mp3Url,
        },
        pl.positionMs,
      );
    } catch (e) {
      if (isAbortError(e)) {
        return;
      }
      onError(e instanceof Error ? e.message : String(e));
    }
    } finally {
      userPlaybackDepthRef.current -= 1;
    }
  }, [
    vaultRoot,
    fs,
    consumeCatalogReady,
    consumeEpisodes,
    onAutoShowPlayerDock,
    onError,
    deviceInstanceId,
    onPlaylistDiskUpdated,
  ]);

  const togglePause = useCallback(async () => {
    const p = getDesktopAudioPlayer();
    const st = await p.getState();
    if (st === 'playing') {
      await p.pause();
      const latestProgress = await p.getProgress();
      setPositionMs(latestProgress.positionMs);
      setDurationMs(latestProgress.durationMs);

      if (!vaultRoot) {
        return;
      }
      const deviceId = deviceInstanceId.trim();
      if (!deviceId) {
        onError('Device id missing from local settings.');
        return;
      }
      const active = activeEpisode;
      if (!active) {
        return;
      }

      try {
        if (latestProgress.positionMs < MIN_PLAYLIST_PERSIST_POSITION_MS) {
          await clearPlaylistEntry(vaultRoot, fs);
          setDiskPlaylist(null);
          setActiveEpisode(null);
          playbackRef.current = null;
          setPositionMs(0);
          setDurationMs(null);
          lastPrimedPlaylistKeyRef.current = null;
          onPlaylistDiskUpdated?.();
          return;
        }

        const prior = diskPlaylistRef.current;
        const base: PlaylistEntry =
          prior?.episodeId === active.id
            ? prior
            : {
                durationMs: latestProgress.durationMs,
                episodeId: active.id,
                mp3Url: active.mp3Url,
                positionMs: 0,
                updatedAt: 0,
                playbackOwnerId: '',
                controlRevision: 0,
              };
        const entry = buildPlaylistEntryForWrite(
          base,
          {
            durationMs: latestProgress.durationMs,
            episodeId: active.id,
            mp3Url: active.mp3Url,
            positionMs: latestProgress.positionMs,
          },
          deviceId,
          'control',
          Date.now(),
        );
        const wr = await writePlaylistEntry(vaultRoot, fs, entry, {
          mode: 'control',
        });
        if (wr.kind === 'superseded') {
          setDiskPlaylist(wr.entry);
          onPlaylistDiskUpdated?.();
        } else if (wr.kind === 'saved') {
          setDiskPlaylist(wr.entry);
          onPlaylistDiskUpdated?.();
        }
      } catch (e) {
        onError(
          e instanceof Error ? e.message : 'Could not save playback position.',
        );
      }
    } else if (
      st === 'paused' ||
      st === 'ended' ||
      st === 'loading' ||
      st === 'error'
    ) {
      // HTML5 audio reports `loading` until `readyState >= HAVE_FUTURE_DATA`; the dock only
      // calls this handler, so omitting `loading` left Play inert during long buffers.
      await p.resume();
      const resumeProgress = await p.getProgress();
      setPositionMs(resumeProgress.positionMs);
      setDurationMs(resumeProgress.durationMs);

      if (!vaultRoot) {
        return;
      }
      const resumeDeviceId = deviceInstanceId.trim();
      if (!resumeDeviceId) {
        onError('Device id missing from local settings.');
        return;
      }
      const resumeActive = activeEpisode;
      if (!resumeActive) {
        return;
      }

      try {
        const priorResume = diskPlaylistRef.current;
        const baseResume: PlaylistEntry =
          priorResume?.episodeId === resumeActive.id
            ? priorResume
            : {
                durationMs: resumeProgress.durationMs,
                episodeId: resumeActive.id,
                mp3Url: resumeActive.mp3Url,
                positionMs: 0,
                updatedAt: 0,
                playbackOwnerId: '',
                controlRevision: 0,
              };
        const resumeEntry = buildPlaylistEntryForWrite(
          baseResume,
          {
            durationMs: resumeProgress.durationMs,
            episodeId: resumeActive.id,
            mp3Url: resumeActive.mp3Url,
            positionMs: resumeProgress.positionMs,
          },
          resumeDeviceId,
          'control',
          Date.now(),
        );
        const resumeWr = await writePlaylistEntry(vaultRoot, fs, resumeEntry, {
          mode: 'control',
        });
        if (resumeWr.kind === 'superseded') {
          setDiskPlaylist(resumeWr.entry);
          onPlaylistDiskUpdated?.();
        } else if (resumeWr.kind === 'saved') {
          setDiskPlaylist(resumeWr.entry);
          onPlaylistDiskUpdated?.();
        }
      } catch (e) {
        onError(
          e instanceof Error ? e.message : 'Could not save playback position.',
        );
      }
    }
  }, [
    activeEpisode,
    deviceInstanceId,
    fs,
    onError,
    onPlaylistDiskUpdated,
    vaultRoot,
  ]);

  return {
    activeEpisode,
    durationMs,
    playEpisode,
    playerLabel,
    positionMs,
    resumeFromVault,
    togglePause,
  };
}
