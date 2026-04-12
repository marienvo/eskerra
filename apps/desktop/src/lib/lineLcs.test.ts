import {describe, expect, it} from 'vitest';

import {editsFromBaseToOther, lineLcsPairs, splitLines} from './lineLcs';

describe('splitLines', () => {
  it('returns [] for empty string', () => {
    expect(splitLines('')).toEqual([]);
  });

  it('splits on newlines', () => {
    expect(splitLines('a\nb')).toEqual(['a', 'b']);
  });
});

describe('lineLcsPairs', () => {
  it('pairs identical single-line docs', () => {
    expect(lineLcsPairs(['x'], ['x'])).toEqual([[0, 0]]);
  });

  it('returns empty when no line matches', () => {
    expect(lineLcsPairs(['a'], ['b'])).toEqual([]);
  });
});

describe('editsFromBaseToOther', () => {
  it('returns empty when base and other are identical', () => {
    expect(editsFromBaseToOther(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('replaces tail line', () => {
    expect(editsFromBaseToOther(['a', 'b'], ['a', 'c'])).toEqual([
      {start: 1, end: 2, lines: ['c']},
    ]);
  });

  it('inserts after single base line', () => {
    expect(editsFromBaseToOther(['m'], ['m', 'tail'])).toEqual([
      {start: 1, end: 1, lines: ['tail']},
    ]);
  });
});
