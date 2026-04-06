/**
 * Conflict-free 3-way line merge for vault markdown (base = last known persist, local = editor, remote = disk).
 * Returns `ok: false` when edits overlap on the same base region or ordering is ambiguous.
 *
 * Lines use LF only; callers should pass strings already normalized with the same rules as disk reads.
 */

function normalizeLf(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function splitLines(s: string): string[] {
  if (s.length === 0) {
    return [];
  }
  return s.split('\n');
}

type Hunk = {start: number; end: number; lines: string[]};

function lineLcsPairs(base: string[], other: string[]): Array<[number, number]> {
  const n = base.length;
  const m = other.length;
  const dp: number[][] = Array.from({length: n + 1}, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        base[i] === other[j] ? 1 + dp[i + 1]![j + 1]! : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (base[i] === other[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

function editsFromBaseToOther(base: string[], other: string[]): Hunk[] {
  const pairs = lineLcsPairs(base, other);
  const out: Hunk[] = [];
  let pb = 0;
  let po = 0;
  for (const [b, o] of pairs) {
    if (b > pb || o > po) {
      out.push({start: pb, end: b, lines: other.slice(po, o)});
    }
    pb = b + 1;
    po = o + 1;
  }
  if (pb < base.length || po < other.length) {
    out.push({start: pb, end: base.length, lines: other.slice(po)});
  }
  return out;
}

/** Half-open span on base lines touched by a hunk; pure inserts use [i, i+1). */
function hunkBaseSpan(h: Hunk): [number, number] {
  if (h.end > h.start) {
    return [h.start, h.end];
  }
  if (h.lines.length > 0) {
    return [h.start, h.start + 1];
  }
  return [h.start, h.start];
}

function spansOverlap(a: [number, number], b: [number, number]): boolean {
  return Math.max(a[0], b[0]) < Math.min(a[1], b[1]);
}

function hunksConflict(a: Hunk, b: Hunk): boolean {
  const sa = hunkBaseSpan(a);
  const sb = hunkBaseSpan(b);
  return spansOverlap(sa, sb);
}

function mergeDisjointHunks(base: string[], left: Hunk[], right: Hunk[]): string[] | null {
  for (const a of left) {
    for (const b of right) {
      if (hunksConflict(a, b)) {
        return null;
      }
    }
  }
  const all: Hunk[] = [...left, ...right].sort((x, y) => y.start - x.start);
  const out = base.slice();
  for (const h of all) {
    out.splice(h.start, h.end - h.start, ...h.lines);
  }
  return out;
}

/**
 * @param base - `lastPersisted.markdown` (LF)
 * @param local - editor buffer (LF)
 * @param disk - normalized disk body (LF)
 */
export function tryMergeThreeWayVaultMarkdown(
  base: string,
  local: string,
  disk: string,
): {ok: true; merged: string} | {ok: false} {
  const b = normalizeLf(base);
  const l = normalizeLf(local);
  const d = normalizeLf(disk);
  if (l === d) {
    return {ok: true, merged: d};
  }
  if (b === l) {
    return {ok: true, merged: d};
  }
  if (b === d) {
    return {ok: true, merged: l};
  }

  const baseLines = splitLines(b);
  const localLines = splitLines(l);
  const diskLines = splitLines(d);

  const el = editsFromBaseToOther(baseLines, localLines);
  const er = editsFromBaseToOther(baseLines, diskLines);
  const mergedLines = mergeDisjointHunks(baseLines, el, er);
  if (mergedLines === null) {
    return {ok: false};
  }
  return {ok: true, merged: mergedLines.join('\n')};
}
