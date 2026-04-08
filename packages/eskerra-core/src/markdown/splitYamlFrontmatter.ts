/**
 * Detects a well-formed YAML-style frontmatter block at the start of markdown (after optional blank
 * lines): first non-empty line is exactly `---`, later a closing line is exactly `---`.
 * If the block is not well-formed (including missing closing delimiter), returns `frontmatter: null`
 * and `body` is the full normalized text unchanged.
 */
export function splitYamlFrontmatter(markdown: string): {
  frontmatter: string | null;
  body: string;
  /** Normalized text before the opening `---` line (only non-empty when that line is not the first). */
  leadingBeforeFrontmatter: string;
} {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let i = 0;
  while (i < lines.length && lines[i].trim() === '') {
    i += 1;
  }

  if (lines[i]?.trim() !== '---') {
    return {
      frontmatter: null,
      body: normalized,
      leadingBeforeFrontmatter: '',
    };
  }

  const openLine = i;
  let off = 0;
  for (let j = 0; j < openLine; j++) {
    off += lines[j].length + 1;
  }
  const leadingBeforeFrontmatter = normalized.slice(0, off);

  i = openLine + 1;

  while (i < lines.length && lines[i].trim() !== '---') {
    i += 1;
  }

  if (i >= lines.length) {
    return {
      frontmatter: null,
      body: normalized,
      leadingBeforeFrontmatter: '',
    };
  }

  const closeLine = i;
  const frontmatter = lines.slice(openLine, closeLine + 1).join('\n');
  const body = lines.slice(closeLine + 1).join('\n');

  return {frontmatter, body, leadingBeforeFrontmatter};
}
