import {open} from '@tauri-apps/plugin-dialog';
import {listen} from '@tauri-apps/api/event';
import {load} from '@tauri-apps/plugin-store';
import type {Layout} from 'react-resizable-panels';
import {useCallback, useEffect, useLayoutEffect, useMemo, useState} from 'react';

import {AddNoteModal} from './components/AddNoteModal';
import {InboxTab} from './components/InboxTab';
import {PodcastsTab} from './components/PodcastsTab';
import {RailNav} from './components/RailNav';
import {SettingsModal} from './components/SettingsModal';
import {WindowTitleBar} from './components/WindowTitleBar';
import {getDesktopAudioPlayer} from './lib/htmlAudioPlayer';
import {
  DEFAULT_LAYOUTS,
  loadStoredLayouts,
  saveStoredLayouts,
  type StoredLayouts,
} from './lib/layoutStore';
import {
  bootstrapVaultLayout,
  createInboxMarkdownNote,
  listInboxNotes,
  readVaultSettings,
  saveNoteMarkdown,
  syncInboxMarkdownIndex,
  writeVaultSettings,
} from './lib/vaultBootstrap';
import {
  createTauriVaultFilesystem,
  getVaultSession,
  setVaultSession,
  startVaultWatch,
} from './lib/tauriVault';

import './App.css';

const STORE_PATH = 'notebox-desktop.json';
const STORE_KEY_VAULT = 'vaultRoot';

type NoteRow = {lastModified: number | null; name: string; uri: string};
type MainTab = 'podcasts' | 'inbox';

export default function App() {
  const fs = useMemo(() => createTauriVaultFilesystem(), []);
  const [vaultRoot, setVaultRoot] = useState<string | null>(null);
  const [settingsName, setSettingsName] = useState('Notebox');
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [editorBody, setEditorBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [mainTab, setMainTab] = useState<MainTab>('podcasts');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [layouts, setLayouts] = useState<StoredLayouts>(DEFAULT_LAYOUTS);
  const [layoutsReady, setLayoutsReady] = useState(false);
  const [fsRefreshNonce, setFsRefreshNonce] = useState(0);
  const [podcastsTabMounted, setPodcastsTabMounted] = useState(false);

  const refreshNotes = useCallback(
    async (root: string) => {
      const list = await listInboxNotes(root, fs);
      setNotes(list);
    },
    [fs],
  );

  const hydrateVault = useCallback(
    async (root: string) => {
      setBusy(true);
      setErr(null);
      try {
        await setVaultSession(root);
        await bootstrapVaultLayout(root, fs);
        await syncInboxMarkdownIndex(root, fs);
        const s = await readVaultSettings(root, fs);
        setSettingsName(s.displayName);
        await refreshNotes(root);
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
    [fs, refreshNotes],
  );

  useLayoutEffect(() => {
    if (mainTab === 'podcasts') {
      setPodcastsTabMounted(true);
    }
  }, [mainTab]);

  useEffect(() => {
    let cancelled = false;
    void loadStoredLayouts().then(loaded => {
      if (!cancelled) {
        setLayouts(loaded);
        setLayoutsReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateVault]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<string>('media-control', event => {
      const action = event.payload;
      const p = getDesktopAudioPlayer();
      if (action === 'pause' || action === 'stop') {
        void p.pause();
        return;
      }
      if (action === 'play' || action === 'toggle') {
        void p.resumeOrToggleFromOs();
      }
    })
      .then(fn => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!vaultRoot) {
      return;
    }
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen('vault-files-changed', () => {
      void refreshNotes(vaultRoot);
      setFsRefreshNonce(n => n + 1);
    })
      .then(fn => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [vaultRoot, refreshNotes]);

  useEffect(() => {
    if (!vaultRoot || !selectedUri) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await fs.readFile(selectedUri, {encoding: 'utf8'});
        if (!cancelled) {
          setEditorBody(raw.replace(/\n$/, ''));
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultRoot, selectedUri, fs]);

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

  const addNote = async (title: string, body: string) => {
    if (!vaultRoot) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const created = await createInboxMarkdownNote(vaultRoot, fs, title, body);
      await refreshNotes(vaultRoot);
      setSelectedUri(created.uri);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!selectedUri) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await saveNoteMarkdown(selectedUri, fs, editorBody);
      if (vaultRoot) {
        await refreshNotes(vaultRoot);
      }
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
      await refreshNotes(vaultRoot);
      setFsRefreshNonce(n => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const persistInboxLayout = useCallback((layout: Layout) => {
    setLayouts(prev => {
      const next = {...prev, inbox: layout};
      void saveStoredLayouts(next);
      return next;
    });
  }, []);

  const persistPodcastsMainLayout = useCallback((layout: Layout) => {
    setLayouts(prev => {
      const next = {...prev, podcastsMain: layout};
      void saveStoredLayouts(next);
      return next;
    });
  }, []);

  if (!vaultRoot) {
    return (
      <div className="app-root">
        <WindowTitleBar title={settingsName} />
        <div className="shell setup-shell">
          <h1>{settingsName}</h1>
          <p className="muted">Choose your notes folder (vault root). Settings are stored in `.notebox/` inside it.</p>
          <button type="button" className="primary" onClick={() => void pickFolder()} disabled={busy}>
            Choose folder…
          </button>
          {err ? <p className="error">{err}</p> : null}
        </div>
      </div>
    );
  }

  if (!layoutsReady) {
    return (
      <div className="app-root">
        <WindowTitleBar title={settingsName} />
        <div className="shell setup-shell">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <WindowTitleBar title={settingsName} onSettingsClick={() => setSettingsOpen(true)} />

      {err ? (
        <div className="error-banner" role="alert">
          {err}
        </div>
      ) : null}

      <div className="app-body">
        <RailNav active={mainTab} onSelect={setMainTab} />
        <main className="main-stage">
          <div className="tab-panel" hidden={mainTab !== 'inbox'}>
            <InboxTab
              defaultLayout={layouts.inbox}
              onLayoutChanged={persistInboxLayout}
              notes={notes}
              selectedUri={selectedUri}
              onSelectNote={setSelectedUri}
              onAddEntry={() => setAddNoteOpen(true)}
              editorBody={editorBody}
              onEditorChange={setEditorBody}
              onSaveNote={() => void saveNote()}
              busy={busy}
            />
          </div>
          {podcastsTabMounted ? (
            <div className="tab-panel" hidden={mainTab !== 'podcasts'}>
              <PodcastsTab
                key={vaultRoot}
                vaultRoot={vaultRoot}
                fs={fs}
                displayName={settingsName}
                defaultMainLayout={layouts.podcastsMain}
                onMainLayoutChanged={persistPodcastsMainLayout}
                onError={setErr}
                fsRefreshNonce={fsRefreshNonce}
              />
            </div>
          ) : null}
        </main>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        displayName={settingsName}
        onDisplayNameChange={setSettingsName}
        onSaveDisplayName={() => void saveDisplayName()}
        onChangeFolder={() => void pickFolder()}
        onRefreshVault={() => void refreshFromDisk()}
        busy={busy}
      />

      <AddNoteModal
        open={addNoteOpen}
        onClose={() => setAddNoteOpen(false)}
        onCreate={addNote}
        busy={busy}
      />
    </div>
  );
}
