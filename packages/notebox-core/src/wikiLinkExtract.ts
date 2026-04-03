/**
 * Extracts wiki-link inners from Markdown text.
 * Matches the same `[[inner]]` syntax used by the desktop editor highlight.
 */
export function extractWikiLinkInnersFromMarkdown(markdown: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^[\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    out.push(match[1]);
  }
  return out;
}
