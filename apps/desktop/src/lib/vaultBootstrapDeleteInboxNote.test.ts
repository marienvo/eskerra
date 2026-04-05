import {describe, expect, it, vi} from 'vitest';

import {deleteVaultMarkdownNote} from './vaultBootstrap';

import type {VaultFilesystem} from '@eskerra/core';

function createFsMock(): {fs: VaultFilesystem; unlinks: string[]} {
  const unlinks: string[] = [];
  const fs: VaultFilesystem = {
    exists: vi.fn().mockResolvedValue(true),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('missing')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockImplementation(async (path: string) => {
      unlinks.push(path);
    }),
    removeTree: vi.fn().mockResolvedValue(undefined),
    renameFile: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue([]),
  };
  return {fs, unlinks};
}

// Nested `.md` paths under the vault are allowed for vault-wide CRUD (not Inbox-list-only).
describe('deleteVaultMarkdownNote', () => {
  it('unlinks the note and refreshes the inbox index', async () => {
    const {fs, unlinks} = createFsMock();
    const root = '/vault';
    const noteUri = '/vault/Inbox/note.md';

    await deleteVaultMarkdownNote(root, noteUri, fs);

    expect(fs.unlink).toHaveBeenCalledWith(noteUri);
    expect(unlinks).toEqual([noteUri]);
    expect(fs.listFiles).toHaveBeenCalledWith('/vault/Inbox');
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/vault/General/Inbox.md',
      expect.any(String),
      {encoding: 'utf8', mimeType: 'text/markdown'},
    );
  });

  it('allows nested vault markdown paths', async () => {
    const {fs, unlinks} = createFsMock();
    const root = '/vault';
    const noteUri = '/vault/Inbox/sub/note.md';
    await deleteVaultMarkdownNote(root, noteUri, fs);
    expect(unlinks).toEqual([noteUri]);
  });

  it('rejects paths outside the vault', async () => {
    const {fs} = createFsMock();
    await expect(
      deleteVaultMarkdownNote('/vault', '/other/Inbox/note.md', fs),
    ).rejects.toThrow('outside the vault');
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('rejects markdown under hard-excluded folders', async () => {
    const {fs} = createFsMock();
    await expect(deleteVaultMarkdownNote('/vault', '/vault/Assets/n.md', fs)).rejects.toThrow(
      'excluded folder',
    );
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('rejects non-markdown files', async () => {
    const {fs} = createFsMock();
    await expect(
      deleteVaultMarkdownNote('/vault', '/vault/Inbox/note.txt', fs),
    ).rejects.toThrow('Only vault markdown');
    expect(fs.unlink).not.toHaveBeenCalled();
  });
});
