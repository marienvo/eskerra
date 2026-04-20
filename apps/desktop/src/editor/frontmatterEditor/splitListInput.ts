/**
 * Split user input meant for list/tags into discrete items (commas, semicolons,
 * tabs, newlines). Trims whitespace; drops empty segments; preserves duplicates.
 */
export function splitListInput(raw: string): string[] {
  return raw
    .split(/[\n,;\t]+/u)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}
