import {
  buildInboxMarkdownFromCompose,
  parseComposeInput,
} from '../src/core/vault/vaultComposeNote';

describe('vaultComposeNote', () => {
  test('parses input with only first line as title', () => {
    expect(parseComposeInput('Meeting notes')).toEqual({
      bodyAfterBlank: '',
      titleLine: 'Meeting notes',
    });
  });

  test('parses first line as title and keeps remaining lines as body', () => {
    expect(parseComposeInput('Meeting notes\n\nLine 2\nLine 3')).toEqual({
      bodyAfterBlank: 'Line 2\nLine 3',
      titleLine: 'Meeting notes',
    });
  });

  test('builds markdown with only H1 when no body is provided', () => {
    expect(buildInboxMarkdownFromCompose('Meeting notes', '')).toBe('# Meeting notes\n');
  });

  test('builds markdown with H1, blank line, and body', () => {
    expect(buildInboxMarkdownFromCompose('Meeting notes', 'Line 2\nLine 3')).toBe(
      '# Meeting notes\n\nLine 2\nLine 3',
    );
  });

  test('keeps special characters in H1 title content', () => {
    expect(buildInboxMarkdownFromCompose('Sprint #12: done?!', 'Body')).toBe(
      '# Sprint #12: done?!\n\nBody',
    );
  });
});
