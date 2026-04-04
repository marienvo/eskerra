import {describe, expect, it, vi} from 'vitest';

import {moveVaultTreeItemToDirectory} from './vaultBootstrap';

import type {VaultFilesystem} from '@notebox/core';

function createFsMock(): {
  fs: VaultFilesystem;
  renames: Array<{from: string; to: string}>;
} {
  const renames: Array<{from: string; to: string}> = [];
  const fs: VaultFilesystem = {
    exists: vi.fn().mockResolvedValue(false),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('missing')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    removeTree: vi.fn().mockResolvedValue(undefined),
    renameFile: vi.fn().mockImplementation(async (from: string, to: string) => {
      renames.push({from, to});
    }),
    listFiles: vi.fn().mockResolvedValue([]),
  };
  return {fs, renames};
}

describe('moveVaultTreeItemToDirectory', () => {
  it('moves a markdown note into another folder', async () => {
    const {fs, renames} = createFsMock();
    const r = await moveVaultTreeItemToDirectory('/vault', fs, {
      sourceUri: '/vault/Inbox/a.md',
      sourceKind: 'article',
      targetDirectoryUri: '/vault/Projects',
    });
    expect(r.previousUri).toBe('/vault/Inbox/a.md');
    expect(r.nextUri).toBe('/vault/Projects/a.md');
    expect(r.movedKind).toBe('article');
    expect(renames).toEqual([{from: '/vault/Inbox/a.md', to: '/vault/Projects/a.md'}]);
  });

  it('moves a folder into another folder', async () => {
    const {fs, renames} = createFsMock();
    const r = await moveVaultTreeItemToDirectory('/vault', fs, {
      sourceUri: '/vault/Inbox/Sub',
      sourceKind: 'folder',
      targetDirectoryUri: '/vault/Projects',
    });
    expect(r.nextUri).toBe('/vault/Projects/Sub');
    expect(r.movedKind).toBe('folder');
    expect(renames).toEqual([{from: '/vault/Inbox/Sub', to: '/vault/Projects/Sub'}]);
  });

  it('returns a no-op when the item is already in the target directory', async () => {
    const {fs, renames} = createFsMock();
    const r = await moveVaultTreeItemToDirectory('/vault', fs, {
      sourceUri: '/vault/Inbox/x.md',
      sourceKind: 'article',
      targetDirectoryUri: '/vault/Inbox',
    });
    expect(r.previousUri).toBe(r.nextUri);
    expect(renames).toEqual([]);
    expect(fs.renameFile).not.toHaveBeenCalled();
  });

  it('returns a no-op when dropping a folder onto its own row', async () => {
    const {fs, renames} = createFsMock();
    const r = await moveVaultTreeItemToDirectory('/vault', fs, {
      sourceUri: '/vault/Inbox/Box',
      sourceKind: 'folder',
      targetDirectoryUri: '/vault/Inbox/Box',
    });
    expect(r.previousUri).toBe('/vault/Inbox/Box');
    expect(r.nextUri).toBe('/vault/Inbox/Box');
    expect(renames).toEqual([]);
  });

  it('rejects when the destination path already exists', async () => {
    const {fs, renames} = createFsMock();
    fs.exists = vi.fn(async (u: string) => u === '/vault/Inbox/taken.md');
    await expect(
      moveVaultTreeItemToDirectory('/vault', fs, {
        sourceUri: '/vault/Projects/taken.md',
        sourceKind: 'article',
        targetDirectoryUri: '/vault/Inbox',
      }),
    ).rejects.toThrow(/already exists/);
    expect(renames).toEqual([]);
  });

  it('rejects moving a folder into its own subtree', async () => {
    const {fs, renames} = createFsMock();
    await expect(
      moveVaultTreeItemToDirectory('/vault', fs, {
        sourceUri: '/vault/Inbox/Outer',
        sourceKind: 'folder',
        targetDirectoryUri: '/vault/Inbox/Outer/Inner',
      }),
    ).rejects.toThrow(/subfolder/);
    expect(renames).toEqual([]);
  });

  it('rejects markdown under excluded folders', async () => {
    const {fs, renames} = createFsMock();
    await expect(
      moveVaultTreeItemToDirectory('/vault', fs, {
        sourceUri: '/vault/Assets/n.md',
        sourceKind: 'article',
        targetDirectoryUri: '/vault/Inbox',
      }),
    ).rejects.toThrow(/excluded/);
    expect(renames).toEqual([]);
  });
});
