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

import {AppChromeBackground} from './components/AppChromeBackground';
import {
  DesktopStartupSplash,
  type DesktopStartupSplashPhase,
} from './components/DesktopStartupSplash';
import {QuickOpenNotePalette} from './components/QuickOpenNotePalette';
import {VaultSearchPalette} from './components/VaultSearchPalette';
import {VaultTab} from './components/VaultTab.tsx';
import type {NoteMarkdownEditorHandle} from './editor/noteEditor/NoteMarkdownEditor';
import {EpisodesPane} from './components/EpisodesPane';
import {
  APP_SHELL_TAGLINE,
  AppSetupTagline,
  AppStatusBar,
} from './components/AppStatusBar';
import type {PlaybackTransportProps} from './components/PlaybackTransport';
import {WindowTitleBar} from './components/WindowTitleBar';
import {useDesktopPlaylistR2EtagPollingForMainWindow} from './hooks/useDesktopPlaylistR2EtagPolling';
import {useDesktopPodcastCatalog} from './hooks/useDesktopPodcastCatalog';
import {useDesktopPodcastPlayback} from './hooks/useDesktopPodcastPlayback';
import {useTauriWindowMaximized} from './hooks/useTauriWindowMaximized';
import {useTauriWindowTiling} from './hooks/useTauriWindowTiling';
import {useEditorHistoryMouseButtons} from './hooks/useEditorHistoryMouseButtons';
import {useMainWindowWorkspace} from './hooks/useMainWindowWorkspace';
import {usePreventMiddleClickPaste} from './hooks/usePreventMiddleClickPaste';
import {useSessionNotifications} from './hooks/useSessionNotifications';
import {openSettingsWindow} from './lib/openSettingsWindow';
import {defaultEskerraSettings, isVaultR2PlaylistConfigured} from '@eskerra/core';

import {getDesktopAudioPlayer} from './lib/htmlAudioPlayer';
import {normalizeEditorDocUri} from './lib/editorDocumentHistory';
import {
  tabCurrentUri,
  tabsToStored,
} from './lib/editorWorkspaceTabs';
import {
  DEFAULT_LAYOUTS,
  loadStoredLayouts,
  saveStoredLayouts,
  type StoredLayouts,
} from './lib/layoutStore';
import {hydrateEmojiUsageFromStore} from './lib/emojiUsageStore';
import {formatPlaybackMs} from './lib/formatPlaybackMs';
import {
  DEFAULT_MAIN_WINDOW_PANE_VISIBILITY,
  loadMainWindowUi,
  saveMainWindowUi,
  type TodayHubWorkspaceSnapshot,
} from './lib/mainWindowUiStore';
import {
  initialDoubleShiftState,
  reduceDoubleShiftKeyDown,
  reduceDoubleShiftKeyUp,
} from './lib/doubleShiftKeySequence';
import {resolveAppStatusBarCenter} from './lib/resolveAppStatusBarCenter';
import {createTauriVaultFilesystem} from './lib/tauriVault';

import './App.css';

type StartupSplashPhase = DesktopStartupSplashPhase | 'done';

const PLAYBACK_SKIP_MS = 10_000;
/** Max time to wait for R2 playlist persist after pausing on window close (debounce + network). */
const SHUTDOWN_PERSIST_TIMEOUT_MS = 3000;
const MAIN_WINDOW_LABEL = 'main';

/**
 * Wayland often fails `set_position` inside window-state; plugin aborts before `set_size` if POSITION runs first.
 * Omit DECORATIONS so persisted `decorated: false` from the old frameless build does not disable native chrome.
 */
const WINDOW_RESTORE_FLAGS_NO_POSITION =
  StateFlags.ALL & ~StateFlags.POSITION & ~StateFlags.DECORATIONS;

