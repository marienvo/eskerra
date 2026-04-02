import {describe, expect, it, vi} from 'vitest';

import {deleteInboxMarkdownNote} from './vaultBootstrap';

import type {VaultFilesystem} from '@notebox/core';

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
    listFiles: vi.fn().mockResolvedValue([]),
  };
  return {fs, unlinks};
}

describe('deleteInboxMarkdownNote', () => {
  it('unlinks the note and refreshes the inbox index', async () => {
    const {fs, unlinks} = createFsMock();
    const root = '/vault';
    const noteUri = '/vault/Inbox/note.md';

    await deleteInboxMarkdownNote(root, noteUri, fs);

    expect(fs.unlink).toHaveBeenCalledWith(noteUri);
    expect(unlinks).toEqual([noteUri]);
    expect(fs.listFiles).toHaveBeenCalledWith('/vault/Inbox');
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/vault/General/Inbox.md',
      expect.any(String),
      {encoding: 'utf8', mimeType: 'text/markdown'},
    );
  });

  it('rejects paths outside Inbox', async () => {
    const {fs} = createFsMock();
    await expect(
      deleteInboxMarkdownNote('/vault', '/vault/General/other.md', fs),
    ).rejects.toThrow('not in the vault Inbox folder');
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('rejects nested paths under Inbox', async () => {
    const {fs} = createFsMock();
    await expect(
      deleteInboxMarkdownNote('/vault', '/vault/Inbox/sub/note.md', fs),
    ).rejects.toThrow('Invalid inbox note path');
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('rejects non-markdown files', async () => {
    const {fs} = createFsMock();
    await expect(
      deleteInboxMarkdownNote('/vault', '/vault/Inbox/note.txt', fs),
    ).rejects.toThrow('Only inbox markdown');
    expect(fs.unlink).not.toHaveBeenCalled();
  });
});
