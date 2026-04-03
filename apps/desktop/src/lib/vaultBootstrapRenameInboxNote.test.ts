import {describe, expect, it, vi} from 'vitest';

import {renameInboxMarkdownNote} from './vaultBootstrap';

import type {VaultFilesystem} from '@notebox/core';

function createFsMock(existingUris: string[] = []): {
  fs: VaultFilesystem;
  renames: Array<{from: string; to: string}>;
} {
  const existing = new Set(existingUris);
  const renames: Array<{from: string; to: string}> = [];
  const fs: VaultFilesystem = {
    exists: vi.fn().mockImplementation(async (path: string) => existing.has(path)),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('missing')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    renameFile: vi.fn().mockImplementation(async (fromPath: string, toPath: string) => {
      renames.push({from: fromPath, to: toPath});
      existing.delete(fromPath);
      existing.add(toPath);
    }),
    listFiles: vi.fn().mockResolvedValue([]),
  };
  return {fs, renames};
}

describe('renameInboxMarkdownNote', () => {
  it('renames the note and refreshes the inbox index', async () => {
    const noteUri = '/vault/Inbox/old-name.md';
    const nextUri = '/vault/Inbox/new name.md';
    const {fs, renames} = createFsMock([noteUri, '/vault/Inbox']);

    const renamedUri = await renameInboxMarkdownNote('/vault', noteUri, 'new name', fs);

    expect(renamedUri).toBe(nextUri);
    expect(fs.renameFile).toHaveBeenCalledWith(noteUri, nextUri);
    expect(renames).toEqual([{from: noteUri, to: nextUri}]);
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
      renameInboxMarkdownNote('/vault', '/vault/General/other.md', 'renamed', fs),
    ).rejects.toThrow('not in the vault Inbox folder');
    expect(fs.renameFile).not.toHaveBeenCalled();
  });

  it('rejects nested paths under Inbox', async () => {
    const {fs} = createFsMock();
    await expect(
      renameInboxMarkdownNote('/vault', '/vault/Inbox/sub/note.md', 'renamed', fs),
    ).rejects.toThrow('Invalid inbox note path');
    expect(fs.renameFile).not.toHaveBeenCalled();
  });

  it('rejects non-markdown files', async () => {
    const {fs} = createFsMock();
    await expect(
      renameInboxMarkdownNote('/vault', '/vault/Inbox/note.txt', 'renamed', fs),
    ).rejects.toThrow('Only inbox markdown');
    expect(fs.renameFile).not.toHaveBeenCalled();
  });

  it('rejects when destination already exists', async () => {
    const noteUri = '/vault/Inbox/note.md';
    const existingUri = '/vault/Inbox/existing.md';
    const {fs} = createFsMock([noteUri, existingUri]);
    await expect(
      renameInboxMarkdownNote('/vault', noteUri, 'existing', fs),
    ).rejects.toThrow('already exists');
    expect(fs.renameFile).not.toHaveBeenCalled();
  });
});
