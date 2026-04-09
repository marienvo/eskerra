import {MaterialIcon} from './MaterialIcon';

export type TitleBarPlayControl = 'loading' | 'paused' | 'playing';

export type TitleBarTransportProps = {
  positionLabel: string;
  durationLabel: string;
  seekDisabled: boolean;
  playControl: TitleBarPlayControl;
  onSeekBack: () => void;
  onSeekForward: () => void;
  onTogglePlay: () => void;
};

/**
 * Centered title-bar playback: elapsed, skip back, play/pause or loading, skip forward, duration.
 */
export function TitleBarTransport({
  positionLabel,
  durationLabel,
  seekDisabled,
  playControl,
  onSeekBack,
  onSeekForward,
  onTogglePlay,
}: TitleBarTransportProps) {
  const isPlaying = playControl === 'playing';
  const isLoading = playControl === 'loading';
  const playLabel = isLoading ? 'Loading' : isPlaying ? 'Pause' : 'Play';

  return (
    <div
      className="window-title-bar-transport"
      role="group"
      aria-label="Playback"
    >
      <span
        className="window-title-bar-transport__time window-title-bar-transport__time--position"
        aria-hidden
      >
        {positionLabel}
      </span>
      <button
        type="button"
        className="app-playback-chrome-btn app-playback-chrome-btn--seek"
        aria-label="Rewind 10 seconds"
        disabled={seekDisabled}
        onClick={() => void onSeekBack()}
      >
        <MaterialIcon name="replay_10" size={22} aria-hidden />
      </button>
      <button
        type="button"
        className="app-playback-chrome-btn app-playback-chrome-btn--play"
        aria-busy={isLoading}
        aria-label={playLabel}
        disabled={isLoading}
        onClick={() => void onTogglePlay()}
      >
        {isLoading ? (
          <MaterialIcon
            aria-hidden
            className="app-playback-chrome-btn__spin"
            name="autorenew"
            size={28}
          />
        ) : (
          <MaterialIcon
            name={isPlaying ? 'pause_circle_filled' : 'play_circle_filled'}
            size={28}
            aria-hidden
          />
        )}
      </button>
      <button
        type="button"
        className="app-playback-chrome-btn app-playback-chrome-btn--seek"
        aria-label="Forward 10 seconds"
        disabled={seekDisabled}
        onClick={() => void onSeekForward()}
      >
        <MaterialIcon name="forward_10" size={22} aria-hidden />
      </button>
      <span className="window-title-bar-transport__time window-title-bar-transport__time--duration" aria-hidden>
        {durationLabel}
      </span>
    </div>
  );
}
