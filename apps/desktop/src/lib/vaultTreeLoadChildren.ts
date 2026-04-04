import {
  filterVaultTreeDirEntries,
  isEligibleVaultMarkdownFileName,
  type VaultFilesystem,
} from '@notebox/core';

import type {MutableRefObject} from 'react';

export type VaultTreeItemData = {
  kind: 'folder' | 'article';
  name: string;
  uri: string;
  lastModified: number | null;
};

/**
 * Lists visible children for the vault tree using one `listFiles` + non-recursive filters only.
 * Subtree-based pruning (empty-looking folders) is deferred; expansion stays on the direct listing path.
 */
export async function loadVaultTreeVisibleChildIds(options: {
  parentUri: string;
  fs: VaultFilesystem;
  itemStoreRef: MutableRefObject<Record<string, VaultTreeItemData>>;
  signal?: AbortSignal;
}): Promise<string[]> {
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
  const ids: string[] = [];
  for (const e of ordered) {
    const isDir = e.type === 'directory';
    const payload: VaultTreeItemData = {
      kind: isDir ? 'folder' : 'article',
      name: e.name,
      uri: e.uri,
      lastModified: e.lastModified,
    };
    itemStoreRef.current[e.uri] = payload;
    ids.push(e.uri);
  }
  return ids;
}
