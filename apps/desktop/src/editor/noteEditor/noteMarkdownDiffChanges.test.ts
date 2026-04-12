import {describe, expect, it} from 'vitest';

import {
  computeMinimalEditorChanges,
  mapPositionThroughDiff,
} from './noteMarkdownDiffChanges';

describe('computeMinimalEditorChanges', () => {
  it('returns [] when texts are identical', () => {
    expect(computeMinimalEditorChanges('hello', 'hello')).toEqual([]);
  });

  it('single line replacement is one change', () => {
    expect(computeMinimalEditorChanges('a', 'b')).toEqual([
      {from: 0, to: 1, insert: 'b'},
    ]);
  });

  it('scattered line edits produce multiple ascending changes', () => {
    const oldText = 'line0\nline1\nline2';
    const newText = 'line0\nlocalMid\nline2';
    const changes = computeMinimalEditorChanges(oldText, newText);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      from: 'line0\n'.length,
      to: 'line0\nline1\n'.length,
      insert: 'localMid\n',
    });
  });

  it('handles appended lines', () => {
    const changes = computeMinimalEditorChanges('a', 'a\ntail');
    expect(changes).toEqual([{from: 1, to: 1, insert: '\ntail'}]);
  });

  it('reapplied changes yield newText', () => {
    const pairs: Array<[string, string]> = [
      ['line0\nline1\nline2', 'line0\nlocalMid\nline2'],
      ['a', 'a\ntail'],
      ['hello', 'hello'],
    ];
    for (const [oldText, newText] of pairs) {
      let cur = oldText;
      for (const ch of computeMinimalEditorChanges(oldText, newText)) {
        cur = cur.slice(0, ch.from) + ch.insert + cur.slice(ch.to);
      }
      expect(cur).toBe(newText);
    }
  });

  it('no common line uses single full-document replace', () => {
    const changes = computeMinimalEditorChanges('a', 'b');
    expect(changes).toEqual([{from: 0, to: 1, insert: 'b'}]);
  });

  it('empty to non-empty uses full replace path', () => {
    const changes = computeMinimalEditorChanges('', 'x');
    expect(changes).toEqual([{from: 0, to: 0, insert: 'x'}]);
  });
});

describe('mapPositionThroughDiff', () => {
  it('maps identical strings by clamping only', () => {
    expect(mapPositionThroughDiff(50, 'short', 'short')).toBe(5);
  });

  it('keeps caret in unchanged prefix', () => {
    const oldText = 'line0\nline1\nline2';
    const newText = 'line0\nlocalMid\nline2';
    const head = 2; // inside "line0"
    expect(mapPositionThroughDiff(head, oldText, newText)).toBe(head);
  });

  it('maps caret inside replaced line to start of insertion', () => {
    const oldText = 'line0\nline1\nline2';
    const newText = 'line0\nlocalMid\nline2';
    const startOfLine1 = 'line0\n'.length;
    expect(mapPositionThroughDiff(startOfLine1 + 1, oldText, newText)).toBe(
      startOfLine1,
    );
  });

  it('shifts caret at start of preserved line after a hunk', () => {
    const oldText = 'line0\nline1\nline2';
    const newText = 'line0\nlocalMid\nline2';
    const startOfLine2Old = oldText.indexOf('line2');
    const startOfLine2New = newText.indexOf('line2');
    expect(mapPositionThroughDiff(startOfLine2Old, oldText, newText)).toBe(
      startOfLine2New,
    );
  });

  it('maps EOF after last unchanged segment', () => {
    const oldText = 'a\nb';
    const newText = 'a\nc';
    expect(mapPositionThroughDiff(oldText.length, oldText, newText)).toBe(
      newText.length,
    );
  });
});
