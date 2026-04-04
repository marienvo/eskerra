import {
  isVaultTreeHardExcludedDirectoryName,
  isVaultTreeIgnoredEntryName,
} from './vaultVisibility';
import {
  isSyncConflictFileName,
  MARKDOWN_EXTENSION,
  normalizeVaultBaseUri,
} from './vaultLayout';

function normalizeSlashes(uri: string): string {
  return uri.trim().replace(/\\/g, '/');
}

/**
 * Validates that `noteUri` is a user markdown file under `vaultRootUri` (nested allowed), then returns
 * the normalized URI string for CRUD.
 */
export function assertVaultMarkdownNoteUriForCrud(
  vaultRootUri: string,
  noteUri: string,
): string {
  const base = normalizeSlashes(normalizeVaultBaseUri(vaultRootUri)).replace(/\/+$/, '');
  const uri = normalizeSlashes(noteUri);
  if (uri !== base && !uri.startsWith(`${base}/`)) {
    throw new Error('Note is outside the vault.');
  }
  const relative = uri === base ? '' : uri.slice(base.length + 1);
  if (!relative) {
    throw new Error('Invalid note path.');
  }
  const segments = relative.split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new Error('Invalid note path.');
  }
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (isVaultTreeIgnoredEntryName(seg)) {
      throw new Error('Invalid note path.');
    }
    if (isVaultTreeHardExcludedDirectoryName(seg)) {
      throw new Error('Note path is in an excluded folder.');
    }
  }
  const fileName = segments[segments.length - 1]!;
  if (!fileName.endsWith(MARKDOWN_EXTENSION)) {
    throw new Error('Only vault markdown notes can be changed here.');
  }
  if (isSyncConflictFileName(fileName)) {
    throw new Error('Cannot change sync conflict notes with this action.');
  }
  if (isVaultTreeIgnoredEntryName(fileName)) {
    throw new Error('Invalid note path.');
  }
  return uri;
}
