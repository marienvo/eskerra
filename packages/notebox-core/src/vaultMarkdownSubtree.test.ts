import {describe, expect, it} from 'vitest';

import type {VaultDirEntry, VaultFilesystem} from './vaultFilesystem';
import {SubtreeMarkdownPresenceCache} from './vaultVisibility';
import {vaultSubtreeHasEligibleMarkdown} from './vaultMarkdownSubtree';

function entry(name: string, uri: string, type: 'directory' | 'file'): VaultDirEntry {
  return {name, uri, type, lastModified: null};
}

describe('vaultSubtreeHasEligibleMarkdown', () => {
  it('returns true when an eligible markdown file exists nested', async () => {
    const fs: VaultFilesystem = {
      exists: async () => false,
      mkdir: async () => {},
      readFile: async () => '',
      writeFile: async () => {},
      unlink: async () => {},
      removeTree: async () => {},
      renameFile: async () => {},
      listFiles: async (dir: string): Promise<VaultDirEntry[]> => {
        if (dir === '/v') {
          return [entry('Inbox', '/v/Inbox', 'directory')];
        }
        if (dir === '/v/Inbox') {
          return [entry('Deep', '/v/Inbox/Deep', 'directory')];
        }
        if (dir === '/v/Inbox/Deep') {
          return [entry('note.md', '/v/Inbox/Deep/note.md', 'file')];
        }
        return [];
      },
    };
    await expect(vaultSubtreeHasEligibleMarkdown(fs, '/v/Inbox')).resolves.toBe(true);
  });

  it('returns false when subtree has no eligible markdown', async () => {
    const fs: VaultFilesystem = {
      exists: async () => false,
      mkdir: async () => {},
      readFile: async () => '',
      writeFile: async () => {},
      unlink: async () => {},
      removeTree: async () => {},
      renameFile: async () => {},
      listFiles: async (dir: string): Promise<VaultDirEntry[]> => {
        if (dir === '/v') {
          return [entry('Inbox', '/v/Inbox', 'directory')];
        }
        if (dir === '/v/Inbox') {
          return [entry('readme.txt', '/v/Inbox/readme.txt', 'file')];
        }
        return [];
      },
    };
    await expect(vaultSubtreeHasEligibleMarkdown(fs, '/v/Inbox')).resolves.toBe(false);
  });

  it('uses subtreeCache hits', async () => {
    const listCalls: string[] = [];
    const fs: VaultFilesystem = {
      exists: async () => false,
      mkdir: async () => {},
      readFile: async () => '',
      writeFile: async () => {},
      unlink: async () => {},
      removeTree: async () => {},
      renameFile: async () => {},
      listFiles: async (dir: string): Promise<VaultDirEntry[]> => {
        listCalls.push(dir);
        if (dir === '/v/A') {
          return [entry('x.md', '/v/A/x.md', 'file')];
        }
        return [];
      },
    };
    const subtreeCache = new SubtreeMarkdownPresenceCache();
    await vaultSubtreeHasEligibleMarkdown(fs, '/v/A', {subtreeCache});
    await vaultSubtreeHasEligibleMarkdown(fs, '/v/A', {subtreeCache});
    expect(listCalls.filter(d => d === '/v/A')).toHaveLength(1);
  });
});
