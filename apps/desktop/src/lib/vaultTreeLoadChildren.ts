import {
  filterVaultTreeDirEntries,
  isEligibleVaultMarkdownFileName,
  shouldPruneVaultTreeSubdirectory,
  type SubtreeMarkdownPresenceCache,
  vaultSubtreeHasEligibleMarkdown,
  type VaultFilesystem,
} from '@notebox/core';

import type {MutableRefObject} from 'react';

export type VaultTreeItemData = {
  kind: 'folder' | 'article';
  name: string;
  uri: string;
  lastModified: number | null;
};

export async function loadVaultTreeVisibleChildIds(options: {
  parentUri: string;
  fs: VaultFilesystem;
  subtreeCache: SubtreeMarkdownPresenceCache;
  itemStoreRef: MutableRefObject<Record<string, VaultTreeItemData>>;
  signal?: AbortSignal;
}): Promise<string[]> {
  const {parentUri, fs, subtreeCache, itemStoreRef, signal} = options;
  const rows = await fs.listFiles(parentUri);
  signal?.throwIfAborted();
  const filtered = filterVaultTreeDirEntries(rows);
  type Entry = (typeof filtered)[number];
  const folders: Entry[] = [];
  const articles: Entry[] = [];
  for (const e of filtered) {
    if (e.type === 'directory') {
      const childFiltered = filterVaultTreeDirEntries(await fs.listFiles(e.uri));
      signal?.throwIfAborted();
      const hasMd = await vaultSubtreeHasEligibleMarkdown(fs, e.uri, {
        signal,
        subtreeCache,
        knownFilteredEntries: childFiltered,
      });
      if (
        shouldPruneVaultTreeSubdirectory({
          filteredChildEntries: childFiltered,
          subtreeHasEligibleMarkdown: hasMd,
        })
      ) {
        continue;
      }
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
