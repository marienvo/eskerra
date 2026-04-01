import {describe, expect, it} from 'vitest';

import {parseLoneMarkdownImageLine} from './loneMarkdownImageLine';

describe('parseLoneMarkdownImageLine', () => {
  it('parses a vault-style pasted line', () => {
    expect(
      parseLoneMarkdownImageLine('![Image](../Assets/Attachments/foo.png)'),
    ).toEqual({alt: 'Image', src: '../Assets/Attachments/foo.png'});
  });

  it('trims outer and inner src whitespace', () => {
    expect(parseLoneMarkdownImageLine('  ![x]( ../a/b.png )  ')).toEqual({
      alt: 'x',
      src: '../a/b.png',
    });
  });

  it('returns null when extra text is present', () => {
    expect(
      parseLoneMarkdownImageLine('see ![Image](../Assets/Attachments/foo.png)'),
    ).toBeNull();
    expect(parseLoneMarkdownImageLine('![a](b.png) more')).toBeNull();
  });

  it('returns null for empty or invalid src', () => {
    expect(parseLoneMarkdownImageLine('![a]()')).toBeNull();
    expect(parseLoneMarkdownImageLine('')).toBeNull();
  });

  it('allows empty alt', () => {
    expect(parseLoneMarkdownImageLine('![](../x.png)')).toEqual({
      alt: '',
      src: '../x.png',
    });
  });

  it('returns null for links (not images)', () => {
    expect(parseLoneMarkdownImageLine('[t](https://x)')).toBeNull();
  });
});
