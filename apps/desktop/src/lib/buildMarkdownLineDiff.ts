import {editsFromBaseToOther, splitLines, type LineEditHunk} from './lineLcs';

export type DiffSegment =
  | {kind: 'context'; lines: string[]}
  | {kind: 'hunk'; index: number; leftLines: string[]; rightLines: string[]};

const CONTEXT_LINES = 3;

function collapseContext(lines: string[]): DiffSegment[] {
  if (lines.length <= CONTEXT_LINES * 2) {
    return [{kind: 'context', lines}];
  }
  return [
    {kind: 'context', lines: lines.slice(0, CONTEXT_LINES)},
    {kind: 'context', lines: [`…${lines.length - CONTEXT_LINES * 2} unchanged lines…`]},
    {kind: 'context', lines: lines.slice(lines.length - CONTEXT_LINES)},
  ];
}

export function buildDiffSegments(
  baseText: string,
  otherText: string,
): {segments: DiffSegment[]; hunks: LineEditHunk[]} {
  const baseLines = splitLines(baseText);
  const otherLines = splitLines(otherText);
  const hunks = editsFromBaseToOther(baseLines, otherLines);

  if (hunks.length === 0) {
    const ctx = baseLines.length > 0 ? collapseContext(baseLines) : [];
    return {segments: ctx, hunks};
  }

  const segments: DiffSegment[] = [];
  let bPos = 0;

  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i]!;
    const equalBefore = baseLines.slice(bPos, hunk.start);
    if (equalBefore.length > 0) {
      segments.push(...collapseContext(equalBefore));
    }
    segments.push({
      kind: 'hunk',
      index: i,
      leftLines: baseLines.slice(hunk.start, hunk.end),
      rightLines: hunk.lines,
    });
    bPos = hunk.end;
  }

  const trailing = baseLines.slice(bPos);
  if (trailing.length > 0) {
    segments.push(...collapseContext(trailing));
  }

  return {segments, hunks};
}

export function applyHunkToText(baseText: string, hunk: LineEditHunk): string {
  const lines = splitLines(baseText);
  lines.splice(hunk.start, hunk.end - hunk.start, ...hunk.lines);
  return lines.join('\n');
}
