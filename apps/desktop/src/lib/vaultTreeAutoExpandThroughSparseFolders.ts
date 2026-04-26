import type {MutableRefObject} from 'react';

import type {VaultFilesystem} from '@eskerra/core';

import {
  loadVaultTreeVisibleChildRows,
  type VaultTreeChildRow,
  type VaultTreeItemData,
} from './vaultTreeLoadChildren';

const DEFAULT_MAX_DEPTH = 64;

function uriPathDepth(uri: string): number {
  let normalized = uri.replace(/\\/g, '/');
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  const n = normalized.split('/').filter(Boolean).length;
  return Math.max(0, n);
}

export type PickLonelySubfolderOptions = {
  /** Maximum folder depth (by path segment count); stops auto-expand past this level. */
  maxDepth?: number;
  /** URI of the parent whose children were loaded; used with `maxDepth`. */
  parentUri?: string;
};

/**
 * When a directory has no visible markdown children and exactly one visible subfolder,
 * returns that subfolder's id so the tree can expand it automatically.
 * Otherwise returns null.
 */
export function pickLonelySubfolderWhenNoMarkdown(
  childrenIds: readonly string[],
  itemStore: Readonly<Record<string, VaultTreeItemData>>,
  options?: PickLonelySubfolderOptions,
): string | null {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const parentUri = options?.parentUri;
  if (parentUri !== undefined && uriPathDepth(parentUri) >= maxDepth) {
    return null;
  }

  let folderId: string | null = null;
  for (const id of childrenIds) {
    const row = itemStore[id];
    if (!row) {
      continue;
    }
    if (row.kind === 'article' || row.kind === 'todayHub') {
      return null;
    }
    if (row.kind === 'folder') {
      if (folderId !== null) {
        return null;
      }
      folderId = id;
    }
  }
  return folderId;
}

export type SparseLonelyExpandBatch = {
  parentUri: string;
  rows: VaultTreeChildRow[];
};

/**
 * Prefetches visible child rows along a chain of "lonely" subfolders (no markdown siblings)
 * using the same ordering as `loadVaultTreeVisibleChildRows`, without touching headless-tree.
 * `loadChildRows` is injectable for tests.
 */
export async function buildSparseLonelyExpandPlan(options: {
  firstLonelyUri: string;
  itemStoreRef: MutableRefObject<Record<string, VaultTreeItemData>>;
  loadChildRows: (parentUri: string) => Promise<VaultTreeChildRow[]>;
}): Promise<{
  expandChain: string[];
  cacheBatches: SparseLonelyExpandBatch[];
}> {
  const {firstLonelyUri, itemStoreRef, loadChildRows} = options;
  const expandChain: string[] = [];
  const cacheBatches: SparseLonelyExpandBatch[] = [];
  let next: string | null = firstLonelyUri;

  while (next) {
    expandChain.push(next);
    const rows = await loadChildRows(next);
    cacheBatches.push({parentUri: next, rows});
    const ids = rows.map(r => r.id);
    const parentUri = next;
    next = pickLonelySubfolderWhenNoMarkdown(ids, itemStoreRef.current, {
      parentUri,
    });
  }

  return {expandChain, cacheBatches};
}

/** Adapter: same FS + store wiring as the vault tree data loader. */
export function createVaultSparsePlanLoader(options: {
  fs: VaultFilesystem;
  itemStoreRef: MutableRefObject<Record<string, VaultTreeItemData>>;
  signal?: AbortSignal;
}): (parentUri: string) => Promise<VaultTreeChildRow[]> {
  const {fs, itemStoreRef, signal} = options;
  return (parentUri: string) =>
    loadVaultTreeVisibleChildRows({
      parentUri,
      fs,
      itemStoreRef,
      signal,
    });
}
