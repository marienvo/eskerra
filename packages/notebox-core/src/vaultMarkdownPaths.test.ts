import {describe, expect, it} from 'vitest';

import {assertVaultMarkdownNoteUriForCrud} from './vaultMarkdownPaths';

/**
 * Policy: vault markdown CRUD allows **nested** paths anywhere under the vault root (except
 * hard-excluded dirs and ignored name segments). The Inbox **list** UI remains top-level-only;
 * `assertVaultMarkdownNoteUriForCrud` is the gate for delete/rename on arbitrary vault `.md` paths.
 */
describe('assertVaultMarkdownNoteUriForCrud (nested vault markdown)', () => {
  it('accepts nested markdown under the vault root', () => {
    expect(assertVaultMarkdownNoteUriForCrud('/vault', '/vault/Projects/2026/note.md')).toBe(
      '/vault/Projects/2026/note.md',
    );
    expect(assertVaultMarkdownNoteUriForCrud('/vault', '/vault/Inbox/subject/a.md')).toBe(
      '/vault/Inbox/subject/a.md',
    );
  });

  it('accepts top-level inbox markdown', () => {
    expect(assertVaultMarkdownNoteUriForCrud('/vault', '/vault/Inbox/a.md')).toBe('/vault/Inbox/a.md');
  });

  it('rejects markdown inside hard-excluded directories', () => {
    expect(() => assertVaultMarkdownNoteUriForCrud('/vault', '/vault/Assets/n.md')).toThrow(
      'excluded folder',
    );
  });

  it('rejects path segments with ignored name prefixes', () => {
    expect(() => assertVaultMarkdownNoteUriForCrud('/vault', '/vault/_hidden/x.md')).toThrow(
      'Invalid note path.',
    );
  });
});
