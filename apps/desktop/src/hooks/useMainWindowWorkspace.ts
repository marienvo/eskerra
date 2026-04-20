import {listen} from '@tauri-apps/api/event';
import {load} from '@tauri-apps/plugin-store';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';

import {
  buildInboxMarkdownFromCompose,
  collectVaultMarkdownRefs,
  ensureDeviceInstanceId,
  getGeneralDirectoryUri,
  getInboxDirectoryUri,
  markdownContainsTransientImageUrls,
  mergeYamlFrontmatterBody,
  fencedFrontmatterBlockToInner,
  innerToFencedFrontmatterBlock,
  normalizeVaultBaseUri,
  parseComposeInput,
  sanitizeInboxNoteStem,
  splitYamlFrontmatter,
  stemFromMarkdownFileName,
  SubtreeMarkdownPresenceCache,
  isBrowserOpenableMarkdownHref,
  wikiLinkInnerBrowserOpenableHref,
  type EskerraSettings,
  type VaultFilesystem,
  type VaultMarkdownRef,
} from '@eskerra/core';

import type {NoteMarkdownEditorHandle} from '../editor/noteEditor/NoteMarkdownEditor';
import type {
  VaultRelativeMarkdownLinkActivatePayload,
  VaultWikiLinkActivatePayload,
} from '../editor/noteEditor/vaultLinkActivatePayload';
import {
  openOrCreateInboxWikiLinkTarget,
  openOrCreateVaultRelativeMarkdownLink,
} from '../lib/inboxWikiLinkNavigation';
import {openSystemBrowserUrl} from '../lib/openSystemBrowserUrl';
import {
  createInboxAutosaveScheduler,
  INBOX_AUTOSAVE_DEBOUNCE_MS,
} from '../lib/inboxAutosaveScheduler';
import {persistTransientMarkdownImages} from '../lib/persistTransientMarkdownImages';
import {
  bootstrapVaultLayout,
  createInboxMarkdownNote,
  deleteVaultMarkdownNote,
  deleteVaultTreeDirectory,
  listInboxNotes,
  moveVaultTreeItemToDirectory,
  type MoveVaultTreeItemResult,
  readVaultLocalSettings,
  readVaultSettings,
  renameVaultMarkdownNote,
  renameVaultTreeDirectory,
  saveNoteMarkdown,
  writeVaultLocalSettings,
} from '../lib/vaultBootstrap';
import {
  filterVaultTreeBulkMoveSources,
  planVaultTreeBulkTargets,
  type VaultTreeBulkItem,
} from '../lib/vaultTreeBulkPlan';
import {
  enumerateTodayHubWeekStarts,
  parseTodayHubFrontmatter,
  normalizeTodayHubRowForDisk,
  splitTodayRowIntoColumns,
  todayHubRowSectionsAllBlank,
  todayHubRowUri,
  createIdleTodayHubWorkspaceBridge,
  type TodayHubSettings,
  type TodayHubWorkspaceBridge,
} from '../lib/todayHub';
import {vaultUriParentDirectory} from '../lib/vaultUriPaths';
import {vaultUriIsTodayMarkdownFile} from '../lib/vaultTreeLoadChildren';
import {
  getVaultSession,
  setVaultSession,
  startVaultWatch,
} from '../lib/tauriVault';
import {
  vaultFrontmatterIndexSchedule,
  vaultFrontmatterIndexTouchPaths,
} from '../lib/tauriVaultFrontmatter';
import {vaultSearchIndexSchedule, vaultSearchIndexTouchPaths} from '../lib/tauriVaultSearch';
import {listInboxAllBacklinkReferrersForTarget} from '../lib/inboxAllBacklinkIndex';
import {mergeVaultBacklinkBodySeed} from '../lib/vaultBacklinkBodySeed';
import {
  applyVaultWikiLinkRenameMaintenance,
  planVaultWikiLinkRenameMaintenance,
} from '../lib/vaultWikiLinkRenameMaintenance';
import {
  normalizeEditorDocUri,
  remapVaultUriPrefix,
  vaultUriDeletedByTreeChange,
} from '../lib/editorDocumentHistory';
import {
  type ClosedEditorTabRecord,
  isEditorClosedTabReopenable,
} from '../lib/editorClosedTabStack';
import {
  collectDistinctUrisFromTabs,
  createEditorWorkspaceTab,
  ensureActiveTabId,
  findTabById,
  findTabIdWithCurrentUri,
  firstSurvivorUriFromTabs,
  insertTabAfterActive,
  insertTabAtIndex,
  migrateOpenTabUrisToWorkspaceTabs,
  pickNeighborTabIdAfterRemovingTab,
  pushClosedWorkspaceTabsFromCloseAll,
  pushClosedWorkspaceTabsFromCloseOther,
  pushNavigateOnTab,
  remapAllTabsUriPrefix,
  removeUriFromAllTabs,
  reorderEditorWorkspaceTabsInArray,
  tabCurrentUri,
  tabsFromStored,
  tabsToStored,
  type EditorWorkspaceTab,
} from '../lib/editorWorkspaceTabs';
import {editorOpenTabPillLabel} from '../lib/editorOpenTabPillLabel';
import type {TodayHubWorkspaceSnapshot} from '../lib/mainWindowUiStore';
import {sortedTodayHubNoteUrisFromRefs} from '@eskerra/core';
import {pickDefaultActiveTodayHubUri} from '../lib/todayHubWorkspaceRestore';
import {
  isActiveWorkspaceTodayLinkSurface,
  selectNoteActiveHubTodayOpen,
  workspaceSelectShowsActiveTabPillState,
} from '../lib/workspaceShellToday';
import type {VaultFilesChangedPayload} from '../lib/vaultFilesChangedPayload';
import {tryMergeThreeWayVaultMarkdown} from '../lib/vaultMarkdownThreeWayMerge';
import {cleanNoteMarkdownBody} from '../lib/cleanNoteMarkdown';
import {
  clearInboxYamlFrontmatterEditorRefs,
  inboxEditorSliceToFullMarkdown,
} from '../lib/inboxYamlFrontmatterEditor';
import {
  mergeInboxNoteBodyIntoCache,
  resolveInboxCachedBodyForEditor,
  classifyNoteDiskReconcile,
  fsChangePathsMayAffectUri,
  normalizeVaultMarkdownDiskRead,
  removeInboxNoteBodyFromCache,
  shouldMergeCacheAfterOutgoingPersist,
  shouldSkipOutgoingPersistAfterNoteLeave,
  shouldSkipOutgoingPersistBeforeWrite,
} from './inboxNoteBodyCache';

/** Skip showing an immediate blocking disk conflict if the user just edited; one deferred re-check follows. */
const DISK_CONFLICT_RECENCY_MS = 2000;
const DISK_CONFLICT_DEFER_MS = 600;

export type InboxEditorShellScrollDirective =
  | {kind: 'snapTop'}
  | {kind: 'restore'; top: number; left: number};

