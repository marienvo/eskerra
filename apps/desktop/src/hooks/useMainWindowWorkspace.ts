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
  isVaultPathUnderAutosyncBackup,
  wikiLinkInnerBrowserOpenableHref,
  wikiLinkInnerVaultRelativeMarkdownHref,
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
  openOrCreateVaultWikiPathMarkdownLink,
} from '../lib/inboxWikiLinkNavigation';
import {openSystemBrowserUrl} from '../lib/openSystemBrowserUrl';
import {
  createInboxAutosaveScheduler,
  INBOX_AUTOSAVE_DEBOUNCE_MS,
  type InboxAutosaveScheduler,
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
  type VaultWikiLinkRenamePlanResult,
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
import {
  type VaultFilesChangedPayload,
} from '../lib/vaultFilesChangedPayload';
import {isPodcastFile} from '../lib/podcasts/podcastParser';
import {planVaultFilesChangedEvent} from '../lib/vaultFilesChangedEventPlan';
import {
  buildRestoredEditorWorkspace,
  isUriValidVaultMarkdown,
  makeStoredTabFilter,
  mergeStoredHubWorkspaces,
  pickFinalActiveHub,
  resolveActiveHubAndTabsSource,
} from './inboxShellRestoreHelpers';

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}

function looksLikeRssEpisodeMarkdownName(name: string): boolean {
  if (!name.endsWith('.md') || !name.startsWith('📻')) {
    return false;
  }
  const middle = name.slice('📻'.length, -'.md'.length);
  return middle.trim().length > 0;
}

function isPodcastRelevantPath(p: string): boolean {
  const name = p.replace(/\\/g, '/').split('/').pop() ?? '';
  return isPodcastFile(name) || looksLikeRssEpisodeMarkdownName(name);
}
import {tryMergeThreeWayVaultMarkdown} from '../lib/vaultMarkdownThreeWayMerge';
import {cleanNoteMarkdownBody} from '../lib/cleanNoteMarkdown';
import {captureObservabilityMessage} from '../observability/captureObservabilityMessage';
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
import {resolveVaultLinkBaseMarkdownUri} from '../lib/resolveVaultLinkBaseMarkdownUri';

/** Skip showing an immediate blocking disk conflict if the user just edited; one deferred re-check follows. */
const DISK_CONFLICT_RECENCY_MS = 2000;
const DISK_CONFLICT_DEFER_MS = 600;
const VAULT_INDEX_TOUCH_DEDUP_MS = 1000;

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

function vaultChangedPathsSignature(paths: readonly string[]): string {
  return [...new Set(paths.map(p => p.trim()).filter(Boolean))].sort().join('\n');
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
  const oldP = trimTrailingSlashes(oldPrefix.replace(/\\/g, '/'));
  const newP = trimTrailingSlashes(newPrefix.replace(/\\/g, '/'));
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

function pickVaultLinkFallbackSource(args: {
  base: string;
  composingNewEntry: boolean;
  showTodayHubCanvas: boolean;
  todayHubWikiNavParent: string | null;
  selectedUri: string | null;
}): string {
  const {
    base,
    composingNewEntry,
    showTodayHubCanvas,
    todayHubWikiNavParent,
    selectedUri,
  } = args;
  if (composingNewEntry) {
    return getInboxDirectoryUri(base);
  }
  if (showTodayHubCanvas) {
    return getGeneralDirectoryUri(base);
  }
  return todayHubWikiNavParent ?? selectedUri ?? getInboxDirectoryUri(base);
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

/**
 * Decide whether a foreground open should use a hub workspace shell variant: full shell (no tabs),
 * preserve-tabs shell (tabs visible but no active pill), or normal tab navigation.
 */
function decideWorkspaceShellMode(args: {
  targetNorm: string;
  activeTodayHubUri: string | null;
  options:
    | {workspaceShell?: boolean; workspaceShellPreserveTabs?: boolean}
    | undefined;
}): 'shell' | 'preserveTabs' | 'normal' {
  const {targetNorm, activeTodayHubUri, options} = args;
  const activeHubNorm = normalizeEditorDocUri(activeTodayHubUri ?? '');
  const isActiveHubFile =
    activeHubNorm != null
    && activeHubNorm !== ''
    && targetNorm === activeHubNorm
    && vaultUriIsTodayMarkdownFile(targetNorm);
  if (!isActiveHubFile) {
    return 'normal';
  }
  if (options?.workspaceShell === true) {
    return 'shell';
  }
  if (options?.workspaceShellPreserveTabs === true) {
    return 'preserveTabs';
  }
  return 'normal';
}

/**
 * Place a target URI into the editor tab strip for the foreground open path:
 * either as a new active tab (with optional insertion index/position), or by
 * navigating the active tab's history when no `newTab` is requested.
 */
function applyForegroundOpenTabPlacement(args: {
  uri: string;
  targetNorm: string;
  tabs: readonly EditorWorkspaceTab[];
  activeId: string | null;
  options:
    | {
        newTab?: boolean;
        activateNewTab?: boolean;
        insertAfterActive?: boolean;
        insertAtIndex?: number;
        skipHistory?: boolean;
      }
    | undefined;
}): {nextTabs: EditorWorkspaceTab[]; nextActiveId: string | null} {
  const {uri, targetNorm, tabs, activeId, options} = args;
  const wantNewTab = options?.newTab === true && options?.activateNewTab !== false;
  if (wantNewTab) {
    const newTab = createEditorWorkspaceTab(targetNorm);
    if (
      typeof options?.insertAtIndex === 'number'
      && Number.isFinite(options.insertAtIndex)
    ) {
      return {
        nextTabs: insertTabAtIndex(tabs, options.insertAtIndex, newTab),
        nextActiveId: newTab.id,
      };
    }
    if (options?.insertAfterActive) {
      return {
        nextTabs: insertTabAfterActive(tabs, activeId, newTab),
        nextActiveId: newTab.id,
      };
    }
    return {nextTabs: [...tabs, newTab], nextActiveId: newTab.id};
  }
  const ensuredActive = ensureActiveTabId(tabs, activeId);
  if (ensuredActive == null) {
    const first = createEditorWorkspaceTab(targetNorm);
    return {nextTabs: [first], nextActiveId: first.id};
  }
  const navigated = tabs.map(t => {
    if (t.id !== ensuredActive) return t;
    if (options?.skipHistory) return t;
    return pushNavigateOnTab(t, uri);
  });
  return {nextTabs: navigated, nextActiveId: ensuredActive};
}

function refToNameAndUri(ref: {name: string; uri: string}): {name: string; uri: string} {
  return {name: ref.name, uri: ref.uri};
}

function refToNameAndUriList(
  refs: ReadonlyArray<{name: string; uri: string}>,
): {name: string; uri: string}[] {
  return refs.map(refToNameAndUri);
}

async function computeSelectedNoteBacklinkUris(args: {
  fs: VaultFilesystem;
  vaultRoot: string;
  targetUri: string;
  refs: VaultMarkdownRef[];
  diskBodyCache: Record<string, string>;
  inboxContentByUri: Readonly<Record<string, string>>;
  activeUri: string | null;
  activeBody: string;
}): Promise<{uris: readonly string[]; pruned: Record<string, string>}> {
  const {
    fs,
    vaultRoot,
    targetUri,
    refs,
    diskBodyCache,
    inboxContentByUri,
    activeUri,
    activeBody,
  } = args;
  const seed = mergeVaultBacklinkBodySeed(diskBodyCache, inboxContentByUri);
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
  const uris = listInboxAllBacklinkReferrersForTarget({
    vaultRoot,
    targetUri,
    notes: refToNameAndUriList(refs),
    contentByUri: expanded,
    activeUri,
    activeBody,
  });
  return {uris, pruned};
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
  /** Increments only when files in `General/` change — used to scope podcast catalog rescans. */
  podcastFsNonce: number;
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
  /**
   * Comparing a resolved `_autosync-backup-*` file with the note the link was opened from (`baseUri`),
   * or comparing editor draft with a disk version from a disk conflict.
   */
  mergeView:
    | null
    | {kind: 'backup'; baseUri: string; backupUri: string}
    | {kind: 'diskConflict'; baseUri: string; diskMarkdown: string};
  closeMergeView: () => void;
  /** Replaces the base note on disk and in the editor with the full backup file contents, then saves. For disk conflict kind: loads disk version and resolves the conflict. */
  applyFullBackupFromMerge: () => Promise<void>;
  /** For disk conflict merge view: marks local edits as primary and resolves the conflict. */
  keepMyEditsFromMerge: () => void;
  /** Opens the merge panel for the current disk conflict (hard or soft; promotes soft to hard). */
  enterDiskConflictMergeView: () => void;
  /** Applies a manually merged body to the editor, resolves any disk conflict, and saves. */
  applyMergedBodyFromMerge: (body: string) => void;
};

/**
 * Open-tab inbox reconcile after vault FS events: tabs, cache, editor, autosave, disk conflicts.
 * Split from {@link ReconcileFsTodayHubEnv} so helpers declare whether they touch Today hub state
 * (review: avoid one undifferentiated env for all vault-watch side effects).
 */
type ReconcileFsOpenMarkdownEnv = {
  cancelled: () => boolean;
  fs: VaultFilesystem;
  vaultRootRef: MutableRefObject<string | null>;
  editorWorkspaceTabsRef: MutableRefObject<EditorWorkspaceTab[]>;
  selectedUriRef: MutableRefObject<string | null>;
  activeEditorTabIdRef: MutableRefObject<string | null>;
  composingNewEntryRef: MutableRefObject<boolean>;
  diskConflictRef: MutableRefObject<DiskConflictState | null>;
  diskConflictSoftRef: MutableRefObject<DiskConflictSoftState | null>;
  inboxContentByUriRef: MutableRefObject<Record<string, string>>;
  lastPersistedRef: MutableRefObject<LastPersisted | null>;
  editorBodyRef: MutableRefObject<string>;
  inboxYamlFrontmatterInnerRef: MutableRefObject<string | null>;
  inboxEditorYamlLeadingBeforeFrontmatterRef: MutableRefObject<string>;
  editorShellScrollByUriRef: MutableRefObject<Map<string, {top: number; left: number}>>;
  skipRecencyDeferForUriRef: MutableRefObject<Set<string>>;
  diskConflictDeferTimerRef: MutableRefObject<number | null>;
  lastInboxEditorActivityAtRef: MutableRefObject<number>;
  inboxEditorRef: RefObject<NoteMarkdownEditorHandle | null>;
  autosaveSchedulerRef: MutableRefObject<InboxAutosaveScheduler>;
  setEditorWorkspaceTabs: Dispatch<SetStateAction<EditorWorkspaceTab[]>>;
  setActiveEditorTabId: Dispatch<SetStateAction<string | null>>;
  setDiskConflict: Dispatch<SetStateAction<DiskConflictState | null>>;
  setDiskConflictSoft: Dispatch<SetStateAction<DiskConflictSoftState | null>>;
  setInboxContentByUri: Dispatch<SetStateAction<Record<string, string>>>;
  setSelectedUri: Dispatch<SetStateAction<string | null>>;
  setComposingNewEntry: Dispatch<SetStateAction<boolean>>;
  setEditorBody: Dispatch<SetStateAction<string>>;
  setInboxEditorResetNonce: Dispatch<SetStateAction<number>>;
  setInboxYamlFrontmatterInner: Dispatch<SetStateAction<string | null>>;
  setInboxEditorYamlLeadingBeforeFrontmatter: Dispatch<SetStateAction<string>>;
  openMarkdownInEditor: (
    uri: string,
    opts?: {skipHistory?: boolean},
  ) => Promise<void>;
  loadFullMarkdownIntoInboxEditor: (
    markdown: string,
    uri: string,
    selection: 'preserve' | 'start',
  ) => void;
  scheduleBacklinksDeferOneFrameAfterLoad: () => void;
};

/** Today hub row disk/cache alignment; only used after open-tab reconcile in the same FS batch. */
type ReconcileFsTodayHubEnv = {
  todayHubRowLastPersistedRef: MutableRefObject<Map<string, string>>;
  todayHubSettingsRef: MutableRefObject<TodayHubSettings | null>;
  todayHubBridgeRef: MutableRefObject<TodayHubWorkspaceBridge>;
};

function normalizeVaultFsWatchRawPaths(rawPaths: string[]): string[] {
  return rawPaths.map(p => p.trim().replace(/\\/g, '/')).filter(Boolean);
}

async function pathExistsForVaultWatch(
  fs: VaultFilesystem,
  normTab: string,
): Promise<boolean | null> {
  try {
    return await fs.exists(normTab);
  } catch {
    return null;
  }
}

async function readVaultMarkdownUtf8Normalized(
  fs: VaultFilesystem,
  normTab: string,
): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(normTab, {encoding: 'utf8'});
    return normalizeVaultMarkdownDiskRead(raw);
  } catch {
    return undefined;
  }
}

