import {isTauri} from '@tauri-apps/api/core';
import {open} from '@tauri-apps/plugin-dialog';
import {listen} from '@tauri-apps/api/event';
import {load} from '@tauri-apps/plugin-store';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';

import {DesktopPlayerDock} from './components/DesktopPlayerDock';
import {InboxTab} from './components/InboxTab';
import type {NoteMarkdownEditorHandle} from './editor/noteEditor/NoteMarkdownEditor';
import {PodcastsTab} from './components/PodcastsTab';
import {AppStatusBar} from './components/AppStatusBar';
import {RailNav} from './components/RailNav';
import type {TitleBarTransportProps} from './components/TitleBarTransport';
import {WindowTitleBar} from './components/WindowTitleBar';
import {useDesktopPlaylistR2EtagPollingForMainWindow} from './hooks/useDesktopPlaylistR2EtagPolling';
import {useDesktopPodcastPlayback} from './hooks/useDesktopPodcastPlayback';
import {useTauriWindowMaximized} from './hooks/useTauriWindowMaximized';
import {useTauriWindowTiling} from './hooks/useTauriWindowTiling';
import {openSettingsWindow} from './lib/openSettingsWindow';
import {getDesktopAudioPlayer} from './lib/htmlAudioPlayer';
import {
  DEFAULT_LAYOUTS,
  loadStoredLayouts,
  saveStoredLayouts,
  type StoredLayouts,
} from './lib/layoutStore';
import {
  loadMainWindowUi,
  saveMainWindowUi,
  type MainTabId,
  type StoredMainWindowInbox,
} from './lib/mainWindowUiStore';
import {persistTransientMarkdownImages} from './lib/persistTransientMarkdownImages';
import {
  bootstrapVaultLayout,
  createInboxMarkdownNote,
  listInboxNotes,
  prefetchInboxMarkdownBodies,
  readVaultLocalSettings,
  readVaultSettings,
  saveNoteMarkdown,
  syncInboxMarkdownIndex,
  writeVaultLocalSettings,
} from './lib/vaultBootstrap';
import {
  createTauriVaultFilesystem,
  getVaultSession,
  setVaultSession,
  startVaultWatch,
} from './lib/tauriVault';
import {
  buildInboxMarkdownFromCompose,
  ensureDeviceInstanceId,
  markdownContainsTransientImageUrls,
  parseComposeInput,
  type NoteboxSettings,
} from '@notebox/core';

import type {PodcastEpisode} from './lib/podcasts/podcastTypes';

import './App.css';

const STORE_PATH = 'notebox-desktop.json';
const STORE_KEY_VAULT = 'vaultRoot';

type NoteRow = {lastModified: number | null; name: string; uri: string};
type MainTab = MainTabId;

const TITLE_BAR_SKIP_MS = 10_000;

