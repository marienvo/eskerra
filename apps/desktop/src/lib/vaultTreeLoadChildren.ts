import {
  filterVaultTreeDirEntries,
  isEligibleVaultMarkdownFileName,
  type VaultDirEntry,
  type VaultFilesystem,
} from '@eskerra/core';

import type {MutableRefObject} from 'react';

/** Eligible markdown files with this exact name inside a directory make that directory a Today hub. */
export const VAULT_TREE_TODAY_HUB_NOTE_NAME = 'Today.md';

/** Last path segment is exactly {@link VAULT_TREE_TODAY_HUB_NOTE_NAME} (vault URI; normalizes `\\`). */
export function vaultUriIsTodayMarkdownFile(uri: string): boolean {
  const norm = uri.replace(/\\/g, '/').replace(/\/+$/, '');
  const seg = norm.split('/').pop() ?? '';
  return seg === VAULT_TREE_TODAY_HUB_NOTE_NAME;
}

export type VaultTreeItemData = {
  kind: 'folder' | 'article' | 'todayHub';
  name: string;
  uri: string;
  lastModified: number | null;
  /** Set when `kind === 'todayHub'`: opens this markdown path. */
  todayNoteUri?: string;
};

/** Sidebar uses the Material `today` glyph for hub rows and for `Today.md` article rows. */
export function vaultTreeItemShowsTodaySidebarIcon(data: VaultTreeItemData): boolean {
  if (data.kind === 'todayHub') {
    return true;
  }
  return data.kind === 'article' && data.name === VAULT_TREE_TODAY_HUB_NOTE_NAME;
}

export type VaultTreeChildRow = {id: string; data: VaultTreeItemData};

/** Same ordering as the vault tree: directories A–Z, then eligible markdown A–Z. */
export function orderVaultTreeVisibleDirEntries(
  filtered: readonly VaultDirEntry[],
): VaultDirEntry[] {
  const folders: VaultDirEntry[] = [];
  const articles: VaultDirEntry[] = [];
  for (const e of filtered) {
    if (e.type === 'directory') {
      folders.push(e);
    } else if (isEligibleVaultMarkdownFileName(e.name)) {
      articles.push(e);
    }
  }
  const byName = (a: VaultDirEntry, b: VaultDirEntry) => a.name.localeCompare(b.name);
  folders.sort(byName);
  articles.sort(byName);
  return [...folders, ...articles];
}

function isTodayHubMarkdownFileEntry(e: VaultDirEntry): boolean {
  return (
    e.type === 'file'
    && e.name === VAULT_TREE_TODAY_HUB_NOTE_NAME
    && isEligibleVaultMarkdownFileName(e.name)
  );
}

/**
 * Returns `Today.md` URI if this directory directly contains that note, else null.
 */
export async function getTodayHubDirectoryInfo(options: {
  directoryUri: string;
  fs: VaultFilesystem;
  signal?: AbortSignal;
}): Promise<{todayNoteUri: string | null}> {
  const {directoryUri, fs, signal} = options;
  const rows = await fs.listFiles(directoryUri);
  signal?.throwIfAborted();
  const ordered = orderVaultTreeVisibleDirEntries(filterVaultTreeDirEntries(rows));
  const today = ordered.find(isTodayHubMarkdownFileEntry);
  return {todayNoteUri: today ? today.uri : null};
}

/**
 * @deprecated Prefer getTodayHubDirectoryInfo; kept for call sites/tests that only need the note URI.
 */
export async function getTodayHubNoteUriIfDirectoryIsHub(options: {
  directoryUri: string;
  fs: VaultFilesystem;
  signal?: AbortSignal;
}): Promise<string | null> {
  const info = await getTodayHubDirectoryInfo(options);
  return info.todayNoteUri;
}

/**
 * Lists visible children for the vault tree using one `listFiles` + non-recursive filters only.
 * Returns id + payload for async loaders that apply item data before rebuilding (stale-while-revalidate friendly).
 */
export async function loadVaultTreeVisibleChildRows(options: {
  parentUri: string;
  fs: VaultFilesystem;
  itemStoreRef: MutableRefObject<Record<string, VaultTreeItemData>>;
  signal?: AbortSignal;
}): Promise<VaultTreeChildRow[]> {
  const {parentUri, fs, itemStoreRef, signal} = options;
  const rows = await fs.listFiles(parentUri);
  signal?.throwIfAborted();
  const filtered = filterVaultTreeDirEntries(rows);
  const ordered = orderVaultTreeVisibleDirEntries(filtered);

  const dirEntries = ordered.filter((e): e is VaultDirEntry & {type: 'directory'} => e.type === 'directory');
  const hubByDirUri = new Map<string, string | null>();
  await Promise.all(
    dirEntries.map(async e => {
      const info = await getTodayHubDirectoryInfo({
        directoryUri: e.uri,
        fs,
        signal,
      });
      hubByDirUri.set(e.uri, info.todayNoteUri);
    }),
  );

  const byName = (a: VaultDirEntry, b: VaultDirEntry) => a.name.localeCompare(b.name);
  const hubFolders: (VaultDirEntry & {type: 'directory'})[] = [];
  const normalFolders: (VaultDirEntry & {type: 'directory'})[] = [];
  for (const e of dirEntries) {
    const todayUri = hubByDirUri.get(e.uri) ?? null;
    if (todayUri !== null) {
      hubFolders.push(e);
    } else {
      normalFolders.push(e);
    }
  }
  hubFolders.sort(byName);
  normalFolders.sort(byName);
  const articleEntries = ordered.filter(e => e.type !== 'directory');
  const visitationOrder: VaultDirEntry[] = [...hubFolders, ...normalFolders, ...articleEntries];

  const out: VaultTreeChildRow[] = [];
  for (const e of visitationOrder) {
    if (e.type === 'directory') {
      const todayUri = hubByDirUri.get(e.uri) ?? null;
      const payload: VaultTreeItemData =
        todayUri !== null
          ? {
              kind: 'todayHub',
              name: e.name,
              uri: e.uri,
              lastModified: e.lastModified,
              todayNoteUri: todayUri,
            }
          : {
              kind: 'folder',
              name: e.name,
              uri: e.uri,
              lastModified: e.lastModified,
            };
      itemStoreRef.current[e.uri] = payload;
      out.push({id: e.uri, data: payload});
    } else {
      const payload: VaultTreeItemData = {
        kind: 'article',
        name: e.name,
        uri: e.uri,
        lastModified: e.lastModified,
      };
      itemStoreRef.current[e.uri] = payload;
      out.push({id: e.uri, data: payload});
    }
  }
  return out;
}
