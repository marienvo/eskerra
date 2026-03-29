import {open} from '@tauri-apps/plugin-dialog';
import {load} from '@tauri-apps/plugin-store';
import {listen} from '@tauri-apps/api/event';
import {useCallback, useEffect, useMemo, useState} from 'react';

import {getDesktopAudioPlayer} from './lib/htmlAudioPlayer';
import {
  bootstrapVaultLayout,
  createInboxMarkdownNote,
  listInboxNotes,
  readPlaylistEntry,
  readVaultSettings,
  saveNoteMarkdown,
  syncInboxMarkdownIndex,
  writePlaylistEntry,
  writeVaultSettings,
} from './lib/vaultBootstrap';
import {
  createTauriVaultFilesystem,
  getVaultSession,
  setVaultSession,
} from './lib/tauriVault';

import './App.css';

const STORE_PATH = 'notebox-desktop.json';
const STORE_KEY_VAULT = 'vaultRoot';

type NoteRow = {lastModified: number | null; name: string; uri: string};

export default function App() {
  const fs = useMemo(() => createTauriVaultFilesystem(), []);
  const [vaultRoot, setVaultRoot] = useState<string | null>(null);
  const [settingsName, setSettingsName] = useState('Notebox');
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [editorBody, setEditorBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [mp3Url, setMp3Url] = useState('');
  const [nowPlaying, setNowPlaying] = useState('');

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
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [fs, refreshNotes],
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
        // first launch: no store yet
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
    }).then(fn => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

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

  const addNote = async () => {
    if (!vaultRoot) {
      return;
    }
    const title = window.prompt('Note title', 'Draft') ?? 'Draft';
    setBusy(true);
    setErr(null);
    try {
      const created = await createInboxMarkdownNote(vaultRoot, fs, title, '');
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

  const playStream = async () => {
    const url = mp3Url.trim();
    if (!url) {
      return;
    }
    setErr(null);
    const p = getDesktopAudioPlayer();
    const entryId = 'manual-stream';
    const episodeId = entryId;
    if (vaultRoot) {
      try {
        await writePlaylistEntry(vaultRoot, fs, {
          episodeId,
          mp3Url: url,
          positionMs: 0,
          durationMs: null,
        });
      } catch {
        // ignore playlist write errors for ad-hoc streams
      }
    }
    setNowPlaying(url);
    await p.play(
      {
        id: entryId,
        title: 'Stream',
        artist: settingsName,
        url,
      },
      undefined,
    );
  };

  const resumeFromVault = async () => {
    if (!vaultRoot) {
      return;
    }
    setErr(null);
    try {
      const pl = await readPlaylistEntry(vaultRoot, fs);
      if (!pl) {
        setErr('No playlist entry in vault.');
        return;
      }
      const p = getDesktopAudioPlayer();
      setNowPlaying(pl.mp3Url);
      await p.play(
        {
          id: pl.episodeId,
          title: 'Podcast',
          artist: settingsName,
          url: pl.mp3Url,
        },
        pl.positionMs,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (!vaultRoot) {
    return (
      <div className="shell">
        <h1>{settingsName}</h1>
        <p className="muted">Choose your notes folder (vault root). Settings are stored in `.notebox/` inside it.</p>
        <button type="button" className="primary" onClick={() => void pickFolder()} disabled={busy}>
          Choose folder…
        </button>
        {err ? <p className="error">{err}</p> : null}
      </div>
    );
  }

  return (
    <div className="shell layout">
      <header className="header">
        <h1>{settingsName}</h1>
        <div className="row">
          <label className="grow">
            Display name
            <input
              value={settingsName}
              onChange={e => setSettingsName(e.target.value)}
            />
          </label>
          <button type="button" onClick={() => void saveDisplayName()} disabled={busy}>
            Save name
          </button>
          <button type="button" className="ghost" onClick={() => void pickFolder()} disabled={busy}>
            Change folder…
          </button>
        </div>
      </header>

      {err ? <p className="error">{err}</p> : null}

      <div className="main">
        <aside className="sidebar">
          <div className="row">
            <button type="button" className="primary" onClick={() => void addNote()} disabled={busy}>
              New note
            </button>
            <button type="button" onClick={() => void refreshNotes(vaultRoot)} disabled={busy}>
              Refresh
            </button>
          </div>
          <ul className="note-list">
            {notes.map(n => (
              <li key={n.uri}>
                <button
                  type="button"
                  className={n.uri === selectedUri ? 'active' : ''}
                  onClick={() => setSelectedUri(n.uri)}
                >
                  {n.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="editor">
          {selectedUri ? (
            <>
              <textarea
                value={editorBody}
                onChange={e => setEditorBody(e.target.value)}
                spellCheck={false}
                placeholder="Markdown"
              />
              <div className="row">
                <button type="button" className="primary" onClick={() => void saveNote()} disabled={busy}>
                  Save note
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Select a note or create one.</p>
          )}
        </section>
      </div>

      <footer className="player-panel">
        <div className="row wrap">
          <label className="grow">
            MP3 URL (stream)
            <input value={mp3Url} onChange={e => setMp3Url(e.target.value)} placeholder="https://…" />
          </label>
          <button type="button" className="primary" onClick={() => void playStream()}>
            Play
          </button>
          <button type="button" onClick={() => void getDesktopAudioPlayer().pause()}>
            Pause
          </button>
          <button type="button" onClick={() => void resumeFromVault()}>
            Resume from vault playlist
          </button>
        </div>
        {nowPlaying ? <p className="muted small">Now playing: {nowPlaying}</p> : null}
      </footer>
    </div>
  );
}
