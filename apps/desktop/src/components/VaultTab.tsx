import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import type {MutableRefObject, ReactNode, RefObject} from 'react';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {createPortal} from 'react-dom';

import {createNoteInboxAttachmentHost} from '../lib/noteInboxAttachmentHost';
import {
  inboxRelativeMarkdownLinkHrefIsResolved,
  inboxWikiLinkTargetIsResolved,
} from '../lib/inboxWikiLinkNavigation';
import {resolveVaultImagePreviewUrl} from '../lib/resolveVaultImagePreviewUrl';

import {
  buildInboxWikiLinkCompletionCandidates,
  extractFirstMarkdownH1,
  getGeneralDirectoryUri,
  getInboxDirectoryUri,
  getNoteTitle,
  normalizeVaultBaseUri,
  type VaultFilesystem,
  type VaultMarkdownRef,
} from '@eskerra/core';

import {
  MIN_RESIZABLE_PANE_PX,
  NOTIFICATIONS_PANEL,
} from '../lib/layoutStore';
import type {SessionNotification} from '../lib/sessionNotifications';

import {
  NoteMarkdownEditor,
  type NoteMarkdownEditorHandle,
} from '../editor/noteEditor/NoteMarkdownEditor';

import {renameDraftStemForMarkdownUri} from '../lib/renameDialogDraft';
import {
  planVaultTreeBulkTargets,
  type VaultTreeBulkItem,
} from '../lib/vaultTreeBulkPlan';

import type {InboxEditorShellScrollDirective} from '../hooks/useMainWindowWorkspace';
import {
  todayHubColumnCount,
  type TodayHubSettings,
  type TodayHubWorkspaceBridge,
} from '../lib/todayHub';

import type {
  VaultRelativeMarkdownLinkActivatePayload,
  VaultWikiLinkActivatePayload,
} from '../editor/noteEditor/vaultLinkActivatePayload';
import type {EditorWorkspaceTab} from '../lib/editorWorkspaceTabs';

import {DesktopHorizontalSplitEnd} from './DesktopHorizontalSplitEnd';
import {EditorPaneOpenNoteTabs} from './EditorPaneOpenNoteTabs';
import {EditorWorkspaceToolbar} from './EditorWorkspaceToolbar';
import {MainWorkspaceSplit} from './MainWorkspaceSplit';
import {NotificationsPanel} from './NotificationsPanel';
import {MaterialIcon} from './MaterialIcon';
import {TodayHubCanvas} from './TodayHubCanvas';
import {VaultTreePane} from './VaultTreePane';

type NoteRow = {lastModified: number | null; name: string; uri: string};

type WikiLinkAmbiguityRenamePrompt = {
  scannedFileCount: number;
  touchedFileCount: number;
  touchedBytes: number;
  updatedLinkCount: number;
  skippedAmbiguousLinkCount: number;
};

type VaultTabProps = {
  vaultRoot: string;
  fs: VaultFilesystem;
  fsRefreshNonce: number;
  inboxEditorRef: RefObject<NoteMarkdownEditorHandle | null>;
  inboxEditorShellScrollRef: RefObject<HTMLDivElement | null>;
  inboxEditorShellScrollDirectiveRef: MutableRefObject<InboxEditorShellScrollDirective | null>;
  vaultPaneVisible: boolean;
  onToggleVault: () => void;
  episodesPaneVisible: boolean;
  vaultWidthPx: number;
  episodesWidthPx: number;
  onVaultWidthPxChanged: (px: number) => void;
  onEpisodesWidthPxChanged: (px: number) => void;
  stackTopHeightPx: number;
  onStackTopHeightPxChanged: (px: number) => void;
  /** Episodes list column; omitted when {@link episodesPaneVisible} is false (pass `null`). */
  episodesPane: ReactNode;
  notes: NoteRow[];
  /** Vault-wide markdown index for wiki resolve / autocomplete / highlighting. */
  vaultMarkdownRefs: VaultMarkdownRef[];
  inboxContentByUri: Record<string, string>;
  backlinkUris: readonly string[];
  selectedUri: string | null;
  onSelectNote: (uri: string) => void;
  onSelectNoteInNewActiveTab: (uri: string) => void;
  onAddEntry: () => void;
  composingNewEntry: boolean;
  onCancelNewEntry: () => void;
  onCreateNewEntry: () => void;
  editorBody: string;
  onEditorChange: (body: string) => void;
  inboxEditorResetNonce: number;
  onEditorError: (message: string) => void;
  onWikiLinkActivate: (payload: VaultWikiLinkActivatePayload) => void;
  onMarkdownRelativeLinkActivate: (
    payload: VaultRelativeMarkdownLinkActivatePayload,
  ) => void;
  onMarkdownExternalLinkOpen: (payload: {href: string; at: number}) => void;
  onSaveShortcut: () => void;
  busy: boolean;
  onDeleteNote: (uri: string) => void | Promise<void>;
  onRenameNote: (uri: string, nextDisplayName: string) => void | Promise<void>;
  onDeleteFolder: (directoryUri: string) => void | Promise<void>;
  onRenameFolder: (directoryUri: string, nextDisplayName: string) => void | Promise<void>;
  onMoveVaultTreeItem: (
    sourceUri: string,
    sourceKind: 'folder' | 'article',
    targetDirectoryUri: string,
  ) => void | Promise<void>;
  onBulkMoveVaultTreeItems: (
    items: VaultTreeBulkItem[],
    targetDirectoryUri: string,
  ) => void | Promise<void>;
  onBulkDeleteVaultTreeItems: (items: VaultTreeBulkItem[]) => void | Promise<void>;
  vaultTreeSelectionClearNonce: number;
  wikiLinkAmbiguityRenamePrompt: WikiLinkAmbiguityRenamePrompt | null;
  onConfirmWikiLinkAmbiguityRename: () => void | Promise<void>;
  onCancelWikiLinkAmbiguityRename: () => void;
  editorHistoryCanGoBack: boolean;
  editorHistoryCanGoForward: boolean;
  onEditorHistoryGoBack: () => void;
  onEditorHistoryGoForward: () => void;
  /** Workspace: bumped after `loadMarkdown`; backlinks defer is handled locally. */
  inboxBacklinksDeferNonce: number;
  editorWorkspaceTabs: readonly EditorWorkspaceTab[];
  activeEditorTabId: string | null;
  onActivateOpenTab: (tabId: string) => void;
  onCloseEditorTab: (tabId: string) => void;
  onReorderEditorWorkspaceTabs?: (fromIndex: number, insertBeforeIndex: number) => void;
  onCloseOtherEditorTabs: (keepTabId: string) => void;
  notificationsPanelVisible: boolean;
  onToggleNotificationsPanel: () => void;
  notificationsWidthPx: number;
  onNotificationsWidthPxChanged: (px: number) => void;
  notificationItems: readonly SessionNotification[];
  notificationHighlightId: string | null;
  onDismissNotification: (id: string) => void;
  onClearAllNotifications: () => void;
  showTodayHubCanvas: boolean;
  todayHubSettings: TodayHubSettings | null;
  todayHubBridgeRef: MutableRefObject<TodayHubWorkspaceBridge>;
  todayHubWikiNavParentRef: MutableRefObject<string | null>;
  todayHubCellEditorRef: RefObject<NoteMarkdownEditorHandle | null>;
  prehydrateTodayHubRows: (rowUris: readonly string[]) => Promise<void>;
  persistTodayHubRow: (
    rowUri: string,
    mergedMarkdown: string,
    columnCount: number,
  ) => Promise<void>;
  /** Mount node in `WindowTitleBar` for editor open-note tabs (portal). */
  titleBarEditorTabsHost?: HTMLElement | null;
};

