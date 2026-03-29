type SettingsContentProps = {
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  onSaveDisplayName: () => void;
  onChangeFolder: () => void;
  onRefreshVault: () => void;
  busy: boolean;
  /** When true, show an in-page “Settings” heading (in-app surfaces). Native settings window omits this. */
  showHeading?: boolean;
};

export function SettingsContent({
  displayName,
  onDisplayNameChange,
  onSaveDisplayName,
  onChangeFolder,
  onRefreshVault,
  busy,
  showHeading = false,
}: SettingsContentProps) {
  return (
    <div className="settings-content">
      {showHeading ? (
        <h2 className="settings-content-heading" id="settings-title">
          Settings
        </h2>
      ) : null}
      <label className="field">
        Display name
        <input
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
          autoComplete="off"
        />
      </label>
      <div className="modal-actions">
        <button type="button" className="primary" onClick={() => void onSaveDisplayName()} disabled={busy}>
          Save name
        </button>
        <button type="button" onClick={() => void onChangeFolder()} disabled={busy}>
          Change vault folder…
        </button>
        <button type="button" className="ghost" onClick={() => void onRefreshVault()} disabled={busy}>
          Refresh from disk
        </button>
      </div>
      <p className="muted small">
        Vault settings live under <code>.notebox/</code> in your selected folder. Use refresh if file watching misses
        changes (network drives).
      </p>
    </div>
  );
}
