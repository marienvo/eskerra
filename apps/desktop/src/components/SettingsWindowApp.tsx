import {open} from '@tauri-apps/plugin-dialog';
import {load} from '@tauri-apps/plugin-store';
import {useCallback, useEffect, useMemo, useState} from 'react';

import {bootstrapVaultLayout, readVaultSettings, writeVaultSettings} from '../lib/vaultBootstrap';
import {createTauriVaultFilesystem, getVaultSession, setVaultSession, startVaultWatch} from '../lib/tauriVault';
import {SettingsContent} from './SettingsContent';

const STORE_PATH = 'notebox-desktop.json';
const STORE_KEY_VAULT = 'vaultRoot';

/**
 * Standalone settings UI for the `settings` webview window (native decorations).
 */
export function SettingsWindowApp() {
  const fs = useMemo(() => createTauriVaultFilesystem(), []);
  const [vaultRoot, setVaultRoot] = useState<string | null>(null);
  const [settingsName, setSettingsName] = useState('Notebox');
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
        const s = await readVaultSettings(root, fs);
        setSettingsName(s.displayName);
        setVaultRoot(root);
        const store = await load(STORE_PATH);
        await store.set(STORE_KEY_VAULT, root);
        await store.save();
        await startVaultWatch();
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

  const saveDisplayName = async () => {
    if (!vaultRoot) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await writeVaultSettings(vaultRoot, fs, {displayName: settingsName});
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const refreshFromDisk = async () => {
    if (!vaultRoot) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const s = await readVaultSettings(vaultRoot, fs);
      setSettingsName(s.displayName);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
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
          displayName={settingsName}
          onDisplayNameChange={setSettingsName}
          onSaveDisplayName={() => void saveDisplayName()}
          onChangeFolder={() => void pickFolder()}
          onRefreshVault={() => void refreshFromDisk()}
          busy={busy}
        />
      )}
    </div>
  );
}