function mergeInboxCacheWithDiskBodyForUri(
  open: ReconcileFsOpenMarkdownEnv,
  normTab: string,
  diskBody: string,
): void {
  const nextCache = mergeInboxNoteBodyIntoCache(
    open.inboxContentByUriRef.current,
    normTab,
    diskBody,
  );
  if (!nextCache) {
    return;
  }
  open.inboxContentByUriRef.current = nextCache;
  open.setInboxContentByUri(prev =>
    mergeInboxNoteBodyIntoCache(prev, normTab, diskBody) ?? prev,
  );
}

function clearDiskConflictRefsForMatchingUri(
  open: ReconcileFsOpenMarkdownEnv,
  normTab: string,
): void {
  if (open.diskConflictRef.current?.uri === normTab) {
    open.setDiskConflict(null);
    open.diskConflictRef.current = null;
  }
  if (open.diskConflictSoftRef.current?.uri === normTab) {
    open.setDiskConflictSoft(null);
    open.diskConflictSoftRef.current = null;
  }
}

function clearSoftDiskConflictRefIfUriMatches(
  open: ReconcileFsOpenMarkdownEnv,
  normTab: string,
): void {
  if (open.diskConflictSoftRef.current?.uri === normTab) {
    open.setDiskConflictSoft(null);
    open.diskConflictSoftRef.current = null;
  }
}

async function applyExternalOpenNoteDeletedForFsWatch(
  open: ReconcileFsOpenMarkdownEnv,
  normTab: string,
): Promise<void> {
  const wasSelected = open.selectedUriRef.current === normTab;
  const nextTabs = removeUriFromAllTabs(
    open.editorWorkspaceTabsRef.current,
    u => u === normTab,
  );
  const nextActive = ensureActiveTabId(
    nextTabs,
    open.activeEditorTabIdRef.current,
  );
  open.editorWorkspaceTabsRef.current = nextTabs;
  open.setEditorWorkspaceTabs(nextTabs);
  open.activeEditorTabIdRef.current = nextActive;
  open.setActiveEditorTabId(nextActive);

  clearDiskConflictRefsForMatchingUri(open, normTab);

  open.editorShellScrollByUriRef.current.delete(normTab);

  const cacheNext = removeInboxNoteBodyFromCache(
    open.inboxContentByUriRef.current,
    normTab,
  );
  if (cacheNext) {
    open.inboxContentByUriRef.current = cacheNext;
    open.setInboxContentByUri(cacheNext);
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
    await open.openMarkdownInEditor(nextAfterRemove, {skipHistory: true});
  } else {
    open.selectedUriRef.current = null;
    open.composingNewEntryRef.current = false;
    open.lastPersistedRef.current = null;
    open.setSelectedUri(null);
    open.setComposingNewEntry(false);
    clearInboxYamlFrontmatterEditorRefs({
      inner: open.inboxYamlFrontmatterInnerRef,
      leading: open.inboxEditorYamlLeadingBeforeFrontmatterRef,
      setInner: open.setInboxYamlFrontmatterInner,
      setLeading: open.setInboxEditorYamlLeadingBeforeFrontmatter,
    });
    open.setEditorBody('');
    open.setInboxEditorResetNonce(n => n + 1);
  }
}

async function mergeBackgroundTabCacheIfDiskChanged(
  open: ReconcileFsOpenMarkdownEnv,
  normTab: string,
  diskBody: string,
): Promise<void> {
  const cached = open.inboxContentByUriRef.current[normTab];
  if (cached === diskBody) {
    return;
  }
  mergeInboxCacheWithDiskBodyForUri(open, normTab, diskBody);
}

async function applyReloadFromDiskForFsWatch(
  open: ReconcileFsOpenMarkdownEnv,
  normTab: string,
  diskBody: string,
): Promise<void> {
  open.autosaveSchedulerRef.current.cancel();
  open.loadFullMarkdownIntoInboxEditor(diskBody, normTab, 'preserve');
  open.scheduleBacklinksDeferOneFrameAfterLoad();
  open.lastPersistedRef.current = {uri: normTab, markdown: diskBody};
  mergeInboxCacheWithDiskBodyForUri(open, normTab, diskBody);
  clearDiskConflictRefsForMatchingUri(open, normTab);
}

function tryScheduleDiskConflictRecencyDefer(
  open: ReconcileFsOpenMarkdownEnv,
  normTab: string,
  rerunForTab: (tab: string) => void,
): boolean {
  const skipRecency = open.skipRecencyDeferForUriRef.current.has(normTab);
  if (skipRecency) {
    open.skipRecencyDeferForUriRef.current.delete(normTab);
    return false;
  }
  if (Date.now() - open.lastInboxEditorActivityAtRef.current >= DISK_CONFLICT_RECENCY_MS) {
    return false;
  }
  if (open.diskConflictDeferTimerRef.current != null) {
    window.clearTimeout(open.diskConflictDeferTimerRef.current);
  }
  open.diskConflictDeferTimerRef.current = window.setTimeout(() => {
    open.diskConflictDeferTimerRef.current = null;
    open.skipRecencyDeferForUriRef.current.add(normTab);
    if (
      open.cancelled() ||
      open.selectedUriRef.current !== normTab ||
      open.composingNewEntryRef.current
    ) {
      open.skipRecencyDeferForUriRef.current.delete(normTab);
      return;
    }
    rerunForTab(normTab);
  }, DISK_CONFLICT_DEFER_MS);
  return true;
}

