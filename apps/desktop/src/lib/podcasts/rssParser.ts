import {stripTrailingAtxClosingHashes} from '@eskerra/core';

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

function normalizeMarkdownNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

function extractFrontmatterContent(content: string): string | null {
  const normalized = normalizeMarkdownNewlines(content);
  const firstLineEnd = normalized.indexOf('\n');
  if (firstLineEnd < 0) {
    return null;
  }
  const firstLine = normalized.slice(0, firstLineEnd).trim();
  if (firstLine !== '---') {
    return null;
  }

  const lines = normalized.slice(firstLineEnd + 1).split('\n');
  const endIdx = lines.findIndex(line => line.trim() === '---');
  if (endIdx < 0) {
    return null;
  }
  return lines.slice(0, endIdx).join('\n');
}

function extractFrontmatterRssFeedUrl(frontmatter: string): string | undefined {
  const lines = frontmatter.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmedStart = line.trimStart();
    const colonIdx = trimmedStart.indexOf(':');
    if (colonIdx < 0) {
      continue;
    }
    const key = trimmedStart.slice(0, colonIdx).trim();
    if (key.toLowerCase() !== 'rssfeedurl') {
      continue;
    }

    const scalarOrEmpty = trimmedStart.slice(colonIdx + 1).trim();
    if (scalarOrEmpty !== '') {
      const scalarUrl = trimWrappingQuotes(scalarOrEmpty);
      return scalarUrl || undefined;
    }

    for (let j = i + 1; j < lines.length; j += 1) {
      const item = lines[j] ?? '';
      const itemTrimmed = item.trim();
      if (itemTrimmed === '') {
        continue;
      }
      const itemStart = item.trimStart();
      if (!itemStart.startsWith('-')) {
        return undefined;
      }
      const listUrl = trimWrappingQuotes(itemStart.slice(1).trim());
      return listUrl || undefined;
    }
    return undefined;
  }

  return undefined;
}

function extractFirstMarkdownH1(content: string): string | undefined {
  const lines = normalizeMarkdownNewlines(content).split('\n');
  for (const line of lines) {
    const trimmedStart = line.trimStart();
    if (!trimmedStart.startsWith('#') || trimmedStart.startsWith('##')) {
      continue;
    }
    let h1Body = trimmedStart.slice(1).trimStart();
    if (!h1Body) {
      continue;
    }
    h1Body = stripTrailingAtxClosingHashes(h1Body);
    return h1Body === '' ? undefined : h1Body;
  }
  return undefined;
}

export function extractRssFeedUrl(content: string): string | undefined {
  const frontmatterContent = extractFrontmatterContent(content);
  if (frontmatterContent == null) {
    return undefined;
  }

  return extractFrontmatterRssFeedUrl(frontmatterContent);
}

export function extractRssPodcastTitle(fileName: string, content: string): string {
  const heading = extractFirstMarkdownH1(content);
  if (heading != null) {
    return heading;
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
