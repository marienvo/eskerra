import {describe, expect, it} from 'vitest';

import {
  CLIPBOARD_HTML_MAX_CHARS,
  clipboardHtmlToMarkdown,
  isHtmlWrapperForPasteUrlAsLink,
  tryClipboardHtmlToMarkdownInsert,
} from './htmlClipboardToMarkdown';

describe('isHtmlWrapperForPasteUrlAsLink', () => {
  it('returns true for a single anchor wrapping the same URL as plain text', () => {
    expect(
      isHtmlWrapperForPasteUrlAsLink(
        '<a href="https://example.com/path">https://example.com/path</a>',
        'https://example.com/path',
      ),
    ).toBe(true);
  });

  it('returns true when body text is only the URL (no structure)', () => {
    expect(
      isHtmlWrapperForPasteUrlAsLink(
        '<html><body>https://example.com/x</body></html>',
        'https://example.com/x',
      ),
    ).toBe(true);
  });

  it('returns false when plain is not a single URL token', () => {
    expect(
      isHtmlWrapperForPasteUrlAsLink('<p><a href="https://x.com">x</a></p>', 'hello'),
    ).toBe(false);
  });
});

describe('clipboardHtmlToMarkdown', () => {
  it('converts list and emphasis', () => {
    const md = clipboardHtmlToMarkdown(
      '<ul><li><strong>Bold</strong> and <em>italic</em></li></ul>',
    );
    expect(md).toContain('- ');
    expect(md).toContain('**Bold**');
    expect(md).toContain('*italic*');
  });

  it('converts links', () => {
    const md = clipboardHtmlToMarkdown(
      '<p><a href="https://example.com">Example</a></p>',
    );
    expect(md).toContain('[Example](https://example.com)');
  });

  it('converts a simple table to GFM pipe table', () => {
    const md = clipboardHtmlToMarkdown(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead>'
        + '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
    expect(md).toContain('|');
    expect(md).toMatch(/A/);
    expect(md).toMatch(/B/);
  });

  it('converts task list checkboxes', () => {
    const md = clipboardHtmlToMarkdown(
      '<ul><li><input type="checkbox" checked /> Done</li>'
        + '<li><input type="checkbox" /> Todo</li></ul>',
    );
    expect(md).toContain('[x]');
    expect(md).toContain('[ ]');
  });

  it('uses GFM double-tilde strikethrough', () => {
    const md = clipboardHtmlToMarkdown('<p><del>gone</del></p>');
    expect(md).toContain('~~gone~~');
  });
});

describe('tryClipboardHtmlToMarkdownInsert', () => {
  it('returns null for URL-only paste so pasteURLAsLink can run', () => {
    expect(
      tryClipboardHtmlToMarkdownInsert(
        '<meta><a href="https://example.com">https://example.com</a>',
        'https://example.com',
      ),
    ).toBeNull();
  });

  it('returns null when HTML is not structurally interesting', () => {
    expect(tryClipboardHtmlToMarkdownInsert('<span>x</span>', 'x')).toBeNull();
  });

  it('returns null when converted Markdown matches plain text', () => {
    expect(
      tryClipboardHtmlToMarkdownInsert('<p>hello</p>', 'hello'),
    ).toBeNull();
  });

  it('returns Markdown when structure differs from plain', () => {
    const out = tryClipboardHtmlToMarkdownInsert(
      '<p><strong>x</strong></p>',
      'x',
    );
    expect(out).toContain('**x**');
  });

  it('returns Markdown when plain is empty but HTML is structured (WebKit empty text/plain)', () => {
    const out = tryClipboardHtmlToMarkdownInsert(
      '<p><strong>Hi</strong></p>',
      '',
    );
    expect(out).toContain('**Hi**');
  });

  it('returns null when HTML exceeds size limit', () => {
    const huge = `<p><strong>${'a'.repeat(CLIPBOARD_HTML_MAX_CHARS)}</strong></p>`;
    expect(tryClipboardHtmlToMarkdownInsert(huge, '')).toBeNull();
  });
});
