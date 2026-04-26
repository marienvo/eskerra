/**
 * IDE-style editor tabs: each tab has its own {@link EditorDocumentHistoryState}.
 */

import type {EditorDocumentHistoryState} from './editorDocumentHistory';
import {
  normalizeEditorDocUri,
  pushEditorHistoryEntry,
  remapEditorHistoryPrefix,
  removeEditorHistoryUris,
} from './editorDocumentHistory';
import type {ClosedEditorTabRecord} from './editorClosedTabStack';

export type EditorWorkspaceTab = {
  id: string;
  history: EditorDocumentHistoryState;
};

let editorTabIdSeq = 0;

export function createEditorWorkspaceTabId(): string {
  editorTabIdSeq += 1;
  return `etab-${Date.now().toString(36)}-${editorTabIdSeq}`;
}

/** Single-note tab (e.g. new tab or restore). */
export function createEditorWorkspaceTab(
  initialUri: string,
  id: string = createEditorWorkspaceTabId(),
): EditorWorkspaceTab {
  const n = normalizeEditorDocUri(initialUri);
  return {
    id,
    history: n ? {entries: [n], index: 0} : {entries: [], index: -1},
  };
}

export function tabCurrentUri(tab: EditorWorkspaceTab): string | null {
  const {entries, index} = tab.history;
  if (index < 0 || index >= entries.length) {
    return null;
  }
  return entries[index]!;
}

export function pickNeighborTabIdAfterRemovingTab(
  tabs: readonly EditorWorkspaceTab[],
  removedId: string,
): string | null {
  const idx = tabs.findIndex(t => t.id === removedId);
  if (idx < 0 || tabs.length <= 1) {
    return null;
  }
  if (idx + 1 < tabs.length) {
    return tabs[idx + 1]!.id;
  }
  return tabs[idx - 1]!.id;
}

/**
 * All distinct normalized markdown URIs referenced in any tab history (open + back-stack).
 */
