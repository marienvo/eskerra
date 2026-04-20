/**
 * Detect duplicate **top-level** mapping keys in YAML frontmatter inner text.
 * Only lines at column 0 (no leading whitespace) before `:` count as root keys.
 */
export function scanDuplicateTopLevelKeys(inner: string): string[] {
  const normalized = inner.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const counts = new Map<string, number>();

  for (const line of lines) {
    if (/^\s/.test(line)) {
      continue;
    }
    const trimmedEnd = line.trimEnd();
    if (trimmedEnd === '' || trimmedEnd.startsWith('#')) {
      continue;
    }

    const key = extractTopLevelKeyLine(line);
    if (key != null) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const dups: string[] = [];
  for (const [k, c] of counts) {
    if (c > 1) {
      dups.push(k);
    }
  }
  return dups.sort((a, b) => a.localeCompare(b));
}

/** First top-level key on a zero-indent line, or null. */
function extractTopLevelKeyLine(line: string): string | null {
  const unquoted = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/.exec(line);
  if (unquoted) {
    return unquoted[1]!;
  }
  const dq = /^"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/.exec(line);
  if (dq) {
    return dq[1]!.replace(/\\"/g, '"');
  }
  const sq = /^'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/.exec(line);
  if (sq) {
    return sq[1]!.replace(/\\'/g, "'");
  }
  return null;
}
