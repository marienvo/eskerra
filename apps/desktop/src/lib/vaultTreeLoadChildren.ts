import {
  filterVaultTreeDirEntries,
  isEligibleVaultMarkdownFileName,
  type VaultFilesystem,
} from '@eskerra/core';

import type {MutableRefObject} from 'react';

export type VaultTreeItemData = {
  kind: 'folder' | 'article';
  name: string;
  uri: string;
  lastModified: number | null;
};

export type VaultTreeChildRow = {id: string; data: VaultTreeItemData};

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
  type Entry = (typeof filtered)[number];
  const folders: Entry[] = [];
  const articles: Entry[] = [];
  for (const e of filtered) {
    if (e.type === 'directory') {
      folders.push(e);
    } else if (isEligibleVaultMarkdownFileName(e.name)) {
      articles.push(e);
    }
  }

  const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name);
  folders.sort(byName);
  articles.sort(byName);
  const ordered = [...folders, ...articles];
  const out: VaultTreeChildRow[] = [];
  for (const e of ordered) {
    const isDir = e.type === 'directory';
    const payload: VaultTreeItemData = {
      kind: isDir ? 'folder' : 'article',
      name: e.name,
      uri: e.uri,
      lastModified: e.lastModified,
    };
    itemStoreRef.current[e.uri] = payload;
    out.push({id: e.uri, data: payload});
  }
  return out;
}
