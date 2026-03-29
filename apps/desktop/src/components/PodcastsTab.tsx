import {useCallback, useEffect, useRef, useState} from 'react';
import {Group, Panel, Separator} from 'react-resizable-panels';
import type {Layout} from 'react-resizable-panels';
import type {VaultFilesystem} from '@notebox/core';
import type {PlaylistEntry} from '@notebox/core';

import {getDesktopAudioPlayer, isAbortError} from '../lib/htmlAudioPlayer';
import {runPodcastPhase1Desktop} from '../lib/podcasts/podcastPhase1Desktop';
import type {PodcastEpisode, PodcastSection} from '../lib/podcasts/podcastTypes';
import {readPlaylistEntry, writePlaylistEntry} from '../lib/vaultBootstrap';
import {useDeferredLoadingIndicator} from '../hooks/useDeferredLoadingIndicator';

type PodcastsTabProps = {
  vaultRoot: string;
  fs: VaultFilesystem;
  displayName: string;
  defaultMainLayout: Layout;
  onMainLayoutChanged: (layout: Layout) => void;
  onError: (msg: string | null) => void;
  /** Increments when the filesystem watcher reports changes; triggers a rescan. */
  fsRefreshNonce: number;
};

function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) {
    return '—';
  }
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Strip markdown bold markers from list labels (feeds sometimes include `**…**`, which looks like uneven bolding). */
function episodeListLabel(text: string): string {
  return text.replaceAll('**', '').trim();
}

