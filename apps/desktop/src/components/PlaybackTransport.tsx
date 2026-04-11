import {
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
  PauseIcon,
  PlayIcon,
  ReloadIcon,
} from '@radix-ui/react-icons';

export type PlaybackTransportPlayControl = 'loading' | 'paused' | 'playing';

export type PlaybackTransportProps = {
  positionLabel: string;
  durationLabel: string;
  seekDisabled: boolean;
  playControl: PlaybackTransportPlayControl;
  onSeekBack: () => void;
  onSeekForward: () => void;
  onTogglePlay: () => void;
  /** Compact row for {@link EditorWorkspaceToolbar}; fixed-width time slots. */
  variant?: 'default' | 'toolbar';
};

/** Radix icons in the playback row (15×15 viewBox, matches editor toolbar chrome). */
const PLAYBACK_ICON_DIM = {width: 15, height: 15} as const;

/**
 * Playback row: elapsed, skip back, play/pause or loading, skip forward, duration.
 */
export function PlaybackTransport({
  positionLabel,
  durationLabel,
  seekDisabled,
  playControl,
  onSeekBack,
  onSeekForward,
  onTogglePlay,
  variant = 'default',
}: PlaybackTransportProps) {
  const isPlaying = playControl === 'playing';
  const isLoading = playControl === 'loading';
  const playLabel = isLoading ? 'Loading' : isPlaying ? 'Pause' : 'Play';
  const isToolbar = variant === 'toolbar';

  return (
    <div
      className={[
        'app-playback-transport',
        isToolbar ? 'app-playback-transport--toolbar' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="group"
      aria-label="Playback"
    >
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
        <DoubleArrowLeftIcon {...PLAYBACK_ICON_DIM} aria-hidden />
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
          <ReloadIcon
            aria-hidden
            className="app-playback-chrome-btn__spin"
            {...PLAYBACK_ICON_DIM}
          />
        ) : isPlaying ? (
          <PauseIcon {...PLAYBACK_ICON_DIM} aria-hidden />
        ) : (
          <PlayIcon {...PLAYBACK_ICON_DIM} aria-hidden />
        )}
      </button>
      <button
        type="button"
        className="app-playback-chrome-btn app-playback-chrome-btn--seek"
        aria-label="Forward 10 seconds"
        disabled={seekDisabled}
        onClick={() => void onSeekForward()}
      >
        <DoubleArrowRightIcon {...PLAYBACK_ICON_DIM} aria-hidden />
      </button>
      <span className="app-playback-transport__time app-playback-transport__time--duration" aria-hidden>
        {durationLabel}
      </span>
    </div>
  );
}
