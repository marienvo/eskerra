import {invoke, isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow, PhysicalSize} from '@tauri-apps/api/window';
import {open} from '@tauri-apps/plugin-dialog';
import {listen} from '@tauri-apps/api/event';
import {
  restoreState,
  saveWindowState,
  StateFlags,
} from '@tauri-apps/plugin-window-state';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {DesktopStartupSplash} from './components/DesktopStartupSplash';
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
import {useMainWindowWorkspace} from './hooks/useMainWindowWorkspace';
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
} from './lib/mainWindowUiStore';
import {createTauriVaultFilesystem} from './lib/tauriVault';

import type {PodcastEpisode} from './lib/podcasts/podcastTypes';

import './App.css';

type MainTab = MainTabId;

const TITLE_BAR_SKIP_MS = 10_000;
const MAIN_WINDOW_LABEL = 'main';

/** Wayland often fails `set_position` inside window-state; plugin aborts before `set_size` if POSITION runs first. */
const WINDOW_RESTORE_FLAGS_NO_POSITION = StateFlags.ALL & ~StateFlags.POSITION;

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

  /* Modal dim: match the frameless window’s rounded mask (--window-radius), not the webview rectangle. */
  useLayoutEffect(() => {
    if (!isTauri()) {
      return;
    }
    const rounded =
      !maximized && tiling !== 'left' && tiling !== 'right';
    document.documentElement.style.setProperty(
      '--shell-overlay-radius',
      rounded ? 'var(--window-radius)' : '0px',
    );
    return () => {
      document.documentElement.style.removeProperty('--shell-overlay-radius');
    };
  }, [maximized, tiling]);

  const appRootRef = useRef<HTMLDivElement>(null);
  const fs = useMemo(() => createTauriVaultFilesystem(), []);
  const inboxEditorRef = useRef<NoteMarkdownEditorHandle | null>(null);
  const [layoutsReady, setLayoutsReady] = useState(false);
  const [restoredInboxState, setRestoredInboxState] = useState<{
    vaultRoot: string;
    composingNewEntry: boolean;
    selectedUri: string | null;
  } | null>(null);
  const {
    vaultRoot,
    vaultSettings,
    settingsName,
    notes,
    selectedUri,
    editorBody,
    inboxEditorResetNonce,
    busy,
    err,
    composingNewEntry,
    inboxContentByUri,
    vaultMarkdownRefs,
    selectedNoteBacklinkUris,
    fsRefreshNonce,
    deviceInstanceId,
    inboxRenameNotice,
    renameLinkProgress,
    pendingWikiLinkAmbiguityRename,
    confirmPendingWikiLinkAmbiguityRename,
    cancelPendingWikiLinkAmbiguityRename,
    setErr,
    setEditorBody,
    hydrateVault,
    startNewEntry,
    cancelNewEntry,
    selectNote,
    submitNewEntry,
    onInboxSaveShortcut,
    clearVaultNoteSelection,
    flushInboxSave,
    onWikiLinkActivate,
    deleteNote,
    renameNote,
    deleteFolder,
    renameFolder,
    inboxShellRestored,
    initialVaultHydrateAttemptDone,
  } = useMainWindowWorkspace({
    fs,
    inboxEditorRef,
    restoredInboxState,
    inboxRestoreEnabled: layoutsReady,
  });

  const [mainTab, setMainTab] = useState<MainTab>('podcasts');
  const [layouts, setLayouts] = useState<StoredLayouts>(DEFAULT_LAYOUTS);
  const [podcastsTabMounted, setPodcastsTabMounted] = useState(false);
  const [playerDockVisible, setPlayerDockVisible] = useState(true);
  const [playlistDiskRevision, setPlaylistDiskRevision] = useState(0);
  const [consumeEpisodes, setConsumeEpisodes] = useState<PodcastEpisode[]>([]);
  const [consumeCatalogLoading, setConsumeCatalogLoading] = useState(true);
  const [startupSplashDismissed, setStartupSplashDismissed] = useState(
    () => !isTauri(),
  );

  const appStartupReady = useMemo(
    () =>
      initialVaultHydrateAttemptDone &&
      layoutsReady &&
      (vaultRoot ? inboxShellRestored : true),
    [
      initialVaultHydrateAttemptDone,
      layoutsReady,
      vaultRoot,
      inboxShellRestored,
    ],
  );

  const bumpPlaylistDiskRevision = useCallback(() => {
    setPlaylistDiskRevision(r => r + 1);
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
    onPlaylistDiskUpdated: bumpPlaylistDiskRevision,
    playlistRevision: playlistDiskRevision,
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
    onRemotePlaylistChanged: bumpPlaylistDiskRevision,
    vaultRoot,
    vaultSettings,
  });

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
          setRestoredInboxState({
            vaultRoot: ui.vaultRoot,
            composingNewEntry: ui.inbox.composingNewEntry,
            selectedUri: ui.inbox.selectedUri,
          });
        }
        setLayoutsReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!vaultRoot || !inboxShellRestored) {
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
    inboxShellRestored,
  ]);

  useEffect(() => {
    if (!isTauri() || startupSplashDismissed) {
      return;
    }
    if (!appStartupReady) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const win = getCurrentWindow();
      let diskMainW: number | undefined;
      let diskMainH: number | undefined;
      try {
        const v = await invoke<{
          pathExists: boolean;
          mainWidth?: number;
          mainHeight?: number;
        }>('notebox_peek_window_state_file');
        if (v.pathExists) {
          diskMainW = v.mainWidth;
          diskMainH = v.mainHeight;
        }
      } catch {
        /* ignore: fallback only when peek succeeds */
      }

      try {
        await restoreState(MAIN_WINDOW_LABEL, WINDOW_RESTORE_FLAGS_NO_POSITION);
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error(
            '[eskerra] window-state restore (size, maximized, visible, …) failed',
            e,
          );
        }
      }

      try {
        await restoreState(MAIN_WINDOW_LABEL, StateFlags.POSITION);
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error(
            '[eskerra] window-state restore (position) failed; size already applied',
            e,
          );
        }
      }

      let sizeAfterRestore: {width: number; height: number} | null = null;
      try {
        const s = await win.innerSize();
        sizeAfterRestore = {width: s.width, height: s.height};
      } catch {
        sizeAfterRestore = null;
      }

      const dw = diskMainW;
      const dh = diskMainH;
      if (
        dw != null &&
        dh != null &&
        dw > 0 &&
        dh > 0 &&
        sizeAfterRestore != null &&
        (sizeAfterRestore.width !== dw || sizeAfterRestore.height !== dh)
      ) {
        try {
          await win.setSize(new PhysicalSize(dw, dh));
        } catch (e) {
          if (import.meta.env.DEV) {
            console.error(
              '[eskerra] window restore: setSize from persisted file failed',
              e,
            );
          }
        }
      }

      if (!cancelled) {
        setStartupSplashDismissed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appStartupReady, startupSplashDismissed]);

  const pickFolder = async () => {
    setErr(null);
    const dir = await open({directory: true, multiple: false});
    if (dir === null || Array.isArray(dir)) {
      return;
    }
    await hydrateVault(dir);
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

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let cancelled = false;
    let unlistenClose: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;
    const win = getCurrentWindow();
    void win
      .onCloseRequested(async event => {
        event.preventDefault();
        try {
          await flushInboxSave();
          try {
            await saveWindowState(StateFlags.ALL);
          } catch (e) {
            if (import.meta.env.DEV) {
              console.error('[eskerra] saveWindowState failed', e);
            }
          }
        } finally {
          /* Avoid awaiting destroy inside onCloseRequested (Tauri can deadlock waiting on this handler). */
          void win.destroy();
        }
      })
      .then(fn => {
        if (cancelled) {
          fn();
        } else {
          unlistenClose = fn;
        }
      })
      .catch(() => undefined);
    void win
      .onFocusChanged(({payload: focused}) => {
        if (!focused) {
          void flushInboxSave();
        }
      })
      .then(fn => {
        if (cancelled) {
          fn();
        } else {
          unlistenFocus = fn;
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unlistenClose?.();
      unlistenFocus?.();
    };
  }, [flushInboxSave]);

  const startupOverlay =
    isTauri() && !startupSplashDismissed ? (
      <DesktopStartupSplash />
    ) : null;

  if (!vaultRoot) {
    return (
      <>
        {startupOverlay}
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
      </>
    );
  }

  if (!layoutsReady) {
    return (
      <>
        {startupOverlay}
        <div ref={appRootRef} className={appRootClassName}>
          <WindowTitleBar tiling={tiling} transport={titleBarTransport} />
          <div className="shell setup-shell">
            <p className="muted">Loading…</p>
          </div>
          <AppStatusBar onOpenSettings={() => void openSettingsWindow()} />
        </div>
      </>
    );
  }

  return (
    <>
      {startupOverlay}
      <div ref={appRootRef} className={appRootClassName}>
      <WindowTitleBar tiling={tiling} transport={titleBarTransport} />

      {err ? (
        <div className="error-banner" role="alert">
          {err}
        </div>
      ) : null}
      {!err && renameLinkProgress ? (
        <div className="info-banner" aria-live="polite">
          Updating links… {renameLinkProgress.done}/{renameLinkProgress.total}
        </div>
      ) : null}
      {!err && !renameLinkProgress && inboxRenameNotice ? (
        <div className="info-banner" aria-live="polite">
          {inboxRenameNotice}
        </div>
      ) : null}

      <div className="app-body">
        <RailNav
          active={mainTab}
          onSelect={tab => {
            setMainTab(tab);
            if (tab === 'podcasts') {
              setPodcastsTabMounted(true);
            }
          }}
          onTogglePlayerDock={() => setPlayerDockVisible(v => !v)}
          playerDockVisible={playerDockVisible}
          playerToggleDisabled={desktopPlayback.activeEpisode == null}
        />
        <div className="main-column">
          <main className="main-stage">
            <div className="tab-panel" hidden={mainTab !== 'inbox'}>
              <InboxTab
                key={vaultRoot}
                vaultRoot={vaultRoot}
                fs={fs}
                fsRefreshNonce={fsRefreshNonce}
                inboxEditorRef={inboxEditorRef}
                leftWidthPx={layouts.inbox.leftWidthPx}
                onLeftWidthPxChanged={persistInboxLeftWidthPx}
                notes={notes}
                vaultMarkdownRefs={vaultMarkdownRefs}
                inboxContentByUri={inboxContentByUri}
                backlinkUris={selectedNoteBacklinkUris}
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
                onWikiLinkActivate={onWikiLinkActivate}
                onSaveShortcut={onInboxSaveShortcut}
                onVaultFolderSelect={clearVaultNoteSelection}
                busy={busy}
                onDeleteNote={uri => {
                  void deleteNote(uri);
                }}
                onRenameNote={(uri, nextDisplayName) => {
                  void renameNote(uri, nextDisplayName);
                }}
                onDeleteFolder={uri => {
                  void deleteFolder(uri);
                }}
                onRenameFolder={(uri, nextDisplayName) => {
                  void renameFolder(uri, nextDisplayName);
                }}
                wikiLinkAmbiguityRenamePrompt={
                  pendingWikiLinkAmbiguityRename?.summary ?? null
                }
                onConfirmWikiLinkAmbiguityRename={() => {
                  void confirmPendingWikiLinkAmbiguityRename();
                }}
                onCancelWikiLinkAmbiguityRename={
                  cancelPendingWikiLinkAmbiguityRename
                }
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
                  playlistRevision={playlistDiskRevision}
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
    </>
  );
}
