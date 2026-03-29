import {
  buildInboxMarkdownFromCompose,
  inboxMarkdownFileToComposeInput,
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

  test('inboxMarkdownFileToComposeInput inverts buildInboxMarkdownFromCompose', () => {
    const compose = 'Meeting notes\n\nLine 2\nLine 3';
    const file = buildInboxMarkdownFromCompose('Meeting notes', 'Line 2\nLine 3');
    expect(inboxMarkdownFileToComposeInput(file)).toBe(compose);
  });

  test('inboxMarkdownFileToComposeInput handles title-only H1 file', () => {
    expect(inboxMarkdownFileToComposeInput('# Meeting notes\n')).toBe('Meeting notes');
  });

  test('inboxMarkdownFileToComposeInput strips blank lines after H1', () => {
    expect(inboxMarkdownFileToComposeInput('# Title\n\n\nBody')).toBe('Title\n\nBody');
  });

  test('inboxMarkdownFileToComposeInput falls back when no H1', () => {
    expect(inboxMarkdownFileToComposeInput('Plain first\nSecond')).toBe('Plain first\n\nSecond');
  });
});
