import {describe, expect, it} from 'vitest';

import {collectVaultMarkdownRefs} from './vaultMarkdownRefs';
import type {VaultDirEntry, VaultFilesystem} from './vaultFilesystem';

function createListTree(
  dirs: Set<string>,
  files: Map<string, {name: string; type?: string}>,
): VaultFilesystem['listFiles'] {
  return async (directoryUri: string): Promise<VaultDirEntry[]> => {
    const base = directoryUri.replace(/\/$/, '');
    const prefix = `${base}/`;
    const out: VaultDirEntry[] = [];
    for (const d of dirs) {
      if (d.startsWith(prefix) && d !== base) {
        const rest = d.slice(prefix.length);
        if (rest && !rest.includes('/')) {
          out.push({name: rest, uri: d, type: 'directory', lastModified: null});
        }
      }
    }
    for (const [uri, meta] of files) {
      if (uri.startsWith(prefix) && uri !== base) {
        const rest = uri.slice(prefix.length);
        if (rest && !rest.includes('/')) {
          out.push({
            name: meta.name,
            uri,
            type: (meta.type as VaultDirEntry['type']) ?? 'file',
            lastModified: null,
          });
        }
      }
    }
    return out;
  };
}

describe('collectVaultMarkdownRefs', () => {
  it('collects markdown outside Inbox and skips hard-excluded subtrees', async () => {
    const dirs = new Set<string>(['/vault', '/vault/Inbox', '/vault/Assets', '/vault/Proj']);
    const files = new Map<string, {name: string}>([
      ['/vault/root.md', {name: 'root.md'}],
      ['/vault/Inbox/a.md', {name: 'a.md'}],
      ['/vault/Assets/hidden.md', {name: 'hidden.md'}],
      ['/vault/Proj/p.md', {name: 'p.md'}],
    ]);
    const fs: VaultFilesystem = {
      exists: async () => false,
      mkdir: async () => {},
      readFile: async () => '',
      writeFile: async () => {},
      unlink: async () => {},
      removeTree: async () => {},
      renameFile: async () => {},
      listFiles: createListTree(dirs, files),
    };

    const refs = await collectVaultMarkdownRefs('/vault', fs);
    const uris = refs.map(r => r.uri).sort();
    expect(uris).toEqual(['/vault/Inbox/a.md', '/vault/Proj/p.md', '/vault/root.md']);
    expect(refs.find(r => r.uri === '/vault/Inbox/a.md')?.name).toBe('a');
  });

  it('respects AbortSignal', async () => {
    const fs: VaultFilesystem = {
      exists: async () => true,
      mkdir: async () => {},
      readFile: async () => '',
      writeFile: async () => {},
      unlink: async () => {},
      removeTree: async () => {},
      renameFile: async () => {},
      listFiles: async () => [{name: 'd', uri: '/vault/d', type: 'directory', lastModified: null}],
    };
    const ac = new AbortController();
    ac.abort();
    await expect(collectVaultMarkdownRefs('/vault', fs, {signal: ac.signal})).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
