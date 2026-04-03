import {MaterialIcon} from './MaterialIcon';

type AppStatusBarProps = {
  onOpenSettings: () => void;
};

export function AppStatusBar({onOpenSettings}: AppStatusBarProps) {
  return (
    <footer className="app-status-bar">
      <p className="app-status-bar-tagline">Made with ♥️ in Rotterdam</p>
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
