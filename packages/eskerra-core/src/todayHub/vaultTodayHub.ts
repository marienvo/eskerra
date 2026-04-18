import {stemFromMarkdownFileName} from '../inboxMarkdown';
import {vaultPathDirname} from '../vaultVisibility';

import {formatTodayHubMondayStem} from './todayHubMondays';

const SAF_DOCUMENT_MARKER = '/document/';

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
 * Tab-style label for a Today hub from the hub note URI (handles Android SAF
 * `content://…/document/…` IDs where the logical path is URL-encoded in one segment).
 */
export function todayHubFolderLabelFromTodayNoteUri(todayNoteUri: string): string {
  const norm = todayNoteUri.replace(/\\/g, '/').replace(/\/+$/, '');
  const saf = tryDecodeSafDocumentId(norm);
  if (saf) {
    const parts = saf.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && stemFromMarkdownFileName(last) === 'Today') {
      const parent = parts[parts.length - 2];
      if (parent) {
        return parent;
      }
    }
  }
  return todayHubFolderLabelFromUri(norm);
}

/**
 * Hub tab label when the ref comes from the vault index (handles SAF URIs where
 * {@link vaultUriIsTodayMarkdownFile} is false but {@link vaultMarkdownRefIsTodayHubNote} is true).
 */
export function todayHubFolderLabelFromVaultMarkdownRef(ref: {uri: string; name: string}): string {
  return todayHubFolderLabelFromTodayNoteUri(ref.uri);
}

/** Directory containing `Today.md` (hub row files live beside it). */
export function todayHubDirectoryUriFromTodayNoteUri(todayNoteUri: string): string {
  const norm = todayNoteUri.replace(/\\/g, '/').replace(/\/+$/, '');
  return vaultPathDirname(norm);
}

function tryDecodeSafDocumentId(uri: string): string | null {
  const i = uri.indexOf(SAF_DOCUMENT_MARKER);
  if (i < 0) {
    return null;
  }
  const encoded = uri.slice(i + SAF_DOCUMENT_MARKER.length);
  if (!encoded) {
    return null;
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/**
 * Row note URI for `YYYY-MM-DD.md` beside `Today.md`, including Android SAF document URIs
 * where the filesystem path lives inside a single URL-encoded document id.
 */
export function todayHubRowUriFromTodayNoteUri(todayNoteUri: string, weekStart: Date): string {
  const norm = todayNoteUri.replace(/\\/g, '/').replace(/\/+$/, '');
  const stem = `${formatTodayHubMondayStem(weekStart)}.md`;
  const i = norm.indexOf(SAF_DOCUMENT_MARKER);
  if (i >= 0) {
    const prefix = norm.slice(0, i + SAF_DOCUMENT_MARKER.length);
    const encodedTail = norm.slice(i + SAF_DOCUMENT_MARKER.length);
    let decoded: string;
    try {
      decoded = decodeURIComponent(encodedTail);
    } catch {
      return `${vaultPathDirname(norm)}/${stem}`;
    }
    const parts = decoded.split('/').filter(Boolean);
    if (parts.length === 0) {
      return `${vaultPathDirname(norm)}/${stem}`;
    }
    parts[parts.length - 1] = stem;
    const newDecoded = parts.join('/');
    return `${prefix}${encodeURIComponent(newDecoded)}`;
  }
  const base = vaultPathDirname(norm);
  return `${base}/${stem}`;
}
