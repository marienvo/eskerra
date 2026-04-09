import type {PodcastEpisode, PodcastSection} from '../lib/podcasts/podcastTypes';
import {useDeferredLoadingIndicator} from '../hooks/useDeferredLoadingIndicator';

import {MaterialIcon} from './MaterialIcon';

export type EpisodesPaneProps = {
  sections: PodcastSection[];
  catalogLoading: boolean;
  playEpisode: (ep: PodcastEpisode) => Promise<void>;
  resumeFromVault: () => Promise<void>;
  /** When true, episode rows do not start or switch playback (an episode is already playing). */
  episodeSelectLocked?: boolean;
};

function episodeListLabel(text: string): string {
  return text.replaceAll('**', '').trim();
}

export function EpisodesPane({
  sections,
  catalogLoading,
  playEpisode,
  resumeFromVault,
  episodeSelectLocked = false,
}: EpisodesPaneProps) {
  const episodesRefreshVisible = useDeferredLoadingIndicator(catalogLoading, 100);

  return (
    <div className="panel-surface episodes-pane-root" data-app-surface="consume">
      <div className="pane-header pane-header--episodes pane-header--workspace-panel">
        <span className="pane-title">Episodes</span>
        <button
          type="button"
          className="pane-header-aux-btn icon-btn-ghost app-tooltip-trigger"
          onClick={() => void resumeFromVault()}
          aria-label="Resume from vault playlist"
          data-tooltip="Resume from vault playlist"
          data-tooltip-placement="inline-start"
        >
          <span className="pane-header-aux-btn__label">Resume</span>
          <span className="pane-header-aux-btn__glyph" aria-hidden>
            <MaterialIcon name="play_arrow" size={12} />
          </span>
        </button>
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
                <li key={ep.id}>
                  <button
                    type="button"
                    className="episode-row"
                    disabled={episodeSelectLocked}
                    onClick={() => void playEpisode(ep)}
                  >
                    <span className="ep-date">{ep.date}</span>
                    <span className="ep-title">{episodeListLabel(ep.title)}</span>
                    <span className="ep-series muted small">
                      {episodeListLabel(ep.seriesName)}
                    </span>
                  </button>
                </li>
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
