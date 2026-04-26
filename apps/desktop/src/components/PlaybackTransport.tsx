import {
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
  PauseIcon,
  PlayIcon,
} from '@radix-ui/react-icons';

import type {PlaybackTransportPlayControl} from '@eskerra/core';

export type {PlaybackTransportPlayControl};

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

const OUTER_R = 6.25;
const INNER_R = 4;
const RING_R = 10;

function DualArcSpinner() {
  const outerLen = 2 * Math.PI * OUTER_R * 0.7;
  const outerGap = 2 * Math.PI * OUTER_R * 0.3;
  const innerLen = 2 * Math.PI * INNER_R * 0.55;
  const innerGap = 2 * Math.PI * INNER_R * 0.45;
  return (
    <svg
      aria-hidden
      className="app-playback-spinner"
      height={15}
      viewBox="0 0 15 15"
      width={15}
    >
      <circle
        className="app-playback-spinner__arc app-playback-spinner__arc--outer"
        cx={7.5}
        cy={7.5}
        fill="none"
        r={OUTER_R}
        stroke="currentColor"
        strokeDasharray={`${outerLen} ${outerGap}`}
        strokeLinecap="round"
        strokeWidth={1.15}
      />
      <circle
        className="app-playback-spinner__arc app-playback-spinner__arc--inner"
        cx={7.5}
        cy={7.5}
        fill="none"
        r={INNER_R}
        stroke="currentColor"
        strokeDasharray={`${innerLen} ${innerGap}`}
        strokeLinecap="round"
        strokeWidth={1}
      />
    </svg>
  );
}

function BufferRingSpinner() {
  const c = 2 * Math.PI * RING_R;
  const dash = c * 0.65;
  return (
    <svg
      aria-hidden
      className="app-playback-chrome-btn__buffer-ring"
      viewBox="0 0 24 24"
    >
      <circle
        className="app-playback-spinner__arc app-playback-spinner__arc--outer"
        cx={12}
        cy={12}
        fill="none"
        r={RING_R}
        stroke="currentColor"
        strokeDasharray={`${dash} ${c - dash}`}
        strokeLinecap="round"
        strokeWidth={1.25}
      />
    </svg>
  );
}

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
  const isLoading = playControl === 'loading';
  const isBuffering = playControl === 'buffering';
  const showPauseIcon = playControl === 'playing' || playControl === 'buffering';
  let playLabel = 'Play';
  if (isLoading) {
    playLabel = 'Loading';
  } else if (isBuffering) {
    playLabel = 'Buffering, pause';
  } else if (showPauseIcon) {
    playLabel = 'Pause';
  }
  let playIcon = <PlayIcon {...PLAYBACK_ICON_DIM} aria-hidden />;
  if (isLoading) {
    playIcon = <DualArcSpinner />;
  } else if (isBuffering) {
    playIcon = (
      <span className="app-playback-chrome-btn__play-inner">
        <BufferRingSpinner />
        <PauseIcon {...PLAYBACK_ICON_DIM} aria-hidden />
      </span>
    );
  } else if (showPauseIcon) {
    playIcon = <PauseIcon {...PLAYBACK_ICON_DIM} aria-hidden />;
  }
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
        aria-busy={isLoading || isBuffering}
        aria-label={playLabel}
        disabled={isLoading}
        onClick={() => void onTogglePlay()}
      >
        {playIcon}
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
