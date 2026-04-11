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
