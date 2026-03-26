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
