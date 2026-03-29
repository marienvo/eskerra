const FRONTMATTER_PATTERN = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*/;
const RSS_FEED_URL_PATTERN = /^\s*rssFeedUrl[ \t]*:[ \t]*([^\r\n]+)\s*$/im;
const RSS_FEED_URL_LIST_PATTERN = /^\s*rssFeedUrl[ \t]*:[ \t]*\r?\n[ \t]*-[ \t]*(.+)\s*$/im;
const H1_TITLE_PATTERN = /^\s*#\s+(.+?)\s*$/m;

function trimWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function extractRssFeedUrl(content: string): string | undefined {
  const frontmatterMatch = FRONTMATTER_PATTERN.exec(content);
  if (!frontmatterMatch) {
    return undefined;
  }

  const frontmatterContent = frontmatterMatch[1];
  const scalarMatch = RSS_FEED_URL_PATTERN.exec(frontmatterContent);
  if (scalarMatch?.[1]) {
    const scalarUrl = trimWrappingQuotes(scalarMatch[1]);
    return scalarUrl || undefined;
  }

  const listMatch = RSS_FEED_URL_LIST_PATTERN.exec(frontmatterContent);
  if (listMatch?.[1]) {
    const listUrl = trimWrappingQuotes(listMatch[1]);
    return listUrl || undefined;
  }

  return undefined;
}

export function extractRssPodcastTitle(fileName: string, content: string): string {
  const headingMatch = H1_TITLE_PATTERN.exec(content);
  if (headingMatch?.[1]?.trim()) {
    return headingMatch[1].trim();
  }

  const withoutExtension = fileName.replace(/\.md$/i, '');
  return withoutExtension.replace(/^📻\s+/, '').trim();
}

export function normalizeSeriesKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
