import {describe, expect, it, vi} from 'vitest';

import {saveNoteMarkdown} from './vaultBootstrap';

import type {VaultFilesystem} from '@eskerra/core';

function createFsMock(): VaultFilesystem {
  return {
    exists: vi.fn().mockResolvedValue(true),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('missing')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    removeTree: vi.fn().mockResolvedValue(undefined),
    renameFile: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue([]),
  };
}

describe('saveNoteMarkdown', () => {
  it('writes markdown body as-is and preserves trailing blank lines', async () => {
    const fs = createFsMock();
    const uri = '/vault/Inbox/x.md';
    const body = 'line one\n\n\n';

    await saveNoteMarkdown(uri, fs, body);

    expect(fs.writeFile).toHaveBeenCalledWith(uri, body, {
      encoding: 'utf8',
      mimeType: 'text/markdown',
    });
  });

  it('writes empty string without normalizing', async () => {
    const fs = createFsMock();
    const uri = '/vault/Inbox/empty.md';

    await saveNoteMarkdown(uri, fs, '');

    expect(fs.writeFile).toHaveBeenCalledWith(uri, '', {
      encoding: 'utf8',
      mimeType: 'text/markdown',
    });
  });

  it('allows body that is only newlines', async () => {
    const fs = createFsMock();
    const uri = '/vault/Inbox/blank.md';
    const body = '\n\n';

    await saveNoteMarkdown(uri, fs, body);

    expect(fs.writeFile).toHaveBeenCalledWith(uri, body, {
      encoding: 'utf8',
      mimeType: 'text/markdown',
    });
  });
});
