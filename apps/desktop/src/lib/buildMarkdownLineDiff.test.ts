import {describe, expect, it} from 'vitest';
import {applyHunkToText, buildDiffSegments} from './buildMarkdownLineDiff';

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
