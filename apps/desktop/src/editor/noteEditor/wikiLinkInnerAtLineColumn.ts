const WIKI_LINK_REGEX = /\[\[([^[\]]+)\]\]/g;

export type WikiLinkLineMatch = {
  inner: string;
  innerFrom: number;
  innerTo: number;
};

export function wikiLinkMatchAtLineColumn(
  lineText: string,
  column: number,
): WikiLinkLineMatch | null {
  WIKI_LINK_REGEX.lastIndex = 0;
  let match = WIKI_LINK_REGEX.exec(lineText);
  while (match) {
    const start = match.index;
    const end = start + match[0].length;
    if (column >= start && column < end) {
      return {
        inner: match[1],
        innerFrom: start + 2,
        innerTo: end - 2,
      };
    }
    match = WIKI_LINK_REGEX.exec(lineText);
  }
  return null;
}

/**
 * If `column` (0-based UTF-16 index into `lineText`) falls inside a wiki link on this line,
 * returns the raw inner text (including `|` display segments). Otherwise `null`.
 */
export function wikiLinkInnerAtLineColumn(
  lineText: string,
  column: number,
): string | null {
  return wikiLinkMatchAtLineColumn(lineText, column)?.inner ?? null;
}
