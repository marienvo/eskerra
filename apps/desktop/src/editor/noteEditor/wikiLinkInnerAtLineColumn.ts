const WIKI_LINK_REGEX = /\[\[([^[\]]+)\]\]/g;

/**
 * If `column` (0-based UTF-16 index into `lineText`) falls inside a wiki link on this line,
 * returns the raw inner text (including `|` display segments). Otherwise `null`.
 */
export function wikiLinkInnerAtLineColumn(
  lineText: string,
  column: number,
): string | null {
  WIKI_LINK_REGEX.lastIndex = 0;
  let match = WIKI_LINK_REGEX.exec(lineText);
  while (match) {
    const start = match.index;
    const end = start + match[0].length;
    if (column >= start && column < end) {
      return match[1];
    }
    match = WIKI_LINK_REGEX.exec(lineText);
  }
  return null;
}
