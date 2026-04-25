/**
 * Emitted by Tauri after the vault filesystem watcher debounces (see `vault_watch.rs`).
 */
export type VaultFilesChangedPayload = {
  /** Absolute paths touched (files and directories). */
  paths: string[];
  /**
   * Coarse invalidation fallback. When true, frontend should treat this as full-vault refresh
   * regardless of `paths` precision.
   */
  coarse?: boolean;
  /** Best-effort watcher reason for diagnostics only. */
  coarseReason?: string | null;
};

/**
 * Fail-safe classification: path-less batches are treated as coarse invalidation
 * even when `coarse` is not explicitly set.
 */
export function vaultFilesChangedIsCoarse(
  payload: VaultFilesChangedPayload | null | undefined,
): boolean {
  if (!payload) {
    return true;
  }
  return payload.coarse === true || payload.paths.length === 0;
}
