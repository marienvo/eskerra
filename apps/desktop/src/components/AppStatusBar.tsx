import {useLayoutEffect, useRef, useState} from 'react';

import type {AppStatusBarCenter} from '../lib/resolveAppStatusBarCenter';

import {MaterialIcon} from './MaterialIcon';

/** Shared with {@link AppSetupTagline} and main {@link AppStatusBar}. */
export const APP_SHELL_TAGLINE = 'Think. Compose. Nothing else.';

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

export function AppStatusBar({
  center,
  onOpenSettings,
  onReadMoreStatusMessage,
}: AppStatusBarProps) {
  return (
    <footer className="app-status-bar">
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
