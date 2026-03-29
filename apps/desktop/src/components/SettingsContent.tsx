import {useId, useState} from 'react';

import {
  buildNoteboxSettingsFromForm,
  type NoteboxLocalSettings,
  type NoteboxSettings,
} from '@notebox/core';

type SettingsContentProps = {
  vaultSettings: NoteboxSettings;
  localSettings: NoteboxLocalSettings;
  onSave: (shared: NoteboxSettings, local: NoteboxLocalSettings) => Promise<void>;
  onChangeFolder: () => void;
  onRefreshVault: () => void;
  busy: boolean;
  /** When true, show an in-page "Settings" heading (in-app surfaces). Native settings window omits this. */
  showHeading?: boolean;
};

export function SettingsContent({
  vaultSettings,
  localSettings,
  onSave,
  onChangeFolder,
  onRefreshVault,
  busy,
  showHeading = false,
}: SettingsContentProps) {
  const sharedId = useId();
  const deviceId = useId();

  const [displayName, setDisplayName] = useState(localSettings.displayName);
  const [deviceName, setDeviceName] = useState(localSettings.deviceName);
  const [r2Endpoint, setR2Endpoint] = useState(vaultSettings.r2?.endpoint ?? '');
  const [r2Bucket, setR2Bucket] = useState(vaultSettings.r2?.bucket ?? '');
  const [r2AccessKeyId, setR2AccessKeyId] = useState(vaultSettings.r2?.accessKeyId ?? '');
  const [r2SecretAccessKey, setR2SecretAccessKey] = useState(
    vaultSettings.r2?.secretAccessKey ?? '',
  );
  const [showSecrets, setShowSecrets] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const handleSave = async () => {
    setSaveOk(null);
    const shared = buildNoteboxSettingsFromForm({
      endpoint: r2Endpoint,
      bucket: r2Bucket,
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    });
    if (!shared.ok) {
      setInlineError(shared.message);
      return;
    }
    setInlineError(null);
    try {
      const nextLocal = {
        deviceName: deviceName.trimEnd(),
        displayName: displayName.trim(),
      };
      await onSave(shared.settings, nextLocal);
      setSaveOk('Settings saved.');
    } catch (e) {
      setInlineError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="settings-content">
      {showHeading ? (
        <h2 className="settings-content-heading" id="settings-title">
          Settings
        </h2>
      ) : null}
      {inlineError ? (
        <div className="error-banner" role="alert">
          {inlineError}
        </div>
      ) : null}
      {saveOk ? (
        <p className="settings-save-ok muted small" role="status">
          {saveOk}
        </p>
      ) : null}

      <section className="settings-section" aria-labelledby={`${sharedId}-title`}>
        <h3 className="settings-section-title" id={`${sharedId}-title`}>
          Vault (shared)
        </h3>
        <p className="settings-hint muted small">Stored in .notebox/settings-shared.json</p>
        <h4 className="settings-subsection-title">Cloudflare R2 (optional)</h4>
        <p className="settings-hint muted small">
          Values are stored as plain JSON in your vault. Leave all fields empty to clear R2 from shared
          settings.
        </p>
        <label className="field">
          Endpoint URL
          <input
            value={r2Endpoint}
            onChange={e => setR2Endpoint(e.target.value)}
            autoComplete="off"
            placeholder="https://accountid.r2.cloudflarestorage.com"
          />
        </label>
        <label className="field">
          Bucket
          <input value={r2Bucket} onChange={e => setR2Bucket(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          Access key ID
          <input
            type={showSecrets ? 'text' : 'password'}
            value={r2AccessKeyId}
            onChange={e => setR2AccessKeyId(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="field">
          Secret access key
          <span className="settings-secret-row">
            <input
              type={showSecrets ? 'text' : 'password'}
              value={r2SecretAccessKey}
              onChange={e => setR2SecretAccessKey(e.target.value)}
              autoComplete="off"
            />
            <button type="button" className="ghost small" onClick={() => setShowSecrets(s => !s)}>
              {showSecrets ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>
      </section>

      <section className="settings-section" aria-labelledby={`${deviceId}-title`}>
        <h3 className="settings-section-title" id={`${deviceId}-title`}>
          This device
        </h3>
        <p className="settings-hint muted small">Stored in .notebox/settings-local.json</p>
        <label className="field">
          Display name
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="field">
          Device name
          <input
            value={deviceName}
            onChange={e => setDeviceName(e.target.value)}
            autoComplete="off"
          />
        </label>
      </section>

      <p className="settings-security-note muted small">
        R2 credentials are plain text in your vault folder. That is acceptable for a private vault; do
        not publish or share the vault folder widely. A future version may use server-side auth instead of
        vault-stored secrets.
      </p>

      <div className="modal-actions">
        <button type="button" className="primary" onClick={() => void handleSave()} disabled={busy}>
          Save changes
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
  );
}
