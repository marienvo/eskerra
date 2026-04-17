import {
  formatRelativeCalendarLabelFromIsoDate,
  type PlaybackTransportPlayControl,
} from '@eskerra/core';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type {ReactElement} from 'react';
import {useDesktopPodcastArtwork} from '../hooks/useDesktopPodcastArtwork';
import {useDeferredLoadingIndicator} from '../hooks/useDeferredLoadingIndicator';
import type {PodcastEpisode, PodcastSection} from '../lib/podcasts/podcastTypes';

export type EpisodesPaneProps = {
  sections: PodcastSection[];
  catalogLoading: boolean;
  playEpisode: (ep: PodcastEpisode) => Promise<void>;
  markEpisodePlayed: (ep: PodcastEpisode) => Promise<void>;
  activeEpisodeId: string | null;
  activeEpisodePlayControl: PlaybackTransportPlayControl;
  /** When true, episode rows do not start or switch playback (an episode is already playing). */
  episodeSelectLocked?: boolean;
};

function episodeListLabel(text: string): string {
  return text.replaceAll('**', '').trim();
}

function MusicNotePlaceholderIcon(): ReactElement {
  return (
    <svg
      className="ep-artwork__note-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
      />
    </svg>
  );
}

type EpisodeListRowProps = {
  ep: PodcastEpisode;
  sectionRssFeedUrl?: string;
  playEpisode: (ep: PodcastEpisode) => Promise<void>;
  markEpisodePlayed: (ep: PodcastEpisode) => Promise<void>;
  episodeSelectLocked: boolean;
  activeEpisodeId: string | null;
  activeEpisodePlayControl: PlaybackTransportPlayControl;
};

function EpisodeListRow({
  ep,
  sectionRssFeedUrl,
  playEpisode,
  markEpisodePlayed,
  episodeSelectLocked,
  activeEpisodeId,
  activeEpisodePlayControl,
}: EpisodeListRowProps) {
  const rssForArt =
    ep.rssFeedUrl?.trim() || sectionRssFeedUrl?.trim() || '';
  const {artworkUrl, loading: artworkLoading} =
    useDesktopPodcastArtwork(rssForArt);

  const isActive = activeEpisodeId === ep.id;
  const playCtl = isActive ? activeEpisodePlayControl : null;

  const rowClass = [
    'episode-row',
    isActive ? 'episode-row--active' : '',
    isActive && playCtl === 'playing' ? 'episode-row--playing' : '',
    isActive && (playCtl === 'loading' || playCtl === 'buffering')
      ? 'episode-row--buffering'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const statusLabel =
    isActive && playCtl === 'playing'
      ? 'Playing'
      : isActive && (playCtl === 'loading' || playCtl === 'buffering')
        ? 'Buffering'
        : isActive && playCtl === 'paused'
          ? 'Paused'
          : null;

  const markPlayedDisabled =
    ep.isListened || episodeSelectLocked;

  return (
    <li>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div className="episode-row-outer">
            <button
              type="button"
              className={rowClass}
              aria-disabled={episodeSelectLocked}
              onClick={() => {
                if (episodeSelectLocked) {
                  return;
                }
                void playEpisode(ep);
              }}
            >
              <span className="ep-artwork-wrap">
                {artworkUrl ? (
                  <img
                    className="ep-artwork"
                    src={artworkUrl}
                    alt=""
                    decoding="async"
                    loading="lazy"
                  />
                ) : (
                  <span
                    className={
                      artworkLoading
                        ? 'ep-artwork ep-artwork--placeholder ep-artwork--loading'
                        : 'ep-artwork ep-artwork--placeholder'
                    }
                  >
                    <MusicNotePlaceholderIcon />
                  </span>
                )}
                {isActive && playCtl === 'playing' ? (
                  <span
                    className="ep-artwork-overlay ep-artwork-overlay--eq"
                    aria-hidden
                  >
                    <span className="ep-eq">
                      <span className="ep-eq__bar" />
                      <span className="ep-eq__bar" />
                      <span className="ep-eq__bar" />
                    </span>
                  </span>
                ) : null}
                {isActive &&
                (playCtl === 'loading' || playCtl === 'buffering') ? (
                  <span
                    className="ep-artwork-overlay ep-artwork-overlay--spinner"
                    aria-hidden
                  />
                ) : null}
                {isActive && playCtl === 'paused' ? (
                  <span
                    className="ep-artwork-overlay ep-artwork-overlay--pause"
                    aria-hidden
                  >
                    <span className="ep-pause-icon" />
                  </span>
                ) : null}
              </span>
              <span className="ep-title">{episodeListLabel(ep.title)}</span>
              <span className="ep-meta muted small">
                {`${episodeListLabel(ep.seriesName)} - ${formatRelativeCalendarLabelFromIsoDate(ep.date)}`}
              </span>
              {statusLabel != null ? (
                <span className="ep-status muted small">{statusLabel}</span>
              ) : null}
            </button>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className="note-list-context-menu"
            alignOffset={4}
            collisionPadding={8}
          >
            <ContextMenu.Item
              className="note-list-context-menu__item"
              disabled={markPlayedDisabled}
              onSelect={() => {
                void markEpisodePlayed(ep);
              }}
            >
              Mark played
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </li>
  );
}

export function EpisodesPane({
  sections,
  catalogLoading,
  playEpisode,
  markEpisodePlayed,
  activeEpisodeId,
  activeEpisodePlayControl,
  episodeSelectLocked = false,
}: EpisodesPaneProps) {
  const episodesRefreshVisible = useDeferredLoadingIndicator(catalogLoading, 100);

  return (
    <div className="panel-surface episodes-pane-root" data-app-surface="consume">
      <div className="pane-header pane-header--episodes pane-header--workspace-panel">
        <span className="pane-title">Episodes</span>
      </div>
      <div
        className={
          episodesRefreshVisible
            ? 'episodes-refresh-strip episodes-refresh-strip--active'
            : 'episodes-refresh-strip'
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
                <EpisodeListRow
                  key={ep.id}
                  ep={ep}
                  sectionRssFeedUrl={section.rssFeedUrl}
                  playEpisode={playEpisode}
                  markEpisodePlayed={markEpisodePlayed}
                  episodeSelectLocked={episodeSelectLocked}
                  activeEpisodeId={activeEpisodeId}
                  activeEpisodePlayControl={activeEpisodePlayControl}
                />
              ))}
            </ul>
          </section>
        ))}
        {!catalogLoading && sections.length === 0 ? (
          <p className="muted empty-hint">No episodes found in vault General/ podcast markdown.</p>
        ) : null}
      </div>
    </div>
  );
}
