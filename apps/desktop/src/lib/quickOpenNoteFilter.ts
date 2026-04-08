import {normalizeVaultBaseUri} from '@eskerra/core';

function normSlashes(p: string): string {
  return p.trim().replace(/\\/g, '/');
}

/**
 * Path from vault root to the note file, using `/` separators (for display and search).
 */
export function quickOpenVaultRelativePath(vaultRoot: string, noteUri: string): string {
  const base = normSlashes(normalizeVaultBaseUri(vaultRoot)).replace(/\/+$/, '');
  const path = normSlashes(noteUri).replace(/\/+$/, '');
  const prefix = `${base}/`;
  if (
    path.length >= prefix.length
    && path.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()
  ) {
    return path.slice(prefix.length);
  }
  const tail = path.split('/').pop() ?? path;
  return tail;
}

export type QuickOpenNoteRef = {name: string; uri: string};

/**
 * Case-insensitive substring match on note stem (`name`) or relative vault path (`uri`).
 * Results sorted like `collectVaultMarkdownRefs`: name then uri.
 */
export function filterVaultNotesForQuickOpen(
  query: string,
  vaultRoot: string,
  refs: readonly QuickOpenNoteRef[],
): QuickOpenNoteRef[] {
  const sorted = [...refs].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    return a.uri.localeCompare(b.uri);
  });
  const q = query.trim().toLowerCase();
  if (!q) {
    return sorted;
  }
  return sorted.filter(r => {
    const rel = quickOpenVaultRelativePath(vaultRoot, r.uri).toLowerCase();
    return r.name.toLowerCase().includes(q) || rel.includes(q);
  });
}
