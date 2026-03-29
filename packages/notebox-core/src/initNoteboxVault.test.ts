import {describe, expect, it} from 'vitest';

import {initNoteboxVault} from './initNoteboxVault';
import type {VaultDirEntry, VaultFilesystem} from './vaultFilesystem';

function createMemoryFs(initial: Map<string, string | 'dir'>): VaultFilesystem {
  const store = new Map(initial);

  return {
    exists: async uri => store.has(uri),
    mkdir: async uri => {
      store.set(uri, 'dir');
    },
    readFile: async uri => {
      const v = store.get(uri);
      if (v === 'dir' || v === undefined) {
        throw new Error('not found');
      }
      return v;
    },
    writeFile: async (uri, content, _opts) => {
      store.set(uri, content);
    },
    unlink: async uri => {
      store.delete(uri);
    },
    listFiles: async (): Promise<VaultDirEntry[]> => [],
  };
}

describe('initNoteboxVault', () => {
  it('creates default settings when missing', async () => {
    const fs = createMemoryFs(new Map([['/vault', 'dir']]));
    await initNoteboxVault('/vault', fs);
    const raw = await fs.readFile('/vault/.notebox/settings.json', {encoding: 'utf8'});
    expect(JSON.parse(raw).displayName).toBe('My Notebox');
  });
});
