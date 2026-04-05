/**
 * Pure helpers for keeping `inboxContentByUri` consistent with editor and disk state.
 * See specs/architecture/desktop-editor.md (cache consistency invariant).
 */

import {normalizeVaultBaseUri} from '@eskerra/core';

import {normalizeEditorDocUri} from '../lib/editorDocumentHistory';

export type LastPersistedNote = {uri: string; markdown: string};

/** How to reconcile the open editor when disk content may have diverged. */
export type NoteDiskReconcileKind = 'noop' | 'reload_from_disk' | 'conflict';

/**
 * Returns a new cache map with `uri` set to `body`, or `null` if unchanged.
 */
export function mergeInboxNoteBodyIntoCache(
  prev: Record<string, string>,
  uri: string,
  body: string,
): Record<string, string> | null {
  if (prev[uri] === body) {
    return null;
  }
  return {...prev, [uri]: body};
}

/**
 * When opening a note that has a cache entry, prefer `lastPersisted` if it matches
 * the same URI and disagrees with the cache (disk-known wins over stale cache).
 */
export function resolveInboxCachedBodyForEditor(
  selectedUri: string,
  cached: string,
  lastPersisted: LastPersistedNote | null,
): {markdown: string; healedCache: boolean} {
  if (
    lastPersisted != null &&
    lastPersisted.uri === selectedUri &&
    lastPersisted.markdown !== cached
  ) {
    return {markdown: lastPersisted.markdown, healedCache: true};
  }
  return {markdown: cached, healedCache: false};
}

/**
 * Returns whether any path in a debounced watcher batch could affect `noteUri`
 * (same file, or a parent directory).
 * When `changedPaths` is empty, callers should treat it as a full vault refresh signal.
 */
export function fsChangePathsMayAffectUri(
  changedPaths: readonly string[],
  noteUri: string,
  vaultRoot: string,
): boolean {
  if (changedPaths.length === 0) {
    return true;
  }
  const u = normalizeEditorDocUri(noteUri);
  const root = normalizeVaultBaseUri(vaultRoot).replace(/\/+$/, '');
  if (u !== root && !u.startsWith(`${root}/`)) {
    return false;
  }
  for (const raw of changedPaths) {
    const p = normalizeEditorDocUri(raw);
    if (!p) {
      continue;
    }
    if (p === u) {
      return true;
    }
    const prefix = p.replace(/\/+$/, '');
    if (u.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

export function removeInboxNoteBodyFromCache(
  prev: Record<string, string>,
  uri: string,
): Record<string, string> | null {
  if (!Object.prototype.hasOwnProperty.call(prev, uri)) {
    return null;
  }
  const next: Record<string, string> = {...prev};
  delete next[uri];
  return next;
}

/**
 * Decide how to merge external disk content into the open note.
 * - `noop`: disk matches what we already treat as persisted for this URI.
 * - `reload_from_disk`: disk changed and the editor is still aligned with last persist — safe reload.
 * - `conflict`: disk changed and the user has local edits since last persist — must not autosave over disk.
 */
export function classifyNoteDiskReconcile(input: {
  noteUri: string;
  lastPersisted: LastPersistedNote | null;
  diskMarkdown: string;
  localMarkdown: string;
}): NoteDiskReconcileKind {
  const {noteUri, lastPersisted, diskMarkdown, localMarkdown} = input;
  if (lastPersisted == null || lastPersisted.uri !== noteUri) {
    if (diskMarkdown === localMarkdown) {
      return 'noop';
    }
    return 'reload_from_disk';
  }
  // `diskMarkdown` comes from disk read after `replace(/\n$/, '')` (see workspace reconcile).
  // `lastPersisted.markdown` is raw editor / post-save text; strip one trailing newline for compare.
  const persistedNorm = lastPersisted.markdown.replace(/\n$/, '');
  const diskChanged = diskMarkdown !== persistedNorm;
  if (!diskChanged) {
    return 'noop';
  }
  const localDirty = localMarkdown !== lastPersisted.markdown;
  if (localDirty) {
    return 'conflict';
  }
  return 'reload_from_disk';
}