type InboxBacklinksSectionProps = {
  selectedUri: string;
  backlinkRows: readonly {uri: string; fileName: string; title: string}[];
  onSelectNote: (uri: string) => void;
  deferNonce: number;
};

type EditorPaneBodyProps = {
  inboxEditorRef: RefObject<NoteMarkdownEditorHandle | null>;
  inboxEditorShellScrollRef: RefObject<HTMLDivElement | null>;
  inboxAttachmentHost: ReturnType<typeof createNoteInboxAttachmentHost>;
  vaultRoot: string;
  vaultMarkdownRefs: VaultMarkdownRef[];
  inboxContentByUri: Record<string, string>;
  composingNewEntry: boolean;
  selectedUri: string | null;
  editorBody: string;
  inboxEditorResetNonce: number;
  onEditorChange: VaultTabProps['onEditorChange'];
  onEditorError: VaultTabProps['onEditorError'];
  onWikiLinkActivate: VaultTabProps['onWikiLinkActivate'];
  onMarkdownRelativeLinkActivate: VaultTabProps['onMarkdownRelativeLinkActivate'];
  onMarkdownExternalLinkOpen: VaultTabProps['onMarkdownExternalLinkOpen'];
  relativeMarkdownLinkHrefIsResolved: (href: string) => boolean;
  wikiLinkTargetIsResolved: (inner: string) => boolean;
  wikiLinkCompletionCandidates: ReturnType<typeof buildInboxWikiLinkCompletionCandidates>;
  onSaveShortcut: VaultTabProps['onSaveShortcut'];
  onDeleteNoteShortcut: () => void;
  busy: boolean;
  backlinkRows: readonly {uri: string; fileName: string; title: string}[];
  onSelectNote: VaultTabProps['onSelectNote'];
  inboxBacklinksDeferNonce: number;
  showTodayHubCanvas: boolean;
  todayHubSettings: TodayHubSettings | null;
  todayHubBridgeRef: MutableRefObject<TodayHubWorkspaceBridge>;
  todayHubWikiNavParentRef: MutableRefObject<string | null>;
  todayHubCellEditorRef: RefObject<NoteMarkdownEditorHandle | null>;
  prehydrateTodayHubRows: (rowUris: readonly string[]) => Promise<void>;
  persistTodayHubRow: (
    rowUri: string,
    mergedMarkdown: string,
    columnCount: number,
  ) => Promise<void>;
};

