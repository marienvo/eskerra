import {sanitizeInboxNoteStem, stemFromMarkdownFileName} from './inboxMarkdown';

export type InboxWikiLinkNoteRef = {
  name: string;
  uri: string;
};

export type ParsedWikiLinkInner = {
  displayText: string | null;
  targetText: string;
};

export type InboxWikiLinkResolveResult =
  | {kind: 'open'; note: InboxWikiLinkNoteRef; canonicalInner?: string}
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

function hasInboxPrefixCaseInsensitive(target: string): boolean {
  return target.length >= 6 && target.slice(0, 6).toLowerCase() === 'inbox/';
}

function normalizeTargetToStem(targetText: string): {
  kind: 'ok';
  pathlessTarget: string;
  stem: string;
  hadInboxPrefix: boolean;
} | {
  kind: 'unsupported';
  reason: 'empty_target' | 'path_not_supported';
} {
  const trimmedTarget = targetText.trim();
  const hadInboxPrefix = hasInboxPrefixCaseInsensitive(trimmedTarget);
  const pathlessTarget = stripInboxPrefixCaseInsensitive(trimmedTarget);
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
    hadInboxPrefix,
  };
}

function buildCanonicalInnerForOpen(options: {
  parsed: ParsedWikiLinkInner;
  canonicalStem: string;
  hadInboxPrefix: boolean;
}): string {
  const {parsed, canonicalStem, hadInboxPrefix} = options;
  const targetText = hadInboxPrefix ? `Inbox/${canonicalStem}` : canonicalStem;
  if (parsed.displayText == null) {
    return targetText;
  }
  return `${targetText}|${parsed.displayText}`;
}

function buildSanitizedStemKey(rawStem: string): string | null {
  const sanitized = sanitizeInboxNoteStem(rawStem);
  if (!sanitized) {
    return null;
  }
  return sanitized.toLowerCase();
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

  const {pathlessTarget, stem, hadInboxPrefix} = normalized;
  const exactMatches = notes.filter(n => stemFromMarkdownFileName(n.name) === stem);
  if (exactMatches.length === 1) {
    return {kind: 'open', note: exactMatches[0]};
  }

  const title = parsed.displayText ?? pathlessTarget;
  if (exactMatches.length > 1) {
    return {
      kind: 'ambiguous',
      notes: exactMatches,
      targetStem: stem,
      title,
    };
  }

  const foldedStem = stem.toLowerCase();
  const foldedMatches = notes.filter(
    n => stemFromMarkdownFileName(n.name).toLowerCase() === foldedStem,
  );
  if (foldedMatches.length === 1) {
    const canonicalStem = stemFromMarkdownFileName(foldedMatches[0].name);
    return {
      kind: 'open',
      note: foldedMatches[0],
      canonicalInner: buildCanonicalInnerForOpen({
        parsed,
        canonicalStem,
        hadInboxPrefix,
      }),
    };
  }
  if (foldedMatches.length > 1) {
    return {
      kind: 'ambiguous',
      notes: foldedMatches,
      targetStem: stem,
      title,
    };
  }

  const linkStemKey = buildSanitizedStemKey(stem);
  if (linkStemKey) {
    const sanitizedMatches = notes.filter(n => {
      const noteStem = stemFromMarkdownFileName(n.name);
      return buildSanitizedStemKey(noteStem) === linkStemKey;
    });
    if (sanitizedMatches.length === 1) {
      const canonicalStem = stemFromMarkdownFileName(sanitizedMatches[0].name);
      return {
        kind: 'open',
        note: sanitizedMatches[0],
        canonicalInner: buildCanonicalInnerForOpen({
          parsed,
          canonicalStem,
          hadInboxPrefix,
        }),
      };
    }
    if (sanitizedMatches.length > 1) {
      return {
        kind: 'ambiguous',
        notes: sanitizedMatches,
        targetStem: stem,
        title,
      };
    }
  }

  return {kind: 'create', title};
}
