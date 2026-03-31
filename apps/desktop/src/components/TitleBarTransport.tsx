import {MaterialIcon} from './MaterialIcon';

export type TitleBarTransportProps = {
  disabled: boolean;
  isPlaying: boolean;
  onSeekBack: () => void;
  onTogglePlay: () => void;
  onSeekForward: () => void;
};

/**
 * Centered title-bar playback controls (separate from rail tabs and window chrome).
 * Icon names match Material Icons / mobile MiniPlayer (`replay_10`, `forward_10`, circle filled).
 */
export function TitleBarTransport({
  disabled,
  isPlaying,
  onSeekBack,
  onTogglePlay,
  onSeekForward,
}: TitleBarTransportProps) {
  const playTooltip = isPlaying ? 'Pause' : 'Play';
  const playLabel = isPlaying ? 'Pause' : 'Play';

  return (
    <div
      className="window-title-bar-transport"
      role="group"
      aria-label="Playback"
    >
      <button
        type="button"
        className="titlebar-transport-btn app-tooltip-trigger"
        aria-label="Rewind 10 seconds"
        data-tooltip="Rewind 10 seconds"
        data-tooltip-placement="inline-end"
        disabled={disabled}
        onClick={onSeekBack}
      >
        <MaterialIcon name="replay_10" size={24} aria-hidden />
      </button>
      <button
        type="button"
        className="titlebar-transport-btn titlebar-transport-btn--play app-tooltip-trigger"
        aria-label={playLabel}
        data-tooltip={playTooltip}
        data-tooltip-placement="inline-end"
        disabled={disabled}
        onClick={onTogglePlay}
      >
        <MaterialIcon
          name={isPlaying ? 'pause_circle_filled' : 'play_circle_filled'}
          size={36}
          aria-hidden
        />
      </button>
      <button
        type="button"
        className="titlebar-transport-btn app-tooltip-trigger"
        aria-label="Forward 10 seconds"
        data-tooltip="Forward 10 seconds"
        data-tooltip-placement="inline-start"
        disabled={disabled}
        onClick={onSeekForward}
      >
        <MaterialIcon name="forward_10" size={24} aria-hidden />
      </button>
    </div>
  );
}