export default function App() {
  const {maximized} = useTauriWindowMaximized();
  const {tiling, tilingDebug} = useTauriWindowTiling();
  const appRootClassName = useMemo(() => {
    const parts = ['app-root'];
    if (isTauri()) {
      parts.push('app-root--tauri');
    }
    if (maximized) {
      parts.push('app-root--maximized');
    }
    if (tiling === 'left') {
      parts.push('app-root--tiled-left');
    }
    if (tiling === 'right') {
      parts.push('app-root--tiled-right');
    }
    if (tilingDebug) {
      parts.push('app-root--tiling-debug');
    }
    return parts.join(' ');
  }, [maximized, tiling, tilingDebug]);
  const appRootRef = useRef<HTMLDivElement>(null);
  const fs = useMemo(() => createTauriVaultFilesystem(), []);
  const [vaultRoot, setVaultRoot] = useState<string | null>(null);
  const [vaultSettings, setVaultSettings] = useState<NoteboxSettings | null>(null);
  const [settingsName, setSettingsName] = useState('Notebox');
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [editorBody, setEditorBody] = useState('');
  const [inboxEditorResetNonce, setInboxEditorResetNonce] = useState(0);
  const inboxEditorRef = useRef<NoteMarkdownEditorHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [mainTab, setMainTab] = useState<MainTab>('podcasts');
  const [composingNewEntry, setComposingNewEntry] = useState(false);
  const [layouts, setLayouts] = useState<StoredLayouts>(DEFAULT_LAYOUTS);
  const [layoutsReady, setLayoutsReady] = useState(false);
  const [fsRefreshNonce, setFsRefreshNonce] = useState(0);
  const [podcastsTabMounted, setPodcastsTabMounted] = useState(false);
  const [playerDockVisible, setPlayerDockVisible] = useState(true);
  const [playlistRevision, setPlaylistRevision] = useState(0);
  const [consumeEpisodes, setConsumeEpisodes] = useState<PodcastEpisode[]>([]);
  const [consumeCatalogLoading, setConsumeCatalogLoading] = useState(true);
  const [deviceInstanceId, setDeviceInstanceId] = useState('');
  const [mainShellRestored, setMainShellRestored] = useState(false);

  const inboxShellRestorePendingRef = useRef<{
    vaultRoot: string;
    inbox: StoredMainWindowInbox;
  } | null>(null);
  const inboxShellAppliedRef = useRef<string | null>(null);
  const inboxBodyPrefetchGenRef = useRef(0);
  const [inboxContentByUri, setInboxContentByUri] = useState<
    Record<string, string>
  >({});

  const bumpPlaylistRevision = useCallback(() => {
    setPlaylistRevision(r => r + 1);
  }, []);

  const onAutoShowPlayerDock = useCallback(() => {
    setPlayerDockVisible(true);
  }, []);

  const consumeCatalogReady = podcastsTabMounted && !consumeCatalogLoading;

  const onConsumeCatalogState = useCallback(
    (s: {catalogLoading: boolean; episodes: PodcastEpisode[]}) => {
      setConsumeEpisodes(s.episodes);
      setConsumeCatalogLoading(s.catalogLoading);
    },
    [],
  );

  const desktopPlayback = useDesktopPodcastPlayback({
    consumeCatalogReady,
    consumeEpisodes,
    deviceInstanceId,
    fs,
    onAutoShowPlayerDock,
    onError: setErr,
    onPlaylistDiskUpdated: bumpPlaylistRevision,
    playlistRevision,
    vaultRoot,
  });

  const titleBarTransport: TitleBarTransportProps = {
    disabled:
      desktopPlayback.activeEpisode == null ||
      desktopPlayback.playerLabel === 'loading',
    isPlaying: desktopPlayback.playerLabel === 'playing',
    onSeekBack: () => void desktopPlayback.seekBy(-TITLE_BAR_SKIP_MS),
    onTogglePlay: () => void desktopPlayback.togglePause(),
    onSeekForward: () => void desktopPlayback.seekBy(TITLE_BAR_SKIP_MS),
  };

  useDesktopPlaylistR2EtagPollingForMainWindow({
    allowPolling: desktopPlayback.playerLabel !== 'playing',
    deviceInstanceId,
    onRemotePlaylistChanged: bumpPlaylistRevision,
    vaultRoot,
    vaultSettings,
  });

  const refreshNotes = useCallback(
    async (root: string) => {
      const gen = ++inboxBodyPrefetchGenRef.current;
      const list = await listInboxNotes(root, fs);
      if (gen !== inboxBodyPrefetchGenRef.current) {
        return;
      }
      setNotes(list);
      bumpPlaylistRevision();
      const bodies = await prefetchInboxMarkdownBodies(list, fs);
      if (gen !== inboxBodyPrefetchGenRef.current) {
        return;
      }
      setInboxContentByUri(bodies);
    },
    [bumpPlaylistRevision, fs],
  );

  const hydrateVault = useCallback(
    async (root: string) => {
      setBusy(true);
      setErr(null);
      setVaultSettings(null);
      try {
        await setVaultSession(root);
        await bootstrapVaultLayout(root, fs);
        await syncInboxMarkdownIndex(root, fs);
        const shared = await readVaultSettings(root, fs);
        setVaultSettings(shared);
        let local = await readVaultLocalSettings(root, fs);
        const ensuredLocal = ensureDeviceInstanceId(local);
        if (ensuredLocal.changed) {
          local = ensuredLocal.settings;
          await writeVaultLocalSettings(root, fs, local);
        }
        setDeviceInstanceId(local.deviceInstanceId);
        const label = local.displayName.trim();
        setSettingsName(label !== '' ? label : 'Notebox');
        await refreshNotes(root);
        setSelectedUri(null);
        setComposingNewEntry(false);
        setEditorBody('');
        setInboxEditorResetNonce(n => n + 1);
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
    void Promise.all([loadStoredLayouts(), loadMainWindowUi()]).then(
      ([loadedLayouts, ui]) => {
        if (cancelled) {
          return;
        }
        setLayouts(loadedLayouts);
        if (ui) {
          setMainTab(ui.mainTab);
          setPlayerDockVisible(ui.playerDockVisible);
          inboxShellRestorePendingRef.current = {
            vaultRoot: ui.vaultRoot,
            inbox: ui.inbox,
          };
        }
        setLayoutsReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    inboxShellAppliedRef.current = null;
    setMainShellRestored(false);
  }, [vaultRoot]);

  useEffect(() => {
    if (!vaultRoot || !layoutsReady) {
      return;
    }
    if (inboxShellAppliedRef.current === vaultRoot) {
      return;
    }
    const pending = inboxShellRestorePendingRef.current;
    if (pending && pending.vaultRoot === vaultRoot) {
      if (pending.inbox.composingNewEntry) {
        setComposingNewEntry(true);
        setSelectedUri(null);
        setEditorBody('');
        setInboxEditorResetNonce(n => n + 1);
      } else if (pending.inbox.selectedUri) {
        const uri = pending.inbox.selectedUri;
        if (notes.some(n => n.uri === uri)) {
          setComposingNewEntry(false);
          setSelectedUri(uri);
        }
      }
      inboxShellRestorePendingRef.current = null;
    }
    inboxShellAppliedRef.current = vaultRoot;
    setMainShellRestored(true);
  }, [vaultRoot, notes, layoutsReady]);

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
      void (async () => {
        try {
          const next = await readVaultSettings(vaultRoot, fs);
          setVaultSettings(next);
        } catch {
          // ignore: transient FS race
        }
      })();
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
  }, [vaultRoot, refreshNotes, fs]);

  useEffect(() => {
    if (!vaultRoot || !selectedUri) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await fs.readFile(selectedUri, {encoding: 'utf8'});
        if (!cancelled) {
          const normalized = raw.replace(/\n$/, '');
          setEditorBody(normalized);
          setInboxContentByUri(prev => ({...prev, [selectedUri]: normalized}));
          setInboxEditorResetNonce(n => n + 1);
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

  useEffect(() => {
    if (!vaultRoot || !mainShellRestored) {
      return;
    }
    const payload = {
      vaultRoot,
      mainTab,
      playerDockVisible,
      inbox: {
        composingNewEntry,
        selectedUri,
      },
    };
    const t = window.setTimeout(() => {
      void saveMainWindowUi(payload);
    }, 200);
    return () => {
      window.clearTimeout(t);
    };
  }, [
    vaultRoot,
    mainTab,
    playerDockVisible,
    selectedUri,
    composingNewEntry,
    mainShellRestored,
  ]);

  const pickFolder = async () => {
    setErr(null);
    const dir = await open({directory: true, multiple: false});
    if (dir === null || Array.isArray(dir)) {
      return;
    }
    await hydrateVault(dir);
  };

  const addNote = useCallback(
    async (title: string, body: string) => {
      if (!vaultRoot) {
        return;
      }
      setBusy(true);
      setErr(null);
      try {
        const created = await createInboxMarkdownNote(vaultRoot, fs, title, body);
        await refreshNotes(vaultRoot);
        setSelectedUri(created.uri);
        setComposingNewEntry(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes],
  );

  const startNewEntry = useCallback(() => {
    setErr(null);
    setComposingNewEntry(true);
    setSelectedUri(null);
    setEditorBody('');
    setInboxEditorResetNonce(n => n + 1);
  }, []);

  const cancelNewEntry = useCallback(() => {
    setComposingNewEntry(false);
    setEditorBody('');
    setInboxEditorResetNonce(n => n + 1);
  }, []);

  const selectNote = useCallback((uri: string) => {
    setComposingNewEntry(false);
    setSelectedUri(uri);
  }, []);

  const submitNewEntry = useCallback(async () => {
    if (!vaultRoot) {
      return;
    }
    setErr(null);
    const rawBody = inboxEditorRef.current?.getMarkdown() ?? editorBody;
    let body = rawBody;
    try {
      body = await persistTransientMarkdownImages(body, vaultRoot);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return;
    }
    if (markdownContainsTransientImageUrls(body)) {
      setErr(
        'Cannot create this note: some images are still temporary (blob or data URLs). Paste images again so they are stored under Assets/Attachments, or remove those image references.',
      );
      return;
    }
    if (body !== rawBody) {
      inboxEditorRef.current?.loadMarkdown(body);
      setEditorBody(body);
    }
    const {titleLine, bodyAfterBlank} = parseComposeInput(body);
    if (!titleLine.trim()) {
      setErr('First line is required.');
      return;
    }
    const fullMarkdown = buildInboxMarkdownFromCompose(titleLine, bodyAfterBlank);
    void addNote(titleLine, fullMarkdown);
  }, [addNote, editorBody, vaultRoot]);

  const saveNote = async () => {
    if (!selectedUri || !vaultRoot) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const raw = inboxEditorRef.current?.getMarkdown() ?? editorBody;
      const md = await persistTransientMarkdownImages(raw, vaultRoot);
      if (markdownContainsTransientImageUrls(md)) {
        throw new Error(
          'Cannot save: some images are still temporary (blob or data URLs). Paste images again so they are stored under Assets/Attachments, or remove those image references.',
        );
      }
      if (md !== raw) {
        inboxEditorRef.current?.loadMarkdown(md);
        setEditorBody(md);
      }
      await saveNoteMarkdown(selectedUri, fs, md);
      await refreshNotes(vaultRoot);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const persistInboxLeftWidthPx = useCallback((leftWidthPx: number) => {
    setLayouts(prev => {
      const next = {...prev, inbox: {leftWidthPx}};
      void saveStoredLayouts(next);
      return next;
    });
  }, []);

  const persistPodcastsLeftWidthPx = useCallback((leftWidthPx: number) => {
    setLayouts(prev => {
      const next = {...prev, podcastsMain: {leftWidthPx}};
      void saveStoredLayouts(next);
      return next;
    });
  }, []);

  if (!vaultRoot) {
    return (
      <div ref={appRootRef} className={appRootClassName}>
        <WindowTitleBar tiling={tiling} transport={titleBarTransport} />
        <div className="shell setup-shell">
          <h1>{settingsName}</h1>
          <p className="muted">Choose your notes folder (vault root). Settings are stored in `.notebox/` inside it.</p>
          <button type="button" className="primary" onClick={() => void pickFolder()} disabled={busy}>
            Choose folder…
          </button>
          {err ? <p className="error">{err}</p> : null}
        </div>
        <AppStatusBar onOpenSettings={() => void openSettingsWindow()} />
      </div>
    );
  }

  if (!layoutsReady) {
    return (
      <div ref={appRootRef} className={appRootClassName}>
        <WindowTitleBar tiling={tiling} transport={titleBarTransport} />
        <div className="shell setup-shell">
          <p className="muted">Loading…</p>
        </div>
        <AppStatusBar onOpenSettings={() => void openSettingsWindow()} />
      </div>
    );
  }

  return (
    <div ref={appRootRef} className={appRootClassName}>
      <WindowTitleBar tiling={tiling} transport={titleBarTransport} />

      {err ? (
        <div className="error-banner" role="alert">
          {err}
        </div>
      ) : null}

      <div className="app-body">
        <RailNav
          active={mainTab}
          onSelect={setMainTab}
          onTogglePlayerDock={() => setPlayerDockVisible(v => !v)}
          playerDockVisible={playerDockVisible}
          playerToggleDisabled={desktopPlayback.activeEpisode == null}
        />
        <div className="main-column">
          <main className="main-stage">
            <div className="tab-panel" hidden={mainTab !== 'inbox'}>
              <InboxTab
                vaultRoot={vaultRoot}
                inboxEditorRef={inboxEditorRef}
                leftWidthPx={layouts.inbox.leftWidthPx}
                onLeftWidthPxChanged={persistInboxLeftWidthPx}
                notes={notes}
                inboxContentByUri={inboxContentByUri}
                selectedUri={selectedUri}
                onSelectNote={selectNote}
                onAddEntry={startNewEntry}
                composingNewEntry={composingNewEntry}
                onCancelNewEntry={cancelNewEntry}
                onCreateNewEntry={() => void submitNewEntry()}
                editorBody={editorBody}
                onEditorChange={setEditorBody}
                inboxEditorResetNonce={inboxEditorResetNonce}
                onEditorError={setErr}
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
                  leftWidthPx={layouts.podcastsMain.leftWidthPx}
                  onLeftWidthPxChanged={persistPodcastsLeftWidthPx}
                  onConsumeCatalogState={onConsumeCatalogState}
                  onError={setErr}
                  fsRefreshNonce={fsRefreshNonce}
                  playEpisode={desktopPlayback.playEpisode}
                  playlistRevision={playlistRevision}
                  resumeFromVault={desktopPlayback.resumeFromVault}
                  episodeSelectLocked={desktopPlayback.playerLabel === 'playing'}
                />
              </div>
            ) : null}
          </main>
          {playerDockVisible && desktopPlayback.activeEpisode != null ? (
            <DesktopPlayerDock
              activeEpisode={desktopPlayback.activeEpisode}
              durationMs={desktopPlayback.durationMs}
              playerLabel={desktopPlayback.playerLabel}
              positionMs={desktopPlayback.positionMs}
              onTogglePause={desktopPlayback.togglePause}
            />
          ) : null}
        </div>
      </div>

      <AppStatusBar onOpenSettings={() => void openSettingsWindow()} />
    </div>
  );
}
