import {describe, expect, it, vi} from 'vitest';

import type {VaultDirEntry, VaultFilesystem} from '@notebox/core';
import {SubtreeMarkdownPresenceCache} from '@notebox/core';

import {loadVaultTreeVisibleChildIds, type VaultTreeItemData} from './vaultTreeLoadChildren';

function dir(name: string, uri: string): VaultDirEntry {
  return {name, uri, type: 'directory', lastModified: null};
}

function file(name: string, uri: string): VaultDirEntry {
  return {name, uri, type: 'file', lastModified: null};
}

describe('loadVaultTreeVisibleChildIds', () => {
  it('lists folders first then markdown, and prunes dirs with no eligible markdown', async () => {
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
        if (d === '/v/Empty') {
          return [file('x.txt', '/v/Empty/x.txt')];
        }
        if (d === '/v/Zebra') {
          return [file('z.md', '/v/Zebra/z.md')];
        }
        return [];
      }),
    };
    const subtreeCache = new SubtreeMarkdownPresenceCache();
    const itemStoreRef = {current: {} as Record<string, VaultTreeItemData>};
    const ids = await loadVaultTreeVisibleChildIds({
      parentUri: '/v',
      fs,
      subtreeCache,
      itemStoreRef,
    });
    expect(ids).toEqual(['/v/Zebra', '/v/a.md', '/v/b.md']);
    expect(itemStoreRef.current['/v/Zebra']).toMatchObject({kind: 'folder'});
    expect(itemStoreRef.current['/v/a.md']).toMatchObject({kind: 'article', name: 'a.md'});
    expect(itemStoreRef.current['/v/Empty']).toBeUndefined();
  });
});
