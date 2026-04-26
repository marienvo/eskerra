/**
 * Bulk vault tree delete → editor tab strip and per-URI scroll snapshot cleanup.
 *
 * Ownership: pure tab/scroll pruning from a resolved bulk-delete plan; I/O stays in workspace hook.
 */

import {normalizeEditorDocUri, vaultUriDeletedByTreeChange} from '../lib/editorDocumentHistory';
import {
  ensureActiveTabId,
  removeUriFromAllTabs,
  type EditorWorkspaceTab,
} from '../lib/editorWorkspaceTabs';
import type {VaultTreeBulkItem} from '../lib/vaultTreeBulkPlan';

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}

export function collectDeletedPathsFromBulkPlan(plan: readonly VaultTreeBulkItem[]): {
  deletedFiles: Set<string>;
  deletedFolders: string[];
} {
  const deletedFiles = new Set<string>();
  const deletedFolders: string[] = [];
  for (const entry of plan) {
    if (entry.kind === 'article') {
      deletedFiles.add(normalizeEditorDocUri(entry.uri));
    } else {
      deletedFolders.push(trimTrailingSlashes(entry.uri.replace(/\\/g, '/')));
    }
  }
  return {deletedFiles, deletedFolders};
}

export function pruneEditorTabsAfterBulkTreeDelete(args: {
  editorWorkspaceTabs: readonly EditorWorkspaceTab[];
  activeEditorTabId: string | null;
  plan: readonly VaultTreeBulkItem[];
  /** When provided, returns scroll-map keys that should be removed (same predicate as open tabs). */
  scrollMapKeys?: Iterable<string>;
}): {
  newTabs: EditorWorkspaceTab[];
  nextActive: string | null;
  scrollKeysToRemove: string[];
} {
  const {deletedFiles, deletedFolders} = collectDeletedPathsFromBulkPlan(args.plan);
  const newTabs = removeUriFromAllTabs(
    args.editorWorkspaceTabs,
    u => vaultUriDeletedByTreeChange(u, deletedFiles, deletedFolders),
  );
  const nextActive = ensureActiveTabId(newTabs, args.activeEditorTabId);
  const scrollKeysToRemove =
    args.scrollMapKeys == null
      ? []
      : [...args.scrollMapKeys].filter(k =>
          vaultUriDeletedByTreeChange(k, deletedFiles, deletedFolders),
        );
  return {newTabs, nextActive, scrollKeysToRemove};
}
