import {describe, expect, it, vi} from 'vitest';

import type {VaultDirEntry, VaultFilesystem} from '@eskerra/core';

import {
  getTodayHubDirectoryInfo,
  loadVaultTreeVisibleChildRows,
  orderVaultTreeVisibleDirEntries,
  vaultTreeItemShowsTodaySidebarIcon,
  vaultUriIsTodayMarkdownFile,
  type VaultTreeItemData,
} from './vaultTreeLoadChildren';

function dir(name: string, uri: string): VaultDirEntry {
  return {name, uri, type: 'directory', lastModified: null};
}

function file(name: string, uri: string): VaultDirEntry {
  return {name, uri, type: 'file', lastModified: null};
}

describe('vaultUriIsTodayMarkdownFile', () => {
  it('is true only when the final segment is Today.md', () => {
    expect(vaultUriIsTodayMarkdownFile('/vault/Work/Today.md')).toBe(true);
    expect(vaultUriIsTodayMarkdownFile('C:\\vault\\Work\\Today.md')).toBe(true);
    expect(vaultUriIsTodayMarkdownFile('/vault/Work/Note.md')).toBe(false);
    expect(vaultUriIsTodayMarkdownFile('/vault/Work/Today-backup.md')).toBe(false);
  });
});

describe('vaultTreeItemShowsTodaySidebarIcon', () => {
  it('is true for todayHub and for article Today.md', () => {
    const hub: VaultTreeItemData = {
      kind: 'todayHub',
      name: 'Daily',
      uri: '/v/Daily',
      lastModified: null,
      todayNoteUri: '/v/Daily/Today.md',
    };
    const article: VaultTreeItemData = {
      kind: 'article',
      name: 'Today.md',
      uri: '/v/Work/Today.md',
      lastModified: null,
    };
    const other: VaultTreeItemData = {
      kind: 'article',
      name: 'Note.md',
      uri: '/v/Note.md',
      lastModified: null,
    };
    expect(vaultTreeItemShowsTodaySidebarIcon(hub)).toBe(true);
    expect(vaultTreeItemShowsTodaySidebarIcon(article)).toBe(true);
    expect(vaultTreeItemShowsTodaySidebarIcon(other)).toBe(false);
  });
});

describe('orderVaultTreeVisibleDirEntries', () => {
  it('sorts folders then markdown; drops non-markdown files', () => {
    const ordered = orderVaultTreeVisibleDirEntries([
      file('z.md', '/v/z.md'),
      dir('B', '/v/B'),
      file('readme.txt', '/v/readme.txt'),
      dir('A', '/v/A'),
      file('a.md', '/v/a.md'),
    ]);
    expect(ordered.map(e => e.uri)).toEqual(['/v/A', '/v/B', '/v/a.md', '/v/z.md']);
  });
});

describe('getTodayHubDirectoryInfo', () => {
  it('returns Today.md uri when present among other markdown', async () => {
    const fs: VaultFilesystem = {
      exists: vi.fn(),
      mkdir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      unlink: vi.fn(),
      removeTree: vi.fn(),
      renameFile: vi.fn(),
      listFiles: vi.fn(async (): Promise<VaultDirEntry[]> => {
        return [file('Today.md', '/v/Hub/Today.md'), file('Z.md', '/v/Hub/Z.md')];
      }),
    };
    const info = await getTodayHubDirectoryInfo({
      directoryUri: '/v/Hub',
      fs,
    });
    expect(info.todayNoteUri).toBe('/v/Hub/Today.md');
  });

  it('returns Today.md when a subdirectory sorts before it', async () => {
    const fs: VaultFilesystem = {
      exists: vi.fn(),
      mkdir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      unlink: vi.fn(),
      removeTree: vi.fn(),
      renameFile: vi.fn(),
      listFiles: vi.fn(async (): Promise<VaultDirEntry[]> => {
        return [dir('Nested', '/v/h/Nested'), file('Today.md', '/v/h/Today.md')];
      }),
    };
    const info = await getTodayHubDirectoryInfo({
      directoryUri: '/v/h',
      fs,
    });
    expect(info.todayNoteUri).toBe('/v/h/Today.md');
  });

  it('returns Today.md when Other.md sorts before Today.md', async () => {
    const fs: VaultFilesystem = {
      exists: vi.fn(),
      mkdir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      unlink: vi.fn(),
      removeTree: vi.fn(),
      renameFile: vi.fn(),
      listFiles: vi.fn(async (): Promise<VaultDirEntry[]> => {
        return [file('Other.md', '/v/h/Other.md'), file('Today.md', '/v/h/Today.md')];
      }),
    };
    const info = await getTodayHubDirectoryInfo({
      directoryUri: '/v/h',
      fs,
    });
    expect(info.todayNoteUri).toBe('/v/h/Today.md');
  });

  it('returns null when Today.md is missing', async () => {
    const fs: VaultFilesystem = {
      exists: vi.fn(),
      mkdir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      unlink: vi.fn(),
      removeTree: vi.fn(),
      renameFile: vi.fn(),
      listFiles: vi.fn(async (): Promise<VaultDirEntry[]> => {
        return [file('A.md', '/v/h/A.md')];
      }),
    };
    const info = await getTodayHubDirectoryInfo({
      directoryUri: '/v/h',
      fs,
    });
    expect(info.todayNoteUri).toBeNull();
  });
});

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
        if (d === '/v/Zebra' || d === '/v/Empty') {
          return [];
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
    expect(vi.mocked(fs.listFiles)).toHaveBeenCalled();
    const listCalls = vi.mocked(fs.listFiles).mock.calls.map(c => c[0]);
    expect(listCalls.filter(p => p === '/v').length).toBe(1);
    expect(new Set(listCalls)).toEqual(new Set(['/v', '/v/Empty', '/v/Zebra']));
  });

  it('classifies directory as todayHub when it contains Today.md', async () => {
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
          return [dir('Daily', '/v/Daily'), file('root.md', '/v/root.md')];
        }
        if (d === '/v/Daily') {
          return [file('Today.md', '/v/Daily/Today.md')];
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
    const daily = rows.find(r => r.id === '/v/Daily');
    expect(daily?.data).toMatchObject({
      kind: 'todayHub',
      uri: '/v/Daily',
      todayNoteUri: '/v/Daily/Today.md',
      name: 'Daily',
    });
  });

  it('lists todayHub directories before other folders, then markdown', async () => {
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
            dir('Research', '/v/Research'),
            dir('Personal', '/v/Personal'),
            dir('Work', '/v/Work'),
            file('n.md', '/v/n.md'),
          ];
        }
        if (d === '/v/Personal' || d === '/v/Work') {
          return [file('Today.md', `${d}/Today.md`)];
        }
        if (d === '/v/Research') {
          return [];
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
    expect(rows.map(r => r.id)).toEqual([
      '/v/Personal',
      '/v/Work',
      '/v/Research',
      '/v/n.md',
    ]);
    expect(rows[0]?.data.kind).toBe('todayHub');
    expect(rows[1]?.data.kind).toBe('todayHub');
    expect(rows[2]?.data.kind).toBe('folder');
  });

  it('classifies todayHub when Today.md is not first in sort order', async () => {
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
          return [dir('X', '/v/X')];
        }
        if (d === '/v/X') {
          return [file('A.md', '/v/X/A.md'), file('Today.md', '/v/X/Today.md')];
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
    const x = rows.find(r => r.id === '/v/X');
    expect(x?.data).toMatchObject({
      kind: 'todayHub',
      uri: '/v/X',
      todayNoteUri: '/v/X/Today.md',
    });
  });
});
