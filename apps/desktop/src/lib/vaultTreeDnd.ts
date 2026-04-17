import type {VaultTreeBulkItem} from './vaultTreeBulkPlan';
import type {VaultTreeItemData} from './vaultTreeLoadChildren';

export const VAULT_TREE_DND_MIME = 'application/x-eskerra-vault-tree';

export type VaultTreeDndPayloadItem = {
  uri: string;
  kind: 'folder' | 'article' | 'todayHub';
};

export type VaultTreeDndPayload = {
  uri: string;
  kind: VaultTreeDndPayloadItem['kind'];
  items?: VaultTreeDndPayloadItem[];
};

function isVaultTreeDndKind(kind: unknown): kind is VaultTreeDndPayloadItem['kind'] {
  return kind === 'folder' || kind === 'article' || kind === 'todayHub';
}

function isBulkPayloadItem(x: unknown): x is VaultTreeDndPayloadItem {
  if (!x || typeof x !== 'object') {
    return false;
  }
  const o = x as {uri?: unknown; kind?: unknown};
  return typeof o.uri === 'string' && isVaultTreeDndKind(o.kind);
}

/**
 * JSON for `dataTransfer.setData(VAULT_TREE_DND_MIME, …)`.
 * When the dragged row is part of a multi-selection in the source tree, includes `items` so the
 * drop target tree (possibly another pane) can bulk-move without reading that pane's selection.
 */
export function serializeVaultTreeDragPayload(options: {
  draggedUri: string;
  draggedKind: VaultTreeItemData['kind'];
  selectedItemIds: readonly string[];
  rootId: string;
  getRow: (id: string) => VaultTreeItemData | undefined;
}): string {
  const {draggedUri, draggedKind, selectedItemIds, rootId, getRow} = options;
  const base: VaultTreeDndPayload = {uri: draggedUri, kind: draggedKind};
  const multi =
    selectedItemIds.length > 1 && selectedItemIds.includes(draggedUri);
  if (!multi) {
    return JSON.stringify(base);
  }
  const items: VaultTreeDndPayloadItem[] = [];
  for (const id of selectedItemIds) {
    if (id === rootId) {
      continue;
    }
    const row = getRow(id);
    if (row?.uri && isVaultTreeDndKind(row.kind)) {
      items.push({uri: row.uri, kind: row.kind});
    }
  }
  if (items.length <= 1) {
    return JSON.stringify(base);
  }
  return JSON.stringify({...base, items} satisfies VaultTreeDndPayload);
}

export type VaultTreeDropResolution =
  | {ok: false}
  | {
      ok: true;
      mode: 'single';
      sourceUri: string;
      sourceKind: 'folder' | 'article';
    }
  | {ok: true; mode: 'bulk'; items: VaultTreeBulkItem[]};

/**
 * Parses drag MIME JSON and decides single vs bulk move (bulk only when `items` was set on drag).
 */
export function resolveVaultTreeDropFromMime(raw: string): VaultTreeDropResolution {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {ok: false};
  }
  if (!parsed || typeof parsed !== 'object') {
    return {ok: false};
  }
  const o = parsed as {uri?: unknown; kind?: unknown; items?: unknown};
  if (typeof o.uri !== 'string' || !isVaultTreeDndKind(o.kind)) {
    return {ok: false};
  }
  const primaryUri = o.uri;
  const primaryKind = o.kind;

  const itemsRaw = o.items;
  if (
    Array.isArray(itemsRaw)
    && itemsRaw.length > 1
    && itemsRaw.every(isBulkPayloadItem)
    && itemsRaw.some(i => i.uri === primaryUri)
  ) {
    const items: VaultTreeBulkItem[] = itemsRaw.map(i => ({
      uri: i.uri,
      kind: i.kind,
    }));
    return {ok: true, mode: 'bulk', items};
  }

  const moveSourceKind: 'folder' | 'article' =
    primaryKind === 'article' ? 'article' : 'folder';
  return {
    ok: true,
    mode: 'single',
    sourceUri: primaryUri,
    sourceKind: moveSourceKind,
  };
}
