import {describe, expect, it} from 'vitest';

import {readVaultSharedSettingsRaw} from './readVaultSharedSettings';
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
    renameFile: async (fromUri, toUri) => {
      const value = store.get(fromUri);
      if (value === undefined) {
        throw new Error('not found');
      }
      store.delete(fromUri);
      store.set(toUri, value);
    },
    listFiles: async (): Promise<VaultDirEntry[]> => [],
  };
}

describe('readVaultSharedSettingsRaw', () => {
  it('reads shared file when present', async () => {
    const body = '{"displayName":"A"}\n';
    const fs = createMemoryFs(
      new Map([
        ['/v', 'dir'],
        ['/v/.notebox', 'dir'],
        ['/v/.notebox/settings-shared.json', body],
      ]),
    );
    await expect(readVaultSharedSettingsRaw('/v', fs)).resolves.toBe(body);
  });

  it('migrates legacy file and writes shared', async () => {
    const legacyBody = '{"displayName":"Old"}\n';
    const fs = createMemoryFs(
      new Map([
        ['/v', 'dir'],
        ['/v/.notebox', 'dir'],
        ['/v/.notebox/settings.json', legacyBody],
      ]),
    );
    const raw = await readVaultSharedSettingsRaw('/v', fs);
    expect(raw).toBe(legacyBody);
    expect(await fs.exists('/v/.notebox/settings-shared.json')).toBe(true);
  });

  it('throws when neither shared nor legacy exists', async () => {
    const fs = createMemoryFs(
      new Map([
        ['/v', 'dir'],
        ['/v/.notebox', 'dir'],
      ]),
    );
    await expect(readVaultSharedSettingsRaw('/v', fs)).rejects.toThrow(
      /settings-shared\.json/,
    );
  });
});
