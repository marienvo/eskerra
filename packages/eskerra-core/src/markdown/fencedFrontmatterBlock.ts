/**
 * Converts a fenced frontmatter block (as returned by {@link splitYamlFrontmatter}'s `frontmatter`
 * field, including the opening and closing `---` lines) to the YAML **inner** string used by
 * {@link parseFrontmatterInner}.
 */
export function fencedFrontmatterBlockToInner(block: string | null): string | null {
  if (block === null) {
    return null;
  }
  const normalized = block.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0]?.trim() !== '---') {
    return normalized;
  }
  let j = 1;
  while (j < lines.length && lines[j].trim() !== '---') {
    j += 1;
  }
  if (j >= lines.length) {
    return '';
  }
  return lines.slice(1, j).join('\n');
}

/** Wrap YAML inner content as a fenced frontmatter block for {@link mergeYamlFrontmatterBody}. */
export function innerToFencedFrontmatterBlock(inner: string): string {
  const body = inner.replace(/\r\n/g, '\n').trimEnd();
  return `---\n${body}\n---`;
}
