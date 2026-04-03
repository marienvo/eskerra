import {
  extractWikiLinkInnersFromMarkdown,
  resolveInboxWikiLinkTarget,
  type InboxWikiLinkNoteRef,
} from '@notebox/core';

export function buildInboxWikiLinkBacklinkIndex(options: {
  notes: ReadonlyArray<InboxWikiLinkNoteRef>;
  contentByUri: Readonly<Record<string, string>>;
  activeUri: string | null;
  activeBody: string;
}): ReadonlyMap<string, readonly string[]> {
  const {notes, contentByUri, activeUri, activeBody} = options;
  const byTarget = new Map<string, Set<string>>();

  for (const source of notes) {
    const sourceBody =
      activeUri != null && source.uri === activeUri
        ? activeBody
        : (contentByUri[source.uri] ?? '');
    const inners = extractWikiLinkInnersFromMarkdown(sourceBody);
    for (const inner of inners) {
      const resolved = resolveInboxWikiLinkTarget(notes, inner);
      if (resolved.kind === 'open') {
        if (resolved.note.uri === source.uri) {
          continue;
        }
        const refs = byTarget.get(resolved.note.uri) ?? new Set<string>();
        refs.add(source.uri);
        byTarget.set(resolved.note.uri, refs);
        continue;
      }
      if (resolved.kind === 'ambiguous') {
        for (const target of resolved.notes) {
          if (target.uri === source.uri) {
            continue;
          }
          const refs = byTarget.get(target.uri) ?? new Set<string>();
          refs.add(source.uri);
          byTarget.set(target.uri, refs);
        }
      }
    }
  }

  const out = new Map<string, readonly string[]>();
  for (const [targetUri, refSet] of byTarget) {
    out.set(targetUri, [...refSet].sort((a, b) => a.localeCompare(b)));
  }
  return out;
}