async function reconcileDiskConflictAfterMergeFailed(
  open: ReconcileFsOpenMarkdownEnv,
  normTab: string,
  diskBody: string,
  local: string,
  lp: LastPersisted | null,
  rerunForTab: (tab: string) => void,
): Promise<void> {
  if (tryScheduleDiskConflictRecencyDefer(open, normTab, rerunForTab)) {
    return;
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
  open.setDiskConflict(null);
  open.diskConflictRef.current = null;
  open.setDiskConflictSoft(soft);
  open.diskConflictSoftRef.current = soft;
}

async function reconcileDiskConflictKindForSelectedTab(
  open: ReconcileFsOpenMarkdownEnv,
  args: {
    normTab: string;
    diskBody: string;
    local: string;
    lp: LastPersisted | null;
  },
  rerunForTab: (tab: string) => void,
): Promise<void> {
  const {normTab, diskBody, local, lp} = args;
  open.autosaveSchedulerRef.current.cancel();

  if (lp != null && normalizeEditorDocUri(lp.uri) === normTab) {
    const merged = tryMergeThreeWayVaultMarkdown(
      lp.markdown,
      local,
      diskBody,
    );
    if (merged.ok) {
      const mergedCanon = normalizeVaultMarkdownDiskRead(merged.merged);
      open.loadFullMarkdownIntoInboxEditor(mergedCanon, normTab, 'preserve');
      open.scheduleBacklinksDeferOneFrameAfterLoad();
      open.lastPersistedRef.current = {uri: normTab, markdown: mergedCanon};
      mergeInboxCacheWithDiskBodyForUri(open, normTab, mergedCanon);
      clearDiskConflictRefsForMatchingUri(open, normTab);
      console.debug('[disk-merge]', {
        uri: normTab,
        mergedLen: mergedCanon.length,
      });
      return;
    }
  }

  await reconcileDiskConflictAfterMergeFailed(
    open,
    normTab,
    diskBody,
    local,
    lp,
    rerunForTab,
  );
}

async function reconcileOneOpenMarkdownTabAfterDiskRead(
  open: ReconcileFsOpenMarkdownEnv,
  args: {normTab: string; diskBody: string},
  rerunForTab: (tab: string) => void,
): Promise<void> {
  const {normTab, diskBody} = args;
  const isSelected =
    open.selectedUriRef.current === normTab && !open.composingNewEntryRef.current;
  if (!isSelected) {
    await mergeBackgroundTabCacheIfDiskChanged(open, normTab, diskBody);
    return;
  }

  const local = inboxEditorSliceToFullMarkdown(
    open.inboxEditorRef.current?.getMarkdown() ?? open.editorBodyRef.current,
    normTab,
    open.composingNewEntryRef.current,
    open.inboxYamlFrontmatterInnerRef.current,
    open.inboxEditorYamlLeadingBeforeFrontmatterRef.current,
  );
  const lp = open.lastPersistedRef.current;
  const kind = classifyNoteDiskReconcile({
    noteUri: normTab,
    lastPersisted: lp,
    diskMarkdown: diskBody,
    localMarkdown: local,
  });

  if (kind === 'noop') {
    clearSoftDiskConflictRefIfUriMatches(open, normTab);
    return;
  }
  if (kind === 'reload_from_disk') {
    await applyReloadFromDiskForFsWatch(open, normTab, diskBody);
    return;
  }

  await reconcileDiskConflictKindForSelectedTab(
    open,
    {normTab, diskBody, local, lp},
    rerunForTab,
  );
}

async function syncTodayHubWeekRowFromDiskIfNeeded(
  open: ReconcileFsOpenMarkdownEnv,
  today: ReconcileFsTodayHubEnv,
  rowUri: string,
): Promise<void> {
  const rowExists = await pathExistsForVaultWatch(open.fs, rowUri);
  if (rowExists === null) {
    return;
  }
  if (!rowExists) {
    today.todayHubRowLastPersistedRef.current.delete(rowUri);
    const rm = removeInboxNoteBodyFromCache(
      open.inboxContentByUriRef.current,
      rowUri,
    );
    if (rm) {
      open.inboxContentByUriRef.current = rm;
      open.setInboxContentByUri(rm);
    }
    return;
  }
  const hubDiskBody = await readVaultMarkdownUtf8Normalized(open.fs, rowUri);
  if (hubDiskBody === undefined) {
    return;
  }
  const liveUri = today.todayHubBridgeRef.current.getLiveRowUri();
  if (liveUri === rowUri) {
    return;
  }
  const cached = open.inboxContentByUriRef.current[rowUri];
  if (cached === hubDiskBody) {
    today.todayHubRowLastPersistedRef.current.set(rowUri, hubDiskBody);
    return;
  }
  today.todayHubRowLastPersistedRef.current.set(rowUri, hubDiskBody);
  const nextHubCache = mergeInboxNoteBodyIntoCache(
    open.inboxContentByUriRef.current,
    rowUri,
    hubDiskBody,
  );
  if (nextHubCache) {
    open.inboxContentByUriRef.current = nextHubCache;
    open.setInboxContentByUri(prev =>
      mergeInboxNoteBodyIntoCache(prev, rowUri, hubDiskBody) ?? prev,
    );
  }
}

async function reconcileTodayHubWeekRowsAfterVaultFsChange(
  open: ReconcileFsOpenMarkdownEnv,
  today: ReconcileFsTodayHubEnv,
  args: {fullRefresh: boolean; normPaths: string[]; root: string},
): Promise<void> {
  const {fullRefresh, normPaths, root} = args;
  const todaySel = open.selectedUriRef.current;
  const normToday = todaySel?.replace(/\\/g, '/');
  if (
    !normToday
    || !vaultUriIsTodayMarkdownFile(normToday)
    || open.composingNewEntryRef.current
  ) {
    return;
  }
  const hubDir = vaultUriParentDirectory(normToday);
  const hubStart = today.todayHubSettingsRef.current?.start ?? 'monday';
  for (const m of enumerateTodayHubWeekStarts(new Date(), hubStart)) {
    const rowUri = normalizeEditorDocUri(todayHubRowUri(hubDir, m));
    if (!fullRefresh && !fsChangePathsMayAffectUri(normPaths, rowUri, root)) {
      continue;
    }
    await syncTodayHubWeekRowFromDiskIfNeeded(open, today, rowUri);
  }
}

async function reconcileOpenWorkspaceTabUriForVaultWatch(
  open: ReconcileFsOpenMarkdownEnv,
  tabUri: string,
  root: string,
  fullRefresh: boolean,
  normPaths: string[],
  rerunForTab: (tab: string) => void,
): Promise<void> {
  const normTab = normalizeEditorDocUri(tabUri);
  if (!normTab.toLowerCase().endsWith('.md')) {
    return;
  }
  const stillOpen = collectDistinctUrisFromTabs(
    open.editorWorkspaceTabsRef.current,
  ).some(u => normalizeEditorDocUri(u) === normTab);
  if (!stillOpen) {
    return;
  }
  if (!fullRefresh && !fsChangePathsMayAffectUri(normPaths, normTab, root)) {
    return;
  }

  const existsResult = await pathExistsForVaultWatch(open.fs, normTab);
  if (existsResult === null) {
    return;
  }
  if (!existsResult) {
    await applyExternalOpenNoteDeletedForFsWatch(open, normTab);
    return;
  }

  const diskBody = await readVaultMarkdownUtf8Normalized(open.fs, normTab);
  if (diskBody === undefined) {
    return;
  }

  await reconcileOneOpenMarkdownTabAfterDiskRead(
    open,
    {normTab, diskBody},
    rerunForTab,
  );
}

async function reconcileOpenNotesAfterFsChangeFromVaultWatch(
  open: ReconcileFsOpenMarkdownEnv,
  today: ReconcileFsTodayHubEnv,
  rawPaths: string[],
  rerunForTab: (tab: string) => void,
): Promise<void> {
  const root = open.vaultRootRef.current;
  if (!root || open.cancelled()) {
    return;
  }
  const normPaths = normalizeVaultFsWatchRawPaths(rawPaths);
  if (normPaths.length === 0) {
    console.debug(
      '[vault-files-changed] empty path batch: reconciling every open markdown tab (coarse invalidation); Rust watcher only emits non-empty batches today',
    );
  }
  const fullRefresh = normPaths.length === 0;
  const tabs = collectDistinctUrisFromTabs(open.editorWorkspaceTabsRef.current);

  for (const tabUri of tabs) {
    await reconcileOpenWorkspaceTabUriForVaultWatch(
      open,
      tabUri,
      root,
      fullRefresh,
      normPaths,
      rerunForTab,
    );
  }

  await reconcileTodayHubWeekRowsAfterVaultFsChange(open, today, {
    fullRefresh,
    normPaths,
    root,
  });
}

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
  // showTodayHubCanvas derives from selection; see useMemo below.
  const [inboxContentByUri, setInboxContentByUri] = useState<Record<string, string>>({});
  const [vaultMarkdownRefs, setVaultMarkdownRefs] = useState<VaultMarkdownRef[]>([]);
  const [fsRefreshNonce, setFsRefreshNonce] = useState(0);
  const [podcastFsNonce, setPodcastFsNonce] = useState(0);
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
  const [editorClosedTabsStackSnapshot, setEditorClosedTabsStackSnapshot] = useState<
    ClosedEditorTabRecord[]
  >([]);
  const [mergeView, setMergeView] = useState<
    | null
    | {kind: 'backup'; baseUri: string; backupUri: string}
    | {kind: 'diskConflict'; baseUri: string; diskMarkdown: string}
  >(null);

  const subtreeMarkdownCache = useMemo(() => new SubtreeMarkdownPresenceCache(), []);
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
  /** Mirror of leading-before-frontmatter (paired with inner) for use in render-time memos. */
  const [inboxEditorYamlLeadingBeforeFrontmatter, setInboxEditorYamlLeadingBeforeFrontmatter] =
    useState('');
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

  useLayoutEffect(() => {
    inboxEditorYamlLeadingBeforeFrontmatterRef.current =
      inboxEditorYamlLeadingBeforeFrontmatter;
  }, [inboxEditorYamlLeadingBeforeFrontmatter]);

  const syncFrontmatterStateFromDisk = useCallback(
    (nextInner: string | null, leading: string) => {
      inboxYamlFrontmatterInnerRef.current = nextInner;
      setInboxYamlFrontmatterInner(nextInner);
      inboxEditorYamlLeadingBeforeFrontmatterRef.current = leading;
      setInboxEditorYamlLeadingBeforeFrontmatter(leading);
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

  useLayoutEffect(() => {
    vaultRootRef.current = vaultRoot;
  }, [vaultRoot]);

  useLayoutEffect(() => {
    selectedUriRef.current = selectedUri;
  }, [selectedUri]);

  useLayoutEffect(() => {
    composingNewEntryRef.current = composingNewEntry;
  }, [composingNewEntry]);

  useLayoutEffect(() => {
    editorBodyRef.current = editorBody;
  }, [editorBody]);

  useLayoutEffect(() => {
    inboxContentByUriRef.current = inboxContentByUri;
  }, [inboxContentByUri]);

  useLayoutEffect(() => {
    backlinksActiveBodyRef.current = backlinksActiveBody;
  }, [backlinksActiveBody]);

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
    setEditorClosedTabsStackSnapshot([...editorClosedTabsStackRef.current]);
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
    const stack = editorClosedTabsStackSnapshot;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (
        isEditorClosedTabReopenable(stack[i]!.uri, root, noteSet)
      ) {
        return true;
      }
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editorClosedStackVersion syncs ref stack mutations to UI
  }, [vaultRoot, notes, editorClosedStackVersion, editorClosedTabsStackSnapshot]);

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
      queueMicrotask(() => {
        setSelectedNoteBacklinkUris([]);
      });
      return;
    }

    const selected = selectedUri;
    let cancelled = false;

    const runBacklinkScan = async () => {
      const activeUri = selectedUriRef.current;
      const activeBody = backlinksActiveBodyRef.current;
      if (cancelled || activeUri !== selected) {
        return;
      }
      try {
        const {uris, pruned} = await computeSelectedNoteBacklinkUris({
          fs,
          vaultRoot,
          targetUri: selected,
          refs: vaultMarkdownRefsRef.current,
          diskBodyCache: vaultBacklinkDiskBodyCacheRef.current,
          inboxContentByUri: inboxContentByUriRef.current,
          activeUri,
          activeBody,
        });
        vaultBacklinkDiskBodyCacheRef.current = pruned;
        if (cancelled || selectedUriRef.current !== selected) {
          return;
        }
        setSelectedNoteBacklinkUris(prev =>
          equalReadonlyStringArrays(prev, uris) ? prev : uris,
        );
      } catch {
        if (cancelled || selectedUriRef.current !== selected) {
          return;
        }
        setSelectedNoteBacklinkUris(prev => (prev.length === 0 ? prev : []));
      }
    };

    const tid = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      void runBacklinkScan();
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

  const showTodayHubCanvas = useMemo(() => {
    if (!vaultRoot || !selectedUri || composingNewEntry) {
      return false;
    }
    const normRoot = trimTrailingSlashes(normalizeVaultBaseUri(vaultRoot).replace(/\\/g, '/'));
    const normSel = selectedUri.replace(/\\/g, '/');
    if (!normSel.startsWith(`${normRoot}/`)) {
      return false;
    }
    return vaultUriIsTodayMarkdownFile(normSel);
  }, [vaultRoot, selectedUri, composingNewEntry]);

  useLayoutEffect(() => {
    showTodayHubCanvasRef.current = showTodayHubCanvas;
  }, [showTodayHubCanvas]);

  // Use `inboxYamlFrontmatterInner` state in the merge (not only the ref) so deps match and Today hub
  // refreshes on frontmatter-only edits. Leading still comes from the ref (updated with inner on disk sync).
  const todayHubSettings = useMemo((): TodayHubSettings | null => {
    if (!showTodayHubCanvas || !selectedUri) {
      return null;
    }
    const full = inboxEditorSliceToFullMarkdown(
      editorBody,
      selectedUri,
      composingNewEntry,
      inboxYamlFrontmatterInner,
      inboxEditorYamlLeadingBeforeFrontmatter,
    );
    return parseTodayHubFrontmatter(full);
  }, [
    showTodayHubCanvas,
    selectedUri,
    editorBody,
    composingNewEntry,
    inboxYamlFrontmatterInner,
    inboxEditorYamlLeadingBeforeFrontmatter,
  ]);

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

  /** Merge a known-good body for `norm` into the inbox content cache (state + ref). No-op if no change. */
  const mergeInboxNoteBodyCacheRefAndState = useCallback(
    (norm: string, body: string) => {
      const nextCache = mergeInboxNoteBodyIntoCache(
        inboxContentByUriRef.current,
        norm,
        body,
      );
      if (!nextCache) {
        return;
      }
      inboxContentByUriRef.current = nextCache;
      setInboxContentByUri(prev =>
        mergeInboxNoteBodyIntoCache(prev, norm, body) ?? prev,
      );
    },
    [],
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

      const persistOutgoingNoteSnapshot = async (): Promise<void> => {
        const root = vaultRootRef.current;
        if (!root) return;
        const dc = diskConflictRef.current;
        if (dc && normalizeEditorDocUri(dc.uri) === norm) return;
        const memStart = inboxContentByUriRef.current[norm];
        if (shouldSkipOutgoingPersistAfterNoteLeave(memStart, leaveSnapshotMarkdown)) return;

        setErr(null);
        const md = await persistTransientMarkdownImages(leaveSnapshotMarkdown, root);
        if (markdownContainsTransientImageUrls(md)) {
          setErr(
            'Cannot save: some images are still temporary (blob or data URLs). Paste images again so they are stored under Assets/Attachments, or remove those image references.',
          );
          return;
        }
        if (md !== leaveSnapshotMarkdown) {
          mergeInboxNoteBodyCacheRefAndState(norm, md);
          const active = selectedUriRef.current;
          if (active && normalizeEditorDocUri(active) === norm) {
            loadFullMarkdownIntoInboxEditor(md, norm, 'preserve');
            scheduleBacklinksDeferOneFrameAfterLoad();
          }
        }
        const memBeforeSave = inboxContentByUriRef.current[norm];
        if (shouldSkipOutgoingPersistBeforeWrite(memBeforeSave, leaveSnapshotMarkdown, md)) {
          return;
        }
        await saveNoteMarkdown(norm, fs, md);
        refreshNotes(root).catch(() => undefined);

        const activeSel = selectedUriRef.current;
        if (activeSel && normalizeEditorDocUri(activeSel) === norm) {
          lastPersistedRef.current = {uri: norm, markdown: md};
        }
        const memAfter = inboxContentByUriRef.current[norm];
        if (shouldMergeCacheAfterOutgoingPersist(memAfter, md, leaveSnapshotMarkdown)) {
          mergeInboxNoteBodyCacheRefAndState(norm, md);
        }
      };

      const run = async (): Promise<void> => {
        try {
          await persistOutgoingNoteSnapshot();
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
      mergeInboxNoteBodyCacheRefAndState,
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
                subtreeMarkdownCache.invalidateForMutation(
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
          subtreeMarkdownCache.invalidateForMutation(root, norm, 'file');
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
    [fs, refreshNotes, subtreeMarkdownCache],
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

  useLayoutEffect(() => {
    flushInboxSaveRef.current = flushInboxSave;
  }, [flushInboxSave]);

  const clearStaleDiskConflictsForOpen = useCallback((targetNorm: string) => {
    const prevConflict = diskConflictRef.current;
    if (prevConflict && normalizeEditorDocUri(prevConflict.uri) !== targetNorm) {
      setDiskConflict(null);
      diskConflictRef.current = null;
    }
    const prevSoft = diskConflictSoftRef.current;
    if (prevSoft && normalizeEditorDocUri(prevSoft.uri) !== targetNorm) {
      setDiskConflictSoft(null);
      diskConflictSoftRef.current = null;
    }
  }, []);

  const prepareInboxScrollDirectiveForOpen = useCallback(
    (targetNorm: string, skipHistory: boolean) => {
      if (skipHistory) {
        const saved =
          editorShellScrollByUriRef.current.get(targetNorm) ?? {top: 0, left: 0};
        inboxEditorShellScrollDirectiveRef.current = {
          kind: 'restore',
          top: saved.top,
          left: saved.left,
        };
        return;
      }
      inboxEditorShellScrollDirectiveRef.current = {kind: 'snapTop'};
    },
    [],
  );

  /** Snapshot the currently open note into the cache, and enqueue a deferred persist if dirty. */
  const snapshotAndPersistCurrentNoteBeforeOpen = useCallback(() => {
    const root = vaultRootRef.current;
    const curUri = selectedUriRef.current;
    if (curUri == null || composingNewEntryRef.current) {
      return;
    }
    const snapMdForSlice =
      inboxEditorRef.current?.getMarkdown() ?? editorBodyRef.current;
    const snapshot = inboxEditorSliceToFullMarkdown(
      snapMdForSlice,
      curUri,
      false,
      inboxYamlFrontmatterInnerRef.current,
      inboxEditorYamlLeadingBeforeFrontmatterRef.current,
    );
    mergeInboxNoteBodyCacheRefAndState(curUri, snapshot);
    const prev = lastPersistedRef.current;
    const needsPersist =
      root != null && !(prev && prev.uri === curUri && prev.markdown === snapshot);
    if (needsPersist) {
      enqueuePersistOutgoingNoteMarkdown(curUri, snapshot);
    }
  }, [
    inboxEditorRef,
    enqueuePersistOutgoingNoteMarkdown,
    mergeInboxNoteBodyCacheRefAndState,
  ]);

  const tryPrefetchTargetBody = useCallback(
    async (targetNorm: string, openGen: number): Promise<string | undefined> => {
      try {
        const raw = await fs.readFile(targetNorm, {encoding: 'utf8'});
        if (openGen !== openMarkdownGenerationRef.current) {
          return undefined;
        }
        return normalizeVaultMarkdownDiskRead(raw);
      } catch (e) {
        if (openGen !== openMarkdownGenerationRef.current) {
          return undefined;
        }
        setErr(e instanceof Error ? e.message : String(e));
        return undefined;
      }
    },
    [fs],
  );

  /**
   * After a foreground open has placed the tab, resolve the body to load (prefetched or cached),
   * load it into the inbox editor, and commit selection state.
   */
  const loadOpenedNoteBodyAndApplySelection = useCallback(
    (targetNorm: string, prefetchBody: string | undefined) => {
      if (prefetchBody !== undefined) {
        lastPersistedRef.current = {uri: targetNorm, markdown: prefetchBody};
        inboxContentByUriRef.current = {
          ...inboxContentByUriRef.current,
          [targetNorm]: prefetchBody,
        };
      }
      const resolvedEditorBody =
        prefetchBody !== undefined
          ? prefetchBody
          : inboxContentByUriRef.current[targetNorm];
      if (resolvedEditorBody !== undefined) {
        lastPersistedRef.current = {uri: targetNorm, markdown: resolvedEditorBody};
        eagerEditorLoadUriRef.current = targetNorm;
        backlinksActiveBodyRef.current = resolvedEditorBody;
        loadFullMarkdownIntoInboxEditor(resolvedEditorBody, targetNorm, 'start');
        scheduleBacklinksDeferOneFrameAfterLoad();
      }
      selectedUriRef.current = targetNorm;
      composingNewEntryRef.current = false;
      if (prefetchBody !== undefined) {
        setInboxContentByUri(prev => {
          if (prev[targetNorm] === prefetchBody) {
            return prev;
          }
          return {...prev, [targetNorm]: prefetchBody};
        });
      }
      if (resolvedEditorBody !== undefined) {
        setBacklinksActiveBody(resolvedEditorBody);
      }
      setComposingNewEntry(false);
      setSelectedUri(targetNorm);
    },
    [loadFullMarkdownIntoInboxEditor, scheduleBacklinksDeferOneFrameAfterLoad],
  );

  const applyBackgroundNewTabOpen = useCallback(
    (
      targetNorm: string,
      options:
        | {insertAtIndex?: number; insertAfterActive?: boolean}
        | undefined,
      prefetchBody: string | undefined,
    ) => {
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
          return {...prev, [targetNorm]: prefetchBody};
        });
      }
    },
    [],
  );

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
      setMergeView(null);
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
      clearStaleDiskConflictsForOpen(targetNorm);
      const isBackgroundNewTab =
        options?.newTab === true && options?.activateNewTab === false;

      if (!isBackgroundNewTab) {
        prepareInboxScrollDirectiveForOpen(targetNorm, options?.skipHistory === true);
      }

      snapshotAndPersistCurrentNoteBeforeOpen();
      if (openGen !== openMarkdownGenerationRef.current) {
        return;
      }

      let prefetchBody: string | undefined;
      const root = vaultRootRef.current;
      if (root != null && inboxContentByUriRef.current[targetNorm] === undefined) {
        prefetchBody = await tryPrefetchTargetBody(targetNorm, openGen);
        if (openGen !== openMarkdownGenerationRef.current) {
          return;
        }
      }

      if (isBackgroundNewTab) {
        applyBackgroundNewTabOpen(targetNorm, options, prefetchBody);
        return;
      }

      let nextTabs = editorWorkspaceTabsRef.current;
      let nextActiveId = activeEditorTabIdRef.current;
      const shellMode = decideWorkspaceShellMode({
        targetNorm,
        activeTodayHubUri: activeTodayHubUriRef.current,
        options,
      });
      if (shellMode === 'shell') {
        nextTabs = [];
        nextActiveId = null;
      } else if (shellMode === 'preserveTabs') {
        nextTabs = [...editorWorkspaceTabsRef.current];
        nextActiveId = null;
      } else {
        const placement = applyForegroundOpenTabPlacement({
          uri,
          targetNorm,
          tabs: nextTabs,
          activeId: nextActiveId,
          options,
        });
        nextTabs = placement.nextTabs;
        nextActiveId = placement.nextActiveId;
      }

      editorWorkspaceTabsRef.current = nextTabs;
      activeEditorTabIdRef.current = nextActiveId;
      setEditorWorkspaceTabs(nextTabs);
      setActiveEditorTabId(nextActiveId);

      loadOpenedNoteBodyAndApplySelection(targetNorm, prefetchBody);
    },
    [
      inboxEditorShellScrollRef,
      clearStaleDiskConflictsForOpen,
      prepareInboxScrollDirectiveForOpen,
      snapshotAndPersistCurrentNoteBeforeOpen,
      tryPrefetchTargetBody,
      applyBackgroundNewTabOpen,
      loadOpenedNoteBodyAndApplySelection,
    ],
  );

  const closeMergeView = useCallback(() => {
    setMergeView(null);
  }, []);

  const tryEnterBackupMergeView = useCallback(
    async (backupUri: string): Promise<boolean> => {
      if (!isVaultPathUnderAutosyncBackup(backupUri)) {
        return false;
      }
      const baseUri = resolveVaultLinkBaseMarkdownUri({
        composingNewEntry: composingNewEntryRef.current,
        showTodayHubCanvas: showTodayHubCanvasRef.current,
        todayHubWikiNavParentUri: todayHubWikiNavParentRef.current,
        selectedUri: selectedUriRef.current,
      });
      if (!baseUri) {
        return false;
      }
      const normBase = normalizeEditorDocUri(baseUri);
      const normBackup = normalizeEditorDocUri(backupUri);
      const cur = selectedUriRef.current
        ? normalizeEditorDocUri(selectedUriRef.current)
        : null;
      if (cur !== normBase) {
        await openMarkdownInEditor(normBase, {skipHistory: true});
      }
      setMergeView({kind: 'backup', baseUri: normBase, backupUri: normBackup});
      return true;
    },
    [openMarkdownInEditor],
  );

  const applyFullBackupFromMerge = useCallback(async () => {
    const mv = mergeView;
    if (!mv) {
      return;
    }
    if (mv.kind === 'diskConflict') {
      resolveDiskConflictReloadFromDisk();
      setMergeView(null);
      return;
    }
    const normBase = normalizeEditorDocUri(mv.baseUri);
    const dc = diskConflictRef.current;
    if (dc && normalizeEditorDocUri(dc.uri) === normBase) {
      setErr(
        'Resolve the disk conflict on this note before replacing it from a backup.',
      );
      return;
    }
    try {
      setErr(null);
      const raw = await fs.readFile(mv.backupUri, {encoding: 'utf8'});
      loadFullMarkdownIntoInboxEditor(raw, normBase, 'start');
      const body =
        inboxEditorRef.current?.getMarkdown() ?? editorBodyRef.current;
      const full = inboxEditorSliceToFullMarkdown(
        body,
        normBase,
        false,
        inboxYamlFrontmatterInnerRef.current,
        inboxEditorYamlLeadingBeforeFrontmatterRef.current,
      );
      const nextCache = mergeInboxNoteBodyIntoCache(
        inboxContentByUriRef.current,
        normBase,
        body,
      );
      if (nextCache) {
        inboxContentByUriRef.current = nextCache;
        setInboxContentByUri(
          prev => mergeInboxNoteBodyIntoCache(prev, normBase, body) ?? prev,
        );
      }
      backlinksActiveBodyRef.current = body;
      setBacklinksActiveBody(body);
      setMergeView(null);
      enqueuePersistOutgoingNoteMarkdown(normBase, full);
      scheduleBacklinksDeferOneFrameAfterLoad();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [
    mergeView,
    resolveDiskConflictReloadFromDisk,
    fs,
    loadFullMarkdownIntoInboxEditor,
    inboxEditorRef,
    enqueuePersistOutgoingNoteMarkdown,
    scheduleBacklinksDeferOneFrameAfterLoad,
  ]);

  const keepMyEditsFromMerge = useCallback(() => {
    resolveDiskConflictKeepLocal();
    setMergeView(null);
  }, [resolveDiskConflictKeepLocal]);

  const enterDiskConflictMergeView = useCallback(() => {
    const uri = selectedUriRef.current;
    if (!uri) return;
    const normUri = normalizeEditorDocUri(uri);

    const dc = diskConflictRef.current;
    if (dc && normalizeEditorDocUri(dc.uri) === normUri) {
      setMergeView({kind: 'diskConflict', baseUri: normUri, diskMarkdown: dc.diskMarkdown});
      return;
    }

    const s = diskConflictSoftRef.current;
    if (s && normalizeEditorDocUri(s.uri) === normUri) {
      autosaveSchedulerRef.current.cancel();
      const hard: DiskConflictState = {uri: s.uri, diskMarkdown: s.diskMarkdown};
      setDiskConflict(hard);
      diskConflictRef.current = hard;
      setDiskConflictSoft(null);
      diskConflictSoftRef.current = null;
      setMergeView({kind: 'diskConflict', baseUri: normUri, diskMarkdown: s.diskMarkdown});
    }
  }, []);

  const applyMergedBodyFromMerge = useCallback(
    (body: string) => {
      const mv = mergeView;
      if (!mv) return;
      const normBase = normalizeEditorDocUri(mv.baseUri);

      if (mv.kind === 'diskConflict') {
        autosaveSchedulerRef.current.cancel();
        const dc = diskConflictRef.current;
        if (dc) {
          lastPersistedRef.current = {uri: dc.uri, markdown: dc.diskMarkdown};
        }
        setDiskConflict(null);
        diskConflictRef.current = null;
        setDiskConflictSoft(null);
        diskConflictSoftRef.current = null;
      } else {
        const dc = diskConflictRef.current;
        if (dc && normalizeEditorDocUri(dc.uri) === normBase) {
          setErr('Resolve the disk conflict on this note before applying a merge.');
          return;
        }
      }

      suppressEditorOnChangeRef.current = true;
      inboxEditorRef.current?.loadMarkdown(body, {selection: 'preserve'});
      suppressEditorOnChangeRef.current = false;
      setEditorBody(body);
      editorBodyRef.current = body;

      const nextCache = mergeInboxNoteBodyIntoCache(
        inboxContentByUriRef.current,
        normBase,
        body,
      );
      if (nextCache) {
        inboxContentByUriRef.current = nextCache;
        setInboxContentByUri(prev => mergeInboxNoteBodyIntoCache(prev, normBase, body) ?? prev);
      }
      backlinksActiveBodyRef.current = body;
      setBacklinksActiveBody(body);
      setMergeView(null);

      const full = inboxEditorSliceToFullMarkdown(
        body,
        normBase,
        false,
        inboxYamlFrontmatterInnerRef.current,
        inboxEditorYamlLeadingBeforeFrontmatterRef.current,
      );
      enqueuePersistOutgoingNoteMarkdown(normBase, full);
      scheduleBacklinksDeferOneFrameAfterLoad();
    },
    [
      mergeView,
      inboxEditorRef,
      enqueuePersistOutgoingNoteMarkdown,
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

  /** Reset the inbox editor body, frontmatter state, and any reset-nonce-driven CodeMirror reload. */
  const resetInboxEditorComposeState = useCallback(() => {
    clearInboxYamlFrontmatterEditorRefs({
      inner: inboxYamlFrontmatterInnerRef,
      leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
      setInner: setInboxYamlFrontmatterInner,
      setLeading: setInboxEditorYamlLeadingBeforeFrontmatter,
    });
    setEditorBody('');
    setInboxEditorResetNonce(n => n + 1);
  }, []);

  /** Drop the active inbox selection entirely — clear refs, state, and editor. */
  const clearInboxSelection = useCallback(() => {
    selectedUriRef.current = null;
    composingNewEntryRef.current = false;
    lastPersistedRef.current = null;
    setSelectedUri(null);
    setComposingNewEntry(false);
    resetInboxEditorComposeState();
  }, [resetInboxEditorComposeState]);

  const recordClosedTabAndPruneScroll = useCallback(
    (tabsBefore: readonly EditorWorkspaceTab[], tabId: string, tabClosing: EditorWorkspaceTab | undefined) => {
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
    },
    [bumpEditorClosedStack],
  );

  const refocusAfterClosingActiveTab = useCallback(
    async (nextTabId: string | null, nextTabs: readonly EditorWorkspaceTab[]) => {
      if (nextTabId) {
        activeEditorTabIdRef.current = nextTabId;
        setActiveEditorTabId(nextTabId);
      }
      const neighbor = nextTabId ? findTabById(nextTabs, nextTabId) : undefined;
      const nextUri = neighbor ? tabCurrentUri(neighbor) : null;
      if (nextUri) {
        await openMarkdownInEditor(nextUri, {skipHistory: true});
        return;
      }
      const shellHub = activeTodayHubUriRef.current;
      if (shellHub) {
        await openMarkdownInEditor(shellHub, {workspaceShell: true});
        return;
      }
      if (!nextTabId) {
        activeEditorTabIdRef.current = null;
        setActiveEditorTabId(null);
      }
      clearInboxSelection();
    },
    [openMarkdownInEditor, clearInboxSelection],
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

        recordClosedTabAndPruneScroll(tabsBefore, tabId, tabClosing);

        const nextTabId = pickNeighborTabIdAfterRemovingTab(tabsBefore, tabId);
        const nextTabs = tabsBefore.filter(t => t.id !== tabId);
        editorWorkspaceTabsRef.current = nextTabs;
        setEditorWorkspaceTabs(nextTabs);

        if (!wasActive) {
          return;
        }
        await refocusAfterClosingActiveTab(nextTabId, nextTabs);
      })();
    },
    [recordClosedTabAndPruneScroll, refocusAfterClosingActiveTab],
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
        setLeading: setInboxEditorYamlLeadingBeforeFrontmatter,
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
      subtreeMarkdownCache.invalidateAll();
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
        bumpEditorClosedStack();
        setSelectedUri(null);
        setComposingNewEntry(false);
        setMergeView(null);
        clearInboxYamlFrontmatterEditorRefs({
          inner: inboxYamlFrontmatterInnerRef,
          leading: inboxEditorYamlLeadingBeforeFrontmatterRef,
          setInner: setInboxYamlFrontmatterInner,
          setLeading: setInboxEditorYamlLeadingBeforeFrontmatter,
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
          vaultSearchIndexSchedule().catch(() => undefined);
          vaultFrontmatterIndexSchedule().catch(() => undefined);
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [fs, refreshNotes, clearRenameNotice, bumpEditorClosedStack, subtreeMarkdownCache],
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
    const watchSessionId = crypto.randomUUID();
    const vaultRootHash = fingerprintUtf16ForDebug(vaultRoot);
    let coarseFullReindexScheduled = false;
    let lastIncrementalIndexTouch:
      | {signature: string; touchedAtMs: number}
      | null = null;

    const reconcileFsOpenEnv: ReconcileFsOpenMarkdownEnv = {
      cancelled: () => cancelled,
      fs,
      vaultRootRef,
      editorWorkspaceTabsRef,
      selectedUriRef,
      activeEditorTabIdRef,
      composingNewEntryRef,
      diskConflictRef,
      diskConflictSoftRef,
      inboxContentByUriRef,
      lastPersistedRef,
      editorBodyRef,
      inboxYamlFrontmatterInnerRef,
      inboxEditorYamlLeadingBeforeFrontmatterRef,
      editorShellScrollByUriRef,
      skipRecencyDeferForUriRef,
      diskConflictDeferTimerRef,
      lastInboxEditorActivityAtRef,
      inboxEditorRef,
      autosaveSchedulerRef,
      setEditorWorkspaceTabs,
      setActiveEditorTabId,
      setDiskConflict,
      setDiskConflictSoft,
      setInboxContentByUri,
      setSelectedUri,
      setComposingNewEntry,
      setEditorBody,
      setInboxEditorResetNonce,
      setInboxYamlFrontmatterInner,
      setInboxEditorYamlLeadingBeforeFrontmatter,
      openMarkdownInEditor,
      loadFullMarkdownIntoInboxEditor,
      scheduleBacklinksDeferOneFrameAfterLoad,
    };
    const reconcileFsTodayEnv: ReconcileFsTodayHubEnv = {
      todayHubRowLastPersistedRef,
      todayHubSettingsRef,
      todayHubBridgeRef,
    };
    const rerunFsReconcileForTab = (normTab: string) => {
      void reconcileOpenNotesAfterFsChangeFromVaultWatch(
        reconcileFsOpenEnv,
        reconcileFsTodayEnv,
        [normTab],
        rerunFsReconcileForTab,
      );
    };
    const reconcileOpenNotesAfterFsChange = (rawPaths: string[]) =>
      reconcileOpenNotesAfterFsChangeFromVaultWatch(
        reconcileFsOpenEnv,
        reconcileFsTodayEnv,
        rawPaths,
        rerunFsReconcileForTab,
      );

    listen<VaultFilesChangedPayload>('vault-files-changed', event => {
      const plan = planVaultFilesChangedEvent({
        payload: event.payload,
        isPodcastRelevantPath,
        allowCoarseFullReindex: !coarseFullReindexScheduled,
      });
      const {paths, coarse} = plan;
      const coarseReason = event.payload?.coarseReason ?? null;
      if (plan.shouldTouchPathsIncrementally) {
        const signature = vaultChangedPathsSignature(paths);
        const now = Date.now();
        const duplicate =
          lastIncrementalIndexTouch?.signature === signature
          && now - lastIncrementalIndexTouch.touchedAtMs < VAULT_INDEX_TOUCH_DEDUP_MS;
        if (!duplicate) {
          lastIncrementalIndexTouch = {signature, touchedAtMs: now};
          vaultSearchIndexTouchPaths(paths).catch(() => undefined);
          vaultFrontmatterIndexTouchPaths(paths).catch(() => undefined);
        }
      }
      if (plan.shouldScheduleFullReindex) {
        if (coarse) {
          coarseFullReindexScheduled = true;
        }
        vaultSearchIndexSchedule().catch(() => undefined);
        vaultFrontmatterIndexSchedule().catch(() => undefined);
      }
      if (coarse) {
        console.warn('[vault-files-changed] coarse invalidation', {
          reason: coarseReason,
          pathCount: paths.length,
          watchSessionId,
          vaultRootHash,
        });
        captureObservabilityMessage({
          message: 'eskerra.desktop.vault_watch_coarse_invalidation',
          level: 'warning',
          extra: {
            reason: coarseReason,
            pathCount: paths.length,
            watchSessionId,
            vaultRootHash,
          },
          tags: {
            obs_surface: 'vault_watch',
            watch_session_id: watchSessionId,
            vault_root_hash: vaultRootHash,
            coarse_reason: coarseReason ?? 'unknown',
          },
          fingerprint: [
            'eskerra.desktop',
            'vault_watch_coarse_invalidation',
            coarseReason ?? 'unknown',
          ],
        });
      }
      subtreeMarkdownCache.invalidateAll();
      vaultBacklinkDiskBodyCacheRef.current = {};
      void refreshNotes(vaultRoot);
      setFsRefreshNonce(n => n + 1);
      // Only rescan podcast catalog when podcast-relevant files change (YYYY podcasts.md or 📻 *.md).
      if (plan.shouldRefreshPodcasts) {
        setPodcastFsNonce(n => n + 1);
      }
      void (async () => {
        try {
          const next = await readVaultSettings(vaultRoot, fs);
          setVaultSettings(next);
        } catch {
          // ignore: transient FS race
        }
      })();
      void reconcileOpenNotesAfterFsChange(plan.pathsForReconcile);
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
    subtreeMarkdownCache,
  ]);

  useEffect(() => {
    if (!vaultRoot) {
      queueMicrotask(() => {
        setVaultMarkdownRefs([]);
      });
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
        setLeading: setInboxEditorYamlLeadingBeforeFrontmatter,
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
    inboxEditorYamlLeadingBeforeFrontmatterRef.current = '';
    queueMicrotask(() => {
      setInboxYamlFrontmatterInner(null);
      setInboxEditorYamlLeadingBeforeFrontmatter('');
    });
    inboxEditorRef.current?.loadMarkdown('', {selection: 'start'});
    scheduleBacklinksDeferOneFrameAfterLoad();
  }, [vaultRoot, selectedUri, inboxEditorRef, scheduleBacklinksDeferOneFrameAfterLoad]);


  useLayoutEffect(() => {
    if (composingNewEntry || !selectedUri) {
      if (backlinksActiveBodyRef.current !== '') {
        queueMicrotask(() => {
          setBacklinksActiveBody('');
        });
      }
      return;
    }
    const snap = inboxContentByUriRef.current[selectedUri] ?? '';
    if (backlinksActiveBodyRef.current === snap) {
      return;
    }
    queueMicrotask(() => {
      setBacklinksActiveBody(snap);
    });
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
        subtreeMarkdownCache.invalidateForMutation(
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
    [vaultRoot, fs, refreshNotes, openMarkdownInEditor, subtreeMarkdownCache],
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
      lastPersistedRef.current = null;
      resetInboxEditorComposeState();
    })();
  }, [resetInboxEditorComposeState]);

  const cancelNewEntry = useCallback(() => {
    void (async () => {
      await flushInboxSaveRef.current();
      setComposingNewEntry(false);
      resetInboxEditorComposeState();
    })();
  }, [resetInboxEditorComposeState]);

  /** Pick where to refocus after the active tab is closed: surviving tab → workspace shell hub → empty. */
  const refocusAfterActiveTabRemoved = useCallback(
    async (
      closedNorm: string,
      nextTabs: readonly EditorWorkspaceTab[],
      nextActive: string | null,
    ) => {
      const activeTab = nextActive ? findTabById(nextTabs, nextActive) : undefined;
      const nextAfterRemove =
        (activeTab ? tabCurrentUri(activeTab) : null)
        ?? firstSurvivorUriFromTabs(nextTabs);
      if (nextAfterRemove) {
        await openMarkdownInEditor(nextAfterRemove, {skipHistory: true});
        return;
      }
      const shellHub = activeTodayHubUriRef.current;
      if (shellHub && shellHub !== closedNorm) {
        await openMarkdownInEditor(shellHub, {workspaceShell: true});
        return;
      }
      clearInboxSelection();
    },
    [openMarkdownInEditor, clearInboxSelection],
  );

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
          setLeading: setInboxEditorYamlLeadingBeforeFrontmatter,
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
        await refocusAfterActiveTabRemoved(norm, nextTabs, nextActive);
      }

      setBusy(true);
      setErr(null);
      try {
        await deleteVaultMarkdownNote(vaultRoot, uri, fs);
        subtreeMarkdownCache.invalidateForMutation(vaultRoot, uri, 'file');
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
    [
      vaultRoot,
      fs,
      refreshNotes,
      subtreeMarkdownCache,
      refocusAfterActiveTabRemoved,
    ],
  );

  const remapInboxStateAfterRename = useCallback(
    (
      uri: string,
      nextUri: string,
      rewritePlan: ReturnType<typeof planVaultWikiLinkRenameMaintenance>,
      applyResult: Awaited<ReturnType<typeof applyVaultWikiLinkRenameMaintenance>>,
    ) => {
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
        remapEditorShellScrollMapExact(editorShellScrollByUriRef.current, uri, nextUri);
        const remappedRenameTabs = remapAllTabsUriPrefix(
          editorWorkspaceTabsRef.current,
          uri,
          nextUri,
        );
        editorWorkspaceTabsRef.current = remappedRenameTabs;
        setEditorWorkspaceTabs(remappedRenameTabs);
      }
    },
    [],
  );

  const applyRenameWithProgress = useCallback(
    async (
      rewritePlan: ReturnType<typeof planVaultWikiLinkRenameMaintenance>,
      oldUri: string,
      newUri: string,
    ) => {
      const showLargeImpactProgress =
        rewritePlan.skippedAmbiguousLinkCount === 0
        && (rewritePlan.touchedFileCount >= LARGE_RENAME_MIN_TOUCHED_FILES
          || rewritePlan.touchedBytes >= LARGE_RENAME_MIN_TOUCHED_BYTES);
      if (showLargeImpactProgress && rewritePlan.touchedFileCount > 0) {
        setRenameLinkProgress({done: 0, total: rewritePlan.touchedFileCount});
      }
      return applyVaultWikiLinkRenameMaintenance({
        fs,
        oldUri,
        newUri,
        updates: rewritePlan.updates,
        onProgress:
          showLargeImpactProgress && rewritePlan.touchedFileCount > 0
            ? (done, total) => {
                setRenameLinkProgress({done, total});
              }
            : undefined,
        yieldEveryWrites: showLargeImpactProgress ? RENAME_APPLY_YIELD_EVERY_WRITES : 0,
      });
    },
    [fs],
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
        const wikiRefs = refToNameAndUriList(vaultMarkdownRefsRef.current);
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

        const planRename = (
          renamedStem: string | null,
          newTargetUri: string,
        ): VaultWikiLinkRenamePlanResult =>
          renamedStem
            ? planVaultWikiLinkRenameMaintenance({
                vaultRoot,
                oldTargetUri: uri,
                renamedStem,
                newTargetUri,
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

        const planStartedAt = performance.now();
        const plannedStem = sanitizeInboxNoteStem(nextDisplayName);
        const preRenamePlan = planRename(plannedStem, uri);
        const planDurationMs = performance.now() - planStartedAt;
        if (preRenamePlan.skippedAmbiguousLinkCount > 0 && !forceApplyDespiteAmbiguity) {
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
        const rewritePlan = planRename(renamedStem, nextUri);
        const applyResult = await applyRenameWithProgress(rewritePlan, uri, nextUri);
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
        });
        remapInboxStateAfterRename(uri, nextUri, rewritePlan, applyResult);
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
        subtreeMarkdownCache.invalidateForMutation(vaultRoot, uri, 'file');
        if (nextUri !== uri) {
          subtreeMarkdownCache.invalidateForMutation(vaultRoot, nextUri, 'file');
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
      subtreeMarkdownCache,
      remapInboxStateAfterRename,
      applyRenameWithProgress,
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

  /**
   * After a vault link resolves to a target URI, route to the right surface:
   * backup merge view, background new tab, foreground new tab on Today surfaces, or normal editor.
   */
  const routeOpenedVaultLink = useCallback(
    async (
      uri: string,
      options: {openInBackgroundTab: boolean; allowBackupMergeView: boolean},
    ): Promise<void> => {
      if (options.allowBackupMergeView && (await tryEnterBackupMergeView(uri))) {
        return;
      }
      if (options.openInBackgroundTab) {
        await openNoteRespectingExistingTab(uri, 'background-new-tab');
        return;
      }
      if (
        isActiveWorkspaceTodayLinkSurface({
          composingNewEntry: composingNewEntryRef.current,
          activeTodayHubUri: activeTodayHubUriRef.current,
          selectedUri: selectedUriRef.current,
        })
      ) {
        await openNoteRespectingExistingTab(uri, 'foreground-new-tab');
        return;
      }
      await openMarkdownInEditor(uri);
    },
    [tryEnterBackupMergeView, openNoteRespectingExistingTab, openMarkdownInEditor],
  );

  /** Apply a canonical wiki-link inner replacement to the right editor (Today Hub cell or main inbox). */
  const replaceWikiLinkInnerAtTargetEditor = useCallback(
    (at: number, expectedInner: string, replacementInner: string) => {
      const hubEd = todayHubCellEditorRef.current;
      if (hubEd && todayHubWikiNavParentRef.current) {
        hubEd.replaceWikiLinkInnerAt({at, expectedInner, replacementInner});
        return;
      }
      inboxEditorRef.current?.replaceWikiLinkInnerAt({at, expectedInner, replacementInner});
    },
    [inboxEditorRef],
  );

  /**
   * Wiki-link target rejected for `path_not_supported`: try opening or creating it as a relative
   * markdown link via `openOrCreateVaultWikiPathMarkdownLink`. Returns whether the link was handled.
   */
  const handleWikiLinkPathNotSupported = useCallback(
    async (args: {inner: string; at: number; openInBackgroundTab: boolean}): Promise<boolean> => {
      if (!vaultRoot) return false;
      const {inner, at, openInBackgroundTab} = args;
      const pathHref = wikiLinkInnerVaultRelativeMarkdownHref(inner);
      if (pathHref == null) {
        return false;
      }
      const base = normalizeVaultBaseUri(vaultRoot);
      const wikiPathFallbackSource = pickVaultLinkFallbackSource({
        base,
        composingNewEntry: composingNewEntryRef.current,
        showTodayHubCanvas: showTodayHubCanvasRef.current,
        todayHubWikiNavParent: todayHubWikiNavParentRef.current,
        selectedUri: selectedUriRef.current,
      });
      const relResult = await openOrCreateVaultWikiPathMarkdownLink({
        inner,
        notes: vaultMarkdownRefsRef.current.map(r => ({name: r.name, uri: r.uri})),
        vaultRoot,
        fs,
        fallbackSourceMarkdownUriOrDir: wikiPathFallbackSource,
      });
      if (relResult.kind === 'cannot_create_parent') {
        setErr(
          'That file was not found on disk (check spelling and special characters). Notebox cannot create notes inside dot-prefixed hidden folders (names starting with .).',
        );
        return true;
      }
      if (relResult.kind !== 'open' && relResult.kind !== 'created') {
        return false;
      }
      if (relResult.kind === 'created') {
        subtreeMarkdownCache.invalidateForMutation(vaultRoot, relResult.uri, 'file');
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
      } else if (relResult.canonicalHref) {
        const pipeAt = inner.indexOf('|');
        const replacementInner =
          pipeAt >= 0
            ? `${relResult.canonicalHref}${inner.slice(pipeAt)}`
            : relResult.canonicalHref;
        replaceWikiLinkInnerAtTargetEditor(at, inner, replacementInner);
      }
      await routeOpenedVaultLink(relResult.uri, {
        openInBackgroundTab,
        allowBackupMergeView: relResult.kind === 'open',
      });
      return true;
    },
    [
      vaultRoot,
      fs,
      refreshNotes,
      replaceWikiLinkInnerAtTargetEditor,
      routeOpenedVaultLink,
      subtreeMarkdownCache,
    ],
  );

  const handleResolvedWikiLinkResult = useCallback(
    async (
      payload: {inner: string; at: number; openInBackgroundTab: boolean},
      result: Awaited<ReturnType<typeof openOrCreateInboxWikiLinkTarget>>,
    ): Promise<void> => {
      const {inner, at, openInBackgroundTab} = payload;
      if (!vaultRoot) return;
      if (result.kind === 'open' || result.kind === 'created') {
        if (result.kind === 'created') {
          subtreeMarkdownCache.invalidateForMutation(vaultRoot, result.uri, 'file');
          await refreshNotes(vaultRoot);
          setFsRefreshNonce(n => n + 1);
        } else if (result.canonicalInner) {
          replaceWikiLinkInnerAtTargetEditor(at, inner, result.canonicalInner);
        }
        await routeOpenedVaultLink(result.uri, {
          openInBackgroundTab,
          allowBackupMergeView: result.kind === 'open',
        });
        return;
      }
      if (result.kind === 'ambiguous') {
        const names = result.notes.map(n => n.name).join(', ');
        setErr(
          `Ambiguous wiki link target: "${inner}" matches multiple notes (${names}).`,
        );
        return;
      }
      if (result.kind === 'unsupported') {
        if (result.reason !== 'path_not_supported') {
          setErr('Wiki link target is empty.');
          return;
        }
        const handled = await handleWikiLinkPathNotSupported({
          inner,
          at,
          openInBackgroundTab,
        });
        if (!handled) {
          setErr(
            `Wiki link targets must be a single note name, not a path (link: "${inner}").`,
          );
        }
      }
    },
    [
      vaultRoot,
      refreshNotes,
      replaceWikiLinkInnerAtTargetEditor,
      routeOpenedVaultLink,
      handleWikiLinkPathNotSupported,
      subtreeMarkdownCache,
    ],
  );

  const activateWikiLink = useCallback(
    async ({inner, at, openInBackgroundTab = false}: VaultWikiLinkActivatePayload) => {
      if (!vaultRoot) {
        return;
      }
      const browserHref = wikiLinkInnerBrowserOpenableHref(inner);
      if (browserHref != null) {
        openSystemBrowserUrl(browserHref.trim()).catch(e => {
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
        await handleResolvedWikiLinkResult({inner, at, openInBackgroundTab}, result);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [vaultRoot, fs, handleResolvedWikiLinkResult],
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
      openInBackgroundTab = false,
    }: VaultRelativeMarkdownLinkActivatePayload) => {
      if (!vaultRoot) {
        return;
      }
      await flushInboxSaveRef.current();
      const base = normalizeVaultBaseUri(vaultRoot);
      const sourceMarkdownUriOrDir = pickVaultLinkFallbackSource({
        base,
        composingNewEntry: composingNewEntryRef.current,
        showTodayHubCanvas: showTodayHubCanvasRef.current,
        todayHubWikiNavParent: todayHubWikiNavParentRef.current,
        selectedUri: selectedUriRef.current,
      });
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
            subtreeMarkdownCache.invalidateForMutation(vaultRoot, result.uri, 'file');
            await refreshNotes(vaultRoot);
            setFsRefreshNonce(n => n + 1);
          } else if (result.canonicalHref) {
            const hubEd = todayHubCellEditorRef.current;
            const replacement = {
              at,
              expectedHref: href,
              replacementHref: result.canonicalHref,
            };
            if (hubEd && todayHubWikiNavParentRef.current) {
              hubEd.replaceMarkdownLinkHrefAt(replacement);
            } else {
              inboxEditorRef.current?.replaceMarkdownLinkHrefAt(replacement);
            }
          }
          await routeOpenedVaultLink(result.uri, {
            openInBackgroundTab,
            allowBackupMergeView: result.kind === 'open',
          });
          return;
        }
        if (result.kind === 'cannot_create_parent') {
          setErr(
            'That file was not found on disk (check spelling and special characters). Notebox cannot create notes inside dot-prefixed hidden folders (names starting with .).',
          );
          return;
        }
        setErr('This link is not a relative vault markdown note.');
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [
      vaultRoot,
      fs,
      refreshNotes,
      inboxEditorRef,
      routeOpenedVaultLink,
      subtreeMarkdownCache,
    ],
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
      openSystemBrowserUrl(href).catch(e => {
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
      const normDir = trimTrailingSlashes(directoryUri.replace(/\\/g, '/'));
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
          setLeading: setInboxEditorYamlLeadingBeforeFrontmatter,
        });
        setEditorBody('');
        setInboxEditorResetNonce(n => n + 1);
      }
      await saveChainRef.current.catch(() => undefined);
      setBusy(true);
      setErr(null);
      try {
        await deleteVaultTreeDirectory(vaultRoot, directoryUri, fs);
        subtreeMarkdownCache.invalidateForMutation(
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
    [vaultRoot, fs, refreshNotes, openMarkdownInEditor, subtreeMarkdownCache],
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
        const oldUri = trimTrailingSlashes(directoryUri.replace(/\\/g, '/'));
        const nextUri = await renameVaultTreeDirectory(
          vaultRoot,
          directoryUri,
          nextDisplayName,
          fs,
        );
        const normalizedNext = nextUri.replace(/\\/g, '/');
        subtreeMarkdownCache.invalidateForMutation(
          vaultRoot,
          oldUri,
          'directory',
        );
        subtreeMarkdownCache.invalidateForMutation(
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
    [vaultRoot, fs, refreshNotes, clearRenameNotice, subtreeMarkdownCache],
  );

  const commitMovedArticleResult = useCallback(
    (previousUri: string, nextUri: string) => {
      setInboxContentByUri(prev => {
        if (prev[previousUri] === undefined) {
          return prev;
        }
        const next = {...prev};
        next[nextUri] = next[previousUri]!;
        delete next[previousUri];
        return next;
      });
      remapEditorShellScrollMapExact(
        editorShellScrollByUriRef.current,
        previousUri,
        nextUri,
      );
      if (selectedUriRef.current !== previousUri) {
        return;
      }
      selectedUriRef.current = nextUri;
      setSelectedUri(nextUri);
      const lp = lastPersistedRef.current;
      if (lp && lp.uri === previousUri) {
        lastPersistedRef.current = {...lp, uri: nextUri};
      }
    },
    [],
  );

  const commitMovedDirectoryResult = useCallback(
    (oldUri: string, newUri: string) => {
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
    },
    [],
  );

  const commitMoveVaultTreeResult = useCallback(
    (result: MoveVaultTreeItemResult) => {
      if (!vaultRoot || result.previousUri === result.nextUri) {
        return;
      }
      const invKind = result.movedKind === 'article' ? 'file' : 'directory';
      subtreeMarkdownCache.invalidateForMutation(vaultRoot, result.previousUri, invKind);
      subtreeMarkdownCache.invalidateForMutation(vaultRoot, result.nextUri, invKind);

      if (result.movedKind === 'article') {
        commitMovedArticleResult(result.previousUri, result.nextUri);
      } else {
        commitMovedDirectoryResult(result.previousUri, result.nextUri);
      }
      const remappedMoveTabs = remapAllTabsUriPrefix(
        editorWorkspaceTabsRef.current,
        result.previousUri,
        result.nextUri,
      );
      editorWorkspaceTabsRef.current = remappedMoveTabs;
      setEditorWorkspaceTabs(remappedMoveTabs);
    },
    [vaultRoot, subtreeMarkdownCache, commitMovedArticleResult, commitMovedDirectoryResult],
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

  const bulkDeleteRemoveVaultEntry = useCallback(
    async (entry: VaultTreeBulkItem, root: string) => {
      if (entry.kind === 'article') {
        await deleteVaultMarkdownNote(root, entry.uri, fs);
        subtreeMarkdownCache.invalidateForMutation(root, entry.uri, 'file');
        setInboxContentByUri(prev => {
          if (prev[entry.uri] === undefined) {
            return prev;
          }
          const next = {...prev};
          delete next[entry.uri];
          return next;
        });
        return;
      }
      const normDir = trimTrailingSlashes(entry.uri.replace(/\\/g, '/'));
      await deleteVaultTreeDirectory(root, entry.uri, fs);
      subtreeMarkdownCache.invalidateForMutation(root, entry.uri, 'directory');
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
    },
    [fs, subtreeMarkdownCache],
  );

  const bulkDeletePruneTabsAndScroll = useCallback(
    (plan: readonly VaultTreeBulkItem[]) => {
      const deletedFiles = new Set<string>();
      const deletedFolders: string[] = [];
      for (const entry of plan) {
        if (entry.kind === 'article') {
          deletedFiles.add(normalizeEditorDocUri(entry.uri));
        } else {
          deletedFolders.push(trimTrailingSlashes(entry.uri.replace(/\\/g, '/')));
        }
      }
      const newTabs = removeUriFromAllTabs(
        editorWorkspaceTabsRef.current,
        u => vaultUriDeletedByTreeChange(u, deletedFiles, deletedFolders),
      );
      const nextActive = ensureActiveTabId(newTabs, activeEditorTabIdRef.current);
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
      return {newTabs, nextActive};
    },
    [],
  );

  const bulkDeleteVaultTreeItems = useCallback(
    async (items: VaultTreeBulkItem[]) => {
      if (!vaultRoot) {
        return;
      }
      const rootId = trimTrailingSlashes(normalizeVaultBaseUri(vaultRoot).replace(/\\/g, '/'));
      const plan = planVaultTreeBulkTargets(items, rootId);
      if (plan.length === 0) {
        return;
      }
      autosaveSchedulerRef.current.cancel();
      const normSel = selectedUriRef.current?.replace(/\\/g, '/');
      const shouldClearEditor =
        normSel != null
        && plan.some(entry => {
          const d = trimTrailingSlashes(entry.uri.replace(/\\/g, '/'));
          if (entry.kind === 'folder' || entry.kind === 'todayHub') {
            return normSel === d || normSel.startsWith(`${d}/`);
          }
          return normSel === d;
        });
      if (shouldClearEditor) {
        clearInboxSelection();
      }
      await saveChainRef.current.catch(() => undefined);
      setBusy(true);
      setErr(null);
      try {
        for (const entry of plan) {
          await bulkDeleteRemoveVaultEntry(entry, vaultRoot);
        }
        const {newTabs, nextActive} = bulkDeletePruneTabsAndScroll(plan);
        if (shouldClearEditor) {
          const activeTab = nextActive ? findTabById(newTabs, nextActive) : undefined;
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
    [
      vaultRoot,
      refreshNotes,
      openMarkdownInEditor,
      bulkDeleteRemoveVaultEntry,
      bulkDeletePruneTabsAndScroll,
      clearInboxSelection,
    ],
  );

  const bulkMoveVaultTreeItems = useCallback(
    async (items: VaultTreeBulkItem[], targetDirectoryUri: string) => {
      if (!vaultRoot) {
        return;
      }
      const rootId = trimTrailingSlashes(normalizeVaultBaseUri(vaultRoot).replace(/\\/g, '/'));
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
          setLeading: setInboxEditorYamlLeadingBeforeFrontmatter,
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
      queueMicrotask(() => {
        setInboxShellRestored(true);
      });
      return;
    }
    queueMicrotask(() => {
      setInboxShellRestored(false);
    });
  }, [vaultRoot]);

  useEffect(() => {
    queueMicrotask(() => {
      setPendingWikiLinkAmbiguityRename(null);
      setRenameLinkProgress(null);
      clearRenameNotice();
    });
  }, [vaultRoot, clearRenameNotice]);

  const applyRestoredEditorWorkspaceTabs = useCallback(
    (
      chosenTabsSource: ReadonlyArray<{id: string; entries: string[]; index: number}>
        | null
        | undefined,
      chosenActiveEditorTabId: string | null,
      filter: (raw: string) => boolean,
    ): string[] => {
      if (chosenTabsSource == null) {
        return [];
      }
      const built = buildRestoredEditorWorkspace({
        chosenTabsSource,
        chosenActiveEditorTabId,
        filter,
      });
      if (built == null) {
        return [];
      }
      editorWorkspaceTabsRef.current = built.tabs;
      activeEditorTabIdRef.current = built.activeEditorTabId;
      queueMicrotask(() => {
        setEditorWorkspaceTabs(built.tabs);
        setActiveEditorTabId(built.activeEditorTabId);
      });
      return built.uris;
    },
    [],
  );

  const migrateLegacyOpenTabsIfNeeded = useCallback(
    (
      rawTabs: readonly string[] | null | undefined,
      filter: (raw: string) => boolean,
    ): string[] => {
      if (
        editorWorkspaceTabsRef.current.length > 0
        || rawTabs == null
        || rawTabs.length === 0
      ) {
        return [];
      }
      const filtered = rawTabs.filter(filter);
      const migrated = migrateOpenTabUrisToWorkspaceTabs(filtered);
      if (migrated.length === 0) {
        return [];
      }
      const nextActive = migrated[0]!.id;
      editorWorkspaceTabsRef.current = migrated;
      activeEditorTabIdRef.current = nextActive;
      queueMicrotask(() => {
        setEditorWorkspaceTabs(migrated);
        setActiveEditorTabId(nextActive);
      });
      return migrated
        .map(t => tabCurrentUri(t))
        .filter((u): u is string => u != null);
    },
    [],
  );

  const restoreInboxSelectionAfterShellRestore = useCallback(
    (root: string, restoredTabs: readonly string[], hubUrisLength: number) => {
      const knownNoteUris = new Set(notesRef.current.map(n => n.uri));
      if (restoredInboxState!.composingNewEntry) {
        startNewEntry();
        return;
      }
      if (restoredInboxState!.selectedUri) {
        const selectedOk = isUriValidVaultMarkdown({
          uri: restoredInboxState!.selectedUri,
          root,
          knownNoteUris,
        });
        if (selectedOk) {
          selectNote(restoredInboxState!.selectedUri);
          return;
        }
        if (restoredTabs.length > 0) {
          selectNote(restoredTabs[0]!);
        }
        return;
      }
      if (restoredTabs.length > 0) {
        selectNote(restoredTabs[0]!);
        return;
      }
      if (
        hubUrisLength > 0
        && editorWorkspaceTabsRef.current.length === 0
        && activeTodayHubUriRef.current
      ) {
        selectNote(activeTodayHubUriRef.current);
      }
    },
    [restoredInboxState, startNewEntry, selectNote],
  );

  useEffect(() => {
    if (!vaultRoot) {
      return;
    }
    if (!inboxRestoreEnabled || inboxShellRestored) {
      return;
    }
    if (restoredInboxState && restoredInboxState.vaultRoot === vaultRoot) {
      const root = trimTrailingSlashes(normalizeVaultBaseUri(vaultRoot).replace(/\\/g, '/'));
      const hubUris = sortedTodayHubNoteUrisFromRefs(vaultMarkdownRefs);
      const knownNoteUris = new Set(notes.map(n => n.uri));
      const filter = makeStoredTabFilter({root, knownNoteUris});

      const {resolvedActiveHub, chosenTabsSource, chosenActiveEditorTabId} =
        resolveActiveHubAndTabsSource({hubUris, restored: restoredInboxState, filter});

      let restoredTabs = applyRestoredEditorWorkspaceTabs(
        chosenTabsSource,
        chosenActiveEditorTabId,
        filter,
      );
      if (restoredTabs.length === 0 && editorWorkspaceTabsRef.current.length === 0) {
        restoredTabs = migrateLegacyOpenTabsIfNeeded(
          restoredInboxState.openTabUris,
          filter,
        );
      }

      if (hubUris.length > 0) {
        const activeHubFinal = pickFinalActiveHub({
          resolvedActiveHub,
          hubUris,
          restored: restoredInboxState,
        });
        const mergedWs = mergeStoredHubWorkspaces({
          hubUris,
          restored: restoredInboxState,
          filter,
          activeHub: activeHubFinal,
          activeHubTabs: editorWorkspaceTabsRef.current,
          activeHubActiveTabId: activeEditorTabIdRef.current,
        });
        activeTodayHubUriRef.current = activeHubFinal;
        queueMicrotask(() => {
          setTodayHubWorkspacesForSave(mergedWs);
          setActiveTodayHubUri(activeHubFinal);
        });
      } else if (vaultMarkdownRefs.length > 0) {
        activeTodayHubUriRef.current = null;
        queueMicrotask(() => {
          setTodayHubWorkspacesForSave({});
          setActiveTodayHubUri(null);
        });
      }

      restoreInboxSelectionAfterShellRestore(root, restoredTabs, hubUris.length);
    }
    queueMicrotask(() => {
      setInboxShellRestored(true);
    });
  }, [
    vaultRoot,
    inboxRestoreEnabled,
    inboxShellRestored,
    restoredInboxState,
    notes,
    vaultMarkdownRefs,
    applyRestoredEditorWorkspaceTabs,
    migrateLegacyOpenTabsIfNeeded,
    restoreInboxSelectionAfterShellRestore,
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
    queueMicrotask(() => {
      setTodayHubWorkspacesForSave(prev => ({
        ...prev,
        [activeTodayHubUri]: {
          editorWorkspaceTabs: tabsToStored(editorWorkspaceTabs),
          activeEditorTabId,
        },
      }));
    });
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
    podcastFsNonce,
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
    subtreeMarkdownCache: subtreeMarkdownCache,
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
    mergeView,
    closeMergeView,
    applyFullBackupFromMerge,
    keepMyEditsFromMerge,
    enterDiskConflictMergeView,
    applyMergedBodyFromMerge,
  };
}
