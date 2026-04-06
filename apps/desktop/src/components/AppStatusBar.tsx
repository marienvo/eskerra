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
};

function AppStatusBarCenterRegion({center}: {center: AppStatusBarCenter}) {
  if (center.kind === 'tagline') {
    return (
      <p className="app-status-bar-center app-status-bar-center--tagline">{center.text}</p>
    );
  }

  if (center.kind === 'message') {
    const toneClass =
      center.tone === 'error'
        ? 'app-status-bar-center--error'
        : 'app-status-bar-center--info';
    return (
      <p
        className={`app-status-bar-center ${toneClass}`}
        {...(center.tone === 'error'
          ? {role: 'alert' as const}
          : {'aria-live': 'polite' as const})}
      >
        {center.text}
      </p>
    );
  }

  return (
    <p className="app-status-bar-center app-status-bar-center--player" aria-live="polite">
      <strong>{center.episodeTitle}</strong>
      <span className="muted small"> — {center.seriesName}</span>
    </p>
  );
}

export function AppStatusBar({center, onOpenSettings}: AppStatusBarProps) {
  return (
    <footer className="app-status-bar">
      <AppStatusBarCenterRegion center={center} />
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
