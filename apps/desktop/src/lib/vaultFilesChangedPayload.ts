/**
 * Emitted by Tauri after the vault filesystem watcher debounces (see `vault_watch.rs`).
 */
export type VaultFilesChangedPayload = {
  /** Absolute paths touched (files and directories). */
  paths: string[];
};
