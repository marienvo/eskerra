import {open} from '@tauri-apps/plugin-dialog';
import {load} from '@tauri-apps/plugin-store';
import {useCallback, useEffect, useMemo, useState} from 'react';

import {
  defaultEskerraLocalSettings,
  defaultEskerraSettings,
  type EskerraLocalSettings,
  type EskerraSettings,
} from '@eskerra/core';

import {
  bootstrapVaultLayout,
  readVaultLocalSettings,
  readVaultSettings,
  writeVaultLocalSettings,
  writeVaultSettings,
} from '../lib/vaultBootstrap';
import {createTauriVaultFilesystem, getVaultSession, setVaultSession, startVaultWatch} from '../lib/tauriVault';
import {vaultSearchIndexSchedule} from '../lib/tauriVaultSearch';
import {SettingsContent} from './SettingsContent';

const STORE_PATH = 'eskerra-desktop.json';
const STORE_KEY_VAULT = 'vaultRoot';

/**
 * Standalone settings UI for the `settings` webview window (native decorations).
 */
export function SettingsWindowApp() {
  const fs = useMemo(() => createTauriVaultFilesystem(), []);
  const [vaultRoot, setVaultRoot] = useState<string | null>(null);
  const [vaultSettings, setVaultSettings] = useState<EskerraSettings>(defaultEskerraSettings);
  const [localSettings, setLocalSettings] = useState<EskerraLocalSettings>(defaultEskerraLocalSettings);
  /** Bumps to remount [SettingsContent] so form state reloads from disk after save/refresh. */
  const [settingsFormKey, setSettingsFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const hydrateVault = useCallback(
    async (root: string) => {
      setBusy(true);
      setErr(null);
      try {
        await setVaultSession(root);
        await bootstrapVaultLayout(root, fs);
        const shared = await readVaultSettings(root, fs);
        const local = await readVaultLocalSettings(root, fs);
        setVaultSettings(shared);
        setLocalSettings(local);
        setSettingsFormKey(k => k + 1);
        setVaultRoot(root);
        const store = await load(STORE_PATH);
        await store.set(STORE_KEY_VAULT, root);
        await store.save();
        await startVaultWatch();
        queueMicrotask(() => {
          void vaultSearchIndexSchedule().catch(() => undefined);
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [fs],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await load(STORE_PATH);
        const saved = await store.get<string>(STORE_KEY_VAULT);
        const fromStore = typeof saved === 'string' ? saved.trim() : '';
        const session = (await getVaultSession())?.trim() ?? '';
        const root = fromStore || session;
        if (root && !cancelled) {
          await hydrateVault(root);
        }
      } catch {
        // first launch
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateVault]);

  const pickFolder = async () => {
    setErr(null);
    const dir = await open({directory: true, multiple: false});
    if (dir === null || Array.isArray(dir)) {
      return;
    }
    await hydrateVault(dir);
  };

  const refreshFromDisk = async () => {
    if (!vaultRoot) {
      return;
    }
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
  };

  const handleSave = async (shared: EskerraSettings, local: EskerraLocalSettings) => {
    if (!vaultRoot) {
      throw new Error('No vault folder selected.');
    }
    setBusy(true);
    setErr(null);
    try {
      await writeVaultSettings(vaultRoot, fs, shared);
      await writeVaultLocalSettings(vaultRoot, fs, local);
      setVaultSettings(shared);
      setLocalSettings(local);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="settings-window-root">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="settings-window-root">
      {err ? (
        <div className="error-banner" role="alert">
          {err}
        </div>
      ) : null}
      {!vaultRoot ? (
        <div className="settings-window-setup">
          <p className="muted">No vault folder is selected yet. Choose a folder to edit settings.</p>
          <button type="button" className="primary" onClick={() => void pickFolder()} disabled={busy}>
            Choose folder…
          </button>
        </div>
      ) : (
        <SettingsContent
          key={settingsFormKey}
          vaultSettings={vaultSettings}
          localSettings={localSettings}
          onSave={handleSave}
          onChangeFolder={() => void pickFolder()}
          onRefreshVault={() => void refreshFromDisk()}
          busy={busy}
        />
      )}
    </div>
  );
}
