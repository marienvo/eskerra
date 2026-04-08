/**
 * Rejoins output of {@link splitYamlFrontmatter} with edited body text. Round-trip:
 * `mergeYamlFrontmatterBody(fm, b, lead) === full` (CRLF normalized) when `(fm, b, lead)` came from `splitYamlFrontmatter(full)`.
 */
export function mergeYamlFrontmatterBody(
  frontmatter: string | null,
  body: string,
  leadingBeforeFrontmatter = '',
): string {
  const b = body.replace(/\r\n/g, '\n');
  if (frontmatter === null) {
    return b;
  }
  const head = frontmatter.trimEnd();
  const lead = leadingBeforeFrontmatter.replace(/\r\n/g, '\n');
  return `${lead}${head}\n${b}`;
}
