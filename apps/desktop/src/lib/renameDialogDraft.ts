import {stemFromMarkdownFileName} from '@eskerra/core';

export type VaultMarkdownRefLike = {name: string; uri: string};

function normalizeVaultPath(uri: string): string {
  return uri.trim().replace(/\\/g, '/');
}

/**
 * Stem used in the rename-note dialog for a vault markdown URI.
 * `vaultMarkdownRefs[].name` is the markdown **stem** (see `collectVaultMarkdownRefs`), not `*.md`.
 * When the URI is not in the index yet, derive from the path basename.
 */
export function renameDraftStemForMarkdownUri(
  uri: string,
  vaultMarkdownRefs: ReadonlyArray<VaultMarkdownRefLike>,
): string | null {
  const normalizedUri = normalizeVaultPath(uri);
  const ref = vaultMarkdownRefs.find(r => normalizeVaultPath(r.uri) === normalizedUri);
  if (ref) {
    const stem = ref.name.trim();
    return stem === '' ? null : stem;
  }
  const base = (normalizedUri.split('/').pop() ?? '').trim();
  if (!base.toLowerCase().endsWith('.md')) {
    return null;
  }
  return stemFromMarkdownFileName(base);
}
