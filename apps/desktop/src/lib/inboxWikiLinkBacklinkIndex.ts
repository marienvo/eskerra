import {
  buildInboxWikiLinkResolveLookup,
  extractWikiLinkInnersFromMarkdown,
  resolveInboxWikiLinkTargetWithLookup,
  type InboxWikiLinkNoteRef,
} from '@eskerra/core';

/**
 * Lists vault markdown notes whose bodies contain a wiki link that resolves to `targetUri`
 * (same policy as navigation: open + ambiguous; self-links excluded).
 * Scans the provided `notes` list once; uses a single O(N) stem lookup table for resolutions.
 */
export function listInboxWikiLinkBacklinkReferrersForTarget(options: {
  targetUri: string;
  notes: ReadonlyArray<InboxWikiLinkNoteRef>;
  contentByUri: Readonly<Record<string, string>>;
  activeUri: string | null;
  activeBody: string;
}): readonly string[] {
  const {targetUri, notes, contentByUri, activeUri, activeBody} = options;
  const lookup = buildInboxWikiLinkResolveLookup(notes);
  const referrers = new Set<string>();

  for (const source of notes) {
    const sourceBody =
      activeUri != null && source.uri === activeUri
        ? activeBody
        : (contentByUri[source.uri] ?? '');
    const inners = extractWikiLinkInnersFromMarkdown(sourceBody);
    for (const inner of inners) {
      const resolved = resolveInboxWikiLinkTargetWithLookup(lookup, inner);
      if (resolved.kind === 'open') {
        if (resolved.note.uri === source.uri) {
          continue;
        }
        if (resolved.note.uri === targetUri) {
          referrers.add(source.uri);
        }
        continue;
      }
      if (resolved.kind === 'ambiguous') {
        const linksToTarget = resolved.notes.some(
          t => t.uri === targetUri && t.uri !== source.uri,
        );
        if (linksToTarget) {
          referrers.add(source.uri);
        }
      }
    }
  }

  return [...referrers].sort((a, b) => a.localeCompare(b));
}
