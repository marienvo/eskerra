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

/**
 * Returns the URI of the `_autosync-backup[-*]` root directory that contains
 * the given file, or `null` if the file is not inside such a directory.
 */
export function getAutosyncBackupRootUri(uri: string): string | null {
  const normalized = uri.trim().replace(/\\/g, '/');
  const parts = normalized.split('/');
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]!;
    if (seg === '_autosync-backup' || seg.startsWith('_autosync-backup-')) {
      return parts.slice(0, i + 1).join('/');
    }
  }
  return null;
}
