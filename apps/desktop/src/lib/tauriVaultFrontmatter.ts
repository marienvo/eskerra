import {invoke} from '@tauri-apps/api/core';

/** Deferred full frontmatter stats scan after vault session is ready (Rust background thread). */
export async function vaultFrontmatterIndexSchedule(): Promise<void> {
  await invoke('vault_frontmatter_index_schedule');
}

/** Incremental re-index for filesystem paths after `vault-files-changed`. */
export async function vaultFrontmatterIndexTouchPaths(
  paths: string[],
): Promise<void> {
  await invoke('vault_frontmatter_index_touch_paths', {paths});
}

export async function vaultFrontmatterIndexSnapshot(): Promise<VaultFrontmatterIndexSnapshotDto> {
  return invoke<VaultFrontmatterIndexSnapshotDto>('vault_frontmatter_index_snapshot');
}

export async function vaultFrontmatterIndexValuesForKey(args: {
  key: string;
  prefix: string;
  limit?: number;
}): Promise<VaultFrontmatterValuesForKeyDto> {
  return invoke<VaultFrontmatterValuesForKeyDto>(
    'vault_frontmatter_index_values_for_key',
    {
      key: args.key,
      prefix: args.prefix,
      limit: args.limit ?? 50,
    },
  );
}

/** Snapshot DTO mirrors Rust `vault_frontmatter_index_snapshot`. */
export type VaultFrontmatterIndexSnapshotDto = {
  keys: ReadonlyArray<{
    key: string;
    inferredType: string;
    totalNotes: number;
    topValues: ReadonlyArray<{valueJson: unknown; count: number}>;
  }>;
  skippedDuplicateKeyFiles: number;
};

export type VaultFrontmatterValuesForKeyDto = {
  entries: ReadonlyArray<{valueJson: unknown; count: number}>;
};
