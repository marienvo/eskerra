import {
  getInboxDirectoryUri,
  normalizeVaultBaseUri,
  type VaultMarkdownRef,
} from '@eskerra/core';

function normalizeFsPath(uri: string): string {
  return uri
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '');
}

/**
 * Counts vault markdown refs whose URI lies under the canonical vault `Inbox/` directory
 * (same path model as `collectVaultMarkdownRefs` / wiki index).
 */
export function countInboxVaultMarkdownRefs(
  vaultRoot: string,
  refs: readonly VaultMarkdownRef[],
): number {
  const base = normalizeFsPath(normalizeVaultBaseUri(vaultRoot));
  const inboxDir = normalizeFsPath(getInboxDirectoryUri(base));
  const prefix = `${inboxDir}/`;
  let n = 0;
  for (const r of refs) {
    const u = normalizeFsPath(r.uri);
    if (u.startsWith(prefix)) {
      n += 1;
    }
  }
  return n;
}
