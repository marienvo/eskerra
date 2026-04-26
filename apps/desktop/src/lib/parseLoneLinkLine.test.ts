import {describe, expect, it} from 'vitest';

import {parseLoneLinkLine} from './parseLoneLinkLine';

describe('parseLoneLinkLine', () => {
  it('matches bare URL', () => {
    expect(parseLoneLinkLine('https://example.com/a')).toEqual({
      url: 'https://example.com/a',
      urlOffset: 0,
    });
  });

  it('matches bullet-prefixed URL', () => {
    expect(parseLoneLinkLine('- https://example.com/a')).toEqual({
      url: 'https://example.com/a',
      urlOffset: 2,
    });
    expect(parseLoneLinkLine('  * https://ex.com')).toEqual({
      url: 'https://ex.com',
      urlOffset: 4,
    });
  });

  it('matches ordered list + task box', () => {
    expect(parseLoneLinkLine('1. [ ] https://ex.com')).toEqual({
      url: 'https://ex.com',
      urlOffset: 7,
    });
  });

  it('strips trailing punctuation', () => {
    expect(parseLoneLinkLine('https://example.com,')).toEqual({
      url: 'https://example.com',
      urlOffset: 0,
    });
  });

  it('rejects lines with extra text', () => {
    expect(parseLoneLinkLine('see https://ex.com')).toBeNull();
    expect(parseLoneLinkLine('https://ex.com cool')).toBeNull();
    expect(parseLoneLinkLine('[label](https://ex.com)')).toBeNull();
    expect(parseLoneLinkLine('<https://ex.com>')).toBeNull();
  });

  it('rejects non-http schemes and obvious garbage', () => {
    expect(parseLoneLinkLine('sftp://foo.com')).toBeNull();
    expect(parseLoneLinkLine('https://')).toBeNull();
    expect(parseLoneLinkLine('')).toBeNull();
  });
});
