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
      if (!store.has(fromUri)) {
        throw new Error('not found');
      }
      const entries = [...store.entries()];
      for (const [k, v] of entries) {
        if (k === fromUri || k.startsWith(`${fromUri}/`)) {
          store.delete(k);
          const dest = k === fromUri ? toUri : `${toUri}${k.slice(fromUri.length)}`;
          store.set(dest, v);
        }
      }
    },
    listFiles: async (): Promise<VaultDirEntry[]> => [],
    removeTree: async () => {},
  };
}

describe('readVaultSharedSettingsRaw', () => {
  it('reads shared file when present', async () => {
    const body = '{"displayName":"A"}\n';
    const fs = createMemoryFs(
      new Map([
        ['/v', 'dir'],
        ['/v/.eskerra', 'dir'],
        ['/v/.eskerra/settings-shared.json', body],
      ]),
    );
    await expect(readVaultSharedSettingsRaw('/v', fs)).resolves.toBe(body);
  });

  it('migrates legacy /.notebox directory then reads shared file', async () => {
    const body = '{"displayName":"A"}\n';
    const fs = createMemoryFs(
      new Map([
        ['/v', 'dir'],
        ['/v/.notebox', 'dir'],
        ['/v/.notebox/settings-shared.json', body],
      ]),
    );
    await expect(readVaultSharedSettingsRaw('/v', fs)).resolves.toBe(body);
    expect(await fs.exists('/v/.eskerra/settings-shared.json')).toBe(true);
    expect(await fs.exists('/v/.notebox')).toBe(false);
  });

  it('migrates legacy file and writes shared', async () => {
    const legacyBody = '{"displayName":"Old"}\n';
    const fs = createMemoryFs(
      new Map([
        ['/v', 'dir'],
        ['/v/.eskerra', 'dir'],
        ['/v/.eskerra/settings.json', legacyBody],
      ]),
    );
    const raw = await readVaultSharedSettingsRaw('/v', fs);
    expect(raw).toBe(legacyBody);
    expect(await fs.exists('/v/.eskerra/settings-shared.json')).toBe(true);
  });

  it('migrates legacy file under /.notebox before shared migration', async () => {
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
    expect(await fs.exists('/v/.eskerra/settings-shared.json')).toBe(true);
    expect(await fs.exists('/v/.notebox')).toBe(false);
  });

  it('throws when neither shared nor legacy exists', async () => {
    const fs = createMemoryFs(
      new Map([
        ['/v', 'dir'],
        ['/v/.eskerra', 'dir'],
      ]),
    );
    await expect(readVaultSharedSettingsRaw('/v', fs)).rejects.toThrow(
      /settings-shared\.json/,
    );
  });
});
