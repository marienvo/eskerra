import {MaterialIcon} from './MaterialIcon';

export type TitleBarTransportProps = {
  positionLabel: string;
  durationLabel: string;
  seekDisabled: boolean;
  playDisabled: boolean;
  isPlaying: boolean;
  onSeekBack: () => void;
  onSeekForward: () => void;
  onTogglePlay: () => void;
};

/**
 * Centered title-bar playback: elapsed, skip back, play/pause, skip forward, duration.
 */
export function TitleBarTransport({
  positionLabel,
  durationLabel,
  seekDisabled,
  playDisabled,
  isPlaying,
  onSeekBack,
  onSeekForward,
  onTogglePlay,
}: TitleBarTransportProps) {
  const playTooltip = isPlaying ? 'Pause' : 'Play';
  const playLabel = isPlaying ? 'Pause' : 'Play';

  return (
    <div
      className="window-title-bar-transport"
      role="group"
      aria-label="Playback"
    >
      <span className="window-title-bar-transport__time" aria-hidden>
        {positionLabel}
      </span>
      <button
        type="button"
        className="app-playback-chrome-btn app-tooltip-trigger"
        aria-label="Rewind 10 seconds"
        data-tooltip="Rewind 10 seconds"
        data-tooltip-placement="inline-end"
        disabled={seekDisabled}
        onClick={() => void onSeekBack()}
      >
        <MaterialIcon name="replay_10" size={24} aria-hidden />
      </button>
      <button
        type="button"
        className="app-playback-chrome-btn app-playback-chrome-btn--play app-tooltip-trigger"
        aria-label={playLabel}
        data-tooltip={playTooltip}
        data-tooltip-placement="inline-end"
        disabled={playDisabled}
        onClick={() => void onTogglePlay()}
      >
        <MaterialIcon
          name={isPlaying ? 'pause_circle_filled' : 'play_circle_filled'}
          size={24}
          aria-hidden
        />
      </button>
      <button
        type="button"
        className="app-playback-chrome-btn app-tooltip-trigger"
        aria-label="Forward 10 seconds"
        data-tooltip="Forward 10 seconds"
        data-tooltip-placement="inline-start"
        disabled={seekDisabled}
        onClick={() => void onSeekForward()}
      >
        <MaterialIcon name="forward_10" size={24} aria-hidden />
      </button>
      <span className="window-title-bar-transport__time window-title-bar-transport__time--duration" aria-hidden>
        {durationLabel}
      </span>
    </div>
  );
}
