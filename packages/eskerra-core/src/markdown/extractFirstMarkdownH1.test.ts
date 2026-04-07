import {describe, expect, test} from 'vitest';

import {extractFirstMarkdownH1} from './extractFirstMarkdownH1';

describe('extractFirstMarkdownH1', () => {
  test('returns null for empty input', () => {
    expect(extractFirstMarkdownH1('')).toBeNull();
    expect(extractFirstMarkdownH1('   \n  ')).toBeNull();
  });

  test('parses first H1', () => {
    expect(extractFirstMarkdownH1('# Hello world')).toBe('Hello world');
    expect(extractFirstMarkdownH1('\n\n# Title here\n\nBody')).toBe('Title here');
  });

  test('ignores H2 and uses first H1 when later', () => {
    expect(
      extractFirstMarkdownH1('Intro line\n\n## Sub\n\n# Real title'),
    ).toBe('Real title');
  });

  test('skips YAML frontmatter', () => {
    const md = `---
foo: bar
---

# From body
`;
    expect(extractFirstMarkdownH1(md)).toBe('From body');
  });

  test('does not treat ill-formed frontmatter as metadata; finds H1 in body', () => {
    const md = `---
no closing fence
# Real title
`;
    expect(extractFirstMarkdownH1(md)).toBe('Real title');
  });

  test('trims closing hash marks in ATX heading', () => {
    expect(extractFirstMarkdownH1('# Trimmed ##')).toBe('Trimmed');
  });

  test('returns null when no H1', () => {
    expect(extractFirstMarkdownH1('Just text\n\n## H2 only')).toBeNull();
  });

  test('ignores lines that are not H1', () => {
    expect(extractFirstMarkdownH1('## Not h1\n# Yes')).toBe('Yes');
  });
});