export function collectDistinctUrisFromTabs(tabs: readonly EditorWorkspaceTab[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tabs) {
    for (const u of t.history.entries) {
      const n = normalizeEditorDocUri(u);
      if (n && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

export function findTabById(
  tabs: readonly EditorWorkspaceTab[],
  tabId: string,
): EditorWorkspaceTab | undefined {
  return tabs.find(t => t.id === tabId);
}

/** Tab id whose {@link tabCurrentUri} equals `uri` after normalization, if any. */
export function findTabIdWithCurrentUri(
  tabs: readonly EditorWorkspaceTab[],
  uri: string,
): string | null {
  const targetNorm = normalizeEditorDocUri(uri);
  for (const t of tabs) {
    const cur = tabCurrentUri(t);
    if (cur != null && normalizeEditorDocUri(cur) === targetNorm) {
      return t.id;
    }
  }
  return null;
}

/** Insert `newTab` immediately after the tab with `activeId`, or at index 0 if none. */
export function insertTabAfterActive(
  tabs: readonly EditorWorkspaceTab[],
  activeId: string | null,
  newTab: EditorWorkspaceTab,
): EditorWorkspaceTab[] {
  const idx = activeId == null ? -1 : tabs.findIndex(t => t.id === activeId);
  const insertAt = idx < 0 ? 0 : idx + 1;
  const out = [...tabs];
  out.splice(insertAt, 0, newTab);
  return out;
}

/** Insert `newTab` at `index`, clamped to `[0, tabs.length]`. */
export function insertTabAtIndex(
  tabs: readonly EditorWorkspaceTab[],
  index: number,
  newTab: EditorWorkspaceTab,
): EditorWorkspaceTab[] {
  const clamped = Math.max(0, Math.min(index, tabs.length));
  const out = [...tabs];
  out.splice(clamped, 0, newTab);
  return out;
}

/**
 * Move the tab at `fromIndex` so it ends up immediately before the tab that is
 * currently at `insertBeforeIndex` (0 = start, `tabs.length` = end).
 * Indices refer to the array **before** the move.
 */
export function reorderEditorWorkspaceTabsInArray(
  tabs: readonly EditorWorkspaceTab[],
  fromIndex: number,
  insertBeforeIndex: number,
): EditorWorkspaceTab[] {
  const n = tabs.length;
  if (n <= 1) {
    return [...tabs];
  }
  if (fromIndex < 0 || fromIndex >= n) {
    return [...tabs];
  }
  const cappedInsert = Math.max(0, Math.min(insertBeforeIndex, n));
  const list = [...tabs];
  const [item] = list.splice(fromIndex, 1);
  if (!item) {
    return [...tabs];
  }
  let dest = cappedInsert;
  if (fromIndex < cappedInsert) {
    dest = cappedInsert - 1;
  }
  dest = Math.max(0, Math.min(dest, list.length));
  list.splice(dest, 0, item);
  return list;
}

export function ensureActiveTabId(
  tabs: readonly EditorWorkspaceTab[],
  activeId: string | null,
): string | null {
  if (tabs.length === 0) {
    return null;
  }
  if (activeId && tabs.some(t => t.id === activeId)) {
    return activeId;
  }
  return tabs[0]!.id;
}

export function pushNavigateOnTab(
  tab: EditorWorkspaceTab,
  uri: string,
): EditorWorkspaceTab {
  return {
    ...tab,
    history: pushEditorHistoryEntry(tab.history, uri),
  };
}

export function mapTabHistories(
  tabs: EditorWorkspaceTab[],
  mapFn: (h: EditorDocumentHistoryState) => EditorDocumentHistoryState,
): EditorWorkspaceTab[] {
  return tabs.map(t => ({...t, history: mapFn(t.history)}));
}

export function remapAllTabsUriPrefix(
  tabs: EditorWorkspaceTab[],
  oldPrefix: string,
  newPrefix: string,
): EditorWorkspaceTab[] {
  return mapTabHistories(tabs, h =>
    remapEditorHistoryPrefix(h, oldPrefix, newPrefix),
  );
}

export function removeUriFromAllTabs(
  tabs: EditorWorkspaceTab[],
  shouldRemove: (normalizedUri: string) => boolean,
): EditorWorkspaceTab[] {
  return tabs
    .map(t => ({
      ...t,
      history: removeEditorHistoryUris(t.history, shouldRemove),
    }))
    .filter(t => t.history.entries.length > 0);
}

/**
 * After `removeUriFromAllTabs`, pick a URI to show when the previous selection was deleted.
 */
export function firstSurvivorUriFromTabs(tabs: readonly EditorWorkspaceTab[]): string | null {
  for (const t of tabs) {
    const u = tabCurrentUri(t);
    if (u) {
      return u;
    }
  }
  return null;
}

/**
 * Push closed-tab records for reopen (most recently closed from the right, excluding keep).
 */
export function pushClosedWorkspaceTabsFromCloseOther(
  stack: ClosedEditorTabRecord[],
  prevTabs: readonly EditorWorkspaceTab[],
  keepTabId: string,
): void {
  for (let i = prevTabs.length - 1; i >= 0; i--) {
    const t = prevTabs[i]!;
    if (t.id === keepTabId) {
      continue;
    }
    const u = tabCurrentUri(t);
    if (u) {
      stack.push({uri: u, index: i});
    }
  }
}

function pushAllTabUrisToClosedStackRightToLeft(
  stack: ClosedEditorTabRecord[],
  prevTabs: readonly EditorWorkspaceTab[],
): void {
  for (let i = prevTabs.length - 1; i >= 0; i--) {
    const u = tabCurrentUri(prevTabs[i]!);
    if (u) {
      stack.push({uri: u, index: i});
    }
  }
}

function pushClosedTabsExceptActiveThenActive(
  stack: ClosedEditorTabRecord[],
  prevTabs: readonly EditorWorkspaceTab[],
  active: string,
): void {
  for (let i = prevTabs.length - 1; i >= 0; i--) {
    const t = prevTabs[i]!;
    if (t.id !== active) {
      const u = tabCurrentUri(t);
      if (u) {
        stack.push({uri: u, index: i});
      }
    }
  }
  const activeIdx = prevTabs.findIndex(t => t.id === active);
  const at = prevTabs.find(t => t.id === active);
  const selU = at ? tabCurrentUri(at) : null;
  if (selU && activeIdx >= 0) {
    stack.push({uri: selU, index: activeIdx});
  }
}

export function pushClosedWorkspaceTabsFromCloseAll(
  stack: ClosedEditorTabRecord[],
  prevTabs: readonly EditorWorkspaceTab[],
  activeTabId: string | null,
): void {
  if (prevTabs.length === 0) {
    return;
  }
  const active =
    activeTabId && prevTabs.some(t => t.id === activeTabId) ? activeTabId : null;
  if (active) {
    pushClosedTabsExceptActiveThenActive(stack, prevTabs, active);
  } else {
    pushAllTabUrisToClosedStackRightToLeft(stack, prevTabs);
  }
}

/** Stored shape for main window UI persistence. */
export type StoredEditorWorkspaceTab = {
  id: string;
  entries: string[];
  index: number;
};

export function tabsToStored(tabs: readonly EditorWorkspaceTab[]): StoredEditorWorkspaceTab[] {
  return tabs.map(t => ({
    id: t.id,
    entries: [...t.history.entries],
    index: t.history.index,
  }));
}

export function tabsFromStored(
  stored: readonly StoredEditorWorkspaceTab[],
): EditorWorkspaceTab[] {
  const out: EditorWorkspaceTab[] = [];
  for (const s of stored) {
    if (typeof s.id !== 'string' || !s.id.trim()) {
      continue;
    }
    const entries = Array.isArray(s.entries)
      ? s.entries.map(e => normalizeEditorDocUri(String(e))).filter(Boolean)
      : [];
    let index = typeof s.index === 'number' ? Math.floor(s.index) : -1;
    if (entries.length === 0) {
      continue;
    }
    if (index < 0 || index >= entries.length) {
      index = entries.length - 1;
    }
    out.push({id: s.id.trim(), history: {entries, index}});
  }
  return out;
}

export function migrateOpenTabUrisToWorkspaceTabs(uris: readonly string[]): EditorWorkspaceTab[] {
  const list = uris
    .map(u => normalizeEditorDocUri(String(u)))
    .filter(Boolean);
  const seen = new Set<string>();
  const out: EditorWorkspaceTab[] = [];
  for (const u of list) {
    if (seen.has(u)) {
      continue;
    }
    seen.add(u);
    out.push(createEditorWorkspaceTab(u));
  }
  return out;
}

/** Vitest harness: reset tab id sequence so id-sensitive tests do not leak across cases. */
export function __resetForTests(): void {
  editorTabIdSeq = 0;
}