export default function App() {
  const {maximized} = useTauriWindowMaximized();
  const {tiling, tilingDebug} = useTauriWindowTiling();

  const appRootRef = useRef<HTMLDivElement>(null);
  const fs = useMemo(() => createTauriVaultFilesystem(), []);
  const inboxEditorRef = useRef<NoteMarkdownEditorHandle | null>(null);
  const inboxEditorShellScrollRef = useRef<HTMLDivElement | null>(null);
  const [layoutsReady, setLayoutsReady] = useState(false);
  const [restoredInboxState, setRestoredInboxState] = useState<{
    vaultRoot: string;
    composingNewEntry: boolean;
    selectedUri: string | null;
    openTabUris?: readonly string[];
    editorWorkspaceTabs?: ReadonlyArray<{
      id: string;
      entries: string[];
      index: number;
    }>;
    activeEditorTabId?: string | null;
    activeTodayHubUri?: string | null;
    todayHubWorkspaces?: Record<string, TodayHubWorkspaceSnapshot> | null;
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
    diskConflict,
    resolveDiskConflictReloadFromDisk,
    resolveDiskConflictKeepLocal,
    diskConflictSoft,
    elevateDiskConflictSoftToBlocking,
    dismissDiskConflictSoft,
    composingNewEntry,
    inboxContentByUri,
    vaultMarkdownRefs,
    selectedNoteBacklinkUris,
    fsRefreshNonce,
    deviceInstanceId,
    wikiRenameNotice,
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
    selectNoteInNewActiveTab,
    submitNewEntry,
    onInboxSaveShortcut,
    onCleanNoteInbox,
    flushInboxSave,
    onWikiLinkActivate,
    onMarkdownRelativeLinkActivate,
    onMarkdownExternalLinkOpen,
    deleteNote,
    renameNote,
    deleteFolder,
    renameFolder,
    moveVaultTreeItem,
    bulkDeleteVaultTreeItems,
    bulkMoveVaultTreeItems,
    vaultTreeSelectionClearNonce,
    inboxShellRestored,
    initialVaultHydrateAttemptDone,
    editorHistoryCanGoBack,
    editorHistoryCanGoForward,
    editorHistoryGoBack,
    editorHistoryGoForward,
    inboxEditorShellScrollDirectiveRef,
    inboxBacklinksDeferNonce,
    editorWorkspaceTabs,
    activeEditorTabId,
    activateOpenTab,
    closeEditorTab,
    reorderEditorWorkspaceTabs,
    closeOtherEditorTabs,
    reopenLastClosedEditorTab,
    canReopenClosedEditorTab,
    showTodayHubCanvas,
    todayHubSettings,
    todayHubBridgeRef,
    todayHubWikiNavParentRef,
    todayHubCellEditorRef,
    prehydrateTodayHubRows,
    persistTodayHubRow,
    todayHubCleanRowBlocked,
    todayHubSelectorItems,
    activeTodayHubUri,
    todayHubWorkspacesForSave,
    switchTodayHubWorkspace,
    focusActiveTodayHubNote,
    workspaceSelectShowsActiveTabPill,
  } = useMainWindowWorkspace({
    fs,
    inboxEditorRef,
    inboxEditorShellScrollRef,
    restoredInboxState,
    inboxRestoreEnabled: layoutsReady,
  });

  const appRootClassName = useMemo(() => {
    const parts = ['app-root'];
    if (isTauri()) {
      parts.push('app-root--tauri');
    }
    if (!vaultRoot || !layoutsReady) {
      parts.push('app-root--setup');
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
  }, [vaultRoot, layoutsReady, maximized, tiling, tilingDebug]);

  const mainShellReady = Boolean(vaultRoot && layoutsReady);

  const titleBarTodayHubSelect = useMemo(() => {
    if (
      !vaultRoot
      || todayHubSelectorItems.length === 0
      || activeTodayHubUri == null
    ) {
      return null;
    }
    const activeLabel =
      todayHubSelectorItems.find(i => i.todayNoteUri === activeTodayHubUri)
        ?.label ?? 'Today';
    return {
      items: todayHubSelectorItems,
      activeTodayNoteUri: activeTodayHubUri,
      activeLabel,
      mainShowsActiveTabPill: workspaceSelectShowsActiveTabPill,
      onMainActivate: focusActiveTodayHubNote,
      onPickHub: (uri: string) => {
        void switchTodayHubWorkspace(uri);
      },
      onOpenHubInNewTab: selectNoteInNewActiveTab,
    };
  }, [
    vaultRoot,
    todayHubSelectorItems,
    activeTodayHubUri,
    workspaceSelectShowsActiveTabPill,
    focusActiveTodayHubNote,
    switchTodayHubWorkspace,
    selectNoteInNewActiveTab,
  ]);

  const [vaultPaneVisible, setVaultPaneVisible] = useState(
    DEFAULT_MAIN_WINDOW_PANE_VISIBILITY.vaultPaneVisible,
  );
  const [episodesPaneVisible, setEpisodesPaneVisible] = useState(
    DEFAULT_MAIN_WINDOW_PANE_VISIBILITY.episodesPaneVisible,
  );
  const [inboxPaneVisible, setInboxPaneVisible] = useState(
    DEFAULT_MAIN_WINDOW_PANE_VISIBILITY.inboxPaneVisible,
  );
  const [titleBarEditorTabsHost, setTitleBarEditorTabsHost] = useState<HTMLDivElement | null>(
    null,
  );
  useEditorHistoryMouseButtons({
    vaultRoot,
    busy,
    editorHistoryCanGoBack,
    editorHistoryCanGoForward,
    editorHistoryGoBack,
    editorHistoryGoForward,
  });
  usePreventMiddleClickPaste();

  const canReopenClosedEditorTabRef = useRef(canReopenClosedEditorTab);
  const reopenLastClosedEditorTabRef = useRef(reopenLastClosedEditorTab);
  useLayoutEffect(() => {
    canReopenClosedEditorTabRef.current = canReopenClosedEditorTab;
    reopenLastClosedEditorTabRef.current = reopenLastClosedEditorTab;
  }, [canReopenClosedEditorTab, reopenLastClosedEditorTab]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!vaultRoot) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !e.shiftKey || e.altKey) {
        return;
      }
      if (e.key !== 't' && e.key !== 'T') {
        return;
      }
      if (busy || !canReopenClosedEditorTabRef.current) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      reopenLastClosedEditorTabRef.current();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [vaultRoot, busy]);

  const onCleanNoteInboxRef = useRef(onCleanNoteInbox);
  useLayoutEffect(() => {
    onCleanNoteInboxRef.current = onCleanNoteInbox;
  }, [onCleanNoteInbox]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!vaultRoot || busy) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.shiftKey || e.altKey) {
        return;
      }
      if (e.key !== 'e' && e.key !== 'E') {
        return;
      }
      const focusEl =
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null) ?? (e.target as HTMLElement | null);
      const inInboxCm = focusEl?.closest('.inbox-root .cm-editor');
      const inTodayHubCm = focusEl?.closest('.today-hub-canvas .cm-editor');
      if (!inInboxCm && !inTodayHubCm) {
        return;
      }
      if (composingNewEntry || !selectedUri) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onCleanNoteInboxRef.current();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [vaultRoot, busy, composingNewEntry, selectedUri]);

  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const quickOpenOpenRef = useRef(false);
  quickOpenOpenRef.current = quickOpenOpen;
  const [vaultSearchOpen, setVaultSearchOpen] = useState(false);
  const vaultSearchOpenRef = useRef(false);
  vaultSearchOpenRef.current = vaultSearchOpen;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!vaultRoot || busy) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !e.shiftKey || e.altKey) {
        return;
      }
      if (e.key !== 'f' && e.key !== 'F') {
        return;
      }
      if (quickOpenOpenRef.current || vaultSearchOpenRef.current) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setVaultSearchOpen(true);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [vaultRoot, busy]);

  useEffect(() => {
    let state = initialDoubleShiftState;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!vaultRoot || quickOpenOpenRef.current || vaultSearchOpenRef.current || busy) {
        return;
      }
      state = reduceDoubleShiftKeyDown(state, e.key, e.ctrlKey, e.metaKey, e.altKey);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!vaultRoot || quickOpenOpenRef.current || vaultSearchOpenRef.current || busy) {
        return;
      }
      if (e.repeat) {
        return;
      }
      const next = reduceDoubleShiftKeyUp(
        state,
        performance.now(),
        e.key,
        e.ctrlKey,
        e.metaKey,
        e.altKey,
      );
      state = next.state;
      if (next.shouldOpen) {
        e.preventDefault();
        e.stopPropagation();
        setQuickOpenOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [vaultRoot, busy]);

  const [layouts, setLayouts] = useState<StoredLayouts>(DEFAULT_LAYOUTS);
  const [notificationsPanelVisible, setNotificationsPanelVisible] = useState(true);
  const [playlistDiskRevision, setPlaylistDiskRevision] = useState(0);
  const [startupSplashPhase, setStartupSplashPhase] = useState<StartupSplashPhase>(
    () => (!isTauri() ? 'done' : 'artwork'),
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

  const podcastCatalog = useDesktopPodcastCatalog({
    vaultRoot,
    fs,
    fsRefreshNonce,
    onError: setErr,
  });

  const consumeCatalogReady = Boolean(vaultRoot) && !podcastCatalog.catalogLoading;

  const desktopPlayback = useDesktopPodcastPlayback({
    consumeCatalogReady,
    consumeEpisodes: podcastCatalog.episodes,
    deviceInstanceId,
    fs,
    onCatalogRefresh: () => podcastCatalog.refreshPodcasts(false),
    onError: setErr,
    onPlaylistDiskUpdated: bumpPlaylistDiskRevision,
    playlistRevision: playlistDiskRevision,
    r2PlaylistConfigured: isVaultR2PlaylistConfigured(
      vaultSettings ?? defaultEskerraSettings,
    ),
    vaultRoot,
  });

  const toolbarNowPlaying = useMemo(() => {
    if (desktopPlayback.activeEpisode == null) {
      return null;
    }
    return {
      episodeTitle: desktopPlayback.activeEpisode.title,
      seriesName: desktopPlayback.activeEpisode.seriesName,
    };
  }, [desktopPlayback.activeEpisode]);

  const playbackTransport = useMemo((): PlaybackTransportProps | undefined => {
    if (desktopPlayback.activeEpisode == null) {
      return undefined;
    }
    const seek = desktopPlayback.seekBy;
    return {
      positionLabel: formatPlaybackMs(desktopPlayback.positionMs),
      durationLabel: formatPlaybackMs(desktopPlayback.durationMs),
      seekDisabled: desktopPlayback.seekDisabled,
      playControl: desktopPlayback.playbackTransportPlayControl,
      onSeekBack: () => void seek(-PLAYBACK_SKIP_MS),
      onSeekForward: () => void seek(PLAYBACK_SKIP_MS),
      onTogglePlay: () => void desktopPlayback.togglePause(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- granular playback fields below; hook return object is unstable
  }, [
    desktopPlayback.activeEpisode,
    desktopPlayback.durationMs,
    desktopPlayback.playbackTransportPlayControl,
    desktopPlayback.positionMs,
    desktopPlayback.seekBy,
    desktopPlayback.seekDisabled,
    desktopPlayback.togglePause,
  ]);

  const statusBarCenter = useMemo(
    () =>
      resolveAppStatusBarCenter({
        err,
        diskConflict: diskConflict != null,
        diskConflictSoft: diskConflictSoft != null,
        renameLinkProgress,
        wikiRenameNotice,
        playerLabel: desktopPlayback.playerLabel,
        activeEpisode: desktopPlayback.activeEpisode,
        tagline: APP_SHELL_TAGLINE,
      }),
    [
      err,
      diskConflict,
      diskConflictSoft,
      renameLinkProgress,
      wikiRenameNotice,
      desktopPlayback.playerLabel,
      desktopPlayback.activeEpisode,
    ],
  );

  /* Setup / loading: native OS decorations; main shell: frameless + transparent HTML chrome. */
  useLayoutEffect(() => {
    if (!isTauri()) {
      return;
    }
    void getCurrentWindow().setDecorations(!mainShellReady);
  }, [mainShellReady]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!isTauri()) {
      return;
    }
    if (mainShellReady) {
      root.classList.add('tauri-main-chrome');
    } else {
      root.classList.remove('tauri-main-chrome');
    }
    return () => {
      root.classList.remove('tauri-main-chrome');
    };
  }, [mainShellReady]);

  /* Modal dim: match frameless rounded mask; only used when tauri-main-chrome is active. */
  useLayoutEffect(() => {
    if (!isTauri()) {
      return;
    }
    if (!mainShellReady) {
      document.documentElement.style.removeProperty('--shell-overlay-radius');
      return () => {
        document.documentElement.style.removeProperty('--shell-overlay-radius');
      };
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
  }, [mainShellReady, maximized, tiling]);

  useDesktopPlaylistR2EtagPollingForMainWindow({
    allowPolling: !desktopPlayback.episodeSelectLocked,
    deviceInstanceId,
    onRemotePlaylistChanged: bumpPlaylistDiskRevision,
    onRemotePlaylistCleared: bumpPlaylistDiskRevision,
    vaultRoot,
    vaultSettings,
  });

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadStoredLayouts(),
      loadMainWindowUi(),
      hydrateEmojiUsageFromStore(),
    ]).then(([loadedLayouts, ui]) => {
        if (cancelled) {
          return;
        }
        setLayouts(loadedLayouts);
        if (ui) {
          setVaultPaneVisible(ui.vaultPaneVisible);
          setEpisodesPaneVisible(ui.episodesPaneVisible);
          setInboxPaneVisible(ui.inboxPaneVisible);
          setNotificationsPanelVisible(ui.notificationsPanelVisible);
          setRestoredInboxState({
            vaultRoot: ui.vaultRoot,
            composingNewEntry: ui.inbox.composingNewEntry,
            selectedUri: ui.inbox.selectedUri,
            openTabUris: ui.inbox.openTabUris,
            editorWorkspaceTabs: ui.inbox.editorWorkspaceTabs,
            activeEditorTabId: ui.inbox.activeEditorTabId ?? null,
            activeTodayHubUri: ui.inbox.activeTodayHubUri ?? null,
            todayHubWorkspaces: ui.inbox.todayHubWorkspaces ?? null,
          });
        }
        setLayoutsReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const desktopPlaybackRef = useRef(desktopPlayback);
  desktopPlaybackRef.current = desktopPlayback;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<string>('media-control', event => {
      const action = event.payload;
      const p = getDesktopAudioPlayer();
      void (async () => {
        if (action === 'pause' || action === 'stop') {
          if ((await p.getState()) === 'playing') {
            await desktopPlaybackRef.current.togglePause();
          } else if (action === 'stop') {
            await p.pause();
          }
          return;
        }
        if (action === 'play' || action === 'toggle') {
          await desktopPlaybackRef.current.togglePause();
        }
      })().catch(() => undefined);
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
      vaultPaneVisible,
      episodesPaneVisible,
      inboxPaneVisible,
      notificationsPanelVisible,
      inbox: {
        composingNewEntry,
        selectedUri,
        openTabUris: editorWorkspaceTabs
          .map(t => tabCurrentUri(t))
          .filter((u): u is string => u != null),
        editorWorkspaceTabs: tabsToStored(editorWorkspaceTabs),
        activeEditorTabId,
        activeTodayHubUri,
        todayHubWorkspaces: todayHubWorkspacesForSave,
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
    vaultPaneVisible,
    episodesPaneVisible,
    inboxPaneVisible,
    notificationsPanelVisible,
    selectedUri,
    composingNewEntry,
    editorWorkspaceTabs,
    activeEditorTabId,
    activeTodayHubUri,
    todayHubWorkspacesForSave,
    inboxShellRestored,
  ]);

  useEffect(() => {
    if (!isTauri() || startupSplashPhase !== 'artwork' || !appStartupReady) {
      return;
    }
    setStartupSplashPhase('scrim');
  }, [appStartupReady, startupSplashPhase]);

  useEffect(() => {
    if (!isTauri() || startupSplashPhase !== 'scrim' || !appStartupReady) {
      return;
    }
    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        void (async () => {
          const win = getCurrentWindow();
          let diskMainW: number | undefined;
          let diskMainH: number | undefined;
          try {
            const v = await invoke<{
              pathExists: boolean;
              mainWidth?: number;
              mainHeight?: number;
            }>('eskerra_peek_window_state_file');
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
            setStartupSplashPhase('done');
          }
        })();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [appStartupReady, startupSplashPhase]);

  const pickFolder = async () => {
    setErr(null);
    const dir = await open({directory: true, multiple: false});
    if (dir === null || Array.isArray(dir)) {
      return;
    }
    await hydrateVault(dir);
  };

  /** Single left-pane width (Vault, Episodes, or stack); mirrors `inbox` and `podcastsMain` in layout store. */
  const persistMainLeftWidthPx = useCallback((leftWidthPx: number) => {
    setLayouts(prev => {
      const next = {
        ...prev,
        inbox: {leftWidthPx},
        podcastsMain: {leftWidthPx},
      };
      void saveStoredLayouts(next);
      return next;
    });
  }, []);

  const persistVaultEpisodesStackTopHeightPx = useCallback((topHeightPx: number) => {
    setLayouts(prev => {
      const next = {...prev, vaultEpisodesStack: {topHeightPx}};
      void saveStoredLayouts(next);
      return next;
    });
  }, []);

  const persistNotificationsInboxStackTopHeightPx = useCallback((topHeightPx: number) => {
    setLayouts(prev => {
      const next = {...prev, notificationsInboxStack: {topHeightPx}};
      void saveStoredLayouts(next);
      return next;
    });
  }, []);

  const persistNotificationsWidthPx = useCallback((widthPx: number) => {
    setLayouts(prev => {
      const next = {...prev, notifications: {widthPx}};
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
          try {
            await desktopPlaybackRef.current.pauseIfPlaying();
            await desktopPlaybackRef.current.waitForPersistFlushed(
              SHUTDOWN_PERSIST_TIMEOUT_MS,
            );
          } catch (e) {
            if (import.meta.env.DEV) {
              console.error('[eskerra] shutdown pause/flush failed', e);
            }
          }
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

  const diskConflictSoftVisible = useMemo(
    () =>
      !err &&
      diskConflict == null &&
      diskConflictSoft != null &&
      selectedUri != null &&
      normalizeEditorDocUri(diskConflictSoft.uri) === normalizeEditorDocUri(selectedUri),
    [err, diskConflict, diskConflictSoft, selectedUri],
  );

  const openNotificationsPanel = useCallback(() => {
    setNotificationsPanelVisible(true);
  }, []);

  const {
    items: notificationItems,
    dismissItem: dismissNotification,
    clearAll: clearAllNotifications,
    highlightId: notificationHighlightId,
    linkedNotificationId,
    openPanelAndHighlight,
  } = useSessionNotifications(
    {
      statusBarCenter,
      renameLinkProgress,
      diskConflictBlocking: diskConflict != null,
      diskConflictSoftVisible,
    },
    {onOpenPanel: openNotificationsPanel},
  );

  const onReadMoreStatusMessage = useCallback(() => {
    if (linkedNotificationId) {
      openPanelAndHighlight(linkedNotificationId);
    } else {
      setNotificationsPanelVisible(true);
    }
  }, [linkedNotificationId, openPanelAndHighlight]);

  const startupOverlay =
    isTauri() && startupSplashPhase !== 'done' ? (
      <DesktopStartupSplash
        phase={startupSplashPhase === 'artwork' ? 'artwork' : 'scrim'}
      />
    ) : null;

  if (!vaultRoot) {
    return (
      <>
        {startupOverlay}
        <div ref={appRootRef} className={appRootClassName}>
          <AppChromeBackground />
          <div className="app-root-chrome">
            <div className="shell setup-shell">
              <h1>{settingsName}</h1>
              <p className="muted">Choose your notes folder (vault root). Settings are stored in `.eskerra/` inside it.</p>
              <button type="button" className="primary" onClick={() => void pickFolder()} disabled={busy}>
                Choose folder…
              </button>
              {err ? <p className="error">{err}</p> : null}
            </div>
            <AppSetupTagline />
          </div>
        </div>
      </>
    );
  }

  if (!layoutsReady) {
    return (
      <>
        {startupOverlay}
        <div ref={appRootRef} className={appRootClassName}>
          <AppChromeBackground />
          <div className="app-root-chrome">
            <div className="shell setup-shell">
              <p className="muted">Loading…</p>
            </div>
            <AppSetupTagline />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {startupOverlay}
      <div ref={appRootRef} className={appRootClassName}>
        <AppChromeBackground />
        <div className="app-root-chrome">
          <WindowTitleBar
            tiling={tiling}
            onEditorTabsHostRef={setTitleBarEditorTabsHost}
            todayHubSelect={titleBarTodayHubSelect}
          />

          <div className="app-body">
            <div className="main-shell-stage panel-group fill">
              <div className="main-column">
                <main className="main-stage">
                  <VaultTab
                      key={vaultRoot}
                      vaultRoot={vaultRoot}
                      fs={fs}
                      fsRefreshNonce={fsRefreshNonce}
                      inboxEditorRef={inboxEditorRef}
                      inboxEditorShellScrollRef={inboxEditorShellScrollRef}
                      inboxEditorShellScrollDirectiveRef={
                        inboxEditorShellScrollDirectiveRef
                      }
                      vaultPaneVisible={vaultPaneVisible}
                      onToggleVault={() => setVaultPaneVisible(v => !v)}
                      episodesPaneVisible={episodesPaneVisible}
                      onToggleEpisodes={() => setEpisodesPaneVisible(v => !v)}
                      inboxPaneVisible={inboxPaneVisible}
                      onToggleInboxPane={() => setInboxPaneVisible(v => !v)}
                      onOpenInboxPane={() => setInboxPaneVisible(true)}
                      notificationsInboxStackTopHeightPx={
                        layouts.notificationsInboxStack.topHeightPx
                      }
                      onNotificationsInboxStackTopHeightPxChanged={
                        persistNotificationsInboxStackTopHeightPx
                      }
                      playbackTransport={playbackTransport}
                      toolbarNowPlaying={toolbarNowPlaying}
                      vaultWidthPx={layouts.inbox.leftWidthPx}
                      episodesWidthPx={layouts.inbox.leftWidthPx}
                      onVaultWidthPxChanged={persistMainLeftWidthPx}
                      onEpisodesWidthPxChanged={persistMainLeftWidthPx}
                      stackTopHeightPx={layouts.vaultEpisodesStack.topHeightPx}
                      onStackTopHeightPxChanged={persistVaultEpisodesStackTopHeightPx}
                      episodesPane={
                        episodesPaneVisible ? (
                          <EpisodesPane
                            sections={podcastCatalog.sections}
                            catalogLoading={podcastCatalog.catalogLoading}
                            playEpisode={desktopPlayback.playEpisode}
                            episodeSelectLocked={
                              desktopPlayback.episodeSelectLocked
                            }
                          />
                        ) : null
                      }
                      notes={notes}
                      vaultMarkdownRefs={vaultMarkdownRefs}
                      inboxContentByUri={inboxContentByUri}
                      backlinkUris={selectedNoteBacklinkUris}
                      selectedUri={selectedUri}
                      onSelectNote={selectNote}
                      onSelectNoteInNewActiveTab={selectNoteInNewActiveTab}
                      onAddEntry={startNewEntry}
                      composingNewEntry={composingNewEntry}
                      onCancelNewEntry={cancelNewEntry}
                      onCreateNewEntry={() => void submitNewEntry()}
                      editorBody={editorBody}
                      onEditorChange={setEditorBody}
                      inboxEditorResetNonce={inboxEditorResetNonce}
                      onEditorError={setErr}
                      onWikiLinkActivate={onWikiLinkActivate}
                      onMarkdownRelativeLinkActivate={onMarkdownRelativeLinkActivate}
                      onMarkdownExternalLinkOpen={onMarkdownExternalLinkOpen}
                      onSaveShortcut={onInboxSaveShortcut}
                      onCleanNote={
                        !composingNewEntry && selectedUri
                          ? onCleanNoteInbox
                          : undefined
                      }
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
                      onMoveVaultTreeItem={(src, kind, destDir) => {
                        void moveVaultTreeItem(src, kind, destDir);
                      }}
                      onBulkMoveVaultTreeItems={(items, destDir) => {
                        void bulkMoveVaultTreeItems(items, destDir);
                      }}
                      onBulkDeleteVaultTreeItems={items => {
                        void bulkDeleteVaultTreeItems(items);
                      }}
                      vaultTreeSelectionClearNonce={vaultTreeSelectionClearNonce}
                      wikiLinkAmbiguityRenamePrompt={
                        pendingWikiLinkAmbiguityRename?.summary ?? null
                      }
                      onConfirmWikiLinkAmbiguityRename={() => {
                        void confirmPendingWikiLinkAmbiguityRename();
                      }}
                      onCancelWikiLinkAmbiguityRename={
                        cancelPendingWikiLinkAmbiguityRename
                      }
                      editorHistoryCanGoBack={editorHistoryCanGoBack}
                      editorHistoryCanGoForward={editorHistoryCanGoForward}
                      onEditorHistoryGoBack={editorHistoryGoBack}
                      onEditorHistoryGoForward={editorHistoryGoForward}
                      inboxBacklinksDeferNonce={inboxBacklinksDeferNonce}
                      editorWorkspaceTabs={editorWorkspaceTabs}
                      activeEditorTabId={activeEditorTabId}
                      onActivateOpenTab={activateOpenTab}
                      onCloseEditorTab={closeEditorTab}
                      onReorderEditorWorkspaceTabs={reorderEditorWorkspaceTabs}
                      onCloseOtherEditorTabs={closeOtherEditorTabs}
                      notificationsPanelVisible={notificationsPanelVisible}
                      onToggleNotificationsPanel={() =>
                        setNotificationsPanelVisible(v => !v)
                      }
                      notificationsWidthPx={layouts.notifications.widthPx}
                      onNotificationsWidthPxChanged={persistNotificationsWidthPx}
                      notificationItems={notificationItems}
                      notificationHighlightId={notificationHighlightId}
                      onDismissNotification={dismissNotification}
                      onClearAllNotifications={clearAllNotifications}
                      showTodayHubCanvas={showTodayHubCanvas}
                      todayHubSettings={todayHubSettings}
                      todayHubBridgeRef={todayHubBridgeRef}
                      todayHubWikiNavParentRef={todayHubWikiNavParentRef}
                      todayHubCellEditorRef={todayHubCellEditorRef}
                      prehydrateTodayHubRows={prehydrateTodayHubRows}
                      persistTodayHubRow={persistTodayHubRow}
                      todayHubCleanRowBlocked={todayHubCleanRowBlocked}
                      titleBarEditorTabsHost={titleBarEditorTabsHost}
                    />
                </main>
              </div>
            </div>
          </div>

          {!err && diskConflict ? (
            <div className="conflict-banner" role="alert">
              <span>
                This note was changed on disk while you have unsaved edits. Saving is paused until you
                choose.
              </span>
              <span className="conflict-banner__actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => resolveDiskConflictReloadFromDisk()}
                >
                  Reload from disk
                </button>
                <button type="button" onClick={() => resolveDiskConflictKeepLocal()}>
                  Keep my edits
                </button>
              </span>
            </div>
          ) : null}
          {!err &&
          !diskConflict &&
          diskConflictSoft &&
          selectedUri != null &&
          normalizeEditorDocUri(diskConflictSoft.uri) === normalizeEditorDocUri(selectedUri) ? (
            <div className="info-banner info-banner--inline-actions" aria-live="polite">
              <span>
                A version on disk differs from your unsaved draft. Your edits stay primary until you
                save. Open full resolve only if you need to reconcile with disk.
              </span>
              <span className="conflict-banner__actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => elevateDiskConflictSoftToBlocking()}
                >
                  Resolve with disk…
                </button>
                <button type="button" onClick={() => dismissDiskConflictSoft()}>
                  Dismiss
                </button>
              </span>
            </div>
          ) : null}

          <AppStatusBar
            center={statusBarCenter}
            onOpenSettings={() => void openSettingsWindow()}
            onReadMoreStatusMessage={onReadMoreStatusMessage}
          />
          <QuickOpenNotePalette
            open={quickOpenOpen}
            onOpenChange={setQuickOpenOpen}
            vaultRoot={vaultRoot}
            refs={vaultMarkdownRefs}
            onPickNote={selectNote}
          />
          <VaultSearchPalette
            open={vaultSearchOpen}
            onOpenChange={setVaultSearchOpen}
            vaultRoot={vaultRoot}
            onPickNote={selectNote}
          />
        </div>
      </div>
    </>
  );
}
