import {useLayoutEffect, useRef, useState} from 'react';

import type {AppStatusBarCenter} from '../lib/resolveAppStatusBarCenter';

import {MaterialIcon} from './MaterialIcon';

/** Shared with {@link AppSetupTagline} and main {@link AppStatusBar}. */
export const APP_SHELL_TAGLINE = 'Think. Compose. Nothing else.';

export type AppStatusBarPlaybackChrome = {
  positionLabel: string;
  durationLabel: string;
  seekDisabled: boolean;
  onSeekBack: () => void;
  onSeekForward: () => void;
};

/** Bottom tagline on vault picker / loading only (no settings control). */
export function AppSetupTagline() {
  return (
    <footer className="app-setup-tagline">
      <p className="app-setup-tagline-text">{APP_SHELL_TAGLINE}</p>
    </footer>
  );
}

type AppStatusBarProps = {
  center: AppStatusBarCenter;
  playback: AppStatusBarPlaybackChrome | null;
  onOpenSettings: () => void;
  /** When the status message overflows, user can open the notifications panel. */
  onReadMoreStatusMessage?: () => void;
};

function AppStatusBarMessageCenter({
  tone,
  text,
  onReadMore,
}: {
  tone: 'error' | 'info';
  text: string;
  onReadMore: () => void;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [readMore, setReadMore] = useState(false);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) {
      return;
    }
    const run = () => {
      if (readMore) {
        return;
      }
      if (el.scrollWidth > el.clientWidth + 1) {
        setReadMore(true);
      }
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    window.addEventListener('resize', run);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', run);
    };
  }, [text, tone, readMore]);

  const toneClass =
    tone === 'error' ? 'app-status-bar-center--error' : 'app-status-bar-center--info';

  return (
    <div
      className={`app-status-bar-message ${toneClass}`}
      {...(tone === 'error' ? {role: 'alert' as const} : {'aria-live': 'polite' as const})}
    >
      <span ref={textRef} className="app-status-bar-message__text">
        {text}
      </span>
      {readMore ? (
        <button
          type="button"
          className="app-status-bar-read-more app-tooltip-trigger"
          aria-label="Read full message in Notifications"
          data-tooltip="Open in Notifications"
          data-tooltip-placement="inline-end"
          onClick={onReadMore}
        >
          Read more
        </button>
      ) : null}
    </div>
  );
}

function AppStatusBarCenterRegion({
  center,
  onReadMoreStatusMessage,
}: {
  center: AppStatusBarCenter;
  onReadMoreStatusMessage?: () => void;
}) {
  if (center.kind === 'tagline') {
    return (
      <p className="app-status-bar-center app-status-bar-center--tagline">{center.text}</p>
    );
  }

  if (center.kind === 'message') {
    return (
      <AppStatusBarMessageCenter
        key={`${center.tone}:${center.text}`}
        tone={center.tone}
        text={center.text}
        onReadMore={onReadMoreStatusMessage ?? (() => undefined)}
      />
    );
  }

  return (
    <p className="app-status-bar-center app-status-bar-center--player" aria-live="polite">
      <strong>{center.episodeTitle}</strong>
      <span className="muted small"> — {center.seriesName}</span>
    </p>
  );
}

function AppStatusBarPlaybackStrip({p}: {p: AppStatusBarPlaybackChrome}) {
  return (
    <div
      className="app-status-bar-playback"
      role="group"
      aria-label="Skip playback"
    >
      <span className="app-status-bar-playback__time" aria-hidden>
        {p.positionLabel}
      </span>
      <button
        type="button"
        className="app-playback-chrome-btn app-tooltip-trigger"
        aria-label="Rewind 10 seconds"
        data-tooltip="Rewind 10 seconds"
        data-tooltip-placement="inline-end"
        disabled={p.seekDisabled}
        onClick={() => void p.onSeekBack()}
      >
        <MaterialIcon name="replay_10" size={24} aria-hidden />
      </button>
      <button
        type="button"
        className="app-playback-chrome-btn app-tooltip-trigger"
        aria-label="Forward 10 seconds"
        data-tooltip="Forward 10 seconds"
        data-tooltip-placement="inline-start"
        disabled={p.seekDisabled}
        onClick={() => void p.onSeekForward()}
      >
        <MaterialIcon name="forward_10" size={24} aria-hidden />
      </button>
      <span className="app-status-bar-playback__time app-status-bar-playback__time--duration" aria-hidden>
        {p.durationLabel}
      </span>
    </div>
  );
}

export function AppStatusBar({
  center,
  playback,
  onOpenSettings,
  onReadMoreStatusMessage,
}: AppStatusBarProps) {
  const withPlayback = playback != null;

  return (
    <footer className={`app-status-bar${withPlayback ? ' app-status-bar--with-playback' : ''}`}>
      {playback ? (
        <div className="app-status-bar-leading">
          <AppStatusBarPlaybackStrip p={playback} />
        </div>
      ) : null}
      <AppStatusBarCenterRegion
        center={center}
        onReadMoreStatusMessage={onReadMoreStatusMessage}
      />
      <div className="app-status-bar-trailing">
        <button
          type="button"
          className="app-status-bar-settings app-tooltip-trigger icon-btn-ghost"
          aria-label="Settings"
          data-tooltip="Settings"
          data-tooltip-placement="inline-start"
          onClick={onOpenSettings}
        >
          <MaterialIcon name="settings" size={12} />
        </button>
      </div>
    </footer>
  );
}
