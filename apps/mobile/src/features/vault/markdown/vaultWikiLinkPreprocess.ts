const WIKI_LINE_RE = /\[\[([^[\]]+)\]\]/g;

/** Synthetic scheme consumed by vault readonly markdown link rules (not a real URL). */
export const VAULT_READONLY_WIKI_LINK_SCHEME = 'eskerra-wiki:';

/**
 * Applies `transform` only to segments outside ```fenced``` blocks (non-overlapping, greedy).
 */
export function transformMarkdownOutsideTripleBacktickFences(
  markdown: string,
  transform: (chunk: string) => string,
): string {
  const re = /```[\s\S]*?```/g;
  const out: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    out.push(transform(markdown.slice(last, m.index)));
    out.push(m[0]);
    last = m.index + m[0].length;
  }
  out.push(transform(markdown.slice(last)));
  return out.join('');
}

function wikiLinkMarkdownLabel(inner: string): string {
  const raw = inner.trim();
  const pipeAt = raw.indexOf('|');
  if (pipeAt < 0) {
    return raw;
  }
  const display = raw.slice(pipeAt + 1).trim();
  return display === '' ? raw.slice(0, pipeAt).trim() : display;
}

function escapeMarkdownLinkText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

/**
 * Rewrites `[[inner]]` to a markdown inline link so `markdown-it` produces a `link` AST node.
 */
export function wikiLinksToSyntheticMarkdownLinks(markdownChunk: string): string {
  return markdownChunk.replace(WIKI_LINE_RE, (_full, inner: string) => {
    const label = escapeMarkdownLinkText(wikiLinkMarkdownLabel(inner));
    const href = `${VAULT_READONLY_WIKI_LINK_SCHEME}${encodeURIComponent(inner.trim())}`;
    return `[${label}](${href})`;
  });
}

export function preprocessVaultReadonlyMarkdownBody(markdown: string): string {
  return transformMarkdownOutsideTripleBacktickFences(markdown, wikiLinksToSyntheticMarkdownLinks);
}
