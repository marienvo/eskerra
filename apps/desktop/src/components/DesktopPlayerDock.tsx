import type {DesktopPlayerLabel} from '../hooks/useDesktopPodcastPlayback';
import type {PodcastEpisode} from '../lib/podcasts/podcastTypes';

function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) {
    return '—';
  }
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

type DesktopPlayerDockProps = {
  activeEpisode: PodcastEpisode | null;
  playerLabel: DesktopPlayerLabel;
  positionMs: number;
  durationMs: number | null;
  onTogglePause: () => void;
};

export function DesktopPlayerDock({
  activeEpisode,
  durationMs,
  playerLabel,
  positionMs,
  onTogglePause,
}: DesktopPlayerDockProps) {
  return (
    <div className="desktop-player-dock-outer" data-app-surface="consume">
      <section className="desktop-player-dock podcasts-player panel-surface" aria-label="Player">
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
            <button type="button" className="primary" onClick={() => void onTogglePause()}>
              Play / pause
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
