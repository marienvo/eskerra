/**
 * Conflict-free 3-way line merge for vault markdown (base = last known persist, local = editor, remote = disk).
 * Returns `ok: false` when edits overlap on the same base region or ordering is ambiguous.
 *
 * Lines use LF only; callers should pass strings already normalized with the same rules as disk reads.
 */

import {editsFromBaseToOther, splitLines, type LineEditHunk} from './lineLcs';

function normalizeLf(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Half-open span on base lines touched by a hunk; pure inserts use [i, i+1). */
function hunkBaseSpan(h: LineEditHunk): [number, number] {
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

function hunksConflict(a: LineEditHunk, b: LineEditHunk): boolean {
  const sa = hunkBaseSpan(a);
  const sb = hunkBaseSpan(b);
  return spansOverlap(sa, sb);
}

function mergeDisjointHunks(
  base: string[],
  left: LineEditHunk[],
  right: LineEditHunk[],
): string[] | null {
  for (const a of left) {
    for (const b of right) {
      if (hunksConflict(a, b)) {
        return null;
      }
    }
  }
  const all: LineEditHunk[] = [...left, ...right].sort((x, y) => y.start - x.start);
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
