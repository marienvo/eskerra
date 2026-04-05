import {describe, expect, it} from 'vitest';

import {initEskerraVault} from './initEskerraVault';
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

describe('initEskerraVault', () => {
  it('creates default shared and local settings when missing', async () => {
    const fs = createMemoryFs(new Map([['/vault', 'dir']]));
    await initEskerraVault('/vault', fs);
    const sharedRaw = await fs.readFile('/vault/.eskerra/settings-shared.json', {
      encoding: 'utf8',
    });
    expect(JSON.parse(sharedRaw).r2).toBeDefined();
    expect(JSON.parse(sharedRaw).displayName).toBeUndefined();
    const localRaw = await fs.readFile('/vault/.eskerra/settings-local.json', {
      encoding: 'utf8',
    });
    const localCreated = JSON.parse(localRaw);
    expect(localCreated.deviceName).toBe('');
    expect(localCreated.displayName).toBe('');
    expect(typeof localCreated.deviceInstanceId).toBe('string');
    expect(localCreated.deviceInstanceId.length).toBeGreaterThan(0);
    expect(localCreated.playlistKnownControlRevision).toBeNull();
    expect(localCreated.playlistKnownUpdatedAtMs).toBeNull();
  });

  it('migrates /.notebox to /.eskerra before ensuring settings', async () => {
    const body = '{"displayName":"Migrated"}\n';
    const fs = createMemoryFs(
      new Map([
        ['/vault', 'dir'],
        ['/vault/.notebox', 'dir'],
        ['/vault/.notebox/settings-shared.json', body],
      ]),
    );
    await initEskerraVault('/vault', fs);
    expect(await fs.exists('/vault/.notebox')).toBe(false);
    expect(await fs.exists('/vault/.eskerra/settings-shared.json')).toBe(true);
    const sharedRaw = await fs.readFile('/vault/.eskerra/settings-shared.json', {encoding: 'utf8'});
    expect(sharedRaw).toBe(body);
  });

  it('does not overwrite legacy-only vault with default shared on init', async () => {
    const legacy =
      '{\n  "displayName": "Legacy Box"\n}\n';
    const fs = createMemoryFs(
      new Map([
        ['/vault', 'dir'],
        ['/vault/.notebox', 'dir'],
        ['/vault/.notebox/settings.json', legacy],
      ]),
    );
    await initEskerraVault('/vault', fs);
    expect(await fs.exists('/vault/.eskerra/settings-shared.json')).toBe(false);
    const stillLegacy = await fs.readFile('/vault/.eskerra/settings.json', {encoding: 'utf8'});
    expect(JSON.parse(stillLegacy).displayName).toBe('Legacy Box');
    const localRaw = await fs.readFile('/vault/.eskerra/settings-local.json', {encoding: 'utf8'});
    const local = JSON.parse(localRaw);
    expect(local.deviceName).toBe('');
    expect(local.displayName).toBe('');
    expect(typeof local.deviceInstanceId).toBe('string');
    expect(local.deviceInstanceId.length).toBeGreaterThan(0);
    expect(local.playlistKnownControlRevision).toBeNull();
    expect(local.playlistKnownUpdatedAtMs).toBeNull();
  });
});
