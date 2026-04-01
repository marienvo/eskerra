import {useCallback, useEffect, useMemo, useState} from 'react';
import {Group, Panel, Separator, usePanelRef} from 'react-resizable-panels';
import type {Layout} from 'react-resizable-panels';
import type {VaultFilesystem} from '@notebox/core';
import type {PlaylistEntry} from '@notebox/core';

import {runPodcastPhase1Desktop} from '../lib/podcasts/podcastPhase1Desktop';
import type {PodcastEpisode, PodcastSection} from '../lib/podcasts/podcastTypes';
import {readPlaylistEntry} from '../lib/vaultBootstrap';
import {useDeferredLoadingIndicator} from '../hooks/useDeferredLoadingIndicator';
import {PODCASTS_LEFT_PANEL} from '../lib/layoutStore';

type PodcastsTabProps = {
  vaultRoot: string;
  fs: VaultFilesystem;
  leftWidthPx: number;
  onLeftWidthPxChanged: (px: number) => void;
  onConsumeCatalogState?: (s: {catalogLoading: boolean; episodes: PodcastEpisode[]}) => void;
  onError: (msg: string | null) => void;
  /** Increments when the filesystem watcher reports changes; triggers a rescan. */
  fsRefreshNonce: number;
  playEpisode: (ep: PodcastEpisode) => Promise<void>;
  resumeFromVault: () => Promise<void>;
  /** Incremented when vault playlist file is updated from playback (not every progress tick). */
  playlistRevision: number;
  /** When true, episode rows do not start or switch playback (an episode is already playing). */
  episodeSelectLocked?: boolean;
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
  leftWidthPx,
  onLeftWidthPxChanged,
  onConsumeCatalogState,
  onError,
  fsRefreshNonce,
  playEpisode,
  playlistRevision,
  resumeFromVault,
  episodeSelectLocked = false,
}: PodcastsTabProps) {
  const episodesPanelRef = usePanelRef();

  const handleLayoutChanged = (_layout: Layout) => {
    const px = episodesPanelRef.current?.getSize().inPixels;
    if (px !== undefined && Number.isFinite(px)) {
      onLeftWidthPxChanged(Math.round(px));
    }
  };

  const [sections, setSections] = useState<PodcastSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [playlistFile, setPlaylistFile] = useState<PlaylistEntry | null>(null);

  const flatEpisodes = useMemo(() => sections.flatMap(s => s.episodes), [sections]);

  useEffect(() => {
    onConsumeCatalogState?.({catalogLoading: loading, episodes: flatEpisodes});
  }, [flatEpisodes, loading, onConsumeCatalogState]);

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
    if (playlistRevision === 0) {
      return;
    }
    void loadPlaylistSnapshot();
  }, [playlistRevision, loadPlaylistSnapshot]);

  return (
    <div className="consume-root" data-app-surface="consume">
      <Group
        className="panel-group fill"
        orientation="horizontal"
        onLayoutChanged={handleLayoutChanged}
      >
        <Panel
          id="episodes"
          panelRef={episodesPanelRef}
          className="panel-surface"
          minSize={PODCASTS_LEFT_PANEL.minPx}
          maxSize={PODCASTS_LEFT_PANEL.maxPx}
          defaultSize={leftWidthPx}
          groupResizeBehavior="preserve-pixel-size"
        >
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
                      <button
                        type="button"
                        className="episode-row"
                        disabled={episodeSelectLocked}
                        onClick={() => void playEpisode(ep)}>
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
        <Panel
          id="rightCol"
          className="panel-nested podcasts-right-col"
          minSize="28%"
          groupResizeBehavior="preserve-relative-size"
        >
          <div className="podcasts-right-stack">
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
