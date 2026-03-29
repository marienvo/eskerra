type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  onSaveDisplayName: () => void;
  onChangeFolder: () => void;
  onRefreshVault: () => void;
  busy: boolean;
};

export function SettingsModal({
  open,
  onClose,
  displayName,
  onDisplayNameChange,
  onSaveDisplayName,
  onChangeFolder,
  onRefreshVault,
  busy,
}: SettingsModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
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
            Vault settings live under <code>.notebox/</code> in your selected folder. Use refresh if file watching
            misses changes (network drives).
          </p>
        </div>
      </div>
    </div>
  );
}
