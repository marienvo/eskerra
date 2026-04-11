import {invoke} from '@tauri-apps/api/core';

export async function vaultSearchStart(options: {
  searchId: string;
  query: string;
  workerCount?: number;
}): Promise<void> {
  await invoke('vault_search_start', {
    searchId: options.searchId,
    query: options.query,
    workerCount: options.workerCount,
  });
}

export async function vaultSearchCancel(): Promise<void> {
  await invoke('vault_search_cancel');
}

/** Deferred full index rebuild after vault session is ready (non-blocking in Rust). */
export async function vaultSearchIndexSchedule(): Promise<void> {
  await invoke('vault_search_index_schedule');
}

/** Incremental reindex for filesystem paths (absolute) after `vault-files-changed`. */
export async function vaultSearchIndexTouchPaths(paths: string[]): Promise<void> {
  await invoke('vault_search_index_touch_paths', {paths});
}
