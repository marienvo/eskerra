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
  onOpenSettings: () => void;
};

export function AppStatusBar({onOpenSettings}: AppStatusBarProps) {
  return (
    <footer className="app-status-bar">
      <p className="app-status-bar-tagline">{APP_SHELL_TAGLINE}</p>
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
