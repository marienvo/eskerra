/**
 * Pure helpers for keeping `inboxContentByUri` consistent with editor and disk state.
 * See specs/architecture/desktop-editor.md (cache consistency invariant).
 */

export type LastPersistedNote = {uri: string; markdown: string};

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
