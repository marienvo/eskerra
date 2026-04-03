import {extractWikiLinkInnerMatchesFromMarkdown} from './wikiLinkExtract';
import {
  resolveInboxWikiLinkTargetWithLookup,
  type InboxWikiLinkResolveLookup,
} from './wikiLinkInbox';

function splitWikiLinkInner(inner: string): {targetText: string; displayText: string | null} {
  const raw = inner.trim();
  const pipeAt = raw.indexOf('|');
  if (pipeAt < 0) {
    return {targetText: raw, displayText: null};
  }
  const targetText = raw.slice(0, pipeAt).trim();
  const displayRaw = raw.slice(pipeAt + 1).trim();
  return {
    targetText,
    displayText: displayRaw === '' ? null : displayRaw,
  };
}

function rebuildInnerForRenamedStem(inner: string, renamedStem: string): string {
  const parsed = splitWikiLinkInner(inner);
  const hadInboxPrefix = parsed.targetText.length >= 6
    && parsed.targetText.slice(0, 6).toLowerCase() === 'inbox/';
  const nextTarget = hadInboxPrefix ? `Inbox/${renamedStem}` : renamedStem;
  if (parsed.displayText == null) {
    return nextTarget;
  }
  return `${nextTarget}|${parsed.displayText}`;
}

export type InboxWikiLinkRenameSkippedReason = 'ambiguous';

export type InboxWikiLinkRenameMarkdownPlan = {
  changed: boolean;
  markdown: string;
  updatedLinkCount: number;
  skippedAmbiguousLinkCount: number;
};

/**
 * Pure markdown rewrite plan for inbox wiki-link maintenance after a successful rename.
 * Rewrites only links that previously resolved unambiguously to `oldTargetUri`.
 */
export function planInboxWikiLinkRenameInMarkdown(options: {
  markdown: string;
  lookup: InboxWikiLinkResolveLookup;
  oldTargetUri: string;
  renamedStem: string;
}): InboxWikiLinkRenameMarkdownPlan {
  const {markdown, lookup, oldTargetUri, renamedStem} = options;
  const matches = extractWikiLinkInnerMatchesFromMarkdown(markdown);
  if (matches.length === 0) {
    return {
      changed: false,
      markdown,
      updatedLinkCount: 0,
      skippedAmbiguousLinkCount: 0,
    };
  }

  let cursor = 0;
  let out = '';
  let updatedLinkCount = 0;
  let skippedAmbiguousLinkCount = 0;

  for (const match of matches) {
    out += markdown.slice(cursor, match.fullMatchStart);
    const resolved = resolveInboxWikiLinkTargetWithLookup(lookup, match.inner);
    if (resolved.kind === 'open' && resolved.note.uri === oldTargetUri) {
      const nextInner = rebuildInnerForRenamedStem(match.inner, renamedStem);
      out += `[[${nextInner}]]`;
      updatedLinkCount += 1;
    } else {
      if (
        resolved.kind === 'ambiguous'
        && resolved.notes.some(n => n.uri === oldTargetUri)
      ) {
        skippedAmbiguousLinkCount += 1;
      }
      out += markdown.slice(match.fullMatchStart, match.fullMatchEnd);
    }
    cursor = match.fullMatchEnd;
  }

  out += markdown.slice(cursor);
  return {
    changed: updatedLinkCount > 0,
    markdown: updatedLinkCount > 0 ? out : markdown,
    updatedLinkCount,
    skippedAmbiguousLinkCount,
  };
}
