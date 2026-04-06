import {describe, expect, it} from 'vitest';

import {vaultTreeRowLabel} from './vaultTreeRowLabel';
import type {VaultTreeItemData} from './vaultTreeLoadChildren';

function article(name: string, uri: string): VaultTreeItemData {
  return {kind: 'article', name, uri, lastModified: null};
}

function folder(name: string, uri: string): VaultTreeItemData {
  return {kind: 'folder', name, uri, lastModified: null};
}

describe('vaultTreeRowLabel', () => {
  it('strips .md from article rows (case-insensitive)', () => {
    expect(vaultTreeRowLabel(article('Note.md', '/v/Note.md'))).toBe('Note');
    expect(vaultTreeRowLabel(article('long.name.md', '/v/long.name.md'))).toBe('long.name');
  });

  it('leaves folder names unchanged', () => {
    expect(vaultTreeRowLabel(folder('Inbox', '/v/Inbox'))).toBe('Inbox');
    expect(vaultTreeRowLabel(folder('refs.md', '/v/refs.md'))).toBe('refs.md');
  });
});
