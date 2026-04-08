/**
 * Stable `NoteMarkdownEditor` sessionKey for a Today Hub grid cell (no per-open nonce).
 */
export function hubCellStableSessionKey(uri: string, col: number): number {
  const s = `${uri.replace(/\\/g, '/')}:${col}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function hubCellWarmKey(uri: string, col: number): string {
  return `${uri.replace(/\\/g, '/')}\0${col}`;
}

/**
 * LRU order: index 0 = oldest, last = MRU (just touched).
 * `pinnedKey` is never chosen for eviction while trimming (active Today Hub cell).
 */
export function touchWarmLru(
  order: readonly string[],
  key: string,
  maxWarm: number,
  pinnedKey: string | null,
): string[] {
  const max = Math.max(0, maxWarm);
  if (max === 0) {
    return [];
  }
  const filtered = order.filter(k => k !== key);
  let next = [...filtered, key];
  while (next.length > max) {
    const i = next.findIndex(k => k !== pinnedKey);
    if (i === -1) {
      break;
    }
    next = [...next.slice(0, i), ...next.slice(i + 1)];
  }
  return next;
}
