import {MaterialIcon} from './MaterialIcon';

export type PlaybackTransportPlayControl = 'loading' | 'paused' | 'playing';

export type PlaybackTransportProps = {
  positionLabel: string;
  durationLabel: string;
  seekDisabled: boolean;
  playControl: PlaybackTransportPlayControl;
  onSeekBack: () => void;
  onSeekForward: () => void;
  onTogglePlay: () => void;
};

/**
 * Centered playback row: elapsed, skip back, play/pause or loading, skip forward, duration.
 */
export function PlaybackTransport({
  positionLabel,
  durationLabel,
  seekDisabled,
  playControl,
  onSeekBack,
  onSeekForward,
  onTogglePlay,
}: PlaybackTransportProps) {
  const isPlaying = playControl === 'playing';
  const isLoading = playControl === 'loading';
  const playLabel = isLoading ? 'Loading' : isPlaying ? 'Pause' : 'Play';

  return (
    <div className="app-playback-transport" role="group" aria-label="Playback">
      <span
        className="app-playback-transport__time app-playback-transport__time--position"
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
        <MaterialIcon name="replay_10" size={24} aria-hidden />
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
            size={24}
          />
        ) : (
          <MaterialIcon
            name={isPlaying ? 'pause_circle_filled' : 'play_circle_filled'}
            size={24}
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
        <MaterialIcon name="forward_10" size={24} aria-hidden />
      </button>
      <span className="app-playback-transport__time app-playback-transport__time--duration" aria-hidden>
        {durationLabel}
      </span>
    </div>
  );
}
