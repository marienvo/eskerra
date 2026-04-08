import {describe, expect, test} from 'vitest';

import {mergeYamlFrontmatterBody} from './mergeYamlFrontmatterBody';
import {splitYamlFrontmatter} from './splitYamlFrontmatter';

describe('mergeYamlFrontmatterBody', () => {
  test('without frontmatter passes body through normalized', () => {
    expect(mergeYamlFrontmatterBody(null, 'a\r\nb')).toBe('a\nb');
    expect(mergeYamlFrontmatterBody(null, '')).toBe('');
  });

  test('round-trip with splitYamlFrontmatter', () => {
    const cases = [
      '---\nfoo: bar\n---\n\n# Title\n\nBody\n',
      '---\na: 1\n---\n',
      '---\nx: y\n---\n# No blank\n',
      '\n\n---\nk: v\n---\n\nHi\n',
      '---\n---\n\nHello\n',
    ];
    for (const full of cases) {
      const {frontmatter, body, leadingBeforeFrontmatter} =
        splitYamlFrontmatter(full);
      expect(frontmatter).not.toBeNull();
      expect(
        mergeYamlFrontmatterBody(frontmatter, body, leadingBeforeFrontmatter),
      ).toBe(full.replace(/\r\n/g, '\n'));
    }
  });

  test('empty body after frontmatter', () => {
    const full = '---\nx: 1\n---\n';
    const {frontmatter, body, leadingBeforeFrontmatter} =
      splitYamlFrontmatter(full);
    expect(
      mergeYamlFrontmatterBody(frontmatter, body, leadingBeforeFrontmatter),
    ).toBe(full);
  });

  test('trims trailing whitespace on frontmatter block only', () => {
    const fm = '---\na: b\n---  \n';
    const body = '\nNote\n';
    expect(mergeYamlFrontmatterBody(fm, body, '')).toBe(
      '---\na: b\n---\n\nNote\n',
    );
  });
});
