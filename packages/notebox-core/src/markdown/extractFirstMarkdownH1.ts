/**
 * Returns the first ATX-style H1 heading text in markdown body content, or null.
 * Skips leading blank lines and an optional YAML frontmatter block (--- ... ---).
 */
export function extractFirstMarkdownH1(markdown: string): string | null {
  const normalized = markdown.replace(/\r\n/g, '\n');
  if (!normalized.trim()) {
    return null;
  }

  const lines = normalized.split('\n');
  let i = 0;

  while (i < lines.length && lines[i].trim() === '') {
    i += 1;
  }

  if (lines[i]?.trim() === '---') {
    i += 1;
    while (i < lines.length && lines[i].trim() !== '---') {
      i += 1;
    }
    if (i < lines.length) {
      i += 1;
    }
    while (i < lines.length && lines[i].trim() === '') {
      i += 1;
    }
  }

  for (; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith('#') || trimmed.startsWith('##')) {
      continue;
    }
    let body = trimmed.slice(1).trimStart();
    if (!body) {
      continue;
    }
    body = body.replace(/\s+#+\s*$/, '').trim();
    return body || null;
  }

  return null;
}