export function PodcastsTab({
  vaultRoot,
  fs,
  displayName,
  defaultMainLayout,
  onMainLayoutChanged,
  onError,
  fsRefreshNonce,
}: PodcastsTabProps) {
  const [sections, setSections] = useState<PodcastSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [playlistFile, setPlaylistFile] = useState<PlaylistEntry | null>(null);
  const [activeEpisode, setActiveEpisode] = useState<PodcastEpisode | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [playerLabel, setPlayerLabel] = useState<'idle' | 'paused' | 'playing' | 'loading'>('idle');

  const playbackRef = useRef<{episodeId: string; mp3Url: string} | null>(null);

  const episodesRefreshVisible = useDeferredLoadingIndicator(loading, 100);

  const loadPlaylistSnapshot = useCallback(async () => {
    try {
      const pl = await readPlaylistEntry(vaultRoot, fs);
      setPlaylistFile(pl);
    } catch {
      setPlaylistFile(null);
    }
  }, [vaultRoot, fs]);

  const refreshPodcasts = useCallback(
    async (forceFullScan: boolean) => {
      setLoading(true);
      onError(null);
      try {
        const result = await runPodcastPhase1Desktop(vaultRoot, fs, {forceFullScan});
        if (result.error) {
          onError(result.error);
        }
        setSections(result.sections);
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
      await loadPlaylistSnapshot();
    },
    [vaultRoot, fs, onError, loadPlaylistSnapshot],
  );

  useEffect(() => {
    void refreshPodcasts(false);
  }, [refreshPodcasts]);

  useEffect(() => {
    if (fsRefreshNonce === 0) {
      return;
    }
    void refreshPodcasts(true);
    // Only rescan when the app increments the nonce (filesystem watcher or settings refresh).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid re-running when refreshPodcasts identity changes
  }, [fsRefreshNonce]);

  useEffect(() => {
    const player = getDesktopAudioPlayer();
    const unsubState = player.addStateListener(s => {
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
      unsubState();
    };
  }, []);

  useEffect(() => {
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
      }).catch(() => undefined);
    });
    return () => {
      unsubProg();
    };
  }, [vaultRoot, fs]);

  const playEpisode = async (ep: PodcastEpisode) => {
    onError(null);
    setActiveEpisode(ep);
    playbackRef.current = {episodeId: ep.id, mp3Url: ep.mp3Url};
    try {
      await writePlaylistEntry(vaultRoot, fs, {
        durationMs: null,
        episodeId: ep.id,
        mp3Url: ep.mp3Url,
        positionMs: 0,
      });
      await loadPlaylistSnapshot();
      await getDesktopAudioPlayer().play(
        {
          artist: ep.seriesName,
          id: ep.id,
          title: ep.title,
          url: ep.mp3Url,
        },
        undefined,
      );
    } catch (e) {
      if (isAbortError(e)) {
        return;
      }
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const resumeFromVault = async () => {
    onError(null);
    try {
      const pl = await readPlaylistEntry(vaultRoot, fs);
      if (!pl) {
        onError('No playlist entry in vault.');
        return;
      }
      playbackRef.current = {episodeId: pl.episodeId, mp3Url: pl.mp3Url};
      const ep: PodcastEpisode = {
        articleUrl: undefined,
        date: '',
        id: pl.episodeId,
        isListened: false,
        mp3Url: pl.mp3Url,
        rssFeedUrl: undefined,
        sectionTitle: '',
        seriesName: displayName,
        sourceFile: '',
        title: 'Resume',
      };
      setActiveEpisode(ep);
      await getDesktopAudioPlayer().play(
        {
          artist: displayName,
          id: pl.episodeId,
          title: 'Podcast',
          url: pl.mp3Url,
        },
        pl.positionMs,
      );
      await loadPlaylistSnapshot();
    } catch (e) {
      if (isAbortError(e)) {
        return;
      }
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const togglePause = async () => {
    const p = getDesktopAudioPlayer();
    const st = await p.getState();
    if (st === 'playing') {
      await p.pause();
    } else if (st === 'paused' || st === 'ended') {
      await p.resume();
    }
  };

  const onMainLayout = (layout: Layout) => {
    onMainLayoutChanged(layout);
  };

  return (
    <div className="consume-root" data-app-surface="consume">
      <Group
        className="panel-group fill"
        orientation="horizontal"
        defaultLayout={defaultMainLayout}
        onLayoutChanged={onMainLayout}
      >
        <Panel id="episodes" className="panel-surface" minSize={12} defaultSize="38%">
          <div className="pane-header">
            <span className="pane-title">Episodes</span>
          </div>
          <div
            className={
              episodesRefreshVisible ? 'episodes-refresh-strip episodes-refresh-strip--active' : 'episodes-refresh-strip'
            }
            aria-hidden
          >
            {episodesRefreshVisible ? <div className="episodes-refresh-strip__segment" /> : null}
          </div>
          <div className="episode-scroll">
            {sections.map(section => (
              <section key={section.title} className="episode-section">
                <h3 className="section-heading">{section.title}</h3>
                <ul className="episode-list">
                  {section.episodes.map(ep => (
                    <li key={ep.id}>
                      <button type="button" className="episode-row" onClick={() => void playEpisode(ep)}>
                        <span className="ep-date">{ep.date}</span>
                        <span className="ep-title">{episodeListLabel(ep.title)}</span>
                        <span className="ep-series muted small">{episodeListLabel(ep.seriesName)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!loading && sections.length === 0 ? (
              <p className="muted empty-hint">No episodes found in vault General/ podcast markdown.</p>
            ) : null}
          </div>
        </Panel>
        <Separator className="resize-sep" />
        <Panel id="rightCol" className="panel-nested podcasts-right-col" minSize={22} defaultSize="62%">
          <div className="podcasts-right-stack">
            <section className="podcasts-player panel-surface" aria-label="Player">
              <div className="pane-header">
                <span className="pane-title">Player</span>
                <span className="muted small">{playerLabel}</span>
              </div>
              <div className="player-chrome">
                <p className="now-line">
                  {activeEpisode ? (
                    <>
                      <strong>{activeEpisode.title}</strong>
                      <span className="muted small"> — {activeEpisode.seriesName}</span>
                    </>
                  ) : (
                    <span className="muted">Nothing playing</span>
                  )}
                </p>
                <p className="muted small">
                  {formatMs(positionMs)} / {formatMs(durationMs)}
                </p>
                <div className="row tight">
                  <button type="button" className="primary" onClick={() => void togglePause()}>
                    Play / pause
                  </button>
                </div>
              </div>
            </section>
            <section className="podcasts-playlist panel-surface" aria-label="Playlist">
              <div className="pane-header">
                <span className="pane-title">Playlist</span>
              </div>
              <div className="playlist-body">
                <p className="muted small">
                  Resume pointer and playback state sync to <code>.notebox/playlist.json</code> for cross-device
                  resume.
                </p>
                {playlistFile ? (
                  <dl className="playlist-dl">
                    <dt>Episode ID</dt>
                    <dd className="mono small">{playlistFile.episodeId}</dd>
                    <dt>MP3 URL</dt>
                    <dd className="mono small wrap">{playlistFile.mp3Url}</dd>
                    <dt>Position</dt>
                    <dd>{formatMs(playlistFile.positionMs)}</dd>
                    <dt>Duration</dt>
                    <dd>{playlistFile.durationMs === null ? '—' : formatMs(playlistFile.durationMs)}</dd>
                  </dl>
                ) : (
                  <p className="muted">No playlist entry yet. Play an episode to create one.</p>
                )}
                <button type="button" onClick={() => void resumeFromVault()}>
                  Resume from vault playlist
                </button>
              </div>
            </section>
          </div>
        </Panel>
      </Group>
    </div>
  );
}
