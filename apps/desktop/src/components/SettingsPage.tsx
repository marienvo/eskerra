import {useCallback, useEffect, useState} from 'react';

import type {Dispatch, SetStateAction} from 'react';

import type {EskerraLocalSettings, EskerraSettings, VaultFilesystem} from '@eskerra/core';
import {defaultEskerraLocalSettings} from '@eskerra/core';

import {
  readVaultLocalSettings,
  readVaultSettings,
  writeVaultLocalSettings,
  writeVaultSettings,
} from '../lib/vaultBootstrap';

import {MaterialIcon} from './MaterialIcon';
import {SettingsContent} from './SettingsContent';
import {PropertiesTab} from './settings/PropertiesTab';
import {ThemesTab} from './settings/ThemesTab';

export type SettingsTabId = 'sync' | 'themes' | 'properties';

type SettingsPageProps = {
  onClose: () => void;
  vaultRoot: string;
  fs: VaultFilesystem;
  vaultSettings: EskerraSettings;
  setVaultSettings: Dispatch<SetStateAction<EskerraSettings | null>>;
  /** Same as main-window “Choose folder” (re-select vault root). */
  onChangeVaultFolder: () => Promise<void>;
  initialTab?: SettingsTabId;
};

export function SettingsPage({
  onClose,
  vaultRoot,
  fs,
  vaultSettings,
  setVaultSettings,
  onChangeVaultFolder,
  initialTab = 'sync',
}: SettingsPageProps) {
  const [tab, setTab] = useState<SettingsTabId>(initialTab);
  const [localSettings, setLocalSettings] = useState<EskerraLocalSettings>(defaultEskerraLocalSettings);
  const [settingsFormKey, setSettingsFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const local = await readVaultLocalSettings(vaultRoot, fs);
        if (!cancelled) {
          setLocalSettings(local);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultRoot, fs]);

  const handleSave = useCallback(
    async (shared: EskerraSettings, local: EskerraLocalSettings) => {
      setBusy(true);
      setErr(null);
      try {
        await writeVaultSettings(vaultRoot, fs, shared);
        await writeVaultLocalSettings(vaultRoot, fs, local);
        setVaultSettings(shared);
        setLocalSettings(local);
        setSettingsFormKey(k => k + 1);
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, setVaultSettings],
  );

  const refreshFromDisk = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const shared = await readVaultSettings(vaultRoot, fs);
      const local = await readVaultLocalSettings(vaultRoot, fs);
      setVaultSettings(shared);
      setLocalSettings(local);
      setSettingsFormKey(k => k + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [vaultRoot, fs, setVaultSettings]);

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <button
          type="button"
          className="settings-page-back icon-btn-ghost app-tooltip-trigger"
          aria-label="Back to workspace"
          data-tooltip="Back"
          data-tooltip-placement="inline-end"
          onClick={onClose}>
          <MaterialIcon name="arrow_back" size={24} aria-hidden />
        </button>
        <h1 className="settings-page-title">Settings</h1>
      </header>

      <div className="settings-page-body">
        <nav className="settings-page-nav" aria-label="Settings sections">
          <button
            type="button"
            className={tab === 'sync' ? 'is-active' : undefined}
            onClick={() => setTab('sync')}>
            Sync
          </button>
          <button
            type="button"
            className={tab === 'themes' ? 'is-active' : undefined}
            onClick={() => setTab('themes')}>
            Themes
          </button>
          <button
            type="button"
            className={tab === 'properties' ? 'is-active' : undefined}
            onClick={() => setTab('properties')}>
            Properties
          </button>
        </nav>

        <div className="settings-page-panel">
          {err ? (
            <div className="error-banner" role="alert">
              {err}
            </div>
          ) : null}
          {tab === 'sync' ? (
            <SettingsContent
              key={settingsFormKey}
              vaultSettings={vaultSettings}
              localSettings={localSettings}
              onSave={handleSave}
              onChangeFolder={() => void onChangeVaultFolder()}
              onRefreshVault={() => void refreshFromDisk()}
              busy={busy}
            />
          ) : tab === 'themes' ? (
            <ThemesTab vaultRoot={vaultRoot} fs={fs} />
          ) : (
            <PropertiesTab
              vaultRoot={vaultRoot}
              fs={fs}
              vaultSettings={vaultSettings}
              setVaultSettings={setVaultSettings}
            />
          )}
        </div>
      </div>
    </div>
  );
}
