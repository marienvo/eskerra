import {describe, expect, it} from 'vitest';

import {splitListInput} from './splitListInput';

describe('splitListInput', () => {
  it('splits on commas, semicolons, tabs, and newlines', () => {
    expect(splitListInput('a,b;c')).toEqual(['a', 'b', 'c']);
    expect(splitListInput('x\t y')).toEqual(['x', 'y']);
    expect(splitListInput('one\ntwo')).toEqual(['one', 'two']);
  });

  it('trims whitespace and drops empty segments', () => {
    expect(splitListInput('  foo  ,  bar  ')).toEqual(['foo', 'bar']);
    expect(splitListInput(',,\n')).toEqual([]);
  });

  it('does not dedupe duplicate entries', () => {
    expect(splitListInput('a,a')).toEqual(['a', 'a']);
  });
});
