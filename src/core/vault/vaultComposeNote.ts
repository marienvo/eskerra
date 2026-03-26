type ParsedComposeInput = {
  bodyAfterBlank: string;
  titleLine: string;
};

export function parseComposeInput(raw: string): ParsedComposeInput {
  const [firstLineRaw, ...remainingLines] = raw.split(/\r?\n/);
  const titleLine = (firstLineRaw ?? '').trim();
  const bodyAfterBlank = remainingLines.join('\n').trim();

  return {
    bodyAfterBlank,
    titleLine,
  };
}

export function buildInboxMarkdownFromCompose(
  titleLine: string,
  bodyAfterBlank: string,
): string {
  const normalizedTitle = titleLine.trim();
  const normalizedBody = bodyAfterBlank.trim();

  if (!normalizedBody) {
    return `# ${normalizedTitle}\n`;
  }

  return `# ${normalizedTitle}\n\n${normalizedBody}`;
}

/**
 * Converts stored inbox markdown (typically `# Title` + optional body) into the compose
 * text field format: first line is the title, blank line, then body — matching {@link parseComposeInput}.
 * If there is no `# ` H1 first line, treats the first line as title and the rest as body (same split as compose).
 */
export function inboxMarkdownFileToComposeInput(markdown: string): string {
  const trimmed = markdown.trimEnd();
  if (!trimmed) {
    return '';
  }

  const lines = trimmed.split(/\r?\n/);
  const firstLine = lines[0] ?? '';
  const h1Match = /^#\s+(.*)$/.exec(firstLine);

  if (h1Match) {
    const titleLine = h1Match[1].trim();
    const restLines = lines.slice(1);
    let start = 0;
    while (start < restLines.length && restLines[start].trim() === '') {
      start += 1;
    }
    const body = restLines.slice(start).join('\n').trimEnd();
    return body ? `${titleLine}\n\n${body}` : titleLine;
  }

  const titleLine = firstLine.trim();
  const body = lines.slice(1).join('\n').trim();
  return body ? `${titleLine}\n\n${body}` : titleLine;
}
