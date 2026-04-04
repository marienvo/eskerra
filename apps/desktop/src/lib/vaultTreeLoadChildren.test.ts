import {describe, expect, it, vi} from 'vitest';

import type {VaultDirEntry, VaultFilesystem} from '@notebox/core';

import {loadVaultTreeVisibleChildRows, type VaultTreeItemData} from './vaultTreeLoadChildren';

function dir(name: string, uri: string): VaultDirEntry {
  return {name, uri, type: 'directory', lastModified: null};
}

function file(name: string, uri: string): VaultDirEntry {
  return {name, uri, type: 'file', lastModified: null};
}

describe('loadVaultTreeVisibleChildRows', () => {
  it('returns id+data rows: folders first, then markdown; one listFiles per parent', async () => {
    const fs: VaultFilesystem = {
      exists: vi.fn(),
      mkdir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      unlink: vi.fn(),
      removeTree: vi.fn(),
      renameFile: vi.fn(),
      listFiles: vi.fn(async (d: string): Promise<VaultDirEntry[]> => {
        if (d === '/v') {
          return [
            dir('Zebra', '/v/Zebra'),
            dir('Empty', '/v/Empty'),
            file('b.md', '/v/b.md'),
            file('a.md', '/v/a.md'),
          ];
        }
        return [];
      }),
    };
    const itemStoreRef = {current: {} as Record<string, VaultTreeItemData>};
    const rows = await loadVaultTreeVisibleChildRows({
      parentUri: '/v',
      fs,
      itemStoreRef,
    });
    expect(rows.map(r => r.id)).toEqual(['/v/Empty', '/v/Zebra', '/v/a.md', '/v/b.md']);
    expect(rows[0]?.data).toMatchObject({kind: 'folder', uri: '/v/Empty'});
    expect(itemStoreRef.current['/v/a.md']).toMatchObject({kind: 'article', name: 'a.md'});
    expect(vi.mocked(fs.listFiles)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fs.listFiles)).toHaveBeenCalledWith('/v');
  });
});
