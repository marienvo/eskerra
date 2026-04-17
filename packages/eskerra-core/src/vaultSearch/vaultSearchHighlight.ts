/** Matches `FUZZY_MIN_QUERY_CHARS` in `apps/desktop/src-tauri/src/vault_search.rs`. */
export const VAULT_SEARCH_HIGHLIGHT_MIN_TOKEN_CHARS = 3;

export type VaultSearchHighlightSegment = {
  text: string;
  highlighted: boolean;
};

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) {
    return [];
  }
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let [cs, ce] = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i]!;
    if (s <= ce) {
      ce = Math.max(ce, e);
    } else {
      out.push([cs, ce]);
      cs = s;
      ce = e;
    }
  }
  out.push([cs, ce]);
  return out;
}

/** Lowercase needles for case-insensitive matching; deduped. */
export function vaultSearchHighlightNeedles(queryTrimmed: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const lower = raw.toLowerCase();
    if (lower.length === 0 || seen.has(lower)) {
      return;
    }
    seen.add(lower);
    out.push(lower);
  };
  if (queryTrimmed.length > 0) {
    add(queryTrimmed);
  }
  for (const token of queryTrimmed.split(/\s+/).filter(Boolean)) {
    if (token.length >= VAULT_SEARCH_HIGHLIGHT_MIN_TOKEN_CHARS) {
      add(token);
    }
  }
  return out;
}

function collectMatchRanges(haystackLower: string, needlesLower: string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const n of needlesLower) {
    if (n.length === 0) {
      continue;
    }
    let from = 0;
    while (from <= haystackLower.length - n.length) {
      const idx = haystackLower.indexOf(n, from);
      if (idx === -1) {
        break;
      }
      ranges.push([idx, idx + n.length]);
      from = idx + 1;
    }
  }
  return mergeIntervals(ranges);
}

/**
 * Split `text` into segments for vault search UI. Highlights follow substring matches of the
 * trimmed query and of whitespace tokens with length >= {@link VAULT_SEARCH_HIGHLIGHT_MIN_TOKEN_CHARS}.
 * Original character casing is preserved in segment text.
 */
export function vaultSearchHighlightSegments(
  text: string,
  queryTrimmed: string,
): VaultSearchHighlightSegment[] {
  if (text.length === 0) {
    return [];
  }
  const needles = vaultSearchHighlightNeedles(queryTrimmed);
  if (needles.length === 0) {
    return [{text, highlighted: false}];
  }
  const lower = text.toLowerCase();
  const ranges = collectMatchRanges(lower, needles);
  if (ranges.length === 0) {
    return [{text, highlighted: false}];
  }
  const segments: VaultSearchHighlightSegment[] = [];
  let cursor = 0;
  for (const [s, e] of ranges) {
    if (cursor < s) {
      segments.push({text: text.slice(cursor, s), highlighted: false});
    }
    segments.push({text: text.slice(s, e), highlighted: true});
    cursor = e;
  }
  if (cursor < text.length) {
    segments.push({text: text.slice(cursor), highlighted: false});
  }
  return segments;
}
