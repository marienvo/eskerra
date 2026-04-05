import type {VaultTreeItemData} from './vaultTreeLoadChildren';

const DEFAULT_MAX_DEPTH = 64;

function uriPathDepth(uri: string): number {
  const n = uri.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean).length;
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
    if (row.kind === 'article') {
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
