/**
 * Remove optional ATX closing hash run (ASCII space/tab before `#`… at EOL).
 * Linear time; avoids backtracking-heavy `\s+#+\s*$` on user-controlled strings.
 */
export function stripTrailingAtxClosingHashes(text: string): string {
  const trimmedEnd = text.trimEnd();
  let hashStart = trimmedEnd.length;
  while (hashStart > 0 && trimmedEnd.charCodeAt(hashStart - 1) === 0x23) {
    hashStart -= 1;
  }
  if (hashStart === trimmedEnd.length || hashStart === 0) {
    return text.trim();
  }
  const before = trimmedEnd.charCodeAt(hashStart - 1);
  if (before === 0x20 || before === 0x09) {
    return trimmedEnd.slice(0, hashStart).trimEnd().trim();
  }
  return text.trim();
}