function InboxBacklinksSection({
  selectedUri,
  backlinkRows,
  onSelectNote,
  deferNonce,
}: InboxBacklinksSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const lastAppliedDeferNonceRef = useRef(deferNonce);

  useLayoutEffect(() => {
    if (lastAppliedDeferNonceRef.current === deferNonce) {
      return;
    }
    lastAppliedDeferNonceRef.current = deferNonce;
    const section = sectionRef.current;
    if (section) {
      section.setAttribute('aria-hidden', 'true');
      section.classList.add('inbox-backlinks--defer-first-paint');
    }
    const raf = requestAnimationFrame(() => {
      if (section) {
        section.setAttribute('aria-hidden', 'false');
        section.classList.remove('inbox-backlinks--defer-first-paint');
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [deferNonce, selectedUri]);

  return (
    <section
      ref={sectionRef}
      aria-hidden="false"
      aria-label="Backlinks"
      className="inbox-backlinks"
    >
      <div className="inbox-backlinks__header">Linked from</div>
      {backlinkRows.length === 0 ? (
        <p className="muted inbox-backlinks__empty">No incoming links.</p>
      ) : (
        <ul className="inbox-backlinks__list">
          {backlinkRows.map(row => (
            <li key={row.uri}>
              <button
                type="button"
                className="inbox-backlinks__row"
                onClick={() => onSelectNote(row.uri)}
              >
                <span className="inbox-backlinks__title">{row.title}</span>
                <span className="inbox-backlinks__filename">{row.fileName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EditorPaneBody({
  inboxEditorRef,
  inboxEditorShellScrollRef,
  inboxAttachmentHost,
  vaultRoot,
  vaultMarkdownRefs,
  inboxContentByUri,
  composingNewEntry,
  selectedUri,
  editorBody,
  inboxEditorResetNonce,
  onEditorChange,
  onEditorError,
  onWikiLinkActivate,
  onMarkdownRelativeLinkActivate,
  onMarkdownExternalLinkOpen,
  relativeMarkdownLinkHrefIsResolved,
  wikiLinkTargetIsResolved,
  wikiLinkCompletionCandidates,
  onSaveShortcut,
  onDeleteNoteShortcut,
  busy,
  backlinkRows,
  onSelectNote,
  inboxBacklinksDeferNonce,
  showTodayHubCanvas,
  todayHubSettings,
  todayHubBridgeRef,
  todayHubWikiNavParentRef,
  todayHubCellEditorRef,
  prehydrateTodayHubRows,
  persistTodayHubRow,
}: EditorPaneBodyProps) {
  const [editorHasFoldedRanges, setEditorHasFoldedRanges] = useState(false);
  const [editorHasFoldableRanges, setEditorHasFoldableRanges] = useState(false);
  const editorHasFoldedRangesRef = useRef(editorHasFoldedRanges);
  const editorHasFoldableRangesRef = useRef(editorHasFoldableRanges);
  const backlinksSidecarRef = useRef<HTMLDivElement | null>(null);
  const todayHubSidecarRef = useRef<HTMLDivElement | null>(null);
  const isInitialSidecarDeferRef = useRef(true);

  useLayoutEffect(() => {
    editorHasFoldedRangesRef.current = editorHasFoldedRanges;
    editorHasFoldableRangesRef.current = editorHasFoldableRanges;
  }, [editorHasFoldedRanges, editorHasFoldableRanges]);

  useLayoutEffect(() => {
    if (isInitialSidecarDeferRef.current) {
      isInitialSidecarDeferRef.current = false;
      return;
    }
    const els: HTMLElement[] = [];
    const b = backlinksSidecarRef.current;
    const t = todayHubSidecarRef.current;
    if (b) {
      els.push(b);
    }
    if (t) {
      els.push(t);
    }
    for (const el of els) {
      el.classList.add('note-sidecar-group--deferred');
    }
    const id = window.requestAnimationFrame(() => {
      for (const el of els) {
        el.classList.remove('note-sidecar-group--deferred');
      }
    });
    return () => {
      window.cancelAnimationFrame(id);
      for (const el of els) {
        el.classList.remove('note-sidecar-group--deferred');
      }
    };
  }, [selectedUri]);

  const onFoldedRangesPresentChange = useCallback((next: boolean) => {
    setEditorHasFoldedRanges(next);
  }, []);

  const onFoldableRangesPresentChange = useCallback((next: boolean) => {
    setEditorHasFoldableRanges(next);
  }, []);

  const scrollTodayHubLayout =
    showTodayHubCanvas &&
    Boolean(selectedUri) &&
    todayHubSettings != null &&
    !composingNewEntry;

  return (
    <div className="editor note-markdown-editor-wrap">
        <div
          ref={inboxEditorShellScrollRef}
          className={
            scrollTodayHubLayout
              ? 'note-markdown-editor-scroll note-markdown-editor-scroll--today-hub'
              : 'note-markdown-editor-scroll'
          }
        >
          <div className="note-markdown-editor-page">
            <div className="note-markdown-editor-fold-rail">
              {editorHasFoldedRanges || editorHasFoldableRanges ? (
                <div className="note-markdown-editor-fold-bulk-anchor">
                  <button
                    type="button"
                    className="note-markdown-editor-fold-bulk-btn app-tooltip-trigger"
                    onClick={() => {
                      const ed = inboxEditorRef.current;
                      if (!ed) {
                        return;
                      }
                      if (editorHasFoldedRanges) {
                        ed.unfoldAllFolds();
                      } else {
                        ed.collapseAllFolds();
                      }
                    }}
                    disabled={busy}
                    aria-label={
                      editorHasFoldedRanges
                        ? 'Expand all folds'
                        : 'Collapse all folds'
                    }
                    data-tooltip={
                      editorHasFoldedRanges
                        ? 'Expand all folds'
                        : 'Collapse all folds'
                    }
                    data-tooltip-placement="inline-end"
                  >
                    <MaterialIcon
                      name={
                        editorHasFoldedRanges
                          ? 'unfold_more'
                          : 'unfold_less'
                      }
                      size={12}
                    />
                  </button>
                </div>
              ) : null}
            </div>
            <div className="note-markdown-editor-paper">
              <NoteMarkdownEditor
                ref={inboxEditorRef}
                attachmentHost={inboxAttachmentHost}
                resolveVaultImagePreviewUrl={resolveVaultImagePreviewUrl}
                vaultRoot={vaultRoot}
                activeNotePath={composingNewEntry ? null : selectedUri}
                initialMarkdown={editorBody}
                sessionKey={inboxEditorResetNonce}
                onMarkdownChange={onEditorChange}
                onEditorError={onEditorError}
                onWikiLinkActivate={onWikiLinkActivate}
                onMarkdownRelativeLinkActivate={onMarkdownRelativeLinkActivate}
                onMarkdownExternalLinkOpen={onMarkdownExternalLinkOpen}
                relativeMarkdownLinkHrefIsResolved={relativeMarkdownLinkHrefIsResolved}
                wikiLinkTargetIsResolved={wikiLinkTargetIsResolved}
                wikiLinkCompletionCandidates={wikiLinkCompletionCandidates}
                onSaveShortcut={onSaveShortcut}
                onDeleteNoteShortcut={onDeleteNoteShortcut}
                placeholder={
                  composingNewEntry ? 'First line is title (H1)…' : 'Write markdown…'
                }
                busy={busy}
                onFoldedRangesPresentChange={onFoldedRangesPresentChange}
                onFoldableRangesPresentChange={onFoldableRangesPresentChange}
              />
              {!composingNewEntry && selectedUri && !showTodayHubCanvas ? (
                <div ref={backlinksSidecarRef} className="note-sidecar-group">
                  <InboxBacklinksSection
                    selectedUri={selectedUri}
                    backlinkRows={backlinkRows}
                    onSelectNote={onSelectNote}
                    deferNonce={inboxBacklinksDeferNonce}
                  />
                </div>
              ) : null}
            </div>
          </div>
          {showTodayHubCanvas &&
          selectedUri &&
          todayHubSettings &&
          !composingNewEntry ? (
            <div
              ref={todayHubSidecarRef}
              className="note-markdown-editor-page note-markdown-editor-page--today-hub note-sidecar-group"
            >
              <div className="note-markdown-editor-fold-rail" aria-hidden="true" />
              <div className="note-markdown-editor-paper note-markdown-editor-paper--today-hub-shell">
                <TodayHubCanvas
                  key={`today-hub-${todayHubColumnCount(todayHubSettings)}-${todayHubSettings.start}-${todayHubSettings.columns.join('\0')}-${selectedUri}`}
                  vaultRoot={vaultRoot}
                  todayNoteUri={selectedUri}
                  hubSettings={todayHubSettings}
                  inboxContentByUri={inboxContentByUri}
                  vaultMarkdownRefs={vaultMarkdownRefs}
                  bridgeRef={todayHubBridgeRef}
                  wikiNavParentRef={todayHubWikiNavParentRef}
                  cellEditorRef={todayHubCellEditorRef}
                  onWikiLinkActivate={onWikiLinkActivate}
                  onMarkdownRelativeLinkActivate={onMarkdownRelativeLinkActivate}
                  onMarkdownExternalLinkOpen={onMarkdownExternalLinkOpen}
                  onEditorError={onEditorError}
                  onSaveShortcut={onSaveShortcut}
                  prehydrateTodayHubRows={prehydrateTodayHubRows}
                  persistTodayHubRow={persistTodayHubRow}
                />
              </div>
            </div>
          ) : null}
        </div>
    </div>
  );
}

export function VaultTab({
  vaultRoot,
  fs,
  fsRefreshNonce,
  inboxEditorRef,
  inboxEditorShellScrollRef,
  inboxEditorShellScrollDirectiveRef,
  vaultPaneVisible,
  onToggleVault,
  episodesPaneVisible,
  vaultWidthPx,
  episodesWidthPx,
  onVaultWidthPxChanged,
  onEpisodesWidthPxChanged,
  stackTopHeightPx,
  onStackTopHeightPxChanged,
  episodesPane,
  notes,
  vaultMarkdownRefs,
  inboxContentByUri,
  backlinkUris,
  selectedUri,
  onSelectNote,
  onSelectNoteInNewActiveTab,
  onAddEntry,
  composingNewEntry,
  onCancelNewEntry,
  onCreateNewEntry,
  editorBody,
  onEditorChange,
  inboxEditorResetNonce,
  onEditorError,
  onWikiLinkActivate,
  onMarkdownRelativeLinkActivate,
  onMarkdownExternalLinkOpen,
  onSaveShortcut,
  busy,
  onDeleteNote,
  onRenameNote,
  onDeleteFolder,
  onRenameFolder,
  onMoveVaultTreeItem,
  onBulkMoveVaultTreeItems,
  onBulkDeleteVaultTreeItems,
  vaultTreeSelectionClearNonce,
  wikiLinkAmbiguityRenamePrompt,
  onConfirmWikiLinkAmbiguityRename,
  onCancelWikiLinkAmbiguityRename,
  editorHistoryCanGoBack,
  editorHistoryCanGoForward,
  onEditorHistoryGoBack,
  onEditorHistoryGoForward,
  inboxBacklinksDeferNonce,
  editorWorkspaceTabs,
  activeEditorTabId,
  onActivateOpenTab,
  onCloseEditorTab,
  onReorderEditorWorkspaceTabs,
  onCloseOtherEditorTabs,
  notificationsPanelVisible,
  onToggleNotificationsPanel,
  notificationsWidthPx,
  onNotificationsWidthPxChanged,
  notificationItems,
  notificationHighlightId,
  onDismissNotification,
  onClearAllNotifications,
  showTodayHubCanvas,
  todayHubSettings,
  todayHubBridgeRef,
  todayHubWikiNavParentRef,
  todayHubCellEditorRef,
  prehydrateTodayHubRows,
  persistTodayHubRow,
  titleBarEditorTabsHost = null,
}: VaultTabProps) {
  const [revealTreeNonce, setRevealTreeNonce] = useState(0);
  const normalizedVaultRootForTree = useMemo(
    () => normalizeVaultBaseUri(vaultRoot).replace(/\\/g, '/').replace(/\/+$/, ''),
    [vaultRoot],
  );
  const revealActiveNoteDisabled =
    composingNewEntry
    || selectedUri == null
    || (
      selectedUri !== normalizedVaultRootForTree
      && !selectedUri.startsWith(`${normalizedVaultRootForTree}/`)
    );
  const bumpRevealActiveNoteInTree = useCallback(() => {
    setRevealTreeNonce(n => n + 1);
  }, []);
  const inboxAttachmentHost = useMemo(() => createNoteInboxAttachmentHost(), []);
  const [confirmDeleteUri, setConfirmDeleteUri] = useState<string | null>(null);
  const [confirmDeleteFolderUri, setConfirmDeleteFolderUri] = useState<string | null>(
    null,
  );
  const [confirmBulkDeleteItems, setConfirmBulkDeleteItems] = useState<
    VaultTreeBulkItem[] | null
  >(null);
  const [renameTargetUri, setRenameTargetUri] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameFolderUri, setRenameFolderUri] = useState<string | null>(null);
  const [renameFolderDraft, setRenameFolderDraft] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const vaultMarkdownRefsRef = useRef(vaultMarkdownRefs);
  const onMoveVaultTreeItemRef = useRef(onMoveVaultTreeItem);
  const onBulkMoveVaultTreeItemsRef = useRef(onBulkMoveVaultTreeItems);

  useLayoutEffect(() => {
    vaultMarkdownRefsRef.current = vaultMarkdownRefs;
    onMoveVaultTreeItemRef.current = onMoveVaultTreeItem;
    onBulkMoveVaultTreeItemsRef.current = onBulkMoveVaultTreeItems;
  }, [
    vaultMarkdownRefs,
    onMoveVaultTreeItem,
    onBulkMoveVaultTreeItems,
  ]);

  const onDeleteNoteShortcut = useCallback(() => {
    if (busy || composingNewEntry || selectedUri == null) {
      return;
    }
    setConfirmDeleteUri(selectedUri);
  }, [busy, composingNewEntry, selectedUri]);
  const renameFolderInputRef = useRef<HTMLInputElement | null>(null);

  const openRenameDialog = useCallback((uri: string) => {
    const draft = renameDraftStemForMarkdownUri(uri, vaultMarkdownRefsRef.current);
    if (draft === null) {
      return;
    }
    setRenameTargetUri(uri);
    setRenameDraft(draft);
  }, []);

  const submitRename = () => {
    const uri = renameTargetUri;
    if (!uri || busy) {
      return;
    }
    void onRenameNote(uri, renameDraft);
    setRenameTargetUri(null);
  };

  const openRenameFolderDialog = useCallback((uri: string) => {
    const tail = uri.split(/[/\\]/).filter(Boolean).pop();
    if (!tail) {
      return;
    }
    setRenameFolderUri(uri);
    setRenameFolderDraft(tail);
  }, []);

  const openTreeDeleteNoteDialog = useCallback((uri: string) => {
    setConfirmDeleteUri(uri);
  }, []);

  const openTreeDeleteFolderDialog = useCallback((uri: string) => {
    setConfirmDeleteFolderUri(uri);
  }, []);

  const openBulkDeleteDialog = useCallback((items: VaultTreeBulkItem[]) => {
    setConfirmBulkDeleteItems(items);
  }, []);

  const moveVaultTreeItemStable = useCallback(
    (
      sourceUri: string,
      sourceKind: 'folder' | 'article',
      targetDirectoryUri: string,
    ) => onMoveVaultTreeItemRef.current(sourceUri, sourceKind, targetDirectoryUri),
    [],
  );

  const bulkMoveVaultTreeItemsStable = useCallback(
    (items: VaultTreeBulkItem[], targetDirectoryUri: string) =>
      onBulkMoveVaultTreeItemsRef.current(items, targetDirectoryUri),
    [],
  );

  const submitFolderRename = () => {
    const uri = renameFolderUri;
    if (!uri || busy) {
      return;
    }
    void onRenameFolder(uri, renameFolderDraft);
    setRenameFolderUri(null);
  };

  useEffect(() => {
    if (!renameTargetUri) {
      return;
    }
    const id = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [renameTargetUri]);

  useEffect(() => {
    if (!renameFolderUri) {
      return;
    }
    const id = window.setTimeout(() => {
      renameFolderInputRef.current?.focus();
      renameFolderInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [renameFolderUri]);

  const wikiLinkTargetIsResolved = useMemo(
    () => (inner: string) =>
      inboxWikiLinkTargetIsResolved(
        vaultMarkdownRefs.map(r => ({name: r.name, uri: r.uri})),
        inner,
      ),
    [vaultMarkdownRefs],
  );

  const relativeMarkdownSourceUriOrDir = useMemo(() => {
    const base = normalizeVaultBaseUri(vaultRoot);
    if (composingNewEntry) {
      return getInboxDirectoryUri(base);
    }
    if (showTodayHubCanvas) {
      return getGeneralDirectoryUri(base);
    }
    return selectedUri ?? getInboxDirectoryUri(base);
  }, [composingNewEntry, selectedUri, showTodayHubCanvas, vaultRoot]);

  const relativeMarkdownLinkHrefIsResolved = useMemo(
    () => (href: string) =>
      inboxRelativeMarkdownLinkHrefIsResolved(
        vaultMarkdownRefs.map(r => ({name: r.name, uri: r.uri})),
        relativeMarkdownSourceUriOrDir,
        vaultRoot,
        href,
      ),
    [vaultMarkdownRefs, relativeMarkdownSourceUriOrDir, vaultRoot],
  );

  const wikiLinkCompletionCandidates = useMemo(
    () =>
      buildInboxWikiLinkCompletionCandidates(
        vaultMarkdownRefs.map(r => ({name: r.name, uri: r.uri})),
      ),
    [vaultMarkdownRefs],
  );

  const editorPaneTitle = useMemo(() => {
    if (composingNewEntry) {
      return 'New entry';
    }
    if (!selectedUri) {
      return 'Editor';
    }
    const row = notes.find(n => n.uri === selectedUri);
    if (row) {
      return row.name;
    }
    const tail = selectedUri.split(/[/\\]/).pop()?.trim();
    return tail || 'Editor';
  }, [composingNewEntry, notes, selectedUri]);

  const backlinkRows = useMemo(() => {
    const norm = (u: string) => u.trim().replace(/\\/g, '/');
    return backlinkUris
      .map(uri => {
        const ref = vaultMarkdownRefs.find(r => norm(r.uri) === norm(uri));
        const fileName = (ref?.name ?? uri.split(/[/\\]/).pop() ?? '').trim();
        if (!fileName) {
          return null;
        }
        const markdownSource =
          !composingNewEntry && uri === selectedUri
            ? editorBody
            : inboxContentByUri[uri];
        const title =
          markdownSource !== undefined
            ? extractFirstMarkdownH1(markdownSource) ?? getNoteTitle(fileName)
            : getNoteTitle(fileName);
        return {uri, fileName, title};
      })
      .filter((row): row is {uri: string; fileName: string; title: string} => row != null);
  }, [
    backlinkUris,
    vaultMarkdownRefs,
    composingNewEntry,
    selectedUri,
    editorBody,
    inboxContentByUri,
  ]);

  const editorOpen = composingNewEntry || Boolean(selectedUri);

  useLayoutEffect(() => {
    if (!editorOpen) {
      return;
    }
    const el = inboxEditorShellScrollRef.current;
    if (!el) {
      return;
    }
    const directive = inboxEditorShellScrollDirectiveRef.current;
    if (directive == null) {
      return;
    }
    inboxEditorShellScrollDirectiveRef.current = null;
    const apply = () => {
      if (directive.kind === 'snapTop') {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      } else {
        el.scrollTop = directive.top;
        el.scrollLeft = directive.left;
      }
    };
    apply();
    const raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [
    editorOpen,
    selectedUri,
    composingNewEntry,
    inboxEditorShellScrollDirectiveRef,
    inboxEditorShellScrollRef,
  ]);

  const titleBarTabsPortal =
    titleBarEditorTabsHost != null && !composingNewEntry
      ? createPortal(
          <EditorPaneOpenNoteTabs
            notes={notes}
            workspaceTabs={editorWorkspaceTabs}
            activeTabId={activeEditorTabId}
            busy={busy}
            onActivateTab={onActivateOpenTab}
            onCloseTab={onCloseEditorTab}
            onRenameNote={openRenameDialog}
            onCloseOtherTabs={onCloseOtherEditorTabs}
            inTitleBar
            onReorderTabs={onReorderEditorWorkspaceTabs}
          />,
          titleBarEditorTabsHost,
        )
      : null;

  return (
    <Fragment>
      {titleBarTabsPortal}
      <div className="inbox-root" data-app-surface="capture">
      <AlertDialog.Root
        open={confirmDeleteUri !== null}
        onOpenChange={open => {
          if (!open) {
            setConfirmDeleteUri(null);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="alert-dialog-overlay" />
          <AlertDialog.Content className="alert-dialog-content">
            <AlertDialog.Title className="alert-dialog-title">Delete note</AlertDialog.Title>
            <AlertDialog.Description className="alert-dialog-description">
              Delete this note? This cannot be undone.
            </AlertDialog.Description>
            <div className="alert-dialog-actions">
              <AlertDialog.Cancel asChild>
                <button type="button" className="ghost" disabled={busy}>
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className="primary destructive"
                  disabled={busy}
                  onClick={() => {
                    const uri = confirmDeleteUri;
                    if (uri) {
                      void onDeleteNote(uri);
                    }
                  }}
                >
                  Delete
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AlertDialog.Root
        open={confirmDeleteFolderUri !== null}
        onOpenChange={open => {
          if (!open) {
            setConfirmDeleteFolderUri(null);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="alert-dialog-overlay" />
          <AlertDialog.Content className="alert-dialog-content">
            <AlertDialog.Title className="alert-dialog-title">Delete folder</AlertDialog.Title>
            <AlertDialog.Description className="alert-dialog-description">
              Delete this folder and everything inside it? This cannot be undone.
            </AlertDialog.Description>
            <div className="alert-dialog-actions">
              <AlertDialog.Cancel asChild>
                <button type="button" className="ghost" disabled={busy}>
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className="primary destructive"
                  disabled={busy}
                  onClick={() => {
                    const uri = confirmDeleteFolderUri;
                    if (uri) {
                      void onDeleteFolder(uri);
                    }
                  }}
                >
                  Delete
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AlertDialog.Root
        open={confirmBulkDeleteItems !== null}
        onOpenChange={open => {
          if (!open) {
            setConfirmBulkDeleteItems(null);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="alert-dialog-overlay" />
          <AlertDialog.Content className="alert-dialog-content">
            <AlertDialog.Title className="alert-dialog-title">
              Delete multiple items
            </AlertDialog.Title>
            <AlertDialog.Description className="alert-dialog-description">
              {confirmBulkDeleteItems ? (
                <>
                  Delete{' '}
                  {
                    planVaultTreeBulkTargets(
                      confirmBulkDeleteItems,
                      normalizeVaultBaseUri(vaultRoot).replace(/\\/g, '/').replace(/\/+$/, ''),
                    ).length
                  }{' '}
                  vault item(s) including any files inside selected folders? This cannot be
                  undone.
                </>
              ) : null}
            </AlertDialog.Description>
            <div className="alert-dialog-actions">
              <AlertDialog.Cancel asChild>
                <button type="button" className="ghost" disabled={busy}>
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className="primary destructive"
                  disabled={busy}
                  onClick={() => {
                    const items = confirmBulkDeleteItems;
                    setConfirmBulkDeleteItems(null);
                    if (items) {
                      void onBulkDeleteVaultTreeItems(items);
                    }
                  }}
                >
                  Delete
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AlertDialog.Root
        open={wikiLinkAmbiguityRenamePrompt !== null}
        onOpenChange={open => {
          if (!open) {
            onCancelWikiLinkAmbiguityRename();
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="alert-dialog-overlay" />
          <AlertDialog.Content className="alert-dialog-content">
            <AlertDialog.Title className="alert-dialog-title">
              Ambiguous links found
            </AlertDialog.Title>
            <AlertDialog.Description className="alert-dialog-description">
              {wikiLinkAmbiguityRenamePrompt ? (
                <>
                  This rename can safely update{' '}
                  {wikiLinkAmbiguityRenamePrompt.updatedLinkCount} link(s) across{' '}
                  {wikiLinkAmbiguityRenamePrompt.touchedFileCount} note(s), but{' '}
                  {wikiLinkAmbiguityRenamePrompt.skippedAmbiguousLinkCount} wiki link(s)
                  are ambiguous and will be skipped.
                </>
              ) : null}
            </AlertDialog.Description>
            <div className="alert-dialog-actions">
              <AlertDialog.Cancel asChild>
                <button type="button" className="ghost" disabled={busy}>
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    void onConfirmWikiLinkAmbiguityRename();
                  }}
                >
                  Continue
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <Dialog.Root
        open={renameTargetUri !== null}
        onOpenChange={open => {
          if (!open) {
            setRenameTargetUri(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="alert-dialog-overlay" />
          <Dialog.Content className="alert-dialog-content">
            <Dialog.Title className="alert-dialog-title">Rename note</Dialog.Title>
            <Dialog.Description className="alert-dialog-description">
              Choose a new name for this note.
            </Dialog.Description>
            <label className="rename-note-field">
              <span className="rename-note-field__label">File name</span>
              <input
                ref={renameInputRef}
                type="text"
                className="rename-note-field__input"
                value={renameDraft}
                disabled={busy}
                onChange={event => setRenameDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitRename();
                  }
                }}
              />
            </label>
            <div className="alert-dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="ghost" disabled={busy}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => {
                  submitRename();
                }}
              >
                Rename
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={renameFolderUri !== null}
        onOpenChange={open => {
          if (!open) {
            setRenameFolderUri(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="alert-dialog-overlay" />
          <Dialog.Content className="alert-dialog-content">
            <Dialog.Title className="alert-dialog-title">Rename folder</Dialog.Title>
            <Dialog.Description className="alert-dialog-description">
              Choose a new name for this folder.
            </Dialog.Description>
            <label className="rename-note-field">
              <span className="rename-note-field__label">Folder name</span>
              <input
                ref={renameFolderInputRef}
                type="text"
                className="rename-note-field__input"
                value={renameFolderDraft}
                disabled={busy}
                onChange={event => setRenameFolderDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitFolderRename();
                  }
                }}
              />
            </label>
            <div className="alert-dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="ghost" disabled={busy}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => {
                  submitFolderRename();
                }}
              >
                Rename
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <EditorWorkspaceToolbar
        vaultPaneVisible={vaultPaneVisible}
        onToggleVault={onToggleVault}
        busy={busy}
        editorHistoryCanGoBack={editorHistoryCanGoBack}
        editorHistoryCanGoForward={editorHistoryCanGoForward}
        onEditorHistoryGoBack={onEditorHistoryGoBack}
        onEditorHistoryGoForward={onEditorHistoryGoForward}
        composingNewEntry={composingNewEntry}
        editorPaneTitle={editorPaneTitle}
        onCancelNewEntry={onCancelNewEntry}
        notificationsPanelVisible={notificationsPanelVisible}
        onToggleNotificationsPanel={onToggleNotificationsPanel}
      />
      <DesktopHorizontalSplitEnd
        endVisible={notificationsPanelVisible}
        endWidthPx={notificationsWidthPx}
        minEndPx={NOTIFICATIONS_PANEL.minPx}
        maxEndPx={NOTIFICATIONS_PANEL.maxPx}
        minMainPx={MIN_RESIZABLE_PANE_PX}
        onEndWidthPxChanged={onNotificationsWidthPxChanged}
        main={
          <MainWorkspaceSplit
            vaultVisible={vaultPaneVisible}
            episodesVisible={episodesPaneVisible}
            vaultWidthPx={vaultWidthPx}
            episodesWidthPx={episodesWidthPx}
            onVaultWidthPxChanged={onVaultWidthPxChanged}
            onEpisodesWidthPxChanged={onEpisodesWidthPxChanged}
            stackTopHeightPx={stackTopHeightPx}
            onStackTopHeightPxChanged={onStackTopHeightPxChanged}
            vaultPane={
              <VaultTreePane
                vaultRoot={vaultRoot}
                fs={fs}
                fsRefreshNonce={fsRefreshNonce}
                vaultTreeSelectionClearNonce={vaultTreeSelectionClearNonce}
                editorActiveMarkdownUri={composingNewEntry ? null : selectedUri}
                revealActiveNoteNonce={revealTreeNonce}
                onRevealActiveNoteInTree={bumpRevealActiveNoteInTree}
                revealActiveNoteDisabled={revealActiveNoteDisabled}
                busy={busy}
                onAddEntry={onAddEntry}
                onOpenMarkdownNote={onSelectNote}
                onOpenMarkdownNoteInNewActiveTab={onSelectNoteInNewActiveTab}
                onRenameMarkdownRequest={openRenameDialog}
                onDeleteMarkdownRequest={openTreeDeleteNoteDialog}
                onRenameFolderRequest={openRenameFolderDialog}
                onDeleteFolderRequest={openTreeDeleteFolderDialog}
                onBulkDeleteRequest={openBulkDeleteDialog}
                onMoveVaultTreeItem={moveVaultTreeItemStable}
                onBulkMoveVaultTreeItems={bulkMoveVaultTreeItemsStable}
              />
            }
            episodesPane={episodesPane}
            editorPane={
              <div className="panel-surface">
                {editorOpen ? (
                  <>
                    <EditorPaneBody
                      inboxEditorRef={inboxEditorRef}
                      inboxEditorShellScrollRef={inboxEditorShellScrollRef}
                      inboxAttachmentHost={inboxAttachmentHost}
                      vaultRoot={vaultRoot}
                      vaultMarkdownRefs={vaultMarkdownRefs}
                      inboxContentByUri={inboxContentByUri}
                      composingNewEntry={composingNewEntry}
                      selectedUri={selectedUri}
                      editorBody={editorBody}
                      inboxEditorResetNonce={inboxEditorResetNonce}
                      onEditorChange={onEditorChange}
                      onEditorError={onEditorError}
                      onWikiLinkActivate={onWikiLinkActivate}
                      onMarkdownRelativeLinkActivate={onMarkdownRelativeLinkActivate}
                      onMarkdownExternalLinkOpen={onMarkdownExternalLinkOpen}
                      relativeMarkdownLinkHrefIsResolved={relativeMarkdownLinkHrefIsResolved}
                      wikiLinkTargetIsResolved={wikiLinkTargetIsResolved}
                      wikiLinkCompletionCandidates={wikiLinkCompletionCandidates}
                      onSaveShortcut={onSaveShortcut}
                      onDeleteNoteShortcut={onDeleteNoteShortcut}
                      busy={busy}
                      backlinkRows={backlinkRows}
                      onSelectNote={onSelectNote}
                      inboxBacklinksDeferNonce={inboxBacklinksDeferNonce}
                      showTodayHubCanvas={showTodayHubCanvas}
                      todayHubSettings={todayHubSettings}
                      todayHubBridgeRef={todayHubBridgeRef}
                      todayHubWikiNavParentRef={todayHubWikiNavParentRef}
                      todayHubCellEditorRef={todayHubCellEditorRef}
                      prehydrateTodayHubRows={prehydrateTodayHubRows}
                      persistTodayHubRow={persistTodayHubRow}
                    />
                    {composingNewEntry ? (
                      <div className="pane-footer">
                        <button
                          type="button"
                          className="primary"
                          onClick={() => void onCreateNewEntry()}
                          disabled={busy}
                        >
                          Create note
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="muted empty-hint">
                    Select a note from the vault or use Add entry.
                  </p>
                )}
              </div>
            }
          />
        }
        end={
          <NotificationsPanel
            appSurface={vaultPaneVisible ? 'capture' : 'consume'}
            items={notificationItems}
            highlightId={notificationHighlightId}
            onDismiss={onDismissNotification}
            onClearAll={onClearAllNotifications}
          />
        }
      />
    </div>
    </Fragment>
  );
}
