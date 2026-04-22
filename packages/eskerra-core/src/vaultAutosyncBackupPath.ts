/**
 * Detects path segments for Syncthing-style conflict backups, e.g.
 * `_autosync-backup` or `_autosync-backup-nuc` (underscore-prefixed; not dot-hidden).
 * See `vaultVisibility.ts` for product rules on `_autosync-backup-*`.
 */
export function isVaultPathUnderAutosyncBackup(vaultFileOrDirUri: string): boolean {
  const n = vaultFileOrDirUri.trim().replace(/\\/g, '/');
  for (const seg of n.split('/')) {
    if (seg.length === 0) {
      continue;
    }
    if (seg === '_autosync-backup' || seg.startsWith('_autosync-backup-')) {
      return true;
    }
  }
  return false;
}
