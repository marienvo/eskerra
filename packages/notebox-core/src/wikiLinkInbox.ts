import {stemFromMarkdownFileName} from './inboxMarkdown';

export type InboxWikiLinkNoteRef = {
  name: string;
  uri: string;
};

export type ParsedWikiLinkInner = {
  displayText: string | null;
  targetText: string;
};

export type InboxWikiLinkResolveResult =
  | {kind: 'open'; note: InboxWikiLinkNoteRef}
  | {kind: 'create'; title: string}
  | {
      kind: 'ambiguous';
      notes: InboxWikiLinkNoteRef[];
      targetStem: string;
      title: string;
    }
  | {kind: 'unsupported'; reason: 'empty_target' | 'path_not_supported'};

function splitWikiLinkInner(inner: string): ParsedWikiLinkInner {
  const raw = inner.trim();
  const pipeAt = raw.indexOf('|');
  if (pipeAt < 0) {
    return {displayText: null, targetText: raw};
  }
  const targetText = raw.slice(0, pipeAt).trim();
  const displayRaw = raw.slice(pipeAt + 1).trim();
  return {
    displayText: displayRaw === '' ? null : displayRaw,
    targetText,
  };
}

function stripInboxPrefixCaseInsensitive(target: string): string {
  if (target.length < 6) {
    return target;
  }
  if (target.slice(0, 6).toLowerCase() === 'inbox/') {
    return target.slice(6).trim();
  }
  return target;
}

function normalizeTargetToStem(targetText: string): {
  kind: 'ok';
  pathlessTarget: string;
  stem: string;
} | {
  kind: 'unsupported';
  reason: 'empty_target' | 'path_not_supported';
} {
  const pathlessTarget = stripInboxPrefixCaseInsensitive(targetText.trim());
  if (pathlessTarget === '') {
    return {kind: 'unsupported', reason: 'empty_target'};
  }
  if (pathlessTarget.includes('/') || pathlessTarget.includes('\\')) {
    return {kind: 'unsupported', reason: 'path_not_supported'};
  }
  return {
    kind: 'ok',
    pathlessTarget,
    stem: pathlessTarget,
  };
}

/**
 * Inbox-only resolver for `[[...]]` links.
 * - Supports `[[target]]` and `[[target|display]]`.
 * - Optional `Inbox/` prefix is stripped case-insensitively.
 * - No broader path semantics or fuzzy matching.
 */
export function resolveInboxWikiLinkTarget(
  notes: ReadonlyArray<InboxWikiLinkNoteRef>,
  inner: string,
): InboxWikiLinkResolveResult {
  const parsed = splitWikiLinkInner(inner);
  const normalized = normalizeTargetToStem(parsed.targetText);
  if (normalized.kind === 'unsupported') {
    return {kind: 'unsupported', reason: normalized.reason};
  }

  const {pathlessTarget, stem} = normalized;
  const matches = notes.filter(n => stemFromMarkdownFileName(n.name) === stem);
  if (matches.length === 1) {
    return {kind: 'open', note: matches[0]};
  }

  const title = parsed.displayText ?? pathlessTarget;
  if (matches.length > 1) {
    return {
      kind: 'ambiguous',
      notes: matches,
      targetStem: stem,
      title,
    };
  }

  return {kind: 'create', title};
}
