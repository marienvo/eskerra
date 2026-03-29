import {invoke} from '@tauri-apps/api/core';
import type {VaultDirEntry, VaultFilesystem} from '@notebox/core';

type ListRow = {
  uri: string;
  name: string;
  lastModified: number | null;
  type: string;
};

function mapRow(r: ListRow): VaultDirEntry {
  return {
    uri: r.uri,
    name: r.name,
    lastModified: r.lastModified,
    type: r.type as VaultDirEntry['type'],
  };
}

/**
 * VaultFilesystem backed by Tauri `vault_*` commands (POSIX paths under the selected vault root).
 */

export function createTauriVaultFilesystem(): VaultFilesystem {
  return {
    exists: path => invoke<boolean>('vault_exists', {path}),
    mkdir: path => invoke('vault_mkdir', {path}),
    readFile: (path, options) => {
      if (options.encoding !== 'utf8') {
        throw new Error('Only utf8 is supported');
      }
      return invoke<string>('vault_read_file', {path});
    },
    writeFile: (path, content, options) => {
      if (options.encoding !== 'utf8') {
        throw new Error('Only utf8 is supported');
      }
      return invoke('vault_write_file', {path, contents: content});
    },
    unlink: path => invoke('vault_remove_file', {path}),
    listFiles: async path => {
      const rows = await invoke<ListRow[]>('vault_list_dir', {path});
      return rows.map(mapRow);
    },
  };
}

export async function setVaultSession(rootPath: string): Promise<void> {
  await invoke('vault_set_session', {rootPath});
}

export async function getVaultSession(): Promise<string | null> {
  const v = await invoke<string | null>('vault_get_session');
  return v;
}

export async function startVaultWatch(): Promise<void> {
  await invoke('vault_start_watch');
}