/** Small stable fingerprint for debug logs (not crypto). */
function fingerprintUtf16ForDebug(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function snapshotEditorShellScrollForOpenNote(
  scrollEl: HTMLDivElement | null,
  selectedUri: string | null,
  composingNewEntry: boolean,
  into: Map<string, {top: number; left: number}>,
) {
  if (!scrollEl || !selectedUri || composingNewEntry) {
    return;
  }
  into.set(normalizeEditorDocUri(selectedUri), {
    top: scrollEl.scrollTop,
    left: scrollEl.scrollLeft,
  });
}

function remapEditorShellScrollMapExact(
  map: Map<string, {top: number; left: number}>,
  fromUri: string,
  toUri: string,
) {
  const from = normalizeEditorDocUri(fromUri);
  const to = normalizeEditorDocUri(toUri);
  if (from === to) {
    return;
  }
  const v = map.get(from);
  if (v === undefined) {
    return;
  }
  map.delete(from);
  map.set(to, v);
}

function remapEditorShellScrollMapTreePrefix(
  map: Map<string, {top: number; left: number}>,
  oldPrefix: string,
  newPrefix: string,
) {
  const oldP = oldPrefix.replace(/\\/g, '/').replace(/\/+$/, '');
  const newP = newPrefix.replace(/\\/g, '/').replace(/\/+$/, '');
  if (oldP === newP) {
    return;
  }
  const next = new Map<string, {top: number; left: number}>();
  for (const [k, v] of map) {
    const mapped = remapVaultUriPrefix(k, oldP, newP);
    next.set(mapped ?? k, v);
  }
  map.clear();
  for (const [k, v] of next) {
    map.set(k, v);
  }
}

const STORE_PATH = 'eskerra-desktop.json';
const STORE_KEY_VAULT = 'vaultRoot';

/** Debounce scan of the active note body for backlinks (full vault scan is too heavy per keystroke). */
const INBOX_BACKLINK_BODY_DEBOUNCE_MS = 200;

/** Debounce vault-wide backlink computation after selection / ref list changes (reads note bodies from disk). */
const VAULT_BACKLINK_COMPUTE_DEBOUNCE_MS = 320;

type NoteRow = {lastModified: number | null; name: string; uri: string};

type LastPersisted = {uri: string; markdown: string};

type DiskConflictState = {uri: string; diskMarkdown: string};

/** Non-blocking: disk diverged while editing; autosave may continue until user opens full resolve. */
type DiskConflictSoftState = {uri: string; diskMarkdown: string};

type PendingWikiLinkAmbiguityRename = {
  uri: string;
  nextDisplayName: string;
  summary: {
    scannedFileCount: number;
    touchedFileCount: number;
    touchedBytes: number;
    updatedLinkCount: number;
    skippedAmbiguousLinkCount: number;
  };
};

type RenameLinkProgress = {done: number; total: number};

const LARGE_RENAME_MIN_TOUCHED_FILES = 60;
const LARGE_RENAME_MIN_TOUCHED_BYTES = 768 * 1024;
const RENAME_APPLY_YIELD_EVERY_WRITES = 24;
const RENAME_NOTICE_TTL_MS = 5000;

function equalReadonlyStringArrays(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

async function loadMarkdownBodiesForWikiMaintenance(
  fs: VaultFilesystem,
  refs: ReadonlyArray<{uri: string}>,
  seed: Readonly<Record<string, string>>,
  activeUri: string | null,
  activeBody: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {...seed};
  for (const {uri} of refs) {
    if (activeUri != null && uri === activeUri) {
      out[uri] = activeBody;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(out, uri)) {
      continue;
    }
    try {
      const raw = await fs.readFile(uri, {encoding: 'utf8'});
      out[uri] = normalizeVaultMarkdownDiskRead(raw);
    } catch {
      out[uri] = '';
    }
  }
  return out;
}

export type UseMainWindowWorkspaceResult = {
  vaultRoot: string | null;
  vaultSettings: EskerraSettings | null;
  setVaultSettings: Dispatch<SetStateAction<EskerraSettings | null>>;
  settingsName: string;
  notes: NoteRow[];
  selectedUri: string | null;
  editorBody: string;
  inboxEditorResetNonce: number;
  busy: boolean;
  err: string | null;
  composingNewEntry: boolean;
  inboxContentByUri: Record<string, string>;
  /** Vault-wide markdown index for wiki resolve, autocomplete, and link styling (async; may lag the tree). */
  vaultMarkdownRefs: VaultMarkdownRef[];
  selectedNoteBacklinkUris: readonly string[];
  fsRefreshNonce: number;
  deviceInstanceId: string;
  wikiRenameNotice: string | null;
  renameLinkProgress: RenameLinkProgress | null;
  pendingWikiLinkAmbiguityRename: PendingWikiLinkAmbiguityRename | null;
  confirmPendingWikiLinkAmbiguityRename: () => Promise<void>;
  cancelPendingWikiLinkAmbiguityRename: () => void;
  setErr: (value: string | null) => void;
  /**
   * Disk diverged from last persisted content while the editor has local edits.
   * Autosave is blocked until the user reloads or chooses to keep local edits (overwrite disk on next save).
   */
  diskConflict: DiskConflictState | null;
  resolveDiskConflictReloadFromDisk: () => void;
  resolveDiskConflictKeepLocal: () => void;
  /** Softer notice: disk diverged but saving may continue until the user opens full resolve. */
  diskConflictSoft: DiskConflictSoftState | null;
  elevateDiskConflictSoftToBlocking: () => void;
  dismissDiskConflictSoft: () => void;
  setEditorBody: (value: string) => void;
  hydrateVault: (root: string) => Promise<void>;
  startNewEntry: () => void;
  cancelNewEntry: () => void;
  /** Open or focus: if a tab already shows `uri`, activate it; else navigate the active tab. */
  selectNote: (uri: string) => void;
  /**
   * Prefer activating an existing tab that already shows `uri`; otherwise open a new tab and focus it
   * (e.g. file tree middle-click). Use `insertAfterActive` for hub-dropdown opens.
   */
  selectNoteInNewActiveTab: (
    uri: string,
    opts?: {insertAfterActive?: boolean},
  ) => void;
  submitNewEntry: () => Promise<void>;
  /** Ctrl/Cmd+S dispatch for Inbox editor (submit while composing, save otherwise). */
  onInboxSaveShortcut: () => void;
  /** Normalize markdown layout for the open vault note (body only; YAML unchanged). */
  onCleanNoteInbox: () => void;
  /** Await before closing the window or leaving the vault; cancels pending debounced save and runs persist. */
  flushInboxSave: () => Promise<void>;
  /** Editor intent entrypoint for wiki link open/create. */
  onWikiLinkActivate: (payload: VaultWikiLinkActivatePayload) => void;
  /** Editor intent entrypoint for relative `[](*.md)` link open/create. */
  onMarkdownRelativeLinkActivate: (
    payload: VaultRelativeMarkdownLinkActivatePayload,
  ) => void;
  /** Editor intent entrypoint for `http` / `https` / `mailto` inline links. */
  onMarkdownExternalLinkOpen: (payload: {href: string; at: number}) => void;
  deleteNote: (uri: string) => Promise<void>;
  renameNote: (uri: string, nextDisplayName: string) => Promise<void>;
  subtreeMarkdownCache: SubtreeMarkdownPresenceCache;
  deleteFolder: (directoryUri: string) => Promise<void>;
  renameFolder: (directoryUri: string, nextDisplayName: string) => Promise<void>;
  /** Single-item tree move (DnD): `renameFile` into target folder; stem unchanged (no wiki rewrites). */
  moveVaultTreeItem: (
    sourceUri: string,
    sourceKind: 'folder' | 'article',
    targetDirectoryUri: string,
  ) => Promise<void>;
  bulkDeleteVaultTreeItems: (items: VaultTreeBulkItem[]) => Promise<void>;
  bulkMoveVaultTreeItems: (
    items: VaultTreeBulkItem[],
    targetDirectoryUri: string,
  ) => Promise<void>;
  /** Bumped after bulk tree mutations so the vault pane can clear stale multi-selection. */
  vaultTreeSelectionClearNonce: number;
  /** True once persisted inbox shell state has been considered for the current vault. */
  inboxShellRestored: boolean;
  /** True after the first vault bootstrap attempt from persisted session (success, empty, or error). */
  initialVaultHydrateAttemptDone: boolean;
  editorHistoryCanGoBack: boolean;
  editorHistoryCanGoForward: boolean;
  editorHistoryGoBack: () => void;
  editorHistoryGoForward: () => void;
  /**
   * Set by the workspace immediately before inbox `selectedUri` / compose changes when scroll should
   * jump to top or restore a stored offset (back/forward). `VaultTab` reads and clears this ref in layout.
   */
  inboxEditorShellScrollDirectiveRef: MutableRefObject<InboxEditorShellScrollDirective | null>;
  /**
   * Bumped after each `loadMarkdown`; `VaultTab` handles the one-frame backlinks defer locally so the
   * late rAF clear does not re-render the whole workspace.
   */
  inboxBacklinksDeferNonce: number;
  /** Open editor tabs with per-tab navigation history. */
  editorWorkspaceTabs: readonly EditorWorkspaceTab[];
  activeEditorTabId: string | null;
  activateOpenTab: (tabId: string) => void;
  closeEditorTab: (tabId: string) => void;
  /** Reorder open tabs in the title bar (`fromIndex` / `insertBeforeIndex` refer to order before the move). */
  reorderEditorWorkspaceTabs: (fromIndex: number, insertBeforeIndex: number) => void;
  closeOtherEditorTabs: (keepTabId: string) => void;
  closeAllEditorTabs: () => void;
  reopenLastClosedEditorTab: () => void;
  canReopenClosedEditorTab: boolean;
  /** Weekly hub grid under the main editor when `Today.md` is open. */
  showTodayHubCanvas: boolean;
  /** Parsed hub settings from merged `Today.md` markdown (body + shell-held YAML). */
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
  /** Skip Today Hub week-row clean when the blocking disk conflict targets that file. */
  todayHubCleanRowBlocked: (rowUri: string) => boolean;
  /** Title bar: eligible `Today.md` hubs (vault scan), sorted for stable ordering. */
  todayHubSelectorItems: readonly {todayNoteUri: string; label: string}[];
  /** Canonical `Today.md` URI for the workspace whose tab bar is active. */
  activeTodayHubUri: string | null;
  /** Per-hub tab snapshots merged for `saveMainWindowUi`. */
  todayHubWorkspacesForSave: Record<string, TodayHubWorkspaceSnapshot>;
  /** Switch hub workspace (persists current tabs under the old hub first). */
  switchTodayHubWorkspace: (todayNoteUri: string) => Promise<void>;
  /** Open or focus the active hub note (main segment of split control). */
  focusActiveTodayHubNote: () => void;
  /**
   * When true, the title bar workspace control should use the same active styling as an editor tab pill
   * (active-hub Today visible without a tab row entry for that URI).
   */
  workspaceSelectShowsActiveTabPill: boolean;
  /** YAML between `---` fences (or `null` if the note has no block). */
  inboxYamlFrontmatterInner: string | null;
  /** User / UI frontmatter edits: updates state, ref, and the normal debounced autosave path. */
  applyFrontmatterInnerChange: (nextInner: string | null) => void;
  /**
   * Sync from disk / load / merge (not a direct user edit). Keeps `inboxYamlFrontmatterInner` aligned
   * with the ref and leading text.
   */
  syncFrontmatterStateFromDisk: (nextInner: string | null, leading: string) => void;
};

function cloneEditorWorkspaceTabs(tabs: readonly EditorWorkspaceTab[]): EditorWorkspaceTab[] {
  return tabsFromStored(tabsToStored(tabs));
}

export function useMainWindowWorkspace(options: {
  fs: VaultFilesystem;
  inboxEditorRef: RefObject<NoteMarkdownEditorHandle | null>;
  /** `.note-markdown-editor-scroll`: used to snapshot and restore scroll offsets per note URI. */
  inboxEditorShellScrollRef: RefObject<HTMLDivElement | null>;
  restoredInboxState: {
    vaultRoot: string;
    composingNewEntry: boolean;
    selectedUri: string | null;
    openTabUris?: readonly string[] | null;
    editorWorkspaceTabs?: ReadonlyArray<{
      id: string;
      entries: string[];
      index: number;
    }> | null;
    activeEditorTabId?: string | null;
    activeTodayHubUri?: string | null;
    todayHubWorkspaces?: Record<string, TodayHubWorkspaceSnapshot> | null;
  } | null;
  inboxRestoreEnabled: boolean;
}): UseMainWindowWorkspaceResult {
  const {
    fs,
    inboxEditorRef,
    inboxEditorShellScrollRef,
    restoredInboxState,
    inboxRestoreEnabled,
  } = options;
  const [vaultRoot, setVaultRoot] = useState<string | null>(null);
  const [vaultSettings, setVaultSettings] = useState<EskerraSettings | null>(null);
  const [settingsName, setSettingsName] = useState('Eskerra');
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [editorBody, setEditorBody] = useState('');
  const [inboxEditorResetNonce, setInboxEditorResetNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [diskConflict, setDiskConflict] = useState<DiskConflictState | null>(null);
  const diskConflictRef = useRef<DiskConflictState | null>(null);
  const [diskConflictSoft, setDiskConflictSoft] = useState<DiskConflictSoftState | null>(null);
  const diskConflictSoftRef = useRef<DiskConflictSoftState | null>(null);
  const lastInboxEditorActivityAtRef = useRef(0);
  const skipRecencyDeferForUriRef = useRef<Set<string>>(new Set());
  const diskConflictDeferTimerRef = useRef<number | null>(null);
  const [composingNewEntry, setComposingNewEntry] = useState(false);
  const [showTodayHubCanvas, setShowTodayHubCanvas] = useState(false);
  const [inboxContentByUri, setInboxContentByUri] = useState<Record<string, string>>({});
  const [vaultMarkdownRefs, setVaultMarkdownRefs] = useState<VaultMarkdownRef[]>([]);
  const [fsRefreshNonce, setFsRefreshNonce] = useState(0);
  const [vaultTreeSelectionClearNonce, setVaultTreeSelectionClearNonce] = useState(0);
  const [deviceInstanceId, setDeviceInstanceId] = useState('');
  const [initialVaultHydrateAttemptDone, setInitialVaultHydrateAttemptDone] =
    useState(false);
  const [inboxShellRestored, setInboxShellRestored] = useState(true);
  const [backlinksActiveBody, setBacklinksActiveBody] = useState('');
  const [selectedNoteBacklinkUris, setSelectedNoteBacklinkUris] = useState<
    readonly string[]
  >([]);
  const [inboxBacklinksDeferNonce, setInboxBacklinksDeferNonce] = useState(0);
  const [wikiRenameNotice, setWikiRenameNotice] = useState<string | null>(null);
  const [renameLinkProgress, setRenameLinkProgress] = useState<RenameLinkProgress | null>(
    null,
  );
  const [pendingWikiLinkAmbiguityRename, setPendingWikiLinkAmbiguityRename] =
    useState<PendingWikiLinkAmbiguityRename | null>(null);
  const [editorWorkspaceTabs, setEditorWorkspaceTabs] = useState<
    EditorWorkspaceTab[]
  >([]);
  const [activeEditorTabId, setActiveEditorTabId] = useState<string | null>(
    null,
  );
  const [activeTodayHubUri, setActiveTodayHubUri] = useState<string | null>(
    null,
  );
  const [todayHubWorkspacesForSave, setTodayHubWorkspacesForSave] = useState<
    Record<string, TodayHubWorkspaceSnapshot>
  >({});
  const [editorClosedStackVersion, setEditorClosedStackVersion] = useState(0);

  const subtreeMarkdownCacheRef = useRef(new SubtreeMarkdownPresenceCache());
  /** Bodies read from disk for vault-wide backlink scan; avoids re-reading every note on each selection change. */
  const vaultBacklinkDiskBodyCacheRef = useRef<Record<string, string>>({});
  const inboxBodyPrefetchGenRef = useRef(0);
  const vaultRefsBuildGenRef = useRef(0);
  const vaultMarkdownRefsRef = useRef<VaultMarkdownRef[]>([]);
  const selectedNoteBacklinkUrisRef = useRef<readonly string[]>([]);
  const vaultRootRef = useRef<string | null>(null);
  const selectedUriRef = useRef<string | null>(null);
  const composingNewEntryRef = useRef(false);
  const showTodayHubCanvasRef = useRef(false);
  const editorBodyRef = useRef('');
  const lastPersistedRef = useRef<LastPersisted | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveActiveRef = useRef(false);
  const eagerEditorLoadUriRef = useRef<string | null>(null);
  const suppressEditorOnChangeRef = useRef(false);
  /** YAML inner (between `---` fences); paired ref for autosave hot path. */
  const [inboxYamlFrontmatterInner, setInboxYamlFrontmatterInner] = useState<
    string | null
  >(null);
  const inboxYamlFrontmatterInnerRef = useRef<string | null>(null);
  const inboxEditorYamlLeadingBeforeFrontmatterRef = useRef('');
  const autosaveSchedulerRef = useRef(
    createInboxAutosaveScheduler(INBOX_AUTOSAVE_DEBOUNCE_MS),
  );
  const todayHubBridgeRef = useRef<TodayHubWorkspaceBridge>(
    createIdleTodayHubWorkspaceBridge(),
  );
  const todayHubWikiNavParentRef = useRef<string | null>(null);
  const todayHubCellEditorRef = useRef<NoteMarkdownEditorHandle | null>(null);
  const todayHubRowLastPersistedRef = useRef<Map<string, string>>(new Map());
  const todayHubSettingsRef = useRef<TodayHubSettings | null>(null);
  const flushInboxSaveRef = useRef<() => Promise<void>>(async () => {});
  const inboxContentByUriRef = useRef<Record<string, string>>({});
  const backlinksActiveBodyRef = useRef('');
  const renameNoticeTimeoutRef = useRef<number | null>(null);
  const editorWorkspaceTabsRef = useRef<EditorWorkspaceTab[]>([]);
  const activeEditorTabIdRef = useRef<string | null>(null);
  const activeTodayHubUriRef = useRef<string | null>(null);
  /** User-initiated tab closes only (for Reopen closed tab). */
  const editorClosedTabsStackRef = useRef<ClosedEditorTabRecord[]>([]);
  const notesRef = useRef<NoteRow[]>([]);
  const editorShellScrollByUriRef = useRef(
    new Map<string, {top: number; left: number}>(),
  );
  const inboxEditorShellScrollDirectiveRef =
    useRef<InboxEditorShellScrollDirective | null>(null);
  /** Invalidates in-flight `openMarkdownInEditor` work when a newer open supersedes it. */
  const openMarkdownGenerationRef = useRef(0);
  const inboxBacklinksDeferAfterLoadRafRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    inboxYamlFrontmatterInnerRef.current = inboxYamlFrontmatterInner;
  }, [inboxYamlFrontmatterInner]);

  const syncFrontmatterStateFromDisk = useCallback(
    (nextInner: string | null, leading: string) => {
      inboxYamlFrontmatterInnerRef.current = nextInner;
      setInboxYamlFrontmatterInner(nextInner);
      inboxEditorYamlLeadingBeforeFrontmatterRef.current = leading;
    },
    [],
  );

  const applyFrontmatterInnerChange = useCallback((nextInner: string | null) => {
    if (composingNewEntryRef.current) {
      return;
    }
    if (!selectedUriRef.current) {
      return;
    }
    inboxYamlFrontmatterInnerRef.current = nextInner;
    setInboxYamlFrontmatterInner(nextInner);
  }, []);

  useLayoutEffect(() => {
    diskConflictRef.current = diskConflict;
  }, [diskConflict]);

  useLayoutEffect(() => {
    diskConflictSoftRef.current = diskConflictSoft;
  }, [diskConflictSoft]);

  vaultRootRef.current = vaultRoot;
  selectedUriRef.current = selectedUri;
  composingNewEntryRef.current = composingNewEntry;
  showTodayHubCanvasRef.current = showTodayHubCanvas;
  editorBodyRef.current = editorBody;
  inboxContentByUriRef.current = inboxContentByUri;
  backlinksActiveBodyRef.current = backlinksActiveBody;

  const guardedSetEditorBody: typeof setEditorBody = useCallback(
    value => {
      if (suppressEditorOnChangeRef.current) return;
      lastInboxEditorActivityAtRef.current = Date.now();
      setEditorBody(value);
    },
    [],
  );

  const loadFullMarkdownIntoInboxEditor = useCallback(
    (
      full: string,
      uri: string | null,
      selection: 'start' | 'end' | 'preserve' = 'start',
    ) => {
      const composing = composingNewEntryRef.current;
      if (!uri || composing) {
        syncFrontmatterStateFromDisk(null, '');
        suppressEditorOnChangeRef.current = true;
        inboxEditorRef.current?.loadMarkdown(full, {selection});
        suppressEditorOnChangeRef.current = false;
        setEditorBody(full);
        editorBodyRef.current = full;
        return;
      }
      const {frontmatter, body, leadingBeforeFrontmatter} =
        splitYamlFrontmatter(full);
      const inner =
        frontmatter !== null
          ? fencedFrontmatterBlockToInner(frontmatter)
          : null;
      syncFrontmatterStateFromDisk(
        inner,
        frontmatter !== null ? leadingBeforeFrontmatter : '',
      );
      suppressEditorOnChangeRef.current = true;
      inboxEditorRef.current?.loadMarkdown(body, {selection});
      suppressEditorOnChangeRef.current = false;
      setEditorBody(body);
      editorBodyRef.current = body;
    },
    [inboxEditorRef, setEditorBody, syncFrontmatterStateFromDisk],
  );

  useLayoutEffect(() => {
    selectedNoteBacklinkUrisRef.current = selectedNoteBacklinkUris;
  }, [selectedNoteBacklinkUris]);

  useLayoutEffect(() => {
    editorWorkspaceTabsRef.current = editorWorkspaceTabs;
  }, [editorWorkspaceTabs]);

  useLayoutEffect(() => {
    activeEditorTabIdRef.current = activeEditorTabId;
  }, [activeEditorTabId]);

  useLayoutEffect(() => {
    activeTodayHubUriRef.current = activeTodayHubUri;
  }, [activeTodayHubUri]);

  useLayoutEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const bumpEditorClosedStack = useCallback(() => {
    setEditorClosedStackVersion(v => v + 1);
  }, []);

  /* editorClosedStackVersion re-runs this when the ref-backed closed-tab stack mutates. */
  const canReopenClosedEditorTab = useMemo(() => {
    const root = vaultRoot;
    if (!root) {
      return false;
    }
    const noteSet = new Set(
      notes.map(n => n.uri.replace(/\\/g, '/')),
    );
    const stack = editorClosedTabsStackRef.current;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (
        isEditorClosedTabReopenable(stack[i]!.uri, root, noteSet)
      ) {
        return true;
      }
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editorClosedStackVersion syncs ref stack mutations to UI
  }, [vaultRoot, notes, editorClosedStackVersion]);

  const todayHubSelectorItems = useMemo(() => {
    const hubs = sortedTodayHubNoteUrisFromRefs(vaultMarkdownRefs);
    return hubs.map(todayNoteUri => ({
      todayNoteUri,
      label: editorOpenTabPillLabel(notes, todayNoteUri),
    }));
  }, [vaultMarkdownRefs, notes]);

  const todayHubWorkspacesPersistFiltered = useMemo(() => {
    const hubs = new Set(sortedTodayHubNoteUrisFromRefs(vaultMarkdownRefs));
    const out: Record<string, TodayHubWorkspaceSnapshot> = {};
    for (const [k, v] of Object.entries(todayHubWorkspacesForSave)) {
      if (hubs.has(k)) {
        out[k] = v;
      }
    }
    return out;
  }, [todayHubWorkspacesForSave, vaultMarkdownRefs]);

  const workspaceSelectShowsActiveTabPill = useMemo(
    () =>
      workspaceSelectShowsActiveTabPillState({
        composingNewEntry,
        activeTodayHubUri,
        selectedUri,
        editorWorkspaceTabs,
      }),
    [composingNewEntry, activeTodayHubUri, selectedUri, editorWorkspaceTabs],
  );

  const clearRenameNotice = useCallback(() => {
    if (renameNoticeTimeoutRef.current != null) {
      window.clearTimeout(renameNoticeTimeoutRef.current);
      renameNoticeTimeoutRef.current = null;
    }
    setWikiRenameNotice(null);
  }, []);

  const setTransientRenameNotice = useCallback(
    (message: string) => {
      clearRenameNotice();
      setWikiRenameNotice(message);
      renameNoticeTimeoutRef.current = window.setTimeout(() => {
        setWikiRenameNotice(null);
        renameNoticeTimeoutRef.current = null;
      }, RENAME_NOTICE_TTL_MS);
    },
    [clearRenameNotice],
  );

  useEffect(() => {
    return () => {
      if (renameNoticeTimeoutRef.current != null) {
        window.clearTimeout(renameNoticeTimeoutRef.current);
      }
    };
  }, []);

  const scheduleBacklinksDeferOneFrameAfterLoad = useCallback(() => {
    if (inboxBacklinksDeferAfterLoadRafRef.current != null) {
      cancelAnimationFrame(inboxBacklinksDeferAfterLoadRafRef.current);
      inboxBacklinksDeferAfterLoadRafRef.current = null;
    }
    setInboxBacklinksDeferNonce(n => n + 1);
    inboxBacklinksDeferAfterLoadRafRef.current = requestAnimationFrame(() => {
      inboxBacklinksDeferAfterLoadRafRef.current = null;
    });
  }, []);

  const clearInboxBacklinksDeferAfterLoad = useCallback(() => {
    if (inboxBacklinksDeferAfterLoadRafRef.current != null) {
      cancelAnimationFrame(inboxBacklinksDeferAfterLoadRafRef.current);
      inboxBacklinksDeferAfterLoadRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (inboxBacklinksDeferAfterLoadRafRef.current != null) {
        cancelAnimationFrame(inboxBacklinksDeferAfterLoadRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (composingNewEntry || !selectedUri || !vaultRoot) {
      setSelectedNoteBacklinkUris([]);
      return;
    }

    const selected = selectedUri;
    let cancelled = false;

    const tid = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      void (async () => {
        try {
          const refs = vaultMarkdownRefsRef.current;
          const activeUri = selectedUriRef.current;
          const activeBody = backlinksActiveBodyRef.current;
          if (cancelled || activeUri !== selected) {
            return;
          }

          const seed = mergeVaultBacklinkBodySeed(
            vaultBacklinkDiskBodyCacheRef.current,
            inboxContentByUriRef.current,
          );
          const expanded = await loadMarkdownBodiesForWikiMaintenance(
            fs,
            refs,
            seed,
            activeUri,
            activeBody,
          );
          const pruned: Record<string, string> = {};
          for (const {uri} of refs) {
            pruned[uri] = expanded[uri] ?? '';
          }
          vaultBacklinkDiskBodyCacheRef.current = pruned;
          if (cancelled || selectedUriRef.current !== selected) {
            return;
          }

          const uris = listInboxAllBacklinkReferrersForTarget({
            vaultRoot,
            targetUri: selected,
            notes: refs.map(r => ({name: r.name, uri: r.uri})),
            contentByUri: expanded,
            activeUri,
            activeBody,
          });
          if (!cancelled && selectedUriRef.current === selected) {
            setSelectedNoteBacklinkUris(prev =>
              equalReadonlyStringArrays(prev, uris) ? prev : uris,
            );
          }
        } catch {
          if (!cancelled && selectedUriRef.current === selected) {
            setSelectedNoteBacklinkUris(prev =>
              prev.length === 0 ? prev : [],
            );
          }
        }
      })();
    }, VAULT_BACKLINK_COMPUTE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [
    composingNewEntry,
    selectedUri,
    vaultRoot,
    vaultMarkdownRefs,
    inboxContentByUri,
    backlinksActiveBody,
    fs,
  ]);

  useEffect(() => {
    vaultMarkdownRefsRef.current = vaultMarkdownRefs;
  }, [vaultMarkdownRefs]);

  useEffect(() => {
    if (!vaultRoot || !selectedUri || composingNewEntry) {
      setShowTodayHubCanvas(false);
      return;
    }
    const normRoot = normalizeVaultBaseUri(vaultRoot).replace(/\\/g, '/').replace(/\/+$/, '');
    const normSel = selectedUri.replace(/\\/g, '/');
    if (!normSel.startsWith(`${normRoot}/`)) {
      setShowTodayHubCanvas(false);
      return;
    }
    setShowTodayHubCanvas(vaultUriIsTodayMarkdownFile(normSel));
  }, [vaultRoot, selectedUri, composingNewEntry]);

  const todayHubSettings = useMemo((): TodayHubSettings | null => {
    if (!showTodayHubCanvas || !selectedUri) {
      return null;
    }
    const full = inboxEditorSliceToFullMarkdown(
      editorBody,
      selectedUri,
      composingNewEntry,
      inboxYamlFrontmatterInnerRef.current,
      inboxEditorYamlLeadingBeforeFrontmatterRef.current,
    );
    return parseTodayHubFrontmatter(full);
  }, [showTodayHubCanvas, selectedUri, editorBody, composingNewEntry, inboxYamlFrontmatterInner]);

  useLayoutEffect(() => {
    todayHubSettingsRef.current = todayHubSettings;
  }, [todayHubSettings]);

  const refreshNotes = useCallback(
    async (root: string) => {
      const gen = ++inboxBodyPrefetchGenRef.current;
      const list = await listInboxNotes(root, fs);
      if (gen !== inboxBodyPrefetchGenRef.current) {
        return;
      }
      setNotes(list);
    },
    [fs],
  );

  /**
   * Persists a fixed URI + markdown captured when leaving a dirty note, chained like
   * `enqueueInboxPersist` but **not** awaited by `openMarkdownInEditor`. Uses stale-cache guards so
   * a slow save cannot overwrite newer in-memory edits if the user re-opened the note before the
   * write ran.
   */
  const enqueuePersistOutgoingNoteMarkdown = useCallback(
    (uri: string, leaveSnapshotMarkdown: string): void => {
      const norm = normalizeEditorDocUri(uri);
      const run = async (): Promise<void> => {
        const root = vaultRootRef.current;
        if (!root) {
          return;
        }
        const dc = diskConflictRef.current;
        if (dc && normalizeEditorDocUri(dc.uri) === norm) {
          return;
        }
        const memStart = inboxContentByUriRef.current[norm];
        if (shouldSkipOutgoingPersistAfterNoteLeave(memStart, leaveSnapshotMarkdown)) {
          return;
        }
        try {
          setErr(null);
          const md = await persistTransientMarkdownImages(
            leaveSnapshotMarkdown,
            root,
          );
          if (markdownContainsTransientImageUrls(md)) {
            setErr(
              'Cannot save: some images are still temporary (blob or data URLs). Paste images again so they are stored under Assets/Attachments, or remove those image references.',
            );
            return;
          }
          if (md !== leaveSnapshotMarkdown) {
            const nextCache = mergeInboxNoteBodyIntoCache(
              inboxContentByUriRef.current,
              norm,
              md,
            );
            if (nextCache) {
              inboxContentByUriRef.current = nextCache;
              setInboxContentByUri(prev =>
                mergeInboxNoteBodyIntoCache(prev, norm, md) ?? prev,
              );
            }
            const active = selectedUriRef.current;
            if (active && normalizeEditorDocUri(active) === norm) {
              loadFullMarkdownIntoInboxEditor(md, norm, 'preserve');
              scheduleBacklinksDeferOneFrameAfterLoad();
            }
          }
          const memBeforeSave = inboxContentByUriRef.current[norm];
          if (
            shouldSkipOutgoingPersistBeforeWrite(
              memBeforeSave,
              leaveSnapshotMarkdown,
              md,
            )
          ) {
            return;
          }
          await saveNoteMarkdown(norm, fs, md);
          void refreshNotes(root).catch(() => undefined);

          const activeSel = selectedUriRef.current;
          if (activeSel && normalizeEditorDocUri(activeSel) === norm) {
            lastPersistedRef.current = {uri: norm, markdown: md};
          }

          const memAfter = inboxContentByUriRef.current[norm];
          if (shouldMergeCacheAfterOutgoingPersist(memAfter, md, leaveSnapshotMarkdown)) {
            const nextCache2 = mergeInboxNoteBodyIntoCache(
              inboxContentByUriRef.current,
              norm,
              md,
            );
            if (nextCache2) {
              inboxContentByUriRef.current = nextCache2;
              setInboxContentByUri(prev =>
                mergeInboxNoteBodyIntoCache(prev, norm, md) ?? prev,
              );
            }
          }
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      };

      saveActiveRef.current = true;
      const next = saveChainRef.current.then(run).finally(() => {
        saveActiveRef.current = false;
      });
      saveChainRef.current = next.catch(() => undefined);
    },
    [
      fs,
      refreshNotes,
      loadFullMarkdownIntoInboxEditor,
      scheduleBacklinksDeferOneFrameAfterLoad,
    ],
  );

  const enqueueInboxPersist = useCallback(async (): Promise<void> => {
    const run = async (): Promise<void> => {
      const root = vaultRootRef.current;
      const uri = selectedUriRef.current;
      if (!root || !uri || composingNewEntryRef.current) {
        return;
      }
      const dc = diskConflictRef.current;
      if (dc && normalizeEditorDocUri(dc.uri) === normalizeEditorDocUri(uri)) {
        return;
      }
      const raw = inboxEditorSliceToFullMarkdown(
        inboxEditorRef.current?.getMarkdown() ?? editorBodyRef.current,
        selectedUriRef.current,
        composingNewEntryRef.current,
        inboxYamlFrontmatterInnerRef.current,
        inboxEditorYamlLeadingBeforeFrontmatterRef.current,
      );
      const prev = lastPersistedRef.current;
      if (prev && prev.uri === uri && prev.markdown === raw) {
        return;
      }
      try {
        setErr(null);
        const md = await persistTransientMarkdownImages(raw, root);
        if (markdownContainsTransientImageUrls(md)) {
          setErr(
            'Cannot save: some images are still temporary (blob or data URLs). Paste images again so they are stored under Assets/Attachments, or remove those image references.',
          );
          return;
        }
        if (md !== raw) {
          loadFullMarkdownIntoInboxEditor(
            md,
            selectedUriRef.current,
            'preserve',
          );
          scheduleBacklinksDeferOneFrameAfterLoad();
        }
        await saveNoteMarkdown(uri, fs, md);
        await refreshNotes(root);
        if (selectedUriRef.current !== uri || composingNewEntryRef.current) {
          return;
        }
        lastPersistedRef.current = {uri, markdown: md};
        const nextCache = mergeInboxNoteBodyIntoCache(
          inboxContentByUriRef.current,
          uri,
          md,
        );
        if (nextCache) {
          inboxContentByUriRef.current = nextCache;
          setInboxContentByUri(prev =>
            mergeInboxNoteBodyIntoCache(prev, uri, md) ?? prev,
          );
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    };

    saveActiveRef.current = true;
    const next = saveChainRef.current.then(run).finally(() => {
      saveActiveRef.current = false;
    });
    saveChainRef.current = next.catch(() => undefined);
    await next;
  }, [
    fs,
    refreshNotes,
    inboxEditorRef,
    scheduleBacklinksDeferOneFrameAfterLoad,
    loadFullMarkdownIntoInboxEditor,
  ]);

  const prehydrateTodayHubRows = useCallback(
    async (uris: readonly string[]) => {
      const root = vaultRootRef.current;
      if (!root) {
        return;
      }
      await saveChainRef.current.catch(() => undefined);
      const updates: Record<string, string> = {};
      for (const uri of uris) {
        const n = normalizeEditorDocUri(uri);
        if (inboxContentByUriRef.current[n] !== undefined) {
          continue;
        }
        try {
          if (!(await fs.exists(n))) {
            continue;
          }
          const raw = await fs.readFile(n, {encoding: 'utf8'});
          const body = normalizeVaultMarkdownDiskRead(raw);
          updates[n] = body;
          todayHubRowLastPersistedRef.current.set(n, body);
        } catch {
          // ignore transient FS errors during prehydrate
        }
      }
      if (Object.keys(updates).length > 0) {
        inboxContentByUriRef.current = {...inboxContentByUriRef.current, ...updates};
        setInboxContentByUri(prev => ({...prev, ...updates}));
      }
    },
    [fs],
  );

  const persistTodayHubRow = useCallback(
    async (rowUri: string, merged: string, columnCount: number) => {
      const root = vaultRootRef.current;
      if (!root) {
        return;
      }
      const norm = normalizeEditorDocUri(rowUri);
      const run = async (): Promise<void> => {
        setErr(null);
        try {
          const toPersist = normalizeTodayHubRowForDisk(merged, columnCount);
          const sections = splitTodayRowIntoColumns(toPersist, columnCount);
          if (todayHubRowSectionsAllBlank(sections)) {
            try {
              if (await fs.exists(norm)) {
                await deleteVaultMarkdownNote(root, norm, fs);
                subtreeMarkdownCacheRef.current.invalidateForMutation(
                  root,
                  norm,
                  'file',
                );
              }
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
              return;
            }
            todayHubRowLastPersistedRef.current.delete(norm);
            const rm = removeInboxNoteBodyFromCache(
              inboxContentByUriRef.current,
              norm,
            );
            if (rm) {
              inboxContentByUriRef.current = rm;
              setInboxContentByUri(rm);
            }
            await refreshNotes(root);
            setFsRefreshNonce(n => n + 1);
            return;
          }
          const md = await persistTransientMarkdownImages(toPersist, root);
          if (markdownContainsTransientImageUrls(md)) {
            setErr(
              'Cannot save: some images are still temporary (blob or data URLs). Paste images again so they are stored under Assets/Attachments, or remove those image references.',
            );
            return;
          }
          await saveNoteMarkdown(norm, fs, md);
          subtreeMarkdownCacheRef.current.invalidateForMutation(root, norm, 'file');
          todayHubRowLastPersistedRef.current.set(norm, md);
          const nextCache = mergeInboxNoteBodyIntoCache(
            inboxContentByUriRef.current,
            norm,
            md,
          );
          if (nextCache) {
            inboxContentByUriRef.current = nextCache;
            setInboxContentByUri(prev =>
              mergeInboxNoteBodyIntoCache(prev, norm, md) ?? prev,
            );
          }
          await refreshNotes(root);
          setFsRefreshNonce(n => n + 1);
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      };
      saveActiveRef.current = true;
      const next = saveChainRef.current
        .then(() => run())
        .finally(() => {
          saveActiveRef.current = false;
        });
      saveChainRef.current = next.catch(() => undefined);
      await next;
    },
    [fs, refreshNotes],
  );

  const resolveDiskConflictReloadFromDisk = useCallback(() => {
    const c = diskConflictRef.current;
    const uri = selectedUriRef.current;
    if (!c || !uri || normalizeEditorDocUri(c.uri) !== normalizeEditorDocUri(uri)) {
      return;
    }
    const md = c.diskMarkdown;
    loadFullMarkdownIntoInboxEditor(md, uri, 'start');
    scheduleBacklinksDeferOneFrameAfterLoad();
    lastPersistedRef.current = {uri: c.uri, markdown: md};
    const nextCache = mergeInboxNoteBodyIntoCache(
      inboxContentByUriRef.current,
      c.uri,
      md,
    );
    if (nextCache) {
      inboxContentByUriRef.current = nextCache;
      setInboxContentByUri(prev =>
        mergeInboxNoteBodyIntoCache(prev, c.uri, md) ?? prev,
      );
    }
    setDiskConflict(null);
    diskConflictRef.current = null;
    setDiskConflictSoft(null);
    diskConflictSoftRef.current = null;
    setErr(null);
  }, [loadFullMarkdownIntoInboxEditor, scheduleBacklinksDeferOneFrameAfterLoad]);

  const resolveDiskConflictKeepLocal = useCallback(() => {
    const c = diskConflictRef.current;
    const uri = selectedUriRef.current;
    if (!c || !uri || normalizeEditorDocUri(c.uri) !== normalizeEditorDocUri(uri)) {
      return;
    }
    autosaveSchedulerRef.current.cancel();
    lastPersistedRef.current = {uri: c.uri, markdown: c.diskMarkdown};
    setDiskConflict(null);
    diskConflictRef.current = null;
    setDiskConflictSoft(null);
    diskConflictSoftRef.current = null;
    setErr(null);
  }, []);

  const elevateDiskConflictSoftToBlocking = useCallback(() => {
    const s = diskConflictSoftRef.current;
    const uri = selectedUriRef.current;
    if (!s || !uri || normalizeEditorDocUri(s.uri) !== normalizeEditorDocUri(uri)) {
      return;
    }
    autosaveSchedulerRef.current.cancel();
    const hard: DiskConflictState = {uri: s.uri, diskMarkdown: s.diskMarkdown};
    setDiskConflict(hard);
    diskConflictRef.current = hard;
    setDiskConflictSoft(null);
    diskConflictSoftRef.current = null;
  }, []);

  const dismissDiskConflictSoft = useCallback(() => {
    setDiskConflictSoft(null);
    diskConflictSoftRef.current = null;
    skipRecencyDeferForUriRef.current.clear();
  }, []);

  const flushInboxSave = useCallback(async () => {
    autosaveSchedulerRef.current.cancel();
    await todayHubBridgeRef.current.flushPendingEdits().catch(() => undefined);
    const uri = selectedUriRef.current;
    const dc = diskConflictRef.current;
    if (
      dc &&
      uri &&
      normalizeEditorDocUri(dc.uri) === normalizeEditorDocUri(uri)
    ) {
      setErr(
        'This note changed on disk while you were editing. Choose Reload from disk or Keep my edits before saving.',
      );
      return;
    }
    await enqueueInboxPersist();
  }, [enqueueInboxPersist]);

  flushInboxSaveRef.current = flushInboxSave;

  const openMarkdownInEditor = useCallback(
    async (
      uri: string,
      options?: {
        skipHistory?: boolean;
        newTab?: boolean;
        /** When `newTab` is true: default `true` (focus new tab). */
        activateNewTab?: boolean;
        /**
         * When creating a new tab: insert at `activeIndex + 1` (or index `0` if no active tab)
         * instead of appending at the end.
         */
        insertAfterActive?: boolean;
        /**
         * When creating a new tab: insert at this index (clamped to strip length).
         * Takes precedence over `insertAfterActive`.
         */
        insertAtIndex?: number;
        /**
         * Clear editor tabs for the active hub and open this note without a tab pill.
         * Only honored for the active workspace `Today.md` (`activeTodayHubUri`).
         */
        workspaceShell?: boolean;
        /**
         * Keep tab rows but set `activeEditorTabId` to null while opening the active hub Today
         * (implicit “home” surface; no tab pill active). Mutually exclusive with `workspaceShell`.
         */
        workspaceShellPreserveTabs?: boolean;
      },
    ) => {
      const openGen = ++openMarkdownGenerationRef.current;
      const targetNorm = normalizeEditorDocUri(uri);
      autosaveSchedulerRef.current.cancel();
      const hubBridge = todayHubBridgeRef.current;
      const needHubFlush =
        hubBridge.getLiveRowUri() != null || hubBridge.hasPendingHubFlush();
      if (needHubFlush) {
        await hubBridge.flushPendingEdits().catch(() => undefined);
      }
      if (openGen !== openMarkdownGenerationRef.current) {
        return;
      }
      if (diskConflictDeferTimerRef.current != null) {
        window.clearTimeout(diskConflictDeferTimerRef.current);
        diskConflictDeferTimerRef.current = null;
      }
      snapshotEditorShellScrollForOpenNote(
        inboxEditorShellScrollRef.current,
        selectedUriRef.current,
        composingNewEntryRef.current,
        editorShellScrollByUriRef.current,
      );
      const prevConflict = diskConflictRef.current;
      if (
        prevConflict &&
        normalizeEditorDocUri(prevConflict.uri) !== targetNorm
      ) {
        setDiskConflict(null);
        diskConflictRef.current = null;
      }
      const prevSoft = diskConflictSoftRef.current;
      if (
        prevSoft &&
        normalizeEditorDocUri(prevSoft.uri) !== targetNorm
      ) {
        setDiskConflictSoft(null);
        diskConflictSoftRef.current = null;
      }
      const isBackgroundNewTab =
        options?.newTab === true && options?.activateNewTab === false;

      if (!isBackgroundNewTab) {
        if (options?.skipHistory) {
          const saved =
            editorShellScrollByUriRef.current.get(targetNorm) ?? {top: 0, left: 0};
          inboxEditorShellScrollDirectiveRef.current = {
            kind: 'restore',
            top: saved.top,
            left: saved.left,
          };
        } else {
          inboxEditorShellScrollDirectiveRef.current = {kind: 'snapTop'};
        }
      }

      const root = vaultRootRef.current;
      const curUri = selectedUriRef.current;
      const snapMdForSlice =
        curUri != null && !composingNewEntryRef.current
          ? inboxEditorRef.current?.getMarkdown() ?? editorBodyRef.current
          : undefined;
      const snapshot =
        curUri != null && !composingNewEntryRef.current && snapMdForSlice !== undefined
          ? inboxEditorSliceToFullMarkdown(
              snapMdForSlice,
              curUri,
              false,
              inboxYamlFrontmatterInnerRef.current,
              inboxEditorYamlLeadingBeforeFrontmatterRef.current,
            )
          : undefined;
      if (curUri != null && snapshot !== undefined) {
        const nextCache = mergeInboxNoteBodyIntoCache(
          inboxContentByUriRef.current,
          curUri,
          snapshot,
        );
        if (nextCache) {
          inboxContentByUriRef.current = nextCache;
          setInboxContentByUri(prev =>
            mergeInboxNoteBodyIntoCache(prev, curUri, snapshot) ?? prev,
          );
        }
      }
      const needsPersist =
        root != null &&
        curUri != null &&
        snapshot !== undefined &&
        (() => {
          const prev = lastPersistedRef.current;
          return !(prev && prev.uri === curUri && prev.markdown === snapshot);
        })();
      if (needsPersist && curUri != null && snapshot !== undefined) {
        enqueuePersistOutgoingNoteMarkdown(curUri, snapshot);
      }
      if (openGen !== openMarkdownGenerationRef.current) {
        return;
      }

      const cacheMissPrefetch =
        root != null &&
        inboxContentByUriRef.current[targetNorm] === undefined;
      let prefetchBody: string | undefined;
      if (cacheMissPrefetch) {
        try {
          const raw = await fs.readFile(targetNorm, {encoding: 'utf8'});
          if (openGen !== openMarkdownGenerationRef.current) {
            return;
          }
          prefetchBody = normalizeVaultMarkdownDiskRead(raw);
        } catch (e) {
          if (openGen !== openMarkdownGenerationRef.current) {
            return;
          }
          setErr(e instanceof Error ? e.message : String(e));
        }
      }

      if (openGen !== openMarkdownGenerationRef.current) {
        return;
      }

      if (isBackgroundNewTab) {
        const newTab = createEditorWorkspaceTab(targetNorm);
        const curTabs = editorWorkspaceTabsRef.current;
        const activeId = activeEditorTabIdRef.current;
        let nextTabs: EditorWorkspaceTab[];
        if (
          typeof options?.insertAtIndex === 'number'
          && Number.isFinite(options.insertAtIndex)
        ) {
          nextTabs = insertTabAtIndex(curTabs, options.insertAtIndex, newTab);
        } else if (options?.insertAfterActive) {
          nextTabs = insertTabAfterActive(curTabs, activeId, newTab);
        } else {
          nextTabs = [...curTabs, newTab];
        }
        editorWorkspaceTabsRef.current = nextTabs;
        setEditorWorkspaceTabs(nextTabs);
        if (prefetchBody !== undefined) {
          inboxContentByUriRef.current = {
            ...inboxContentByUriRef.current,
            [targetNorm]: prefetchBody,
          };
          setInboxContentByUri(prev => {
            if (prev[targetNorm] === prefetchBody) {
              return prev;
            }
            return {...prev, [targetNorm]: prefetchBody!};
          });
        }
        return;
      }

      let nextTabs = editorWorkspaceTabsRef.current;
      let nextActiveId = activeEditorTabIdRef.current;

      const activeHubNorm = normalizeEditorDocUri(
        activeTodayHubUriRef.current ?? '',
      );
      const useWorkspaceShell =
        options?.workspaceShell === true
        && activeHubNorm != null
        && activeHubNorm !== ''
        && targetNorm === activeHubNorm
        && vaultUriIsTodayMarkdownFile(targetNorm);

      const useWorkspaceShellPreserveTabs =
        !useWorkspaceShell
        && options?.workspaceShellPreserveTabs === true
        && activeHubNorm != null
        && activeHubNorm !== ''
        && targetNorm === activeHubNorm
        && vaultUriIsTodayMarkdownFile(targetNorm);

      if (useWorkspaceShell) {
        nextTabs = [];
        nextActiveId = null;
      } else if (useWorkspaceShellPreserveTabs) {
        nextTabs = [...editorWorkspaceTabsRef.current];
        nextActiveId = null;
      } else if (options?.newTab && options?.activateNewTab !== false) {
        const newTab = createEditorWorkspaceTab(targetNorm);
        if (
          typeof options?.insertAtIndex === 'number'
          && Number.isFinite(options.insertAtIndex)
        ) {
          nextTabs = insertTabAtIndex(nextTabs, options.insertAtIndex, newTab);
        } else if (options?.insertAfterActive) {
          nextTabs = insertTabAfterActive(nextTabs, nextActiveId, newTab);
        } else {
          nextTabs = [...nextTabs, newTab];
        }
        nextActiveId = newTab.id;
      } else {
        const activeId = ensureActiveTabId(nextTabs, nextActiveId);
        if (activeId == null) {
          const first = createEditorWorkspaceTab(targetNorm);
          nextTabs = [first];
          nextActiveId = first.id;
        } else {
          nextTabs = nextTabs.map(t => {
            if (t.id !== activeId) {
              return t;
            }
            if (options?.skipHistory) {
              return t;
            }
            return pushNavigateOnTab(t, uri);
          });
          nextActiveId = activeId;
        }
      }

      editorWorkspaceTabsRef.current = nextTabs;
      activeEditorTabIdRef.current = nextActiveId;
      setEditorWorkspaceTabs(nextTabs);
      setActiveEditorTabId(nextActiveId);

      if (prefetchBody !== undefined) {
        lastPersistedRef.current = {uri: targetNorm, markdown: prefetchBody};
        inboxContentByUriRef.current = {...inboxContentByUriRef.current, [targetNorm]: prefetchBody};
      }

      const resolvedEditorBody =
        prefetchBody !== undefined
          ? prefetchBody
          : inboxContentByUriRef.current[targetNorm];

      if (resolvedEditorBody !== undefined) {
        lastPersistedRef.current = {uri: targetNorm, markdown: resolvedEditorBody};
        eagerEditorLoadUriRef.current = targetNorm;
        backlinksActiveBodyRef.current = resolvedEditorBody;
        loadFullMarkdownIntoInboxEditor(
          resolvedEditorBody,
          targetNorm,
          'start',
        );
        scheduleBacklinksDeferOneFrameAfterLoad();
      }

      selectedUriRef.current = targetNorm;
      composingNewEntryRef.current = false;

      if (prefetchBody !== undefined) {
        setInboxContentByUri(prev => {
          if (prev[targetNorm] === prefetchBody) {
            return prev;
          }
          return {...prev, [targetNorm]: prefetchBody!};
        });
      }
      if (resolvedEditorBody !== undefined) {
        setBacklinksActiveBody(resolvedEditorBody);
      }
      setComposingNewEntry(false);
      {
        const vr = vaultRootRef.current;
        let nextShowTodayHub = false;
        if (vr && targetNorm) {
          const normRoot = normalizeVaultBaseUri(vr)
            .replace(/\\/g, '/')
            .replace(/\/+$/, '');
          const normSel = targetNorm.replace(/\\/g, '/');
          if (normSel.startsWith(`${normRoot}/`)) {
            nextShowTodayHub = vaultUriIsTodayMarkdownFile(normSel);
          }
        }
        setShowTodayHubCanvas(nextShowTodayHub);
      }
      setSelectedUri(targetNorm);
    },
    [
      enqueuePersistOutgoingNoteMarkdown,
      fs,
      inboxEditorRef,
      inboxEditorShellScrollRef,
      loadFullMarkdownIntoInboxEditor,
      scheduleBacklinksDeferOneFrameAfterLoad,
    ],
  );

  const activateOpenTab = useCallback(
    (tabId: string) => {
      const tab = findTabById(editorWorkspaceTabsRef.current, tabId);
      const u = tab ? tabCurrentUri(tab) : null;
      if (!u) {
        return;
      }
      activeEditorTabIdRef.current = tabId;
      setActiveEditorTabId(tabId);
      void openMarkdownInEditor(u, {skipHistory: true});
    },
    [openMarkdownInEditor],
  );

  const reorderEditorWorkspaceTabs = useCallback(
    (fromIndex: number, insertBeforeIndex: number) => {
      if (busy) {
        return;
      }
      const tabs = editorWorkspaceTabsRef.current;
      const next = reorderEditorWorkspaceTabsInArray(tabs, fromIndex, insertBeforeIndex);
      let sameOrder = true;
      for (let i = 0; i < next.length; i++) {
        if (next[i]!.id !== tabs[i]!.id) {
          sameOrder = false;
          break;
        }
      }
      if (sameOrder) {
        return;
      }
      editorWorkspaceTabsRef.current = next;
      setEditorWorkspaceTabs(next);
    },
    [busy],
  );

  const closeEditorTab = useCallback(
    (tabId: string) => {
      void (async () => {
        const tabsBefore = editorWorkspaceTabsRef.current;
        const tabClosing = findTabById(tabsBefore, tabId);
        const wasActive = activeEditorTabIdRef.current === tabId;

        if (wasActive) {
          await flushInboxSaveRef.current();
        } else {
          await saveChainRef.current.catch(() => undefined);
        }

        const closedUri = tabClosing ? tabCurrentUri(tabClosing) : null;
        if (closedUri) {
          const closedIndex = tabsBefore.findIndex(t => t.id === tabId);
          editorClosedTabsStackRef.current.push({
            uri: closedUri,
            index: closedIndex >= 0 ? closedIndex : tabsBefore.length - 1,
          });
        }
        bumpEditorClosedStack();

        if (tabClosing) {
          for (const u of tabClosing.history.entries) {
            editorShellScrollByUriRef.current.delete(normalizeEditorDocUri(u));
          }
        }

        const nextTabId = pickNeighborTabIdAfterRemovingTab(tabsBefore, tabId);
        const nextTabs = tabsBefore.filter(t => t.id !== tabId);
        editorWorkspaceTabsRef.current = nextTabs;
        setEditorWorkspaceTabs(nextTabs);

        if (!wasActive) {
          return;
        }

        if (nextTabId) {
          activeEditorTabIdRef.current = nextTabId;
          setActiveEditorTabId(nextTabId);
          const neighbor = findTabById(nextTabs, nextTabId);
          const nextUri = neighbor ? tabCurrentUri(neighbor) : null;
          if (nextUri) {
            await openMarkdownInEditor(nextUri, {skipHistory: true});
          } else {
            const shellHubNeighbor = activeTodayHubUriRef.current;
            if (shellHubNeighbor) {
              await openMarkdownInEditor(shellHubNeighbor, {workspaceShell: true});
            } else {
              activeEditorTabIdRef.current = null;
              setActiveEditorTabId(null);
              selectedUriRef.current = null;
              composingNewEntryRef.current = false;
              lastPersistedRef.current = null;
              setSelectedUri(null);
              setComposingNewEntry(false);
              clearInboxYamlFrontmatterEditorRefs({
                inner: inboxYamlFrontmatterInnerRef,
                leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
                setInner: setInboxYamlFrontmatterInner,
              });
              setEditorBody('');
              setInboxEditorResetNonce(n => n + 1);
            }
          }
        } else {
          const shellHub = activeTodayHubUriRef.current;
          if (shellHub) {
            await openMarkdownInEditor(shellHub, {workspaceShell: true});
            return;
          }
          activeEditorTabIdRef.current = null;
          setActiveEditorTabId(null);
          selectedUriRef.current = null;
          composingNewEntryRef.current = false;
          lastPersistedRef.current = null;
          setSelectedUri(null);
          setComposingNewEntry(false);
          clearInboxYamlFrontmatterEditorRefs({
            inner: inboxYamlFrontmatterInnerRef,
            leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
            setInner: setInboxYamlFrontmatterInner,
          });
          setEditorBody('');
          setInboxEditorResetNonce(n => n + 1);
        }
      })();
    },
    [openMarkdownInEditor, bumpEditorClosedStack],
  );

  const closeOtherEditorTabs = useCallback(
    (keepTabId: string) => {
      void (async () => {
        const prevTabs = [...editorWorkspaceTabsRef.current];
        const keepTab = findTabById(prevTabs, keepTabId);
        const keepUri = keepTab ? tabCurrentUri(keepTab) : null;
        if (keepUri == null) {
          return;
        }
        await saveChainRef.current.catch(() => undefined);
        if (activeEditorTabIdRef.current !== keepTabId) {
          activeEditorTabIdRef.current = keepTabId;
          setActiveEditorTabId(keepTabId);
          await openMarkdownInEditor(keepUri, {skipHistory: true});
        } else {
          await flushInboxSaveRef.current();
        }
        pushClosedWorkspaceTabsFromCloseOther(
          editorClosedTabsStackRef.current,
          prevTabs,
          keepTabId,
        );
        bumpEditorClosedStack();
        for (const t of prevTabs) {
          if (t.id === keepTabId) {
            continue;
          }
          for (const u of t.history.entries) {
            editorShellScrollByUriRef.current.delete(normalizeEditorDocUri(u));
          }
        }
        const next = prevTabs.filter(t => t.id === keepTabId);
        editorWorkspaceTabsRef.current = next;
        setEditorWorkspaceTabs(next);
      })();
    },
    [openMarkdownInEditor, bumpEditorClosedStack],
  );

  const closeAllEditorTabs = useCallback(() => {
    void (async () => {
      await flushInboxSaveRef.current();
      const tabs = [...editorWorkspaceTabsRef.current];
      if (tabs.length === 0) {
        return;
      }
      pushClosedWorkspaceTabsFromCloseAll(
        editorClosedTabsStackRef.current,
        tabs,
        activeEditorTabIdRef.current,
      );
      bumpEditorClosedStack();
      for (const t of tabs) {
        for (const u of t.history.entries) {
          editorShellScrollByUriRef.current.delete(normalizeEditorDocUri(u));
        }
      }
      editorWorkspaceTabsRef.current = [];
      setEditorWorkspaceTabs([]);
      activeEditorTabIdRef.current = null;
      setActiveEditorTabId(null);
      const shellHubAll = activeTodayHubUriRef.current;
      if (shellHubAll) {
        await openMarkdownInEditor(shellHubAll, {workspaceShell: true});
        return;
      }
      selectedUriRef.current = null;
      composingNewEntryRef.current = false;
      lastPersistedRef.current = null;
      setSelectedUri(null);
      setComposingNewEntry(false);
      clearInboxYamlFrontmatterEditorRefs({
        inner: inboxYamlFrontmatterInnerRef,
        leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
        setInner: setInboxYamlFrontmatterInner,
      });
      setEditorBody('');
      setInboxEditorResetNonce(n => n + 1);
    })();
  }, [bumpEditorClosedStack, openMarkdownInEditor]);

  const reopenLastClosedEditorTab = useCallback(() => {
    void (async () => {
      const root = vaultRootRef.current;
      const stack = editorClosedTabsStackRef.current;
      while (stack.length > 0) {
        const rec = stack.pop()!;
        bumpEditorClosedStack();
        const noteSet = new Set(
          notesRef.current.map(n => n.uri.replace(/\\/g, '/')),
        );
        if (isEditorClosedTabReopenable(rec.uri, root, noteSet)) {
          await openMarkdownInEditor(rec.uri, {
            newTab: true,
            activateNewTab: true,
            insertAtIndex: rec.index,
          });
          return;
        }
      }
    })();
  }, [openMarkdownInEditor, bumpEditorClosedStack]);

  const hydrateVault = useCallback(
    async (root: string) => {
      await flushInboxSaveRef.current();
      editorShellScrollByUriRef.current = new Map();
      inboxEditorShellScrollDirectiveRef.current = null;
      setBusy(true);
      setErr(null);
      setDiskConflict(null);
      diskConflictRef.current = null;
      setDiskConflictSoft(null);
      diskConflictSoftRef.current = null;
      clearRenameNotice();
      setRenameLinkProgress(null);
      setPendingWikiLinkAmbiguityRename(null);
      subtreeMarkdownCacheRef.current.invalidateAll();
      vaultBacklinkDiskBodyCacheRef.current = {};
      setVaultSettings(null);
      try {
        await setVaultSession(root);
        await bootstrapVaultLayout(root, fs);
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
        setSettingsName(label !== '' ? label : 'Eskerra');
        await refreshNotes(root);
        editorWorkspaceTabsRef.current = [];
        setEditorWorkspaceTabs([]);
        activeEditorTabIdRef.current = null;
        setActiveEditorTabId(null);
        activeTodayHubUriRef.current = null;
        setActiveTodayHubUri(null);
        setTodayHubWorkspacesForSave({});
        editorClosedTabsStackRef.current = [];
        setEditorClosedStackVersion(n => n + 1);
        setSelectedUri(null);
        setComposingNewEntry(false);
        clearInboxYamlFrontmatterEditorRefs({
          inner: inboxYamlFrontmatterInnerRef,
          leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
          setInner: setInboxYamlFrontmatterInner,
        });
        setEditorBody('');
        lastPersistedRef.current = null;
        setInboxEditorResetNonce(n => n + 1);
        setVaultRoot(root);
        const store = await load(STORE_PATH);
        await store.set(STORE_KEY_VAULT, root);
        await store.save();
        await startVaultWatch();
        queueMicrotask(() => {
          void vaultSearchIndexSchedule().catch(() => undefined);
          void vaultFrontmatterIndexSchedule().catch(() => undefined);
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [fs, refreshNotes, clearRenameNotice],
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
          setInitialVaultHydrateAttemptDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateVault]);

  useEffect(() => {
    if (!vaultRoot) {
      return;
    }
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const applyExternalOpenNoteDeleted = async (normTab: string) => {
      const wasSelected = selectedUriRef.current === normTab;
      const nextTabs = removeUriFromAllTabs(
        editorWorkspaceTabsRef.current,
        u => u === normTab,
      );
      const nextActive = ensureActiveTabId(
        nextTabs,
        activeEditorTabIdRef.current,
      );
      editorWorkspaceTabsRef.current = nextTabs;
      setEditorWorkspaceTabs(nextTabs);
      activeEditorTabIdRef.current = nextActive;
      setActiveEditorTabId(nextActive);

      if (diskConflictRef.current?.uri === normTab) {
        setDiskConflict(null);
        diskConflictRef.current = null;
      }
      if (diskConflictSoftRef.current?.uri === normTab) {
        setDiskConflictSoft(null);
        diskConflictSoftRef.current = null;
      }

      editorShellScrollByUriRef.current.delete(normTab);

      const cacheNext = removeInboxNoteBodyFromCache(
        inboxContentByUriRef.current,
        normTab,
      );
      if (cacheNext) {
        inboxContentByUriRef.current = cacheNext;
        setInboxContentByUri(cacheNext);
      }

      if (!wasSelected) {
        return;
      }

      const activeTab = nextActive
        ? findTabById(nextTabs, nextActive)
        : undefined;
      const nextAfterRemove =
        (activeTab ? tabCurrentUri(activeTab) : null)
        ?? firstSurvivorUriFromTabs(nextTabs);

      if (nextAfterRemove) {
        await openMarkdownInEditor(nextAfterRemove, {skipHistory: true});
      } else {
        selectedUriRef.current = null;
        composingNewEntryRef.current = false;
        lastPersistedRef.current = null;
        setSelectedUri(null);
        setComposingNewEntry(false);
        clearInboxYamlFrontmatterEditorRefs({
          inner: inboxYamlFrontmatterInnerRef,
          leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
          setInner: setInboxYamlFrontmatterInner,
        });
        setEditorBody('');
        setInboxEditorResetNonce(n => n + 1);
      }
    };

    const reconcileOpenNotesAfterFsChange = async (rawPaths: string[]) => {
      const root = vaultRootRef.current;
      if (!root || cancelled) {
        return;
      }
      const normPaths = rawPaths.map(p => p.trim().replace(/\\/g, '/')).filter(Boolean);
      if (normPaths.length === 0) {
        console.debug(
          '[vault-files-changed] empty path batch: reconciling every open markdown tab (coarse invalidation); Rust watcher only emits non-empty batches today',
        );
      }
      const fullRefresh = normPaths.length === 0;
      const tabs = collectDistinctUrisFromTabs(editorWorkspaceTabsRef.current);

      for (const tabUri of tabs) {
        const normTab = normalizeEditorDocUri(tabUri);
        if (!normTab.toLowerCase().endsWith('.md')) {
          continue;
        }
        const stillOpen = collectDistinctUrisFromTabs(
          editorWorkspaceTabsRef.current,
        ).some(u => normalizeEditorDocUri(u) === normTab);
        if (!stillOpen) {
          continue;
        }
        if (!fullRefresh && !fsChangePathsMayAffectUri(normPaths, normTab, root)) {
          continue;
        }

        let exists = false;
        try {
          exists = await fs.exists(normTab);
        } catch {
          continue;
        }

        if (!exists) {
          await applyExternalOpenNoteDeleted(normTab);
          continue;
        }

        let diskBody: string;
        try {
          const raw = await fs.readFile(normTab, {encoding: 'utf8'});
          diskBody = normalizeVaultMarkdownDiskRead(raw);
        } catch {
          continue;
        }

        const isSelected =
          selectedUriRef.current === normTab && !composingNewEntryRef.current;
        if (!isSelected) {
          const cached = inboxContentByUriRef.current[normTab];
          if (cached !== diskBody) {
            const nextCache = mergeInboxNoteBodyIntoCache(
              inboxContentByUriRef.current,
              normTab,
              diskBody,
            );
            if (nextCache) {
              inboxContentByUriRef.current = nextCache;
              setInboxContentByUri(prev =>
                mergeInboxNoteBodyIntoCache(prev, normTab, diskBody) ?? prev,
              );
            }
          }
          continue;
        }

        const local = inboxEditorSliceToFullMarkdown(
          inboxEditorRef.current?.getMarkdown() ?? editorBodyRef.current,
          normTab,
          composingNewEntryRef.current,
          inboxYamlFrontmatterInnerRef.current,
          inboxEditorYamlLeadingBeforeFrontmatterRef.current,
        );
        const lp = lastPersistedRef.current;
        const kind = classifyNoteDiskReconcile({
          noteUri: normTab,
          lastPersisted: lp,
          diskMarkdown: diskBody,
          localMarkdown: local,
        });

        if (kind === 'noop') {
          if (diskConflictSoftRef.current?.uri === normTab) {
            setDiskConflictSoft(null);
            diskConflictSoftRef.current = null;
          }
          continue;
        }
        if (kind === 'reload_from_disk') {
          autosaveSchedulerRef.current.cancel();
          loadFullMarkdownIntoInboxEditor(diskBody, normTab, 'preserve');
          scheduleBacklinksDeferOneFrameAfterLoad();
          lastPersistedRef.current = {uri: normTab, markdown: diskBody};
          const nextCache = mergeInboxNoteBodyIntoCache(
            inboxContentByUriRef.current,
            normTab,
            diskBody,
          );
          if (nextCache) {
            inboxContentByUriRef.current = nextCache;
            setInboxContentByUri(prev =>
              mergeInboxNoteBodyIntoCache(prev, normTab, diskBody) ?? prev,
            );
          }
          if (diskConflictRef.current?.uri === normTab) {
            setDiskConflict(null);
            diskConflictRef.current = null;
          }
          if (diskConflictSoftRef.current?.uri === normTab) {
            setDiskConflictSoft(null);
            diskConflictSoftRef.current = null;
          }
          continue;
        }

        autosaveSchedulerRef.current.cancel();

        if (lp != null && normalizeEditorDocUri(lp.uri) === normTab) {
          const merged = tryMergeThreeWayVaultMarkdown(
            lp.markdown,
            local,
            diskBody,
          );
          if (merged.ok) {
            const mergedCanon = normalizeVaultMarkdownDiskRead(merged.merged);
            loadFullMarkdownIntoInboxEditor(mergedCanon, normTab, 'preserve');
            scheduleBacklinksDeferOneFrameAfterLoad();
            lastPersistedRef.current = {uri: normTab, markdown: mergedCanon};
            const mergeCache = mergeInboxNoteBodyIntoCache(
              inboxContentByUriRef.current,
              normTab,
              mergedCanon,
            );
            if (mergeCache) {
              inboxContentByUriRef.current = mergeCache;
              setInboxContentByUri(prev =>
                mergeInboxNoteBodyIntoCache(prev, normTab, mergedCanon) ?? prev,
              );
            }
            if (diskConflictRef.current?.uri === normTab) {
              setDiskConflict(null);
              diskConflictRef.current = null;
            }
            if (diskConflictSoftRef.current?.uri === normTab) {
              setDiskConflictSoft(null);
              diskConflictSoftRef.current = null;
            }
            console.debug('[disk-merge]', {
              uri: normTab,
              mergedLen: mergedCanon.length,
            });
            continue;
          }
        }

        const skipRecency = skipRecencyDeferForUriRef.current.has(normTab);
        if (skipRecency) {
          skipRecencyDeferForUriRef.current.delete(normTab);
        } else if (
          Date.now() - lastInboxEditorActivityAtRef.current < DISK_CONFLICT_RECENCY_MS
        ) {
          if (diskConflictDeferTimerRef.current != null) {
            window.clearTimeout(diskConflictDeferTimerRef.current);
          }
          diskConflictDeferTimerRef.current = window.setTimeout(() => {
            diskConflictDeferTimerRef.current = null;
            skipRecencyDeferForUriRef.current.add(normTab);
            if (
              cancelled ||
              selectedUriRef.current !== normTab ||
              composingNewEntryRef.current
            ) {
              skipRecencyDeferForUriRef.current.delete(normTab);
              return;
            }
            void reconcileOpenNotesAfterFsChange([normTab]);
          }, DISK_CONFLICT_DEFER_MS);
          continue;
        }

        const soft: DiskConflictSoftState = {uri: normTab, diskMarkdown: diskBody};
        console.debug('[disk-conflict-soft]', {
          uri: normTab,
          diskLen: diskBody.length,
          localLen: local.length,
          lastPersistedLen: lp?.markdown.length ?? 0,
          diskFp: fingerprintUtf16ForDebug(diskBody),
          localFp: fingerprintUtf16ForDebug(local),
          persistedFp: lp ? fingerprintUtf16ForDebug(lp.markdown) : null,
        });
        setDiskConflict(null);
        diskConflictRef.current = null;
        setDiskConflictSoft(soft);
        diskConflictSoftRef.current = soft;
      }

      const todaySel = selectedUriRef.current;
      const normToday = todaySel?.replace(/\\/g, '/');
      if (
        normToday
        && vaultUriIsTodayMarkdownFile(normToday)
        && !composingNewEntryRef.current
      ) {
        const hubDir = vaultUriParentDirectory(normToday);
        const hubStart = todayHubSettingsRef.current?.start ?? 'monday';
        for (const m of enumerateTodayHubWeekStarts(new Date(), hubStart)) {
          const rowUri = normalizeEditorDocUri(todayHubRowUri(hubDir, m));
          if (!fullRefresh && !fsChangePathsMayAffectUri(normPaths, rowUri, root)) {
            continue;
          }
          let exists = false;
          try {
            exists = await fs.exists(rowUri);
          } catch {
            continue;
          }
          if (!exists) {
            todayHubRowLastPersistedRef.current.delete(rowUri);
            const rm = removeInboxNoteBodyFromCache(
              inboxContentByUriRef.current,
              rowUri,
            );
            if (rm) {
              inboxContentByUriRef.current = rm;
              setInboxContentByUri(rm);
            }
            continue;
          }
          let diskBody: string;
          try {
            const raw = await fs.readFile(rowUri, {encoding: 'utf8'});
            diskBody = normalizeVaultMarkdownDiskRead(raw);
          } catch {
            continue;
          }
          const liveUri = todayHubBridgeRef.current.getLiveRowUri();
          if (liveUri === rowUri) {
            continue;
          }
          const cached = inboxContentByUriRef.current[rowUri];
          if (cached === diskBody) {
            todayHubRowLastPersistedRef.current.set(rowUri, diskBody);
            continue;
          }
          todayHubRowLastPersistedRef.current.set(rowUri, diskBody);
          const nextHubCache = mergeInboxNoteBodyIntoCache(
            inboxContentByUriRef.current,
            rowUri,
            diskBody,
          );
          if (nextHubCache) {
            inboxContentByUriRef.current = nextHubCache;
            setInboxContentByUri(prev =>
              mergeInboxNoteBodyIntoCache(prev, rowUri, diskBody) ?? prev,
            );
          }
        }
      }
    };

    void listen<VaultFilesChangedPayload>('vault-files-changed', event => {
      const paths = event.payload?.paths ?? [];
      if (paths.length > 0) {
        void vaultSearchIndexTouchPaths(paths).catch(() => undefined);
        void vaultFrontmatterIndexTouchPaths(paths).catch(() => undefined);
      }
      subtreeMarkdownCacheRef.current.invalidateAll();
      vaultBacklinkDiskBodyCacheRef.current = {};
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
      void reconcileOpenNotesAfterFsChange(paths);
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
      if (diskConflictDeferTimerRef.current != null) {
        window.clearTimeout(diskConflictDeferTimerRef.current);
        diskConflictDeferTimerRef.current = null;
      }
    };
  }, [
    vaultRoot,
    refreshNotes,
    fs,
    inboxEditorRef,
    openMarkdownInEditor,
    loadFullMarkdownIntoInboxEditor,
    scheduleBacklinksDeferOneFrameAfterLoad,
  ]);

  useEffect(() => {
    if (!vaultRoot) {
      setVaultMarkdownRefs([]);
      return;
    }
    const gen = ++vaultRefsBuildGenRef.current;
    const ac = new AbortController();
    void (async () => {
      try {
        const refs = await collectVaultMarkdownRefs(vaultRoot, fs, {signal: ac.signal});
        if (gen !== vaultRefsBuildGenRef.current) {
          return;
        }
        setVaultMarkdownRefs(refs);
      } catch (e) {
        if (ac.signal.aborted) {
          return;
        }
        console.warn('[vaultMarkdownRefs]', e);
      }
    })();
    return () => {
      ac.abort();
    };
  }, [vaultRoot, fs, fsRefreshNonce]);

  useLayoutEffect(() => {
    if (!vaultRoot || !selectedUri) {
      clearInboxBacklinksDeferAfterLoad();
      return;
    }
    if (eagerEditorLoadUriRef.current === selectedUri) {
      eagerEditorLoadUriRef.current = null;
      return;
    }
    const cached = inboxContentByUriRef.current[selectedUri];
    if (cached !== undefined) {
      const {markdown: body, healedCache} = resolveInboxCachedBodyForEditor(
        selectedUri,
        cached,
        lastPersistedRef.current,
      );
      if (healedCache) {
        const healed = mergeInboxNoteBodyIntoCache(
          inboxContentByUriRef.current,
          selectedUri,
          body,
        );
        if (healed) {
          inboxContentByUriRef.current = healed;
          setInboxContentByUri(prev =>
            mergeInboxNoteBodyIntoCache(prev, selectedUri, body) ?? prev,
          );
        }
      }
      lastPersistedRef.current = {uri: selectedUri, markdown: body};
      loadFullMarkdownIntoInboxEditor(body, selectedUri, 'start');
      scheduleBacklinksDeferOneFrameAfterLoad();
    } else {
      clearInboxBacklinksDeferAfterLoad();
      clearInboxYamlFrontmatterEditorRefs({
        inner: inboxYamlFrontmatterInnerRef,
        leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
        setInner: setInboxYamlFrontmatterInner,
      });
      setEditorBody('');
      lastPersistedRef.current = null;
    }
  }, [
    vaultRoot,
    selectedUri,
    inboxEditorRef,
    clearInboxBacklinksDeferAfterLoad,
    loadFullMarkdownIntoInboxEditor,
    scheduleBacklinksDeferOneFrameAfterLoad,
  ]);

  /**
   * Clear the open note in CodeMirror when the shell has no cached body yet.
   * Runs after `NoteMarkdownEditor`'s mount effect creates the view (parent layout is too early).
   */
  useEffect(() => {
    if (!vaultRoot || !selectedUri) {
      return;
    }
    if (inboxContentByUriRef.current[selectedUri] !== undefined) {
      return;
    }
    inboxYamlFrontmatterInnerRef.current = null;
    setInboxYamlFrontmatterInner(null);
    inboxEditorYamlLeadingBeforeFrontmatterRef.current = '';
    inboxEditorRef.current?.loadMarkdown('', {selection: 'start'});
    scheduleBacklinksDeferOneFrameAfterLoad();
  }, [vaultRoot, selectedUri, inboxEditorRef, scheduleBacklinksDeferOneFrameAfterLoad]);


  useLayoutEffect(() => {
    if (composingNewEntry || !selectedUri) {
      setBacklinksActiveBody('');
      return;
    }
    const snap = inboxContentByUriRef.current[selectedUri] ?? '';
    if (backlinksActiveBodyRef.current === snap) {
      return;
    }
    setBacklinksActiveBody(snap);
  }, [selectedUri, composingNewEntry, vaultRoot]);

  useEffect(() => {
    if (composingNewEntry || !selectedUri) {
      return;
    }
    const id = window.setTimeout(() => {
      const liveFull = inboxEditorSliceToFullMarkdown(
        editorBody,
        selectedUri,
        composingNewEntry,
        inboxYamlFrontmatterInnerRef.current,
        inboxEditorYamlLeadingBeforeFrontmatterRef.current,
      );
      if (backlinksActiveBodyRef.current === liveFull) {
        return;
      }
      setBacklinksActiveBody(liveFull);
    }, INBOX_BACKLINK_BODY_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [editorBody, selectedUri, composingNewEntry, inboxYamlFrontmatterInner]);

  useEffect(() => {
    if (!vaultRoot || !selectedUri) {
      return;
    }
    if (inboxContentByUriRef.current[selectedUri] !== undefined) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const raw = await fs.readFile(selectedUri, {encoding: 'utf8'});
        if (!cancelled) {
          const normalized = normalizeVaultMarkdownDiskRead(raw);
          lastPersistedRef.current = {uri: selectedUri, markdown: normalized};
          setInboxContentByUri(prev => {
            if (prev[selectedUri] === normalized) {
              return prev;
            }
            return {...prev, [selectedUri]: normalized};
          });
          const currentFull = inboxEditorSliceToFullMarkdown(
            editorBodyRef.current,
            selectedUri,
            composingNewEntryRef.current,
            inboxYamlFrontmatterInnerRef.current,
            inboxEditorYamlLeadingBeforeFrontmatterRef.current,
          );
          if (normalized !== currentFull) {
            loadFullMarkdownIntoInboxEditor(normalized, selectedUri, 'start');
            scheduleBacklinksDeferOneFrameAfterLoad();
          }
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
  }, [
    vaultRoot,
    selectedUri,
    fs,
    inboxEditorRef,
    loadFullMarkdownIntoInboxEditor,
    scheduleBacklinksDeferOneFrameAfterLoad,
  ]);

  useEffect(() => {
    if (!vaultRoot || !selectedUri || composingNewEntry) {
      autosaveSchedulerRef.current.cancel();
      return;
    }
    if (
      diskConflict &&
      normalizeEditorDocUri(diskConflict.uri) === normalizeEditorDocUri(selectedUri)
    ) {
      autosaveSchedulerRef.current.cancel();
      return;
    }
    if (lastPersistedRef.current?.uri !== selectedUri) {
      autosaveSchedulerRef.current.cancel();
      return;
    }
    const prev = lastPersistedRef.current;
    const liveFull = inboxEditorSliceToFullMarkdown(
      editorBody,
      selectedUri,
      composingNewEntry,
      inboxYamlFrontmatterInnerRef.current,
      inboxEditorYamlLeadingBeforeFrontmatterRef.current,
    );
    if (prev && prev.uri === selectedUri && prev.markdown === liveFull) {
      return;
    }
    const scheduler = autosaveSchedulerRef.current;
    scheduler.schedule(() => {
      void enqueueInboxPersist();
    });
    return () => {
      scheduler.cancel();
    };
  }, [
    vaultRoot,
    selectedUri,
    composingNewEntry,
    editorBody,
    inboxYamlFrontmatterInner,
    enqueueInboxPersist,
    diskConflict,
  ]);

  const addNote = useCallback(
    async (title: string, body: string) => {
      if (!vaultRoot) {
        return;
      }
      setBusy(true);
      setErr(null);
      try {
        const created = await createInboxMarkdownNote(vaultRoot, fs, title, body);
        subtreeMarkdownCacheRef.current.invalidateForMutation(
          vaultRoot,
          created.uri,
          'file',
        );
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
        await openMarkdownInEditor(created.uri);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes, openMarkdownInEditor],
  );

  const startNewEntry = useCallback(() => {
    void (async () => {
      await flushInboxSaveRef.current();
      setErr(null);
      setDiskConflict(null);
      diskConflictRef.current = null;
      setDiskConflictSoft(null);
      diskConflictSoftRef.current = null;
      inboxEditorShellScrollDirectiveRef.current = {kind: 'snapTop'};
      setComposingNewEntry(true);
      setSelectedUri(null);
      clearInboxYamlFrontmatterEditorRefs({
        inner: inboxYamlFrontmatterInnerRef,
        leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
        setInner: setInboxYamlFrontmatterInner,
      });
      setEditorBody('');
      lastPersistedRef.current = null;
      setInboxEditorResetNonce(n => n + 1);
    })();
  }, []);

  const cancelNewEntry = useCallback(() => {
    void (async () => {
      await flushInboxSaveRef.current();
      setComposingNewEntry(false);
      clearInboxYamlFrontmatterEditorRefs({
        inner: inboxYamlFrontmatterInnerRef,
        leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
        setInner: setInboxYamlFrontmatterInner,
      });
      setEditorBody('');
      setInboxEditorResetNonce(n => n + 1);
    })();
  }, []);

  const selectNote = useCallback(
    (uri: string) => {
      const existingId = findTabIdWithCurrentUri(editorWorkspaceTabsRef.current, uri);
      if (existingId != null) {
        activateOpenTab(existingId);
        return;
      }
      const norm = normalizeEditorDocUri(uri) ?? '';
      const hubTodayOpen = selectNoteActiveHubTodayOpen({
        uri,
        activeTodayHubUri: activeTodayHubUriRef.current,
        uriIsTodayMarkdownFile: vaultUriIsTodayMarkdownFile(norm),
        editorWorkspaceTabCount: editorWorkspaceTabsRef.current.length,
      });
      if (hubTodayOpen === 'workspaceShell') {
        void openMarkdownInEditor(uri, {workspaceShell: true});
        return;
      }
      if (hubTodayOpen === 'workspaceHomePreserveTabs') {
        void openMarkdownInEditor(uri, {workspaceShellPreserveTabs: true});
        return;
      }
      void openMarkdownInEditor(uri);
    },
    [activateOpenTab, openMarkdownInEditor],
  );

  const selectNoteInNewActiveTab = useCallback(
    (uri: string, opts?: {insertAfterActive?: boolean}) => {
      const existingId = findTabIdWithCurrentUri(editorWorkspaceTabsRef.current, uri);
      if (existingId != null) {
        activateOpenTab(existingId);
        return;
      }
      void openMarkdownInEditor(uri, {
        newTab: true,
        activateNewTab: true,
        insertAfterActive: opts?.insertAfterActive === true,
      });
    },
    [activateOpenTab, openMarkdownInEditor],
  );

  const switchTodayHubWorkspace = useCallback(
    async (todayNoteUri: string) => {
      const norm = normalizeEditorDocUri(todayNoteUri);
      if (!norm) {
        return;
      }
      const hubs = sortedTodayHubNoteUrisFromRefs(vaultMarkdownRefsRef.current);
      if (!hubs.includes(norm)) {
        return;
      }
      if (norm === activeTodayHubUriRef.current) {
        selectNote(norm);
        return;
      }

      await flushInboxSaveRef.current();
      if (composingNewEntryRef.current) {
        composingNewEntryRef.current = false;
        setComposingNewEntry(false);
        clearInboxYamlFrontmatterEditorRefs({
          inner: inboxYamlFrontmatterInnerRef,
          leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
          setInner: setInboxYamlFrontmatterInner,
        });
        setEditorBody('');
        setInboxEditorResetNonce(n => n + 1);
      }

      const old = activeTodayHubUriRef.current;
      let snapForTarget: TodayHubWorkspaceSnapshot | undefined;
      setTodayHubWorkspacesForSave(prev => {
        const next: Record<string, TodayHubWorkspaceSnapshot> = {...prev};
        if (old != null && old !== norm) {
          next[old] = {
            editorWorkspaceTabs: tabsToStored(editorWorkspaceTabsRef.current),
            activeEditorTabId: activeEditorTabIdRef.current,
          };
        }
        snapForTarget = next[norm];
        return next;
      });

      const snapTabs = snapForTarget?.editorWorkspaceTabs;
      let nextTabs: EditorWorkspaceTab[];
      let nextActive: string | null;
      if (snapTabs != null && snapTabs.length > 0) {
        nextTabs = cloneEditorWorkspaceTabs(tabsFromStored(snapTabs));
        nextActive = ensureActiveTabId(
          nextTabs,
          snapForTarget?.activeEditorTabId ?? null,
        );
      } else {
        nextTabs = [];
        nextActive = null;
      }

      editorWorkspaceTabsRef.current = nextTabs;
      activeEditorTabIdRef.current = nextActive;
      setEditorWorkspaceTabs(nextTabs);
      setActiveEditorTabId(nextActive);
      activeTodayHubUriRef.current = norm;
      setActiveTodayHubUri(norm);
      // Do not `selectNote(norm)` when B has restored tabs: that would navigate the
      // active tab to B's Today and overwrite e.g. a tab that was still showing A's hub note.
      if (nextTabs.length === 0) {
        selectNote(norm);
      } else if (nextActive) {
        activateOpenTab(nextActive);
      } else {
        selectNote(norm);
      }
    },
    [selectNote, activateOpenTab],
  );

  const focusActiveTodayHubNote = useCallback(() => {
    const u = activeTodayHubUriRef.current;
    if (u) {
      selectNote(u);
    }
  }, [selectNote]);

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
      inboxEditorRef.current?.loadMarkdown(body, {selection: 'preserve'});
      scheduleBacklinksDeferOneFrameAfterLoad();
      setEditorBody(body);
    }
    const {titleLine, bodyAfterBlank} = parseComposeInput(body);
    if (!titleLine.trim()) {
      setErr('First line is required.');
      return;
    }
    const fullMarkdown = buildInboxMarkdownFromCompose(titleLine, bodyAfterBlank);
    await addNote(titleLine, fullMarkdown);
  }, [
    addNote,
    editorBody,
    inboxEditorRef,
    vaultRoot,
    scheduleBacklinksDeferOneFrameAfterLoad,
  ]);

  const onInboxSaveShortcut = useCallback(() => {
    if (composingNewEntryRef.current) {
      void submitNewEntry();
    } else {
      void flushInboxSave();
    }
  }, [submitNewEntry, flushInboxSave]);

  const todayHubCleanRowBlocked = useCallback((rowUri: string) => {
    const dc = diskConflictRef.current;
    return (
      !!dc &&
      normalizeEditorDocUri(dc.uri) === normalizeEditorDocUri(rowUri)
    );
  }, []);

  const onCleanNoteInbox = useCallback(() => {
    const uri = selectedUriRef.current;
    if (!uri || composingNewEntryRef.current) {
      return;
    }
    const dc = diskConflictRef.current;
    if (dc && normalizeEditorDocUri(dc.uri) === normalizeEditorDocUri(uri)) {
      return;
    }
    const slice =
      inboxEditorRef.current?.getMarkdown() ?? editorBodyRef.current;
    const cleanedSlice = cleanNoteMarkdownBody(slice, uri);
    if (cleanedSlice !== slice) {
      const innerFm = inboxYamlFrontmatterInnerRef.current;
      const full = mergeYamlFrontmatterBody(
        innerFm == null ? null : innerToFencedFrontmatterBlock(innerFm),
        cleanedSlice,
        inboxEditorYamlLeadingBeforeFrontmatterRef.current,
      );
      loadFullMarkdownIntoInboxEditor(full, uri, 'preserve');
      scheduleBacklinksDeferOneFrameAfterLoad();
      const norm = normalizeEditorDocUri(uri);
      const nextCache = mergeInboxNoteBodyIntoCache(
        inboxContentByUriRef.current,
        norm,
        full,
      );
      if (nextCache) {
        inboxContentByUriRef.current = nextCache;
        setInboxContentByUri(prev =>
          mergeInboxNoteBodyIntoCache(prev, norm, full) ?? prev,
        );
      }
    }

    const runHubClean = async () => {
      if (!showTodayHubCanvasRef.current || composingNewEntryRef.current) {
        return;
      }
      const hubTodayUri = selectedUriRef.current;
      if (!hubTodayUri) {
        return;
      }
      const block = diskConflictRef.current;
      if (
        block &&
        normalizeEditorDocUri(block.uri) === normalizeEditorDocUri(hubTodayUri)
      ) {
        return;
      }
      await todayHubBridgeRef.current.flushPendingEdits().catch(() => undefined);
      await todayHubBridgeRef.current.cleanHubPageDayColumns().catch(() => undefined);
    };
    void runHubClean();
  }, [
    inboxEditorRef,
    loadFullMarkdownIntoInboxEditor,
    scheduleBacklinksDeferOneFrameAfterLoad,
    setInboxContentByUri,
  ]);

  const deleteNote = useCallback(
    async (uri: string) => {
      if (!vaultRoot) {
        return;
      }
      autosaveSchedulerRef.current.cancel();
      await saveChainRef.current.catch(() => undefined);

      const norm = normalizeEditorDocUri(uri);
      const wasOpen = selectedUriRef.current === norm;
      const nextTabs = removeUriFromAllTabs(
        editorWorkspaceTabsRef.current,
        u => u === norm,
      );
      const nextActive = ensureActiveTabId(
        nextTabs,
        activeEditorTabIdRef.current,
      );
      editorWorkspaceTabsRef.current = nextTabs;
      setEditorWorkspaceTabs(nextTabs);
      activeEditorTabIdRef.current = nextActive;
      setActiveEditorTabId(nextActive);
      editorShellScrollByUriRef.current.delete(norm);

      if (wasOpen) {
        const activeTab = nextActive
          ? findTabById(nextTabs, nextActive)
          : undefined;
        const nextAfterRemove =
          (activeTab ? tabCurrentUri(activeTab) : null)
          ?? firstSurvivorUriFromTabs(nextTabs);
        if (nextAfterRemove) {
          await openMarkdownInEditor(nextAfterRemove, {skipHistory: true});
        } else {
          selectedUriRef.current = null;
          composingNewEntryRef.current = false;
          lastPersistedRef.current = null;
          setSelectedUri(null);
          setComposingNewEntry(false);
          clearInboxYamlFrontmatterEditorRefs({
            inner: inboxYamlFrontmatterInnerRef,
            leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
            setInner: setInboxYamlFrontmatterInner,
          });
          setEditorBody('');
          setInboxEditorResetNonce(n => n + 1);
        }
      }

      setBusy(true);
      setErr(null);
      try {
        await deleteVaultMarkdownNote(vaultRoot, uri, fs);
        subtreeMarkdownCacheRef.current.invalidateForMutation(vaultRoot, uri, 'file');
        setInboxContentByUri(prev => {
          const next = {...prev};
          delete next[uri];
          return next;
        });
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes, openMarkdownInEditor],
  );

  const runRenameWithWikiLinkMaintenance = useCallback(
    async (options: {
      uri: string;
      nextDisplayName: string;
      forceApplyDespiteAmbiguity: boolean;
    }) => {
      if (!vaultRoot) {
        return;
      }
      const {uri, nextDisplayName, forceApplyDespiteAmbiguity} = options;
      autosaveSchedulerRef.current.cancel();
      await flushInboxSaveRef.current();

      setBusy(true);
      setErr(null);
      clearRenameNotice();
      setRenameLinkProgress(null);
      try {
        const wikiRefs = vaultMarkdownRefsRef.current.map(r => ({
          name: r.name,
          uri: r.uri,
        }));
        const activeUri = selectedUriRef.current;
        const activeBody =
          activeUri != null
            ? inboxEditorSliceToFullMarkdown(
                inboxEditorRef.current?.getMarkdown() ?? editorBodyRef.current,
                activeUri,
                composingNewEntryRef.current,
                inboxYamlFrontmatterInnerRef.current,
                inboxEditorYamlLeadingBeforeFrontmatterRef.current,
              )
            : '';
        const expandedContent = await loadMarkdownBodiesForWikiMaintenance(
          fs,
          wikiRefs,
          inboxContentByUriRef.current,
          activeUri,
          activeBody,
        );
        const planStartedAt = performance.now();
        const plannedStem = sanitizeInboxNoteStem(nextDisplayName);
        const preRenamePlan = plannedStem
          ? planVaultWikiLinkRenameMaintenance({
              vaultRoot,
              oldTargetUri: uri,
              renamedStem: plannedStem,
              newTargetUri: uri,
              notes: wikiRefs,
              contentByUri: expandedContent,
              activeUri,
              activeBody,
            })
          : {
              updates: [],
              scannedFileCount: wikiRefs.length,
              touchedFileCount: 0,
              touchedBytes: 0,
              updatedLinkCount: 0,
              skippedAmbiguousLinkCount: 0,
            };
        const planDurationMs = performance.now() - planStartedAt;
        if (
          preRenamePlan.skippedAmbiguousLinkCount > 0
          && !forceApplyDespiteAmbiguity
        ) {
          setPendingWikiLinkAmbiguityRename({
            uri,
            nextDisplayName,
            summary: {
              scannedFileCount: preRenamePlan.scannedFileCount,
              touchedFileCount: preRenamePlan.touchedFileCount,
              touchedBytes: preRenamePlan.touchedBytes,
              updatedLinkCount: preRenamePlan.updatedLinkCount,
              skippedAmbiguousLinkCount: preRenamePlan.skippedAmbiguousLinkCount,
            },
          });
          return;
        }
        setPendingWikiLinkAmbiguityRename(null);

        const nextUri = await renameVaultMarkdownNote(vaultRoot, uri, nextDisplayName, fs);
        const nextName = nextUri.split('/').pop();
        const renamedStem = nextName ? stemFromMarkdownFileName(nextName) : plannedStem;
        const rewritePlan = renamedStem
          ? planVaultWikiLinkRenameMaintenance({
              vaultRoot,
              oldTargetUri: uri,
              renamedStem,
              newTargetUri: nextUri,
              notes: wikiRefs,
              contentByUri: expandedContent,
              activeUri,
              activeBody,
            })
          : {
              updates: [],
              scannedFileCount: wikiRefs.length,
              touchedFileCount: 0,
              touchedBytes: 0,
              updatedLinkCount: 0,
              skippedAmbiguousLinkCount: 0,
            };
        const showLargeImpactProgress =
          rewritePlan.skippedAmbiguousLinkCount === 0 &&
          (rewritePlan.touchedFileCount >= LARGE_RENAME_MIN_TOUCHED_FILES ||
            rewritePlan.touchedBytes >= LARGE_RENAME_MIN_TOUCHED_BYTES);
        if (showLargeImpactProgress && rewritePlan.touchedFileCount > 0) {
          setRenameLinkProgress({done: 0, total: rewritePlan.touchedFileCount});
        }
        const applyStartedAt = performance.now();
        const applyResult = await applyVaultWikiLinkRenameMaintenance({
          fs,
          oldUri: uri,
          newUri: nextUri,
          updates: rewritePlan.updates,
          onProgress:
            showLargeImpactProgress && rewritePlan.touchedFileCount > 0
              ? (done, total) => {
                  setRenameLinkProgress({done, total});
                }
              : undefined,
          yieldEveryWrites: showLargeImpactProgress
            ? RENAME_APPLY_YIELD_EVERY_WRITES
            : 0,
        });
        const applyDurationMs = performance.now() - applyStartedAt;
        console.info('[WL-5] rename-maintenance', {
          oldUri: uri,
          newUri: nextUri,
          scannedFiles: rewritePlan.scannedFileCount,
          touchedFiles: rewritePlan.touchedFileCount,
          touchedBytes: rewritePlan.touchedBytes,
          updatedLinks: rewritePlan.updatedLinkCount,
          skippedAmbiguous: rewritePlan.skippedAmbiguousLinkCount,
          failedWrites: applyResult.failed.length,
          planDurationMs: Math.round(planDurationMs),
          applyDurationMs: Math.round(applyDurationMs),
        });
        const succeededWriteUris = new Set(applyResult.succeededUris);
        const plannedContentByWriteUri = new Map<string, string>();
        for (const update of rewritePlan.updates) {
          const writeUri = update.uri === uri ? nextUri : update.uri;
          plannedContentByWriteUri.set(writeUri, update.markdown);
        }
        setInboxContentByUri(prev => {
          const next = {...prev};
          if (nextUri !== uri && prev[uri] !== undefined) {
            next[nextUri] = prev[uri];
            delete next[uri];
          }
          for (const [writeUri, markdown] of plannedContentByWriteUri) {
            if (succeededWriteUris.has(writeUri)) {
              next[writeUri] = markdown;
            }
          }
          return next;
        });
        if (selectedUriRef.current === uri) {
          selectedUriRef.current = nextUri;
          setSelectedUri(nextUri);
          const previousPersisted = lastPersistedRef.current;
          if (previousPersisted && previousPersisted.uri === uri) {
            lastPersistedRef.current = {uri: nextUri, markdown: previousPersisted.markdown};
          }
        }
        if (nextUri !== uri) {
          remapEditorShellScrollMapExact(
            editorShellScrollByUriRef.current,
            uri,
            nextUri,
          );
          const remappedRenameTabs = remapAllTabsUriPrefix(
            editorWorkspaceTabsRef.current,
            uri,
            nextUri,
          );
          editorWorkspaceTabsRef.current = remappedRenameTabs;
          setEditorWorkspaceTabs(remappedRenameTabs);
        }
        if (applyResult.failed.length > 0) {
          const list = applyResult.failed.map(f => f.uri).join(', ');
          setErr(
            `Renamed note, but link updates failed for ${applyResult.failed.length} file(s): ${list}`,
          );
        } else if (rewritePlan.updatedLinkCount > 0) {
          const noteLabel = rewritePlan.touchedFileCount === 1 ? 'note' : 'notes';
          setTransientRenameNotice(
            `Updated links in ${rewritePlan.touchedFileCount} ${noteLabel}.`,
          );
        }
        subtreeMarkdownCacheRef.current.invalidateForMutation(vaultRoot, uri, 'file');
        if (nextUri !== uri) {
          subtreeMarkdownCacheRef.current.invalidateForMutation(vaultRoot, nextUri, 'file');
        }
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setRenameLinkProgress(null);
        setBusy(false);
      }
    },
    [
      vaultRoot,
      fs,
      refreshNotes,
      inboxEditorRef,
      clearRenameNotice,
      setTransientRenameNotice,
    ],
  );

  const renameNote = useCallback(
    async (uri: string, nextDisplayName: string) => {
      await runRenameWithWikiLinkMaintenance({
        uri,
        nextDisplayName,
        forceApplyDespiteAmbiguity: false,
      });
    },
    [runRenameWithWikiLinkMaintenance],
  );

  const confirmPendingWikiLinkAmbiguityRename = useCallback(async () => {
    const pending = pendingWikiLinkAmbiguityRename;
    if (!pending) {
      return;
    }
    await runRenameWithWikiLinkMaintenance({
      uri: pending.uri,
      nextDisplayName: pending.nextDisplayName,
      forceApplyDespiteAmbiguity: true,
    });
  }, [pendingWikiLinkAmbiguityRename, runRenameWithWikiLinkMaintenance]);

  const cancelPendingWikiLinkAmbiguityRename = useCallback(() => {
    setPendingWikiLinkAmbiguityRename(null);
  }, []);

  /**
   * Shared "new-tab" routing used by wiki-link and relative-markdown-link activation.
   *
   * - If the target is already open in any tab, that tab is focused (no duplicate).
   * - Otherwise a new tab is opened: foreground (`activateNewTab: true`) or background.
   */
  const openNoteRespectingExistingTab = useCallback(
    async (uri: string, mode: 'foreground-new-tab' | 'background-new-tab') => {
      const existingTabId = findTabIdWithCurrentUri(editorWorkspaceTabsRef.current, uri);
      if (existingTabId != null) {
        activateOpenTab(existingTabId);
        return;
      }
      await openMarkdownInEditor(uri, {
        newTab: true,
        activateNewTab: mode === 'foreground-new-tab',
        insertAfterActive: true,
      });
    },
    [activateOpenTab, openMarkdownInEditor],
  );

  const activateWikiLink = useCallback(
    async ({inner, at, openInBackgroundTab}: VaultWikiLinkActivatePayload) => {
      if (!vaultRoot) {
        return;
      }
      const browserHref = wikiLinkInnerBrowserOpenableHref(inner);
      if (browserHref != null) {
        void openSystemBrowserUrl(browserHref.trim()).catch(e => {
          setErr(e instanceof Error ? e.message : String(e));
        });
        return;
      }
      await flushInboxSaveRef.current();
      try {
        const wikiParent = showTodayHubCanvasRef.current
          ? (todayHubWikiNavParentRef.current ?? selectedUriRef.current)
          : selectedUriRef.current;
        const todayHubNewNoteParent =
          showTodayHubCanvasRef.current && !composingNewEntryRef.current
            ? getGeneralDirectoryUri(normalizeVaultBaseUri(vaultRoot))
            : null;
        const result = await openOrCreateInboxWikiLinkTarget({
          inner,
          notes: vaultMarkdownRefsRef.current.map(r => ({name: r.name, uri: r.uri})),
          vaultRoot,
          fs,
          activeMarkdownUri: composingNewEntryRef.current ? null : wikiParent,
          newNoteParentDirectory: todayHubNewNoteParent,
        });
        if (result.kind === 'open' || result.kind === 'created') {
          if (result.kind === 'created') {
            subtreeMarkdownCacheRef.current.invalidateForMutation(
              vaultRoot,
              result.uri,
              'file',
            );
            await refreshNotes(vaultRoot);
            setFsRefreshNonce(n => n + 1);
          } else if (result.canonicalInner) {
            const hubEd = todayHubCellEditorRef.current;
            if (hubEd && todayHubWikiNavParentRef.current) {
              hubEd.replaceWikiLinkInnerAt({
                at,
                expectedInner: inner,
                replacementInner: result.canonicalInner,
              });
            } else {
              inboxEditorRef.current?.replaceWikiLinkInnerAt({
                at,
                expectedInner: inner,
                replacementInner: result.canonicalInner,
              });
            }
          }
          if (openInBackgroundTab) {
            await openNoteRespectingExistingTab(result.uri, 'background-new-tab');
            return;
          }
          if (
            isActiveWorkspaceTodayLinkSurface({
              composingNewEntry: composingNewEntryRef.current,
              activeTodayHubUri: activeTodayHubUriRef.current,
              selectedUri: selectedUriRef.current,
            })
          ) {
            await openNoteRespectingExistingTab(result.uri, 'foreground-new-tab');
            return;
          }
          await openMarkdownInEditor(result.uri);
          return;
        }
        if (result.kind === 'ambiguous') {
          const names = result.notes.map(n => n.name).join(', ');
          setErr(
            `Ambiguous wiki link target: "${inner}" matches multiple notes (${names}).`,
          );
          return;
        }
        if (result.reason === 'path_not_supported') {
          setErr(
            `Wiki link targets must be a single note name, not a path (link: "${inner}").`,
          );
        } else {
          setErr('Wiki link target is empty.');
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [vaultRoot, fs, refreshNotes, inboxEditorRef, openMarkdownInEditor, openNoteRespectingExistingTab],
  );

  const onWikiLinkActivate = useCallback(
    (payload: VaultWikiLinkActivatePayload) => {
      void activateWikiLink(payload);
    },
    [activateWikiLink],
  );

  const activateRelativeMarkdownLink = useCallback(
    async ({
      href,
      at,
      openInBackgroundTab,
    }: VaultRelativeMarkdownLinkActivatePayload) => {
      if (!vaultRoot) {
        return;
      }
      await flushInboxSaveRef.current();
      const base = normalizeVaultBaseUri(vaultRoot);
      const relParent = showTodayHubCanvasRef.current ? todayHubWikiNavParentRef.current : null;
      const sourceMarkdownUriOrDir = composingNewEntryRef.current
        ? getInboxDirectoryUri(base)
        : showTodayHubCanvasRef.current && !composingNewEntryRef.current
          ? getGeneralDirectoryUri(base)
          : (relParent ?? selectedUriRef.current ?? getInboxDirectoryUri(base));
      try {
        const result = await openOrCreateVaultRelativeMarkdownLink({
          href,
          notes: vaultMarkdownRefsRef.current.map(r => ({
            name: r.name,
            uri: r.uri,
          })),
          vaultRoot,
          fs,
          sourceMarkdownUriOrDir,
        });
        if (result.kind === 'open' || result.kind === 'created') {
          if (result.kind === 'created') {
            subtreeMarkdownCacheRef.current.invalidateForMutation(
              vaultRoot,
              result.uri,
              'file',
            );
            await refreshNotes(vaultRoot);
            setFsRefreshNonce(n => n + 1);
          } else if (result.canonicalHref) {
            const hubEd = todayHubCellEditorRef.current;
            if (hubEd && todayHubWikiNavParentRef.current) {
              hubEd.replaceMarkdownLinkHrefAt({
                at,
                expectedHref: href,
                replacementHref: result.canonicalHref,
              });
            } else {
              inboxEditorRef.current?.replaceMarkdownLinkHrefAt({
                at,
                expectedHref: href,
                replacementHref: result.canonicalHref,
              });
            }
          }
          if (openInBackgroundTab) {
            await openNoteRespectingExistingTab(result.uri, 'background-new-tab');
            return;
          }
          if (
            isActiveWorkspaceTodayLinkSurface({
              composingNewEntry: composingNewEntryRef.current,
              activeTodayHubUri: activeTodayHubUriRef.current,
              selectedUri: selectedUriRef.current,
            })
          ) {
            await openNoteRespectingExistingTab(result.uri, 'foreground-new-tab');
            return;
          }
          await openMarkdownInEditor(result.uri);
          return;
        }
        setErr('This link is not a relative vault markdown note.');
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [vaultRoot, fs, refreshNotes, inboxEditorRef, openMarkdownInEditor, openNoteRespectingExistingTab],
  );

  const onMarkdownRelativeLinkActivate = useCallback(
    (payload: VaultRelativeMarkdownLinkActivatePayload) => {
      void activateRelativeMarkdownLink(payload);
    },
    [activateRelativeMarkdownLink],
  );

  const onMarkdownExternalLinkOpen = useCallback(
    (payload: {href: string; at: number}) => {
      const href = payload.href.trim();
      if (!isBrowserOpenableMarkdownHref(href)) {
        return;
      }
      void openSystemBrowserUrl(href).catch(e => {
        setErr(e instanceof Error ? e.message : String(e));
      });
    },
    [setErr],
  );

  const deleteFolder = useCallback(
    async (directoryUri: string) => {
      if (!vaultRoot) {
        return;
      }
      autosaveSchedulerRef.current.cancel();
      const normDir = directoryUri.replace(/\\/g, '/').replace(/\/+$/, '');
      const selected = selectedUriRef.current?.replace(/\\/g, '/');
      const clearsSelection =
        selected != null
        && (selected === normDir || selected.startsWith(`${normDir}/`));
      if (clearsSelection) {
        selectedUriRef.current = null;
        composingNewEntryRef.current = false;
        lastPersistedRef.current = null;
        setSelectedUri(null);
        setComposingNewEntry(false);
        clearInboxYamlFrontmatterEditorRefs({
          inner: inboxYamlFrontmatterInnerRef,
          leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
          setInner: setInboxYamlFrontmatterInner,
        });
        setEditorBody('');
        setInboxEditorResetNonce(n => n + 1);
      }
      await saveChainRef.current.catch(() => undefined);
      setBusy(true);
      setErr(null);
      try {
        await deleteVaultTreeDirectory(vaultRoot, directoryUri, fs);
        subtreeMarkdownCacheRef.current.invalidateForMutation(
          vaultRoot,
          directoryUri,
          'directory',
        );
        setInboxContentByUri(prev => {
          const norm = normDir;
          const next = {...prev};
          for (const k of Object.keys(next)) {
            const kn = k.replace(/\\/g, '/');
            if (kn === norm || kn.startsWith(`${norm}/`)) {
              delete next[k];
            }
          }
          return next;
        });
        const tabPred = (u: string) => {
          const f = normDir;
          return u === f || u.startsWith(`${f}/`);
        };
        const newTabs = removeUriFromAllTabs(
          editorWorkspaceTabsRef.current,
          tabPred,
        );
        const nextActive = ensureActiveTabId(
          newTabs,
          activeEditorTabIdRef.current,
        );
        editorWorkspaceTabsRef.current = newTabs;
        setEditorWorkspaceTabs(newTabs);
        activeEditorTabIdRef.current = nextActive;
        setActiveEditorTabId(nextActive);
        if (clearsSelection) {
          const activeTab = nextActive
            ? findTabById(newTabs, nextActive)
            : undefined;
          const nextUri =
            (activeTab ? tabCurrentUri(activeTab) : null)
            ?? firstSurvivorUriFromTabs(newTabs);
          if (nextUri) {
            await openMarkdownInEditor(nextUri, {skipHistory: true});
          }
        }
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes, openMarkdownInEditor],
  );

  const renameFolder = useCallback(
    async (directoryUri: string, nextDisplayName: string) => {
      if (!vaultRoot) {
        return;
      }
      autosaveSchedulerRef.current.cancel();
      await flushInboxSaveRef.current();
      setBusy(true);
      setErr(null);
      clearRenameNotice();
      try {
        const oldUri = directoryUri.replace(/\\/g, '/').replace(/\/+$/, '');
        const nextUri = await renameVaultTreeDirectory(
          vaultRoot,
          directoryUri,
          nextDisplayName,
          fs,
        );
        const normalizedNext = nextUri.replace(/\\/g, '/');
        subtreeMarkdownCacheRef.current.invalidateForMutation(
          vaultRoot,
          oldUri,
          'directory',
        );
        subtreeMarkdownCacheRef.current.invalidateForMutation(
          vaultRoot,
          normalizedNext,
          'directory',
        );
        setInboxContentByUri(prev => {
          const next = {...prev};
          for (const k of Object.keys(prev)) {
            const mapped = remapVaultUriPrefix(k, oldUri, normalizedNext);
            if (mapped && mapped !== k && prev[k] !== undefined) {
              next[mapped] = prev[k]!;
              delete next[k];
            }
          }
          return next;
        });
        remapEditorShellScrollMapTreePrefix(
          editorShellScrollByUriRef.current,
          oldUri,
          normalizedNext,
        );
        {
          let nextSel: string | null = selectedUriRef.current;
          if (nextSel) {
            const mappedSel = remapVaultUriPrefix(
              nextSel.replace(/\\/g, '/'),
              oldUri,
              normalizedNext,
            );
            nextSel = mappedSel ?? nextSel;
          }
          selectedUriRef.current = nextSel;
          setSelectedUri(nextSel);
        }
        const lp = lastPersistedRef.current;
        if (lp) {
          const mappedLp = remapVaultUriPrefix(lp.uri, oldUri, normalizedNext);
          if (mappedLp) {
            lastPersistedRef.current = {...lp, uri: mappedLp};
          }
        }
        const remappedTabs = remapAllTabsUriPrefix(
          editorWorkspaceTabsRef.current,
          oldUri,
          normalizedNext,
        );
        editorWorkspaceTabsRef.current = remappedTabs;
        setEditorWorkspaceTabs(remappedTabs);
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes, clearRenameNotice],
  );

  const commitMoveVaultTreeResult = useCallback(
    (result: MoveVaultTreeItemResult) => {
      if (!vaultRoot || result.previousUri === result.nextUri) {
        return;
      }
      const invKind = result.movedKind === 'article' ? 'file' : 'directory';
      subtreeMarkdownCacheRef.current.invalidateForMutation(
        vaultRoot,
        result.previousUri,
        invKind,
      );
      subtreeMarkdownCacheRef.current.invalidateForMutation(
        vaultRoot,
        result.nextUri,
        invKind,
      );

      if (result.movedKind === 'article') {
        setInboxContentByUri(prev => {
          if (prev[result.previousUri] === undefined) {
            return prev;
          }
          const next = {...prev};
          next[result.nextUri] = next[result.previousUri]!;
          delete next[result.previousUri];
          return next;
        });
        remapEditorShellScrollMapExact(
          editorShellScrollByUriRef.current,
          result.previousUri,
          result.nextUri,
        );
        if (selectedUriRef.current === result.previousUri) {
          selectedUriRef.current = result.nextUri;
          setSelectedUri(result.nextUri);
          const lp = lastPersistedRef.current;
          if (lp && lp.uri === result.previousUri) {
            lastPersistedRef.current = {...lp, uri: result.nextUri};
          }
        }
      } else {
        const oldUri = result.previousUri;
        const newUri = result.nextUri;
        setInboxContentByUri(prev => {
          const next = {...prev};
          for (const k of Object.keys(prev)) {
            const mapped = remapVaultUriPrefix(k, oldUri, newUri);
            if (mapped && mapped !== k && prev[k] !== undefined) {
              next[mapped] = prev[k]!;
              delete next[k];
            }
          }
          return next;
        });
        remapEditorShellScrollMapTreePrefix(
          editorShellScrollByUriRef.current,
          oldUri,
          newUri,
        );
        let nextSel: string | null = selectedUriRef.current;
        if (nextSel) {
          const mappedSel = remapVaultUriPrefix(
            nextSel.replace(/\\/g, '/'),
            oldUri,
            newUri,
          );
          nextSel = mappedSel ?? nextSel;
        }
        selectedUriRef.current = nextSel;
        setSelectedUri(nextSel);
        const lp = lastPersistedRef.current;
        if (lp) {
          const mappedLp = remapVaultUriPrefix(lp.uri, oldUri, newUri);
          if (mappedLp) {
            lastPersistedRef.current = {...lp, uri: mappedLp};
          }
        }
      }
      const remappedMoveTabs = remapAllTabsUriPrefix(
        editorWorkspaceTabsRef.current,
        result.previousUri,
        result.nextUri,
      );
      editorWorkspaceTabsRef.current = remappedMoveTabs;
      setEditorWorkspaceTabs(remappedMoveTabs);
    },
    [vaultRoot],
  );

  const moveVaultTreeItem = useCallback(
    async (
      sourceUri: string,
      sourceKind: 'folder' | 'article',
      targetDirectoryUri: string,
    ) => {
      if (!vaultRoot) {
        return;
      }
      autosaveSchedulerRef.current.cancel();
      await flushInboxSaveRef.current();
      setBusy(true);
      setErr(null);
      try {
        const result = await moveVaultTreeItemToDirectory(vaultRoot, fs, {
          sourceUri,
          sourceKind,
          targetDirectoryUri,
        });
        commitMoveVaultTreeResult(result);
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes, commitMoveVaultTreeResult],
  );

  const bulkDeleteVaultTreeItems = useCallback(
    async (items: VaultTreeBulkItem[]) => {
      if (!vaultRoot) {
        return;
      }
      const rootId = normalizeVaultBaseUri(vaultRoot).replace(/\\/g, '/').replace(/\/+$/, '');
      const plan = planVaultTreeBulkTargets(items, rootId);
      if (plan.length === 0) {
        return;
      }
      autosaveSchedulerRef.current.cancel();
      const normSel = selectedUriRef.current?.replace(/\\/g, '/');
      const shouldClearEditor =
        normSel != null
          && plan.some(entry => {
          const d = entry.uri.replace(/\\/g, '/').replace(/\/+$/, '');
          if (entry.kind === 'folder' || entry.kind === 'todayHub') {
            return normSel === d || normSel.startsWith(`${d}/`);
          }
          return normSel === d;
        });
      if (shouldClearEditor) {
        selectedUriRef.current = null;
        composingNewEntryRef.current = false;
        lastPersistedRef.current = null;
        setSelectedUri(null);
        setComposingNewEntry(false);
        clearInboxYamlFrontmatterEditorRefs({
          inner: inboxYamlFrontmatterInnerRef,
          leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
          setInner: setInboxYamlFrontmatterInner,
        });
        setEditorBody('');
        setInboxEditorResetNonce(n => n + 1);
      }
      await saveChainRef.current.catch(() => undefined);
      setBusy(true);
      setErr(null);
      try {
        for (const entry of plan) {
          if (entry.kind === 'article') {
            await deleteVaultMarkdownNote(vaultRoot, entry.uri, fs);
            subtreeMarkdownCacheRef.current.invalidateForMutation(
              vaultRoot,
              entry.uri,
              'file',
            );
            setInboxContentByUri(prev => {
              if (prev[entry.uri] === undefined) {
                return prev;
              }
              const next = {...prev};
              delete next[entry.uri];
              return next;
            });
          } else {
            const normDir = entry.uri.replace(/\\/g, '/').replace(/\/+$/, '');
            await deleteVaultTreeDirectory(vaultRoot, entry.uri, fs);
            subtreeMarkdownCacheRef.current.invalidateForMutation(
              vaultRoot,
              entry.uri,
              'directory',
            );
            setInboxContentByUri(prev => {
              const next = {...prev};
              for (const k of Object.keys(next)) {
                const kn = k.replace(/\\/g, '/');
                if (kn === normDir || kn.startsWith(`${normDir}/`)) {
                  delete next[k];
                }
              }
              return next;
            });
          }
        }
        const deletedFiles = new Set<string>();
        const deletedFolders: string[] = [];
        for (const entry of plan) {
          if (entry.kind === 'article') {
            deletedFiles.add(normalizeEditorDocUri(entry.uri));
          } else {
            deletedFolders.push(
              entry.uri.replace(/\\/g, '/').replace(/\/+$/, ''),
            );
          }
        }
        const newTabs = removeUriFromAllTabs(
          editorWorkspaceTabsRef.current,
          u => vaultUriDeletedByTreeChange(u, deletedFiles, deletedFolders),
        );
        const nextActive = ensureActiveTabId(
          newTabs,
          activeEditorTabIdRef.current,
        );
        editorWorkspaceTabsRef.current = newTabs;
        setEditorWorkspaceTabs(newTabs);
        activeEditorTabIdRef.current = nextActive;
        setActiveEditorTabId(nextActive);
        const sm = editorShellScrollByUriRef.current;
        for (const key of [...sm.keys()]) {
          if (vaultUriDeletedByTreeChange(key, deletedFiles, deletedFolders)) {
            sm.delete(key);
          }
        }
        if (shouldClearEditor) {
          const activeTab = nextActive
            ? findTabById(newTabs, nextActive)
            : undefined;
          const nextUri =
            (activeTab ? tabCurrentUri(activeTab) : null)
            ?? firstSurvivorUriFromTabs(newTabs);
          if (nextUri) {
            await openMarkdownInEditor(nextUri, {skipHistory: true});
          }
        }
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
        setVaultTreeSelectionClearNonce(n => n + 1);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes, openMarkdownInEditor],
  );

  const bulkMoveVaultTreeItems = useCallback(
    async (items: VaultTreeBulkItem[], targetDirectoryUri: string) => {
      if (!vaultRoot) {
        return;
      }
      const rootId = normalizeVaultBaseUri(vaultRoot).replace(/\\/g, '/').replace(/\/+$/, '');
      const plan = filterVaultTreeBulkMoveSources(items, targetDirectoryUri, rootId);
      if (plan.length === 0) {
        return;
      }
      autosaveSchedulerRef.current.cancel();
      await flushInboxSaveRef.current();
      setBusy(true);
      setErr(null);
      try {
        for (const entry of plan) {
          const result = await moveVaultTreeItemToDirectory(vaultRoot, fs, {
            sourceUri: entry.uri,
            sourceKind: entry.kind === 'article' ? 'article' : 'folder',
            targetDirectoryUri,
          });
          commitMoveVaultTreeResult(result);
        }
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
        setVaultTreeSelectionClearNonce(n => n + 1);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes, commitMoveVaultTreeResult],
  );

  const activeTabHistory = useMemo(() => {
    const tab = activeEditorTabId
      ? findTabById(editorWorkspaceTabs, activeEditorTabId)
      : undefined;
    return tab?.history ?? {entries: [], index: -1};
  }, [activeEditorTabId, editorWorkspaceTabs]);

  const editorHistoryCanGoBack = useMemo(() => {
    const {entries, index} = activeTabHistory;
    if (entries.length === 0) {
      return false;
    }
    if (composingNewEntry) {
      return index >= 0;
    }
    return index > 0;
  }, [composingNewEntry, activeTabHistory]);

  const editorHistoryCanGoForward = useMemo(() => {
    const {entries, index} = activeTabHistory;
    if (busy || composingNewEntry) {
      return false;
    }
    return index >= 0 && index < entries.length - 1;
  }, [busy, composingNewEntry, activeTabHistory]);

  const editorHistoryGoBack = useCallback(() => {
    void (async () => {
      await flushInboxSaveRef.current();
      const id = activeEditorTabIdRef.current;
      const tabs = editorWorkspaceTabsRef.current;
      const tab = id ? findTabById(tabs, id) : undefined;
      const snap = tab?.history ?? {entries: [], index: -1};
      if (composingNewEntryRef.current) {
        if (snap.entries.length === 0 || snap.index < 0) {
          return;
        }
        const uri = snap.entries[snap.index]!;
        setComposingNewEntry(false);
        clearInboxYamlFrontmatterEditorRefs({
          inner: inboxYamlFrontmatterInnerRef,
          leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
          setInner: setInboxYamlFrontmatterInner,
        });
        setEditorBody('');
        setInboxEditorResetNonce(n => n + 1);
        await openMarkdownInEditor(uri, {skipHistory: true});
        return;
      }
      if (snap.index <= 0) {
        return;
      }
      const nextIndex = snap.index - 1;
      const uri = snap.entries[nextIndex]!;
      const nextTabs = tabs.map(t =>
        t.id === id
          ? {...t, history: {...t.history, index: nextIndex}}
          : t,
      );
      editorWorkspaceTabsRef.current = nextTabs;
      setEditorWorkspaceTabs(nextTabs);
      await openMarkdownInEditor(uri, {skipHistory: true});
    })();
  }, [openMarkdownInEditor]);

  const editorHistoryGoForward = useCallback(() => {
    void (async () => {
      if (composingNewEntryRef.current) {
        return;
      }
      await flushInboxSaveRef.current();
      const id = activeEditorTabIdRef.current;
      const tabs = editorWorkspaceTabsRef.current;
      const tab = id ? findTabById(tabs, id) : undefined;
      const snap = tab?.history ?? {entries: [], index: -1};
      if (snap.index < 0 || snap.index >= snap.entries.length - 1) {
        return;
      }
      const nextIndex = snap.index + 1;
      const uri = snap.entries[nextIndex]!;
      const nextTabs = tabs.map(t =>
        t.id === id
          ? {...t, history: {...t.history, index: nextIndex}}
          : t,
      );
      editorWorkspaceTabsRef.current = nextTabs;
      setEditorWorkspaceTabs(nextTabs);
      await openMarkdownInEditor(uri, {skipHistory: true});
    })();
  }, [openMarkdownInEditor]);

  useEffect(() => {
    if (!vaultRoot) {
      setInboxShellRestored(true);
      return;
    }
    setInboxShellRestored(false);
  }, [vaultRoot]);

  useEffect(() => {
    setPendingWikiLinkAmbiguityRename(null);
    setRenameLinkProgress(null);
    clearRenameNotice();
  }, [vaultRoot, clearRenameNotice]);

  useEffect(() => {
    if (!vaultRoot) {
      return;
    }
    if (!inboxRestoreEnabled || inboxShellRestored) {
      return;
    }
    if (restoredInboxState && restoredInboxState.vaultRoot === vaultRoot) {
      const root = normalizeVaultBaseUri(vaultRoot).replace(/\/+$/, '');
      const hubUris = sortedTodayHubNoteUrisFromRefs(vaultMarkdownRefs);
      const filterStoredTab = (raw: string) => {
        const uri = raw.replace(/\\/g, '/');
        const inVault = uri === root || uri.startsWith(`${root}/`);
        return (
          inVault
          && (notes.some(n => n.uri === uri) || uri.toLowerCase().endsWith('.md'))
        );
      };

      const sanitizeStoredWorkspaceRows = (
        tabs:
          | ReadonlyArray<{id: string; entries: string[]; index: number}>
          | null
          | undefined,
      ): {id: string; entries: string[]; index: number}[] | null => {
        if (tabs == null) {
          return null;
        }
        if (tabs.length === 0) {
          return [];
        }
        const sanitized = tabs
          .map(t => {
            const entries = t.entries
              .map(e => e.replace(/\\/g, '/'))
              .filter(filterStoredTab);
            if (entries.length === 0) {
              return null;
            }
            let index =
              typeof t.index === 'number' && Number.isFinite(t.index)
                ? Math.floor(t.index)
                : 0;
            if (index < 0 || index >= entries.length) {
              index = entries.length - 1;
            }
            const id = typeof t.id === 'string' ? t.id.trim() : '';
            if (!id) {
              return null;
            }
            return {id, entries, index};
          })
          .filter((x): x is {id: string; entries: string[]; index: number} => x != null);
        return sanitized;
      };

      let chosenTabsSource = restoredInboxState.editorWorkspaceTabs;
      let chosenActiveEditorTabId = restoredInboxState.activeEditorTabId ?? null;
      let resolvedActiveHub: string | null = null;

      if (hubUris.length > 0) {
        const ws = restoredInboxState.todayHubWorkspaces;
        if (ws && Object.keys(ws).length > 0) {
          const rawActive =
            typeof restoredInboxState.activeTodayHubUri === 'string'
              ? restoredInboxState.activeTodayHubUri
                  .replace(/\\/g, '/')
                  .replace(/\/+/g, '/')
                  .trim()
              : null;
          resolvedActiveHub =
            rawActive && hubUris.includes(rawActive)
              ? rawActive
              : pickDefaultActiveTodayHubUri({
                  hubUris,
                  selectedUri: restoredInboxState.selectedUri,
                  editorWorkspaceTabs: restoredInboxState.editorWorkspaceTabs,
                  openTabUris: restoredInboxState.openTabUris,
                });
          const snap = resolvedActiveHub ? ws[resolvedActiveHub] : undefined;
          const fromSnap = snap
            ? sanitizeStoredWorkspaceRows(snap.editorWorkspaceTabs)
            : null;
          if (fromSnap != null) {
            chosenTabsSource = fromSnap;
            if (snap!.activeEditorTabId === null) {
              chosenActiveEditorTabId = null;
            } else if (typeof snap!.activeEditorTabId === 'string') {
              const aid = snap!.activeEditorTabId.trim();
              chosenActiveEditorTabId = aid === '' ? null : aid;
            }
          }
        } else {
          resolvedActiveHub = pickDefaultActiveTodayHubUri({
            hubUris,
            selectedUri: restoredInboxState.selectedUri,
            editorWorkspaceTabs: restoredInboxState.editorWorkspaceTabs,
            openTabUris: restoredInboxState.openTabUris,
          });
        }
      }

      const rawTabs = restoredInboxState.openTabUris;
      let restoredTabs: string[] = [];

      if (chosenTabsSource != null && chosenTabsSource.length === 0) {
        editorWorkspaceTabsRef.current = [];
        activeEditorTabIdRef.current = null;
        setEditorWorkspaceTabs([]);
        setActiveEditorTabId(null);
        restoredTabs = [];
      } else if (chosenTabsSource != null && chosenTabsSource.length > 0) {
        const sanitized = sanitizeStoredWorkspaceRows(chosenTabsSource);
        if (sanitized != null && sanitized.length > 0) {
          const nextTabs = tabsFromStored(sanitized);
          let nextActive =
            typeof chosenActiveEditorTabId === 'string'
              ? chosenActiveEditorTabId.trim()
              : null;
          if (nextActive && !nextTabs.some(t => t.id === nextActive)) {
            nextActive = null;
          }
          nextActive = ensureActiveTabId(nextTabs, nextActive);
          editorWorkspaceTabsRef.current = nextTabs;
          activeEditorTabIdRef.current = nextActive;
          setEditorWorkspaceTabs(nextTabs);
          setActiveEditorTabId(nextActive);
          restoredTabs = nextTabs
            .map(t => tabCurrentUri(t))
            .filter((u): u is string => u != null);
        }
      }

      if (
        editorWorkspaceTabsRef.current.length === 0
        && rawTabs != null
        && rawTabs.length > 0
      ) {
        const filtered = rawTabs.filter(filterStoredTab);
        const migrated = migrateOpenTabUrisToWorkspaceTabs(filtered);
        if (migrated.length > 0) {
          const nextActive = migrated[0]!.id;
          editorWorkspaceTabsRef.current = migrated;
          activeEditorTabIdRef.current = nextActive;
          setEditorWorkspaceTabs(migrated);
          setActiveEditorTabId(nextActive);
          restoredTabs = migrated
            .map(t => tabCurrentUri(t))
            .filter((u): u is string => u != null);
        }
      }

      if (hubUris.length > 0) {
        const mergedWs: Record<string, TodayHubWorkspaceSnapshot> = {};
        const ws = restoredInboxState.todayHubWorkspaces;
        if (ws) {
          for (const [rawKey, snap] of Object.entries(ws)) {
            const h = rawKey.replace(/\\/g, '/').replace(/\/+/g, '/').trim();
            if (!h || !hubUris.includes(h)) {
              continue;
            }
            const rows = sanitizeStoredWorkspaceRows(snap.editorWorkspaceTabs);
            if (rows == null) {
              continue;
            }
            let aid: string | null = null;
            if (snap.activeEditorTabId === null) {
              aid = null;
            } else if (typeof snap.activeEditorTabId === 'string') {
              const t = snap.activeEditorTabId.trim();
              aid = t === '' ? null : t;
            }
            mergedWs[h] = {editorWorkspaceTabs: rows, activeEditorTabId: aid};
          }
        }
        const activeHubFinal =
          resolvedActiveHub
          ?? pickDefaultActiveTodayHubUri({
            hubUris,
            selectedUri: restoredInboxState.selectedUri,
            editorWorkspaceTabs: restoredInboxState.editorWorkspaceTabs,
            openTabUris: restoredInboxState.openTabUris,
          })
          ?? hubUris[0]!;
        mergedWs[activeHubFinal] = {
          editorWorkspaceTabs: tabsToStored(editorWorkspaceTabsRef.current),
          activeEditorTabId: activeEditorTabIdRef.current,
        };
        setTodayHubWorkspacesForSave(mergedWs);
        setActiveTodayHubUri(activeHubFinal);
        activeTodayHubUriRef.current = activeHubFinal;
      } else if (vaultMarkdownRefs.length > 0) {
        setTodayHubWorkspacesForSave({});
        setActiveTodayHubUri(null);
        activeTodayHubUriRef.current = null;
      }

      if (restoredInboxState.composingNewEntry) {
        startNewEntry();
      } else if (restoredInboxState.selectedUri) {
        const uri = restoredInboxState.selectedUri.replace(/\\/g, '/');
        const inVault = uri === root || uri.startsWith(`${root}/`);
        const selectedOk =
          inVault
          && (notes.some(n => n.uri === uri) || uri.toLowerCase().endsWith('.md'));
        if (selectedOk) {
          selectNote(restoredInboxState.selectedUri);
        } else if (restoredTabs.length > 0) {
          selectNote(restoredTabs[0]!);
        }
      } else if (restoredTabs.length > 0) {
        selectNote(restoredTabs[0]!);
      } else if (
        hubUris.length > 0
        && editorWorkspaceTabsRef.current.length === 0
        && activeTodayHubUriRef.current
      ) {
        selectNote(activeTodayHubUriRef.current);
      }
    }
    setInboxShellRestored(true);
  }, [
    vaultRoot,
    inboxRestoreEnabled,
    inboxShellRestored,
    restoredInboxState,
    notes,
    vaultMarkdownRefs,
    startNewEntry,
    selectNote,
  ]);

  useEffect(() => {
    if (!vaultRoot || !inboxShellRestored || vaultMarkdownRefs.length === 0) {
      return;
    }
    const hubs = sortedTodayHubNoteUrisFromRefs(vaultMarkdownRefs);
    if (hubs.length === 0) {
      return;
    }
    const cur = activeTodayHubUri;
    if (cur != null && hubs.includes(cur)) {
      return;
    }
    if (cur != null && !hubs.includes(cur)) {
      void switchTodayHubWorkspace(hubs[0]!);
      return;
    }
    const pick =
      pickDefaultActiveTodayHubUri({
        hubUris: hubs,
        selectedUri: selectedUriRef.current,
        editorWorkspaceTabs: tabsToStored(editorWorkspaceTabsRef.current),
        openTabUris: null,
      }) ?? hubs[0]!;
    activeTodayHubUriRef.current = pick;
    setActiveTodayHubUri(pick);
    setTodayHubWorkspacesForSave(prev => ({
      ...prev,
      [pick]: {
        editorWorkspaceTabs: tabsToStored(editorWorkspaceTabsRef.current),
        activeEditorTabId: activeEditorTabIdRef.current,
      },
    }));
  }, [
    vaultRoot,
    inboxShellRestored,
    vaultMarkdownRefs,
    activeTodayHubUri,
    switchTodayHubWorkspace,
  ]);

  useEffect(() => {
    if (!activeTodayHubUri || !inboxShellRestored) {
      return;
    }
    setTodayHubWorkspacesForSave(prev => ({
      ...prev,
      [activeTodayHubUri]: {
        editorWorkspaceTabs: tabsToStored(editorWorkspaceTabs),
        activeEditorTabId,
      },
    }));
  }, [
    editorWorkspaceTabs,
    activeEditorTabId,
    activeTodayHubUri,
    inboxShellRestored,
  ]);

  return {
    vaultRoot,
    vaultSettings,
    setVaultSettings,
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
    wikiRenameNotice,
    renameLinkProgress,
    pendingWikiLinkAmbiguityRename,
    confirmPendingWikiLinkAmbiguityRename,
    cancelPendingWikiLinkAmbiguityRename,
    setErr,
    diskConflict,
    resolveDiskConflictReloadFromDisk,
    resolveDiskConflictKeepLocal,
    diskConflictSoft,
    elevateDiskConflictSoftToBlocking,
    dismissDiskConflictSoft,
    setEditorBody: guardedSetEditorBody,
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
    subtreeMarkdownCache: subtreeMarkdownCacheRef.current,
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
    closeAllEditorTabs,
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
    todayHubWorkspacesForSave: todayHubWorkspacesPersistFiltered,
    switchTodayHubWorkspace,
    focusActiveTodayHubNote,
    workspaceSelectShowsActiveTabPill,
    inboxYamlFrontmatterInner,
    applyFrontmatterInnerChange,
    syncFrontmatterStateFromDisk,
  };
}
