import {stemFromMarkdownFileName} from '../inboxMarkdown';
import {vaultPathDirname} from '../vaultVisibility';

/** Eligible markdown files with this exact name inside a directory make that directory a Today hub. */
export const VAULT_TREE_TODAY_HUB_NOTE_NAME = 'Today.md';

/** Last path segment is exactly {@link VAULT_TREE_TODAY_HUB_NOTE_NAME} (vault URI; normalizes `\\`). */
export function vaultUriIsTodayMarkdownFile(uri: string): boolean {
  const norm = uri.replace(/\\/g, '/').replace(/\/+$/, '');
  const seg = norm.split('/').pop() ?? '';
  return seg === VAULT_TREE_TODAY_HUB_NOTE_NAME;
}

/**
 * True if this vault markdown ref is the hub note `Today.md`.
 * Storage Access Framework / DocumentProvider URIs often do not expose `Today.md` as the final path
 * segment, so we also match the indexed stem {@link stemFromMarkdownFileName} for `Today.md`.
 */
export function vaultMarkdownRefIsTodayHubNote(ref: {uri: string; name: string}): boolean {
  if (vaultUriIsTodayMarkdownFile(ref.uri)) {
    return true;
  }
  return ref.name === 'Today';
}

/**
 * All eligible `Today.md` vault URIs from markdown refs, sorted for stable “first hub”.
 */
export function sortedTodayHubNoteUrisFromRefs(
  vaultMarkdownRefs: readonly {uri: string; name: string}[],
): string[] {
  const out: string[] = [];
  for (const r of vaultMarkdownRefs) {
    if (vaultMarkdownRefIsTodayHubNote(r)) {
      out.push(r.uri);
    }
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

/**
 * Tab-style label for a Today hub: parent folder name (same rule as desktop editor tab pill).
 */
export function todayHubFolderLabelFromUri(todayNoteUri: string): string {
  const norm = todayNoteUri.replace(/\\/g, '/').replace(/\/+$/, '');
  if (vaultUriIsTodayMarkdownFile(norm)) {
    const parent = vaultPathDirname(norm);
    const folderSeg = parent.split('/').filter(Boolean).pop();
    if (folderSeg) {
      return folderSeg;
    }
  }
  const tail = norm.split('/').filter(Boolean).pop() ?? 'Today.md';
  return stemFromMarkdownFileName(tail);
}

/**
 * Hub tab label when the ref comes from the vault index (handles SAF URIs where
 * {@link vaultUriIsTodayMarkdownFile} is false but {@link vaultMarkdownRefIsTodayHubNote} is true).
 */
export function todayHubFolderLabelFromVaultMarkdownRef(ref: {uri: string; name: string}): string {
  if (vaultUriIsTodayMarkdownFile(ref.uri)) {
    return todayHubFolderLabelFromUri(ref.uri);
  }
  if (ref.name === 'Today') {
    const parent = vaultPathDirname(ref.uri.replace(/\\/g, '/').replace(/\/+$/, ''));
    const rawSeg = parent.split('/').filter(Boolean).pop();
    if (rawSeg) {
      try {
        const decoded = decodeURIComponent(rawSeg);
        if (decoded && decoded.length > 0 && decoded.length < 200) {
          const parts = decoded.split('/');
          const folder = parts.filter(Boolean).pop();
          if (folder) {
            return folder;
          }
          return decoded;
        }
      } catch {
        // fall through
      }
      return rawSeg.length < 120 ? rawSeg : 'Today';
    }
  }
  return todayHubFolderLabelFromUri(ref.uri);
}

/** Directory containing `Today.md` (hub row files live beside it). */
export function todayHubDirectoryUriFromTodayNoteUri(todayNoteUri: string): string {
  const norm = todayNoteUri.replace(/\\/g, '/').replace(/\/+$/, '');
  return vaultPathDirname(norm);
}
