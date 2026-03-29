import type {PlayerState, PlaylistEntry, VaultFilesystem} from '@notebox/core';
import {useCallback, useEffect, useRef, useState} from 'react';

import {getDesktopAudioPlayer, isAbortError} from '../lib/htmlAudioPlayer';
import type {PodcastEpisode} from '../lib/podcasts/podcastTypes';
import {
  clearPlaylistEntry,
  readPlaylistEntry,
  writePlaylistEntry,
} from '../lib/vaultBootstrap';

export type DesktopPlayerLabel = 'idle' | 'paused' | 'playing' | 'loading';

export type UseDesktopPodcastPlaybackOptions = {
  vaultRoot: string | null;
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
  const prevPlayerStateRef = useRef<PlayerState | null>(null);
  const lastPrimedPlaylistKeyRef = useRef<string | null>(null);

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
      if (prev !== 'playing' && s === 'playing') {
        onAutoShowPlayerDock?.();
      }
      if (s === 'playing') {
        setPlayerLabel('playing');
      } else if (s === 'paused') {
        setPlayerLabel('paused');
      } else if (s === 'loading') {
        setPlayerLabel('loading');
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
    if (!vaultRoot) {
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
      void writePlaylistEntry(vaultRoot, fs, {
        durationMs: p.durationMs,
        episodeId: s.episodeId,
        mp3Url: s.mp3Url,
        positionMs: p.positionMs,
        updatedAt: 0,
      })
        .then(wr => {
          if (wr.kind === 'superseded') {
            setDiskPlaylist(wr.entry);
            onPlaylistDiskUpdated?.();
          }
        })
        .catch(() => undefined);
    });
    return () => {
      unsubProg();
    };
  }, [vaultRoot, fs, onPlaylistDiskUpdated]);

  useEffect(() => {
    if (!vaultRoot || !consumeCatalogReady || !diskPlaylist) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const pl = diskPlaylist;
      const byId = new Map(consumeEpisodes.map(e => [e.id, e]));
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

      const st = await getDesktopAudioPlayer().getState();
      if (cancelled) {
        return;
      }
      if (st === 'playing' || st === 'loading') {
        return;
      }

      try {
        await getDesktopAudioPlayer().primePausedAt(
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
      } catch {
        try {
          await getDesktopAudioPlayer().stop();
          await clearPlaylistEntry(vaultRoot, fs);
          if (!cancelled) {
            setDiskPlaylist(null);
            setActiveEpisode(null);
            playbackRef.current = null;
            lastPrimedPlaylistKeyRef.current = null;
            onPlaylistDiskUpdated?.();
          }
        } catch {
          /* ignore */
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
    consumeEpisodes,
    consumeCatalogReady,
    onPlaylistDiskUpdated,
  ]);

  const playEpisode = useCallback(
    async (ep: PodcastEpisode) => {
      if (!vaultRoot) {
        return;
      }
      lastPrimedPlaylistKeyRef.current = null;
      onAutoShowPlayerDock?.();
      onError(null);
      setActiveEpisode(ep);
      playbackRef.current = {episodeId: ep.id, mp3Url: ep.mp3Url};
      let startPositionMs = 0;
      try {
        const prior = await readPlaylistEntry(vaultRoot, fs);
        if (prior?.episodeId === ep.id) {
          startPositionMs = prior.positionMs;
        }
      } catch {
        /* same as missing playlist */
      }
      try {
        const wr = await writePlaylistEntry(vaultRoot, fs, {
          durationMs: null,
          episodeId: ep.id,
          mp3Url: ep.mp3Url,
          positionMs: startPositionMs,
          updatedAt: 0,
        });
        if (wr.kind === 'superseded') {
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
          startPositionMs > 0 ? startPositionMs : undefined,
        );
      } catch (e) {
        if (isAbortError(e)) {
          return;
        }
        onError(e instanceof Error ? e.message : String(e));
      }
    },
    [vaultRoot, fs, onAutoShowPlayerDock, onError, onPlaylistDiskUpdated],
  );

  const resumeFromVault = useCallback(async () => {
    if (!vaultRoot) {
      return;
    }
    if (!consumeCatalogReady) {
      onError('Podcast catalog is still loading.');
      return;
    }
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
      const wr = await writePlaylistEntry(vaultRoot, fs, {
        durationMs: pl.durationMs,
        episodeId: catalogEp.id,
        mp3Url: catalogEp.mp3Url,
        positionMs: pl.positionMs,
        updatedAt: pl.updatedAt,
      });
      if (wr.kind === 'superseded') {
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
  }, [
    vaultRoot,
    fs,
    consumeCatalogReady,
    consumeEpisodes,
    onAutoShowPlayerDock,
    onError,
    onPlaylistDiskUpdated,
  ]);

  const togglePause = useCallback(async () => {
    const p = getDesktopAudioPlayer();
    const st = await p.getState();
    if (st === 'playing') {
      await p.pause();
    } else if (st === 'paused' || st === 'ended') {
      await p.resume();
    }
  }, []);

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
