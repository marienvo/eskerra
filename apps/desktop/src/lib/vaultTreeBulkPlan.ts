import type {VaultTreeItemData} from './vaultTreeLoadChildren';

export type VaultTreeBulkItem = {
  uri: string;
  kind: VaultTreeItemData['kind'];
};

export function normalizeVaultTreePath(uri: string): string {
  let normalized = uri.replace(/\\/g, '/');
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Removes duplicate paths, drops items under a selected folder (folder delete/move covers them),
 * and sorts deepest-first so children are processed before parents.
 */
export function planVaultTreeBulkTargets(
  items: VaultTreeBulkItem[],
  vaultRootId: string,
): VaultTreeBulkItem[] {
  const root = normalizeVaultTreePath(vaultRootId);
  const byUri = new Map<string, VaultTreeBulkItem>();
  for (const raw of items) {
    const uri = normalizeVaultTreePath(raw.uri);
    if (uri === root || !uri.startsWith(`${root}/`)) {
      continue;
    }
    byUri.set(uri, {uri, kind: raw.kind});
  }
  const list = [...byUri.values()];
  list.sort((a, b) => a.uri.length - b.uri.length || a.uri.localeCompare(b.uri));
  const minimal: VaultTreeBulkItem[] = [];
  for (const item of list) {
    if (minimal.some(p => p.uri === item.uri)) {
      continue;
    }
    const underSelectedFolder = minimal.some(
      p =>
        (p.kind === 'folder' || p.kind === 'todayHub')
        && item.uri !== p.uri
        && item.uri.startsWith(`${p.uri}/`),
    );
    if (underSelectedFolder) {
      continue;
    }
    minimal.push(item);
  }
  minimal.sort((a, b) => {
    const da = a.uri.split('/').filter(Boolean).length;
    const db = b.uri.split('/').filter(Boolean).length;
    return db - da || a.uri.localeCompare(b.uri);
  });
  return minimal;
}

/**
 * Strips moves that are no-ops or invalid relative to `targetDirectoryUri` (already under target,
 * source is target, or folder into its own subtree). Expects `items` already de-duplicated; runs
 * {@link planVaultTreeBulkTargets} first.
 */
export function filterVaultTreeBulkMoveSources(
  items: VaultTreeBulkItem[],
  targetDirectoryUri: string,
  vaultRootId: string,
): VaultTreeBulkItem[] {
  const target = normalizeVaultTreePath(targetDirectoryUri);
  const planned = planVaultTreeBulkTargets(items, vaultRootId);
  return planned.filter(s => {
    if (s.uri === target) {
      return false;
    }
    if (s.uri.startsWith(`${target}/`)) {
      return false;
    }
    if ((s.kind === 'folder' || s.kind === 'todayHub') && target.startsWith(`${s.uri}/`)) {
      return false;
    }
    return true;
  });
}
