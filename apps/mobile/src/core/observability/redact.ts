const URI_LIKE = /(content:|file:|https?:\/\/)\S+/gi;

/**
 * Removes URI-like substrings from a single string (best-effort; not a security boundary).
 */
export function scrubString(input: string, maxLength = 800): string {
  const stripped = input.replace(URI_LIKE, '[uri]');
  if (stripped.length <= maxLength) {
    return stripped;
  }
  return `${stripped.slice(0, maxLength)}…`;
}
