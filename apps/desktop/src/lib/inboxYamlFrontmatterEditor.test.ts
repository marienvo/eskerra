import {describe, expect, it} from 'vitest';

import {inboxEditorSliceToFullMarkdown} from './inboxYamlFrontmatterEditor';

describe('inboxEditorSliceToFullMarkdown', () => {
  it('passes through when composing', () => {
    expect(
      inboxEditorSliceToFullMarkdown('# Hi', null, true, '---\nx\n---', ''),
    ).toBe('# Hi');
  });

  it('merges when block is set and uri is a normal note path', () => {
    expect(
      inboxEditorSliceToFullMarkdown(
        '\nBody',
        '/vault/Inbox/N.md',
        false,
        '---\nk: v\n---',
        '',
      ),
    ).toBe('---\nk: v\n---\n\nBody');
  });

  it('merges Today.md hub the same way (body-only editor slice)', () => {
    expect(
      inboxEditorSliceToFullMarkdown(
        '# Doc',
        '/vault/Work/Today.md',
        false,
        '---\nperpetualType: weekly\n---',
        '',
      ),
    ).toBe('---\nperpetualType: weekly\n---\n# Doc');
  });
});
