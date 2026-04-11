import {describe, expect, it} from 'vitest';

import {
  vaultSearchHighlightNeedles,
  vaultSearchHighlightSegments,
  VAULT_SEARCH_HIGHLIGHT_MIN_TOKEN_CHARS,
} from './vaultSearchHighlight';

describe('vaultSearchHighlightNeedles', () => {
  it('includes full trimmed query and tokens with length >= min', () => {
    expect(vaultSearchHighlightNeedles('Foo BAR')).toEqual(['foo bar', 'foo', 'bar']);
  });

  it('dedupes when full query equals a token', () => {
    expect(vaultSearchHighlightNeedles('hello')).toEqual(['hello']);
  });

  it('omits tokens shorter than min length', () => {
    expect(vaultSearchHighlightNeedles('ab cde')).toEqual(['ab cde', 'cde']);
    expect('ab'.length).toBeLessThan(VAULT_SEARCH_HIGHLIGHT_MIN_TOKEN_CHARS);
  });

  it('returns empty for empty query', () => {
    expect(vaultSearchHighlightNeedles('')).toEqual([]);
  });
});

describe('vaultSearchHighlightSegments', () => {
  it('returns empty array for empty text', () => {
    expect(vaultSearchHighlightSegments('', 'foo')).toEqual([]);
  });

  it('returns single non-highlight segment when query is empty', () => {
    expect(vaultSearchHighlightSegments('Hello', '')).toEqual([{text: 'Hello', highlighted: false}]);
  });

  it('highlights case-insensitively and preserves casing', () => {
    expect(vaultSearchHighlightSegments('Hello FOo', 'foo')).toEqual([
      {text: 'Hello ', highlighted: false},
      {text: 'FOo', highlighted: true},
    ]);
  });

  it('merges overlapping ranges from phrase and token', () => {
    const q = 'foo bar';
    const segs = vaultSearchHighlightSegments('X foo bar Y', q);
    expect(segs).toEqual([
      {text: 'X ', highlighted: false},
      {text: 'foo bar', highlighted: true},
      {text: ' Y', highlighted: false},
    ]);
  });

  it('merges adjacent highlights', () => {
    expect(vaultSearchHighlightSegments('foofoo', 'foo')).toEqual([{text: 'foofoo', highlighted: true}]);
  });

  it('handles multiple separate matches', () => {
    expect(vaultSearchHighlightSegments('a foo b foo', 'foo')).toEqual([
      {text: 'a ', highlighted: false},
      {text: 'foo', highlighted: true},
      {text: ' b ', highlighted: false},
      {text: 'foo', highlighted: true},
    ]);
  });
});
