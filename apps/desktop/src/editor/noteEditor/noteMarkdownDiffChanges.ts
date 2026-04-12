/**
 * Line-diff-based minimal document changes so CodeMirror can map selections
 * through `loadMarkdown` with `selection: 'preserve'` (avoids a single full-doc replace).
 */

import {
  editsFromBaseToOther,
  lineLcsPairs,
  splitLines,
  type LineEditHunk,
} from '../../lib/lineLcs';

function lineStartOffsets(lines: readonly string[]): number[] {
  const n = lines.length;
  const out: number[] = new Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    out[i] = p;
    p += lines[i]!.length;
    if (i + 1 < n) {
      p += 1;
    }
  }
  return out;
}

/**
 * Text to insert for a line hunk so that replacing `oldText[from..to)` yields
 * the same string as `oldLines` after the line-array splice + `join('\n')`.
 */
function insertTextForLineHunk(
  oldLines: readonly string[],
  hunk: LineEditHunk,
): string {
  const joined = hunk.lines.join('\n');
  if (hunk.start === hunk.end && hunk.start === oldLines.length) {
    return joined.length > 0 ? `\n${joined}` : '';
  }
  if (hunk.end < oldLines.length && hunk.lines.length > 0) {
    return `${joined}\n`;
  }
  return joined;
}

function hunkToChange(
  oldText: string,
  oldLines: readonly string[],
  oldOffsets: readonly number[],
  hunk: LineEditHunk,
): {from: number; to: number; insert: string} {
  const from =
    hunk.start < oldLines.length ? oldOffsets[hunk.start]! : oldText.length;
  const to = hunk.end < oldLines.length ? oldOffsets[hunk.end]! : oldText.length;
  const insert = insertTextForLineHunk(oldLines, hunk);
  return {from, to, insert};
}

/** One contiguous replace/insert for CodeMirror `changes` (preserve path). */
export type MarkdownDocReplaceChunk = {
  from: number;
  to: number;
  insert: string;
};

/**
 * Minimal replace/insert specs from `oldText` to `newText` (line-level LCS).
 * Returns `[]` when identical. When there is no common line between the two
 * sides, returns a single full-document replace (caret mapping still coarse).
 */
export function computeMinimalEditorChanges(
  oldText: string,
  newText: string,
): readonly MarkdownDocReplaceChunk[] {
  if (oldText === newText) {
    return [];
  }
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const lcsLen = lineLcsPairs(oldLines, newLines).length;
  if (
    lcsLen === 0
    && (oldLines.length > 0 || newLines.length > 0)
  ) {
    return [{from: 0, to: oldText.length, insert: newText}];
  }
  const hunks = editsFromBaseToOther(oldLines, newLines);
  if (hunks.length === 0) {
    return [];
  }
  const oldOffsets = lineStartOffsets(oldLines);
  return hunks.map(h => hunkToChange(oldText, oldLines, oldOffsets, h));
}

/**
 * Map a character offset in `oldText` to a position in `newText` using the same
 * line hunks as `computeMinimalEditorChanges`. Positions inside a replaced span
 * map to the start of that span's insertion in the new document.
 */
export function mapPositionThroughDiff(
  oldPos: number,
  oldText: string,
  newText: string,
): number {
  if (oldText === newText) {
    return Math.min(Math.max(0, oldPos), newText.length);
  }
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const lcsLen = lineLcsPairs(oldLines, newLines).length;
  if (
    lcsLen === 0
    && (oldLines.length > 0 || newLines.length > 0)
  ) {
    return Math.min(Math.max(0, oldPos), newText.length);
  }
  const hunks = editsFromBaseToOther(oldLines, newLines);
  const oldOffsets = lineStartOffsets(oldLines);
  let cum = 0;
  for (const h of hunks) {
    const {from, to, insert} = hunkToChange(oldText, oldLines, oldOffsets, h);
    const removedLen = to - from;
    const insertLen = insert.length;
    if (oldPos < from) {
      return oldPos + cum;
    }
    if (oldPos < to) {
      return from + cum;
    }
    cum += insertLen - removedLen;
  }
  return oldPos + cum;
}
