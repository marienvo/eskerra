/**
 * Line-level longest common subsequence (LCS) between two string arrays.
 * Used by vault three-way merge and editor diff-based caret preservation.
 */

export function splitLines(s: string): string[] {
  if (s.length === 0) {
    return [];
  }
  return s.split('\n');
}

export type LineEditHunk = {start: number; end: number; lines: string[]};

/**
 * Indices (i, j) of matched equal lines between `base` and `other`.
 */
export function lineLcsPairs(
  base: string[],
  other: string[],
): Array<[number, number]> {
  const n = base.length;
  const m = other.length;
  const dp: number[][] = Array.from({length: n + 1}, () =>
    Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j]! =
        base[i] === other[j]
          ? 1 + dp[i + 1]![j + 1]!
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
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

/**
 * Minimal line-based edit script from `base` to `other`: each hunk replaces
 * `base[start..end)` with `lines` (join with `\n` for the inserted text).
 */
export function editsFromBaseToOther(
  base: string[],
  other: string[],
): LineEditHunk[] {
  const pairs = lineLcsPairs(base, other);
  const out: LineEditHunk[] = [];
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
