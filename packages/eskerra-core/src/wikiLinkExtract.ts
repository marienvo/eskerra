export type WikiLinkInnerMatch = {
  inner: string;
  fullMatchStart: number;
  fullMatchEnd: number;
};

const WIKI_LINK_RE = /\[\[([^[\]]+)\]\]/g;

/**
 * Extracts wiki-link inners from Markdown text.
 * Matches the same `[[inner]]` syntax used by the desktop editor highlight.
 */
export function extractWikiLinkInnersFromMarkdown(markdown: string): string[] {
  return extractWikiLinkInnerMatchesFromMarkdown(markdown).map(m => m.inner);
}

/**
 * Extracts wiki-link inner text with source offsets for safe rewrites.
 */
export function extractWikiLinkInnerMatchesFromMarkdown(markdown: string): WikiLinkInnerMatch[] {
  const out: WikiLinkInnerMatch[] = [];
  let match: RegExpExecArray | null;
  WIKI_LINK_RE.lastIndex = 0;
  while ((match = WIKI_LINK_RE.exec(markdown)) !== null) {
    out.push({
      inner: match[1],
      fullMatchStart: match.index,
      fullMatchEnd: match.index + match[0].length,
    });
  }
  return out;
}
