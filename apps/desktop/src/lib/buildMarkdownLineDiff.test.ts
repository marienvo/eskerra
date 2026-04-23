import {describe, expect, it} from 'vitest';
import {applyHunkToText, buildDiffSegments, computeOtherHunkRange, removeConflictBackupWarningLine} from './buildMarkdownLineDiff';
import {splitLines} from './lineLcs';

describe('buildDiffSegments', () => {
  it('returns no hunks when texts are identical', () => {
    const {segments, hunks} = buildDiffSegments('a\nb\nc', 'a\nb\nc');
    expect(hunks).toHaveLength(0);
    const contextLines = segments.flatMap(s => (s.kind === 'context' ? s.lines : []));
    expect(contextLines).toEqual(['a', 'b', 'c']);
  });

  it('identifies a simple replacement hunk', () => {
    const {segments, hunks} = buildDiffSegments('a\nb\nc', 'a\nB\nc');
    expect(hunks).toHaveLength(1);
    const hunk = segments.find(s => s.kind === 'hunk');
    expect(hunk?.kind).toBe('hunk');
    if (hunk?.kind === 'hunk') {
      expect(hunk.leftLines).toEqual(['b']);
      expect(hunk.rightLines).toEqual(['B']);
    }
  });

  it('identifies a deletion hunk', () => {
    const {hunks} = buildDiffSegments('a\nb\nc', 'a\nc');
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines).toEqual([]);
    expect(hunks[0]!.start).toBe(1);
    expect(hunks[0]!.end).toBe(2);
  });

  it('identifies an insertion hunk', () => {
    const {hunks} = buildDiffSegments('a\nc', 'a\nb\nc');
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines).toEqual(['b']);
    expect(hunks[0]!.start).toBe(1);
    expect(hunks[0]!.end).toBe(1);
  });

  it('collapses long context with ellipsis', () => {
    const base = Array.from({length: 20}, (_, i) => `line${i}`).join('\n');
    const other = base.replace('line10', 'LINE10');
    const {segments} = buildDiffSegments(base, other);
    const contextTexts = segments
      .filter(s => s.kind === 'context')
      .flatMap(s => s.lines);
    expect(contextTexts.some(l => l.startsWith('…'))).toBe(true);
  });
});

describe('applyHunkToText', () => {
  it('replaces lines in base with hunk replacement', () => {
    const base = 'a\nb\nc';
    const result = applyHunkToText(base, {start: 1, end: 2, lines: ['B', 'X']});
    expect(result).toBe('a\nB\nX\nc');
  });

  it('deletes lines when hunk has no replacement', () => {
    const base = 'a\nb\nc';
    const result = applyHunkToText(base, {start: 1, end: 2, lines: []});
    expect(result).toBe('a\nc');
  });

  it('inserts lines when hunk has no removed range', () => {
    const base = 'a\nc';
    const result = applyHunkToText(base, {start: 1, end: 1, lines: ['b']});
    expect(result).toBe('a\nb\nc');
  });

  it('applying a hunk then rebuilding diff shows no more changes for that hunk', () => {
    const base = 'a\nb\nc\nd';
    const other = 'a\nB\nc\nD';
    const {hunks} = buildDiffSegments(base, other);
    expect(hunks).toHaveLength(2);
    const after = applyHunkToText(base, hunks[0]!);
    const {hunks: remaining} = buildDiffSegments(after, other);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.lines).toEqual(['D']);
  });
});

describe('computeOtherHunkRange', () => {
  it('returns correct range for first hunk with leading context', () => {
    const {hunks} = buildDiffSegments('a\nb\nc', 'a\nB\nc');
    // hunk 0: start=1,end=2,lines=['B'] → in other: position 1..2
    expect(computeOtherHunkRange(hunks, 0)).toEqual({start: 1, end: 2});
  });

  it('returns correct range for second hunk', () => {
    const {hunks} = buildDiffSegments('a\nb\nc\nd', 'a\nB\nc\nD');
    // hunk 0: start=1,end=2,lines=['B'] (in other: 1..2)
    // hunk 1: start=3,end=4,lines=['D'] → 1 equal before + 1 ins + 1 equal → oPos=1+1+1=3
    expect(computeOtherHunkRange(hunks, 1)).toEqual({start: 3, end: 4});
  });

  it('accept-right makes both sides identical (replace scenario)', () => {
    const right = 'a\nb\nc';
    const left = 'a\nB\nc';
    const {hunks} = buildDiffSegments(right, left);
    expect(hunks).toHaveLength(1);
    // Accept right: update left to match right for this hunk
    const rightLines = splitLines(right).slice(hunks[0]!.start, hunks[0]!.end);
    const {start, end} = computeOtherHunkRange(hunks, 0);
    const newLeft = applyHunkToText(left, {start, end, lines: rightLines});
    expect(newLeft).toBe(right);
    expect(buildDiffSegments(right, newLeft).hunks).toHaveLength(0);
  });

  it('accept-right makes both sides identical (insertion scenario)', () => {
    const right = 'a\nc';
    const left = 'a\nb\nc';
    const {hunks} = buildDiffSegments(right, left);
    expect(hunks).toHaveLength(1);
    const rightLines = splitLines(right).slice(hunks[0]!.start, hunks[0]!.end);
    const {start, end} = computeOtherHunkRange(hunks, 0);
    const newLeft = applyHunkToText(left, {start, end, lines: rightLines});
    expect(newLeft).toBe(right);
  });
});

describe('removeConflictBackupWarningLine', () => {
  it('removes the warning line alone when no surrounding blank lines', () => {
    const body = 'first\n> [!warning] Conflict backup: [[note]]\nlast';
    expect(removeConflictBackupWarningLine(body)).toBe('first\nlast');
  });

  it('removes the warning line and adjacent blank lines above and below', () => {
    const body = 'first\n\n> [!warning] Conflict backup: [[note]]\n\nlast';
    expect(removeConflictBackupWarningLine(body)).toBe('first\nlast');
  });

  it('removes multiple trailing blank lines below but only contiguous ones', () => {
    const body = 'first\n\n> [!warning] Conflict backup: [[note]]\n\n\nlast';
    expect(removeConflictBackupWarningLine(body)).toBe('first\nlast');
  });

  it('is a no-op when no warning line is present', () => {
    const body = 'just\nnormal\ntext';
    expect(removeConflictBackupWarningLine(body)).toBe(body);
  });

  it('removes warning line at start of body', () => {
    const body = '> [!warning] Conflict backup: [[note]]\n\nsome text';
    expect(removeConflictBackupWarningLine(body)).toBe('some text');
  });
});
