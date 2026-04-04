import {describe, expect, it} from 'vitest';

import {renameDraftStemForMarkdownUri} from './renameDialogDraft';

describe('renameDraftStemForMarkdownUri', () => {
  // Shapes match collectVaultMarkdownRefs: `name` is stem, not `*.md`.
  const refs = [
    {name: 'indexed', uri: '/vault/Projects/indexed.md'},
    {name: 'Note', uri: 'C:\\vault\\Inbox\\sub\\Note.md'},
  ];

  it('uses vault ref stem when uri matches ref', () => {
    expect(renameDraftStemForMarkdownUri('/vault/Projects/indexed.md', refs)).toBe('indexed');
  });

  it('derives stem from uri basename when not in refs (deep Inbox path)', () => {
    expect(
      renameDraftStemForMarkdownUri('/vault/Inbox/nested/deep page.md', []),
    ).toBe('deep page');
  });

  it('normalizes backslashes to match refs', () => {
    expect(renameDraftStemForMarkdownUri('C:\\vault\\Inbox\\sub\\Note.md', refs)).toBe('Note');
  });

  it('returns null for non-markdown', () => {
    expect(renameDraftStemForMarkdownUri('/vault/x.txt', refs)).toBeNull();
  });
});
