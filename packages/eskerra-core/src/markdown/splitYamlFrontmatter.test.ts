import {describe, expect, test} from 'vitest';

import {splitYamlFrontmatter} from './splitYamlFrontmatter';

describe('splitYamlFrontmatter', () => {
  test('returns null frontmatter when absent', () => {
    const md = '# Title\n\nBody';
    expect(splitYamlFrontmatter(md)).toEqual({
      frontmatter: null,
      body: md,
      leadingBeforeFrontmatter: '',
    });
  });

  test('returns null when leading blocks exist but not frontmatter', () => {
    const md = '\n\n# Hello';
    expect(splitYamlFrontmatter(md)).toEqual({
      frontmatter: null,
      body: md.replace(/\r\n/g, '\n'),
      leadingBeforeFrontmatter: '',
    });
  });

  test('splits well-formed frontmatter', () => {
    const md = `---
foo: bar
---

# From body
`;
    expect(splitYamlFrontmatter(md)).toEqual({
      frontmatter: `---
foo: bar
---`,
      body: '\n# From body\n',
      leadingBeforeFrontmatter: '',
    });
  });

  test('allows blank lines before frontmatter', () => {
    const md = `\n\n---
k: v
---

Body`;
    expect(splitYamlFrontmatter(md)).toEqual({
      frontmatter: `---
k: v
---`,
      body: '\nBody',
      leadingBeforeFrontmatter: '\n\n',
    });
  });

  test('returns null for missing closing delimiter', () => {
    const md = `---
open only
# Still here
`;
    expect(splitYamlFrontmatter(md)).toEqual({
      frontmatter: null,
      body: md.replace(/\r\n/g, '\n'),
      leadingBeforeFrontmatter: '',
    });
  });

  test('returns null for only opening line', () => {
    const md = '---\n';
    expect(splitYamlFrontmatter(md)).toEqual({
      frontmatter: null,
      body: '---\n',
      leadingBeforeFrontmatter: '',
    });
  });

  test('treats immediate closing --- as empty frontmatter', () => {
    const md = '---\n---\n\nHello';
    expect(splitYamlFrontmatter(md)).toEqual({
      frontmatter: '---\n---',
      body: '\nHello',
      leadingBeforeFrontmatter: '',
    });
  });

  test('normalizes CRLF', () => {
    const md = '---\r\nx: 1\r\n---\r\n\r\nok';
    expect(splitYamlFrontmatter(md)).toEqual({
      frontmatter: '---\nx: 1\n---',
      body: '\nok',
      leadingBeforeFrontmatter: '',
    });
  });
});
