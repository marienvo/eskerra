import {describe, expect, it} from 'vitest';

import {
  wikiLinkInnerAtLineColumn,
  wikiLinkMatchAtLineColumn,
} from './wikiLinkInnerAtLineColumn';

describe('wikiLinkInnerAtLineColumn', () => {
  it('returns inner when caret is inside one link on the line', () => {
    const line = 'See [[alpha note]] here.';
    expect(wikiLinkInnerAtLineColumn(line, line.indexOf('a'))).toBe('alpha note');
    expect(wikiLinkInnerAtLineColumn(line, line.indexOf(']]') - 1)).toBe('alpha note');
  });

  it('returns display-form inner including pipe segment', () => {
    const line = '[[target|My Label]]';
    expect(wikiLinkInnerAtLineColumn(line, 3)).toBe('target|My Label');
  });

  it('disambiguates multiple links on the same line by column', () => {
    const line = '[[first]] and [[second]] end';
    const inFirst = line.indexOf('fir');
    const inSecond = line.indexOf('second');
    expect(wikiLinkInnerAtLineColumn(line, inFirst)).toBe('first');
    expect(wikiLinkInnerAtLineColumn(line, inSecond)).toBe('second');
  });

  it('returns null when column is outside any link', () => {
    const line = '[[only]] plain';
    expect(wikiLinkInnerAtLineColumn(line, line.indexOf('plain'))).toBeNull();
    expect(wikiLinkInnerAtLineColumn(line, line.length)).toBeNull();
  });

  it('returns null on column at closing brackets boundary', () => {
    const line = '[[x]]';
    const after = line.indexOf(']]') + 2;
    expect(wikiLinkInnerAtLineColumn(line, after - 1)).toBe('x');
    expect(wikiLinkInnerAtLineColumn(line, after)).toBeNull();
  });

  it('returns inner range when matching a link', () => {
    const line = 'x [[target|Label]] y';
    const col = line.indexOf('target');
    expect(wikiLinkMatchAtLineColumn(line, col)).toEqual({
      inner: 'target|Label',
      innerFrom: line.indexOf('target'),
      innerTo: line.indexOf(']]'),
    });
  });
});
